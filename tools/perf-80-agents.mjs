import { randomBytes } from 'node:crypto';
import {
  closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { percentile, queueSettlesWithoutGrowth } from './perf-metrics.mjs';

const AGENT_COUNT = 80;
const REPETITIONS = 5;
const LIST_REPETITIONS = 40;
const root = resolve(import.meta.dirname, '..');
const runDirectory = resolve(root, '.run/perf-80');
const composeProject = `hermes-monitor-perf-${process.pid}`;
const databasePort = 55433;
const centerPort = 18090;
const agentPort = 18181;
const centerBaseUrl = `http://127.0.0.1:${centerPort}`;
const agentBaseUrl = `http://127.0.0.1:${agentPort}`;
const javaHome = findJava21Home();
const javaBin = resolve(javaHome, 'bin/java');
const databasePassword = randomBytes(24).toString('hex');
const masterKey = randomBytes(32).toString('base64');
const agentToken = randomBytes(32).toString('hex');
const adminUsername = 'perf-admin';
const adminPassword = randomBytes(24).toString('hex');
const adminHash = bcrypt(adminPassword);
const composeEnvironment = {
  ...process.env,
  HERMES_DB_PASSWORD: databasePassword,
  HERMES_DB_PORT: String(databasePort),
  HERMES_SAMPLE_AGENT_TOKEN: agentToken,
};

mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
const stableCenterJar = resolve(runDirectory, 'monitor-center.jar');
const reportPath = resolve(runDirectory, 'report.json');
let center;
let agent;
let centerLog;
let agentLog;

async function main() {
try {
  prepareCenterJar(stableCenterJar);
  compose(['up', '-d', 'postgres']);
  await waitForDatabase();

  center = startCenter(stableCenterJar);
  await waitForHealth();
  let session = await login();
  await seedInstances(session);
  await stopProcess(center, 'center');
  center = undefined;

  resetCollectionRows();
  agent = startAgent();
  await waitForAgent();
  await resetAgentStats();
  center = startCenter(stableCenterJar);
  await waitForHealth();
  session = await login();

  const queueEvidence = [];
  const firstDataSamples = [];
  let baseline = new Map(Array.from({ length: AGENT_COUNT }, (_, index) => [
    instanceId(index), null,
  ]));
  for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
    if (repetition > 0) {
      await resetAgentStats();
      markAllInstancesDue();
    }
    const cycle = await measureCollectionCycle(session, baseline);
    queueEvidence.push(cycle.queue);
    firstDataSamples.push(cycle.firstDataMs);
    baseline = cycle.lastSeen;
  }

  const listSamples = await measureList(session);
  const snapshotSamples = await measureAgentSnapshots();
  const listP95Ms = percentile(listSamples, 95);
  const snapshotP95Ms = percentile(snapshotSamples, 95);
  const firstDataP95Ms = percentile(firstDataSamples, 95);
  const queueStable = queueEvidence.every(queueSettlesWithoutGrowth);

  assertLimit('list p95', listP95Ms, 500);
  assertLimit('agent snapshot p95', snapshotP95Ms, 1_000);
  assertLimit('first data p95', firstDataP95Ms, 2_000);
  assertLimit('first data max', Math.max(...firstDataSamples), 2_000);
  if (!queueStable) throw new Error('collector queue showed sustained growth or did not drain');

  const report = {
    passed: true,
    agents: AGENT_COUNT,
    repetitions: REPETITIONS,
    list: { samples: listSamples.length, p95_ms: rounded(listP95Ms), limit_ms: 500 },
    agent_snapshot: {
      samples: snapshotSamples.length,
      p95_ms: rounded(snapshotP95Ms),
      limit_ms: 1_000,
    },
    first_data: {
      samples_ms: firstDataSamples.map(rounded),
      p95_ms: rounded(firstDataP95Ms),
      max_ms: rounded(Math.max(...firstDataSamples)),
      limit_ms: 2_000,
    },
    queue: {
      no_sustained_growth: queueStable,
      executor_depth_by_repetition: queueEvidence,
    },
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (center) await stopProcess(center, 'center').catch(() => undefined);
  if (agent) await stopProcess(agent, 'agent').catch(() => undefined);
  closeLog(centerLog);
  closeLog(agentLog);
  compose(['down', '--volumes', '--remove-orphans'], false);
}
}

function prepareCenterJar(destination) {
  const artifact = resolve(root, 'monitor-center/target/monitor-center-0.1.0-SNAPSHOT.jar');
  if (!existsSync(artifact)) {
    command(resolve(root, 'mvnw'), [
      '-q', '-pl', 'monitor-center', '-Dmaven.test.skip=true',
      '-Dfrontend.skip=true', 'package',
    ], {
      ...process.env,
      JAVA_HOME: javaHome,
      PATH: `${resolve(javaHome, 'bin')}:${process.env.PATH}`,
    });
  }
  if (!existsSync(artifact)) throw new Error('center artifact could not be prepared');
  copyFileSync(artifact, destination);
}

function startCenter(jar) {
  centerLog ??= openSync(resolve(runDirectory, 'center.log'), 'a');
  return spawn(javaBin, ['-jar', jar, `--server.port=${centerPort}`], {
    cwd: root,
    env: {
      ...process.env,
      SPRING_DATASOURCE_URL: `jdbc:postgresql://127.0.0.1:${databasePort}/hermes_monitor`,
      SPRING_DATASOURCE_USERNAME: 'hermes',
      SPRING_DATASOURCE_PASSWORD: databasePassword,
      HERMES_MASTER_KEY: masterKey,
      HERMES_ADMIN_USERNAME: adminUsername,
      HERMES_ADMIN_PASSWORD_HASH: adminHash,
      HERMES_AGENT_ALLOWED_CIDRS: '127.0.0.1/32',
      SPRING_PROFILES_ACTIVE: 'e2e',
    },
    stdio: ['ignore', centerLog, centerLog],
  });
}

function startAgent() {
  agentLog ??= openSync(resolve(runDirectory, 'agent.log'), 'a');
  return spawn(process.execPath, [resolve(root, 'tools/perf-agent-server.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      HERMES_PERF_AGENT_TOKEN: agentToken,
      HERMES_PERF_AGENT_PORT: String(agentPort),
    },
    stdio: ['ignore', agentLog, agentLog],
  });
}

async function seedInstances(session) {
  await session.json('/api/v1/projects', {
    method: 'POST',
    body: { projectId: 'perf', displayName: 'Performance', enabled: true },
    expectedStatus: 201,
  });
  for (let offset = 0; offset < AGENT_COUNT; offset += 10) {
    await Promise.all(Array.from({ length: Math.min(10, AGENT_COUNT - offset) }, (_, item) => {
      const id = instanceId(offset + item);
      return session.json('/api/v1/projects/perf/instances', {
        method: 'POST',
        body: {
          instanceId: id,
          displayName: `Performance ${id}`,
          environment: 'performance',
          agentBaseUrl: `${agentBaseUrl}/agents/${id}`,
          token: agentToken,
          apiChecksEnabled: false,
          pollIntervalSeconds: 15,
          enabled: true,
        },
        expectedStatus: 201,
      });
    }));
  }
}

async function measureCollectionCycle(session, baseline) {
  const deadline = Date.now() + 25_000;
  const queue = [];
  let firstRequestAt;
  let firstDataMs;
  let latestItems = [];
  while (Date.now() < deadline) {
    const stats = await agentJson('/perf/stats');
    const info = await session.json('/actuator/info');
    const queueDepth = Number(info.collector?.queue_depth);
    const activeCount = Number(info.collector?.active_count);
    if (!Number.isInteger(queueDepth) || !Number.isInteger(activeCount)) {
      throw new Error('collector executor metrics are unavailable');
    }
    if (queue.at(-1) !== queueDepth) queue.push(queueDepth);
    firstRequestAt ??= stats.firstRequestAt ?? undefined;
    const response = await session.timedJson(
      '/api/v1/projects/perf/instances?page=0&size=200&sort=instance_id,asc',
    );
    latestItems = response.value.items;
    const changed = latestItems.filter((item) => item.last_seen_at
      && item.last_seen_at !== baseline.get(item.instance_id));
    const remaining = AGENT_COUNT - changed.length;
    if (firstDataMs === undefined && firstRequestAt && changed.length > 0) {
      const firstPersistedAt = Math.min(...changed.map((item) => Date.parse(item.last_seen_at)));
      firstDataMs = Math.max(0, firstPersistedAt - firstRequestAt);
    }
    if (remaining === 0 && stats.info >= AGENT_COUNT && stats.snapshot >= AGENT_COUNT
        && stats.active === 0 && queueDepth === 0 && activeCount === 0) break;
    await delay(50);
  }
  const finalStats = await agentJson('/perf/stats');
  if (latestItems.length !== AGENT_COUNT || queue.at(-1) !== 0
      || finalStats.info < AGENT_COUNT || finalStats.snapshot < AGENT_COUNT
      || firstDataMs === undefined) {
    throw new Error(`collection cycle did not settle: ${JSON.stringify({ queue, finalStats })}`);
  }
  return {
    queue,
    firstDataMs,
    lastSeen: new Map(latestItems.map((item) => [item.instance_id, item.last_seen_at])),
  };
}

async function measureList(session) {
  const samples = [];
  for (let index = 0; index < LIST_REPETITIONS; index += 1) {
    const response = await session.timedJson(
      '/api/v1/projects/perf/instances?page=0&size=200&sort=instance_id,asc',
    );
    if (response.value.items.length !== AGENT_COUNT) throw new Error('list returned fewer than 80 agents');
    samples.push(response.durationMs);
  }
  return samples;
}

async function measureAgentSnapshots() {
  const samples = [];
  for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
    for (let offset = 0; offset < AGENT_COUNT; offset += 20) {
      const batch = await Promise.all(Array.from({ length: 20 }, async (_, item) => {
        const id = instanceId(offset + item);
        const started = performance.now();
        const response = await fetch(`${agentBaseUrl}/agents/${id}/monitor/v1/snapshot`, {
          headers: { 'X-Monitor-Token': agentToken },
        });
        if (!response.ok) throw new Error(`agent snapshot failed: ${response.status}`);
        const value = await response.json();
        if (value.identity.instance_id !== id) throw new Error('agent snapshot identity mismatch');
        return performance.now() - started;
      }));
      samples.push(...batch);
    }
  }
  return samples;
}

async function login() {
  const session = new HttpSession(centerBaseUrl);
  const page = await session.raw('/login');
  const html = await page.text();
  const csrf = html.match(/name="_csrf"[^>]*value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error('login CSRF token was not issued');
  const body = new URLSearchParams({ username: adminUsername, password: adminPassword, _csrf: csrf });
  const response = await session.raw('/api/v1/session/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-XSRF-TOKEN': csrf,
    },
    body,
  });
  if (response.status !== 302) throw new Error(`login failed: ${response.status}`);
  await session.raw('/login');
  const me = await session.raw('/api/v1/session/me');
  if (!me.ok) throw new Error(`authenticated session failed: ${me.status}`);
  return session;
}

class HttpSession {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  async raw(path, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    const csrf = this.cookies.get('XSRF-TOKEN');
    if (csrf && !headers.has('X-XSRF-TOKEN') && options.method
        && !['GET', 'HEAD'].includes(options.method)) {
      headers.set('X-XSRF-TOKEN', maskCsrfToken(decodeURIComponent(csrf)));
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers, redirect: 'manual' });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';', 1);
      const separator = pair.indexOf('=');
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }

  async json(path, { body, expectedStatus = 200, ...options } = {}) {
    const headers = new Headers(options.headers);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await this.raw(path, {
      ...options,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status !== expectedStatus) {
      throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status}`);
    }
    return response.status === 204 || response.headers.get('content-length') === '0'
      ? undefined
      : response.json();
  }

  async timedJson(path) {
    const started = performance.now();
    const value = await this.json(path);
    return { value, durationMs: performance.now() - started };
  }
}

async function agentJson(path, method = 'GET') {
  const response = await fetch(`${agentBaseUrl}${path}`, {
    method,
    headers: { 'X-Monitor-Token': agentToken },
  });
  if (!response.ok) throw new Error(`agent control request failed: ${response.status}`);
  return response.json();
}

async function resetAgentStats() {
  await agentJson('/perf/stats', 'POST');
}

function resetCollectionRows() {
  psql(`
    update instances set last_polled_at=null,last_seen_at=null,consecutive_failures=0,
      last_collection_error_code=null where project_id='perf';
    delete from instance_snapshot_latest where project_id='perf';
    delete from instance_metric_samples where project_id='perf';
    delete from disk_latest where project_id='perf';
    delete from disk_samples where project_id='perf';
    delete from db_pool_latest where project_id='perf';
    delete from db_pool_samples where project_id='perf';
    `);
}

function markAllInstancesDue() {
  psql("update instances set last_polled_at=null where project_id='perf';");
}

function psql(sql) {
  compose(['exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', 'hermes', '-d', 'hermes_monitor', '-c', sql]);
}

function compose(arguments_, fail = true) {
  return command('docker', ['compose', '-p', composeProject, ...arguments_], composeEnvironment, fail);
}

function command(executable, arguments_, environment = process.env, fail = true) {
  const result = spawnSync(executable, arguments_, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    stdio: fail ? ['ignore', 'pipe', 'pipe'] : 'ignore',
  });
  if (fail && result.status !== 0) {
    throw new Error(`${executable} ${arguments_.join(' ')} failed: ${result.stderr}`);
  }
  return result;
}

async function waitForDatabase() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = compose(['exec', '-T', 'postgres', 'pg_isready', '-U', 'hermes',
      '-d', 'hermes_monitor'], false);
    if (result.status === 0) return;
    await delay(500);
  }
  throw new Error('PostgreSQL did not become ready');
}

async function waitForHealth() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (center?.exitCode !== null) throw new Error(`center stopped with ${center?.exitCode}`);
    try {
      const response = await fetch(`${centerBaseUrl}/actuator/health`);
      if (response.ok) return;
    } catch {
      // Continue within the bounded readiness window.
    }
    await delay(250);
  }
  throw new Error('center health did not become ready');
}

async function waitForAgent() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (agent?.exitCode !== null) throw new Error(`agent stopped with ${agent?.exitCode}`);
    try {
      await agentJson('/perf/stats');
      return;
    } catch {
      await delay(50);
    }
  }
  throw new Error('performance agent did not become ready');
}

async function stopProcess(child, label) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    new Promise((resolvePromise) => child.once('exit', () => resolvePromise(true))),
    delay(15_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolvePromise) => child.once('exit', resolvePromise));
  }
  if (child.exitCode && child.exitCode !== 143) {
    throw new Error(`${label} stopped with ${child.exitCode}`);
  }
}

function findJava21Home() {
  const tooling = resolve(root, '.tooling');
  const candidates = existsSync(tooling)
    ? readdirSync(tooling).filter((name) => name.startsWith('jdk-21'))
      .map((name) => resolve(tooling, name, 'Contents/Home'))
    : [];
  for (const home of [process.env.HERMES_JAVA21_HOME, ...candidates]) {
    if (!home || !existsSync(resolve(home, 'bin/java'))) continue;
    const result = spawnSync(resolve(home, 'bin/java'), ['-version'], { encoding: 'utf8' });
    if (result.status === 0 && `${result.stdout}${result.stderr}`.includes('version "21')) return home;
  }
  throw new Error('Java 21 is required for the 80-agent performance harness');
}

function maskCsrfToken(token) {
  const tokenBytes = Buffer.from(token, 'utf8');
  const random = randomBytes(tokenBytes.length);
  const combined = Buffer.alloc(tokenBytes.length * 2);
  random.copy(combined, 0);
  for (let index = 0; index < tokenBytes.length; index += 1) {
    combined[tokenBytes.length + index] = tokenBytes[index] ^ random[index];
  }
  return combined.toString('base64url');
}

function bcrypt(password) {
  const result = command('/usr/sbin/htpasswd', ['-bnBC', '10', '', password]);
  return result.stdout.trim().replace(/^:/, '');
}

function instanceId(index) {
  return `agent-${String(index + 1).padStart(3, '0')}`;
}

function assertLimit(name, actual, limit) {
  if (actual > limit) throw new Error(`${name} ${rounded(actual)}ms exceeded ${limit}ms`);
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function closeLog(descriptor) {
  if (typeof descriptor === 'number') closeSync(descriptor);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

await main();
