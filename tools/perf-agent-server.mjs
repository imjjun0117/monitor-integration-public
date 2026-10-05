import { createServer } from 'node:http';

const token = process.env.HERMES_PERF_AGENT_TOKEN;
const port = Number(process.env.HERMES_PERF_AGENT_PORT ?? 18181);
const delayMs = Number(process.env.HERMES_PERF_AGENT_DELAY_MS ?? 5);
if (!token || Buffer.byteLength(token, 'utf8') < 32) {
  throw new Error('HERMES_PERF_AGENT_TOKEN must be at least 32 UTF-8 bytes');
}

let stats = emptyStats();
const startedAt = Date.now();
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/perf/stats') {
      if (request.headers['x-monitor-token'] !== token) return json(response, 401, {});
      if (request.method === 'POST') stats = emptyStats();
      return json(response, 200, stats);
    }
    if (request.headers['x-monitor-token'] !== token) return json(response, 401, {});
    const match = url.pathname.match(
      /^\/agents\/(agent-[0-9]{3})\/monitor\/v1\/(info|snapshot)$/,
    );
    if (!match || request.method !== 'GET') return json(response, 404, {});

    const [, instanceId, endpoint] = match;
    stats.firstRequestAt ??= Date.now();
    stats.active += 1;
    stats.peakActive = Math.max(stats.peakActive, stats.active);
    stats.requests += 1;
    stats[endpoint] += 1;
    await delay(delayMs);
    const body = endpoint === 'info' ? info(instanceId) : snapshot(instanceId);
    stats.active -= 1;
    stats.completed += 1;
    stats.firstCompletedAt ??= Date.now();
    return json(response, 200, body);
  } catch {
    stats.active = Math.max(0, stats.active - 1);
    return json(response, 500, {});
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`perf lightweight agent listening on ${port}\n`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

function info(instanceId) {
  return {
    schema_version: '1.0',
    agent_version: 'perf-lightweight-1.0',
    observed_at: new Date().toISOString(),
    identity: { project_id: 'perf', instance_id: instanceId },
    attributes: {
      display_name: instanceId,
      environment: 'performance',
      host_name: `perf-${instanceId}`,
      context_path: '',
    },
    capabilities: ['JVM', 'SYSTEM', 'DISK', 'DB_POOL'],
    checks: [],
  };
}

function snapshot(instanceId) {
  return {
    schema_version: '1.0',
    observed_at: new Date().toISOString(),
    identity: { project_id: 'perf', instance_id: instanceId },
    jvm: {
      pid: process.pid,
      start_time: new Date(startedAt).toISOString(),
      uptime_ms: Date.now() - startedAt,
      java_vendor: 'Performance lightweight HTTP agent',
      java_version: 'protocol-v1',
      process_cpu_ratio: 0.1,
      heap_used_bytes: 32_000_000,
      heap_max_bytes: 128_000_000,
      non_heap_used_bytes: 8_000_000,
      thread_live_count: 8,
      thread_peak_count: 10,
      gc_count: 1,
      gc_time_ms: 2,
    },
    system: {
      system_cpu_ratio: 0.2,
      physical_memory_used_bytes: 256_000_000,
      physical_memory_total_bytes: 1_024_000_000,
      disks: [{
        path_id: 'tmp', path_display: 'Performance temporary filesystem',
        used_bytes: 100_000_000, total_bytes: 1_000_000_000,
      }],
    },
    db_pools: [{
      pool_id: 'main', name: 'Performance Pool', active: 1, idle: 9, max: 10,
      min_idle: 1, waiters: 0, max_wait_ms: 0, validation_latency_ms: 1,
      unsupported: [],
    }],
    recent_checks: [],
    partial: false,
    collection_errors: [],
  };
}

function emptyStats() {
  return {
    requests: 0,
    completed: 0,
    info: 0,
    snapshot: 0,
    active: 0,
    peakActive: 0,
    firstRequestAt: null,
    firstCompletedAt: null,
  };
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
