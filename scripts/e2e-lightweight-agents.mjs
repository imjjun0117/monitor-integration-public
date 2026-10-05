import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const token = process.env.HERMES_E2E_AGENT_TOKEN;
if (!token || Buffer.byteLength(token, 'utf8') < 32) {
  throw new Error('HERMES_E2E_AGENT_TOKEN must be at least 32 UTF-8 bytes');
}

const agents = [
  { port: 18081, projectId: 'sample-a', instanceId: 'local-01' },
  { port: 18082, projectId: 'sample-a', instanceId: 'local-02' },
  { port: 18083, projectId: 'sample-b', instanceId: 'local-01' },
  { port: 18084, projectId: 'sample-b', instanceId: 'local-02' },
];
const servers = [];

for (const agent of agents) {
  const startedAt = Date.now();
  const jobs = new Map();
  const latest = new Map([
    ['internal-health', checkResult('internal-health', 'INTERNAL')],
    ['sample-api', checkResult('sample-api', 'API')],
    ['e2e-internal-api', checkResult('e2e-internal-api', 'API')],
  ]);
  const server = createServer(async (request, response) => {
    try {
      if (request.headers['x-monitor-token'] !== token) {
        return json(response, 401, { code: 'UNAUTHORIZED' });
      }
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${agent.port}`);
      if (request.method === 'GET' && url.pathname === '/monitor/v1/info') {
        return json(response, 200, info(agent));
      }
      if (request.method === 'GET' && url.pathname === '/monitor/v1/snapshot') {
        return json(response, 200, snapshot(agent, startedAt, [...latest.values()]));
      }
      if (request.method === 'POST' && url.pathname === '/monitor/v1/checks/run') {
        const body = JSON.parse(await readBody(request));
        const requested = Array.isArray(body.check_ids) ? body.check_ids : [];
        const accepted = [];
        const rejected = [];
        const results = [];
        for (const id of requested) {
          const category = id === 'internal-health' ? 'INTERNAL' : 'API';
          if (!latest.has(id)) {
            rejected.push({ check_id: id, reason: 'NOT_REGISTERED' });
            continue;
          }
          const result = checkResult(id, category);
          latest.set(id, result);
          results.push(result);
          accepted.push(id);
        }
        const jobId = randomUUID();
        jobs.set(jobId, { results, readyAt: Date.now() + 1_500 });
        return json(response, 202, {
          job_id: jobId,
          accepted_check_ids: accepted,
          rejected,
        });
      }
      if (request.method === 'GET' && url.pathname === '/monitor/v1/checks/results') {
        const job = jobs.get(url.searchParams.get('job_id'));
        return json(response, 200, job && Date.now() >= job.readyAt ? job.results : []);
      }
      return json(response, 404, { code: 'NOT_FOUND' });
    } catch {
      return json(response, 400, { code: 'INVALID_REQUEST' });
    }
  });
  server.listen(agent.port, '127.0.0.1');
  servers.push(server);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function info(agent) {
  return {
    schema_version: '1.0',
    agent_version: 'e2e-lightweight-1.0',
    observed_at: new Date().toISOString(),
    identity: identity(agent),
    attributes: {
      display_name: agent.instanceId,
      environment: 'e2e',
      host_name: `e2e-${agent.projectId}-${agent.instanceId}`,
      context_path: '',
    },
    capabilities: ['JVM', 'SYSTEM', 'DISK', 'DB_POOL', 'INTERNAL_CHECK', 'API_CHECK'],
    checks: [
      { check_id: 'internal-health', name: 'Internal health', category: 'INTERNAL', direction: null },
      { check_id: 'sample-api', name: 'Sample API', category: 'API', direction: 'EXTERNAL' },
      { check_id: 'e2e-internal-api', name: 'E2E Internal API', category: 'API', direction: 'INTERNAL' },
    ],
  };
}

function snapshot(agent, startedAt, recentChecks) {
  const unsupported = agent.instanceId === 'local-02';
  return {
    schema_version: '1.0',
    observed_at: new Date().toISOString(),
    identity: identity(agent),
    jvm: {
      pid: process.pid,
      start_time: new Date(startedAt).toISOString(),
      uptime_ms: Date.now() - startedAt,
      java_vendor: 'E2E lightweight HTTP agent',
      java_version: 'protocol-v1',
      process_cpu_ratio: 0.1,
      heap_used_bytes: unsupported ? null : 32_000_000,
      heap_max_bytes: unsupported ? null : 128_000_000,
      non_heap_used_bytes: 8_000_000,
      thread_live_count: 8,
      thread_peak_count: 10,
      gc_count: 1,
      gc_time_ms: 2,
    },
    system: {
      system_cpu_ratio: unsupported ? null : 0.2,
      physical_memory_used_bytes: unsupported ? null : 256_000_000,
      physical_memory_total_bytes: unsupported ? null : 1_024_000_000,
      disks: [{
        path_id: 'tmp', path_display: 'Temporary filesystem',
        used_bytes: unsupported ? null : 100_000_000,
        total_bytes: unsupported ? null : 1_000_000_000,
      }],
    },
    db_pools: [{
      pool_id: 'main', name: 'Sample Pool', active: unsupported ? null : 1,
      idle: unsupported ? null : 2, max: unsupported ? null : 10,
      min_idle: 1, waiters: 0, max_wait_ms: 0, validation_latency_ms: 1,
      unsupported: unsupported ? ['active', 'idle', 'max'] : [],
    }],
    recent_checks: recentChecks,
    partial: false,
    collection_errors: [],
  };
}

function checkResult(checkId, category) {
  return {
    check_id: checkId,
    category,
    status: 'UP',
    duration_ms: category === 'API' ? 2 : 1,
    result_code: category === 'API' ? '200' : null,
    checked_at: new Date().toISOString(),
    message: 'ok',
  };
}

function identity(agent) {
  return { project_id: agent.projectId, instance_id: agent.instanceId };
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 16 * 1024) throw new Error('body too large');
  }
  return body;
}

function shutdown() {
  Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
    .finally(() => process.exit(0));
}
