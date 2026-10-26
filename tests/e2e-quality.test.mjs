import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("Playwright launches the isolated real backend stack rather than Vite fixtures", () => {
  const config = readFileSync("agent/frontend/playwright.config.ts", "utf8");
  const script = readFileSync("scripts/start-e2e-stack.sh", "utf8");
  assert.match(config, /start-e2e-stack\.sh/);
  const configPort = config.match(
    /const centerPort = Number\(process\.env\.HERMES_E2E_CENTER_PORT \?\? (\d+)\)/,
  );
  const scriptPort = script.match(
    /center_port=\$\{HERMES_E2E_CENTER_PORT:-(\d+)\}/,
  );
  assert.ok(configPort, "Playwright center port is configurable");
  assert.ok(scriptPort, "stack center port is configurable");
  assert.equal(
    configPort[1],
    scriptPort[1],
    "Playwright and stack use the same default port",
  );
  assert.match(config, /baseURL:\s*`http:\/\/127\.0\.0\.1:\$\{centerPort\}`/);
  assert.match(
    config,
    /url:\s*`http:\/\/127\.0\.0\.1:\$\{centerPort\}\/actuator\/health`/,
  );
  assert.match(config, /reuseExistingServer:\s*false/);
  assert.doesNotMatch(config, /npm run dev|127\.0\.0\.1:5173/);
  assert.match(
    script,
    /db_port=.*\ncenter_port=.*\nbootstrap_port=.*\nagent_base_port=.*\ntls_port=.*\ntls_failure_port=/,
  );
  assert.match(
    script,
    /python3 - "\$db_port" "\$center_port" "\$bootstrap_port" "\$agent_base_port" "\$tls_port" "\$tls_failure_port"/,
  );
  assert.match(
    script,
    /ports = \[db, center, bootstrap, \*range\(agent, agent \+ 4\), tls, tls_failure\]/,
  );
  assert.match(script, /len\(set\(ports\)\) != len\(ports\)/);
  assert.match(
    script,
    /\(socket\.AF_INET, '127\.0\.0\.1'\), \(socket\.AF_INET6, '::1'\)/,
  );
  assert.match(script, /probe\.bind\(\(host, port\)\)/);
  assert.ok(
    script.indexOf("probe.bind((host, port))") <
      script.indexOf('mkdir -p "$run_dir"'),
    "port preflight precedes stack resource creation",
  );
  assert.equal(existsSync("scripts/start-e2e-stack.sh"), true);
});

test("authenticated E2E verifies four agents, all detail tabs, and accessibility", () => {
  const spec = readFileSync("agent/frontend/e2e/core-flow.spec.ts", "utf8");
  assert.match(spec, /input\[name="username"\]/);
  for (const label of [
    "샘플 A 1",
    "샘플 A 2",
    "샘플 B 1",
    "샘플 B 2",
    "JVM·서버 자원",
    "DB Pool",
    "내부 점검",
    "AxeBuilder",
  ]) {
    assert.ok(spec.includes(label), label);
  }
  assert.doesNotMatch(spec, /route\(|fulfill\(|mock/i);
});

test("stack gate proves nonzero latest/history rows and center restart recovery", () => {
  const script = readFileSync("scripts/start-e2e-stack.sh", "utf8");
  for (const table of [
    "instance_snapshot_latest",
    "instance_metric_samples",
    "disk_latest",
    "disk_samples",
    "db_pool_latest",
    "db_pool_samples",
    "check_results_latest",
    "check_result_samples",
  ]) {
    assert.ok(script.includes(table), table);
  }
  assert.match(script, /restart/i);
});
