#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
run_dir="$root/.run/e2e"
compose_project="hermes-monitor-e2e-$$"
db_port=55432
center_pid=""
tls_pid=""
agent_pid=""
mkdir -p "$run_dir"

cleanup() {
  if [[ -n "$center_pid" ]] && kill -0 "$center_pid" 2>/dev/null; then
    kill "$center_pid" 2>/dev/null || true
    wait "$center_pid" 2>/dev/null || true
  fi
  if [[ -n "$tls_pid" ]] && kill -0 "$tls_pid" 2>/dev/null; then
    kill "$tls_pid" 2>/dev/null || true
    wait "$tls_pid" 2>/dev/null || true
  fi
  if [[ -n "$agent_pid" ]] && kill -0 "$agent_pid" 2>/dev/null; then
    kill "$agent_pid" 2>/dev/null || true
    wait "$agent_pid" 2>/dev/null || true
  fi
  docker compose -p "$compose_project" --profile samples down --volumes \
    --remove-orphans >/dev/null 2>&1 || true
  rm -f "$run_dir/credentials.json" "$run_dir/control.json" \
    "$run_dir"/check-run-*.json "$run_dir/center-classpath.txt" \
    "$run_dir/e2e-localhost.crt" "$run_dir/e2e-localhost.key" \
    "$run_dir/e2e-truststore.p12" "$run_dir/agent.jar"
}
trap cleanup EXIT
trap 'exit 143' INT TERM

java_bin="${HERMES_E2E_JAVA_HOME:-}/bin/java"
if [[ ! -x "$java_bin" ]]; then
  echo "configured Java 21 executable is unavailable" >&2
  exit 1
fi
java_version=$("$java_bin" -version 2>&1) || {
  echo "configured Java runtime did not execute" >&2
  exit 1
}
if ! grep -Eq 'version "21([."])' <<<"$java_version"; then
  first_version_line=${java_version%%$'\n'*}
  echo "configured Java runtime is not version 21: $first_version_line" >&2
  exit 1
fi

db_password=$(openssl rand -hex 24)
master_key=$(openssl rand -base64 32)
agent_token=$(openssl rand -hex 32)
replacement_token=$(openssl rand -hex 32)
admin_username="e2e-admin"
admin_password=$(openssl rand -hex 24)
truststore_password=$(openssl rand -hex 16)

chmod 700 "$run_dir"
printf '{"username":"%s","password":"%s","agentToken":"%s","replacementToken":"%s"}' \
  "$admin_username" "$admin_password" "$agent_token" "$replacement_token" \
  >"$run_dir/credentials.json"
chmod 600 "$run_dir/credentials.json"
printf '{"composeProject":"%s"}' "$compose_project" >"$run_dir/control.json"
chmod 600 "$run_dir/control.json"

openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -keyout "$run_dir/e2e-localhost.key" -out "$run_dir/e2e-localhost.crt" \
  >/dev/null 2>&1
"$java_bin" -version >/dev/null 2>&1
"${HERMES_E2E_JAVA_HOME}/bin/keytool" -importcert -noprompt -alias e2e-localhost \
  -file "$run_dir/e2e-localhost.crt" -keystore "$run_dir/e2e-truststore.p12" \
  -storetype PKCS12 -storepass "$truststore_password" >/dev/null 2>&1
openssl s_server -quiet -www -accept 18443 -cert "$run_dir/e2e-localhost.crt" \
  -key "$run_dir/e2e-localhost.key" >"$run_dir/tls-server.log" 2>&1 &
tls_pid=$!
tls_ready=false
for _ in {1..30}; do
  if curl --fail --silent --show-error --max-time 2 --cacert "$run_dir/e2e-localhost.crt" \
    https://localhost:18443/ >/dev/null 2>&1; then
    tls_ready=true
    break
  fi
  sleep 1
done
if [[ "$tls_ready" != true ]]; then
  echo "local trusted TLS target did not become ready" >&2
  exit 1
fi

center_artifact="$root/agent/target/agent-0.1.0-SNAPSHOT.jar"
(cd "$root/agent/frontend" && npm run build >"$run_dir/frontend-build.log")
JAVA_HOME="$HERMES_E2E_JAVA_HOME" PATH="$HERMES_E2E_JAVA_HOME/bin:$PATH" \
  "$root/mvnw" -q -pl agent -Dmaven.test.skip=true \
  -Dfrontend.skip=true package
if [[ ! -f "$center_artifact" ]]; then
  echo "center artifact could not be prepared" >&2
  exit 1
fi
center_jar="$run_dir/agent.jar"
cp "$center_artifact" "$center_jar"
admin_hash=$(htpasswd -bnBC 10 '' "$admin_password" | tr -d ':\n')

export HERMES_DB_PASSWORD="$db_password"
export HERMES_DB_PORT="$db_port"
export HERMES_SAMPLE_AGENT_TOKEN="$agent_token"
HERMES_E2E_AGENT_TOKEN="$agent_token" node "$root/scripts/e2e-lightweight-agents.mjs" \
  >"$run_dir/lightweight-agents.log" 2>&1 &
agent_pid=$!
docker compose -p "$compose_project" up -d postgres >/dev/null

for port in 18081 18082 18083 18084; do
  ready=false
  for _ in {1..60}; do
    if curl --fail --silent --show-error --max-time 2 \
      -H "X-Monitor-Token: $agent_token" \
      "http://127.0.0.1:$port/monitor/v1/info" >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then
    echo "sample agent on port $port did not become ready" >&2
    exit 1
  fi
  if ! curl --fail --silent --show-error --max-time 3 \
    -H "X-Monitor-Token: $agent_token" -H 'Content-Type: application/json' \
    --data '{"check_ids":["internal-health","sample-api"],"requested_by":"agent"}' \
    --output "$run_dir/check-run-$port.json" \
    "http://127.0.0.1:$port/monitor/v1/checks/run"; then
    echo "sample agent check submission failed on port $port" >&2
    exit 1
  fi
done

start_center() {
  local port=$1
  SPRING_DATASOURCE_URL="jdbc:postgresql://127.0.0.1:$db_port/hermes_monitor" \
  SPRING_DATASOURCE_USERNAME=hermes \
  SPRING_DATASOURCE_PASSWORD="$db_password" \
  HERMES_MASTER_KEY="$master_key" \
  HERMES_ADMIN_USERNAME="$admin_username" \
  HERMES_ADMIN_PASSWORD_HASH="$admin_hash" \
  HERMES_AGENT_ALLOWED_CIDRS="127.0.0.1/32" \
  HERMES_SAMPLE_FIXTURES_ENABLED=true \
  HERMES_SAMPLE_AGENT_TOKEN="$agent_token" \
  SPRING_PROFILES_ACTIVE=e2e \
    "$java_bin" -Djavax.net.ssl.trustStore="$run_dir/e2e-truststore.p12" \
    -Djavax.net.ssl.trustStorePassword="$truststore_password" \
    -jar "$center_jar" \
    --server.port="$port" >"$run_dir/center-$port.log" 2>&1 &
  center_pid=$!
}

wait_for_health() {
  local port=$1
  for _ in {1..90}; do
    if curl --fail --silent --show-error --max-time 2 \
      "http://127.0.0.1:$port/actuator/health" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$center_pid" 2>/dev/null; then
      echo "center stopped before health became ready" >&2
      return 1
    fi
    sleep 1
  done
  echo "center health timed out" >&2
  return 1
}

database_counts_ready() {
  local counts
  counts=$(docker compose -p "$compose_project" exec -T postgres psql -U hermes \
    -d hermes_monitor -At -F ' ' -c "
      select (select count(*) from instance_snapshot_latest),
             (select count(*) from instance_metric_samples),
             (select count(*) from disk_latest),
             (select count(*) from disk_samples),
             (select count(*) from db_pool_latest),
             (select count(*) from db_pool_samples),
             (select count(*) from check_results_latest),
             (select count(*) from check_result_samples);" 2>/dev/null) || return 1
  read -r latest metric disk_latest disk_history db_latest db_history check_latest check_history \
    <<<"$counts"
  [[ "$latest" -ge 4 && "$metric" -ge 4 && "$disk_latest" -ge 4 && \
     "$disk_history" -ge 4 && "$db_latest" -ge 4 && "$db_history" -ge 4 && \
     "$check_latest" -ge 8 && "$check_history" -ge 8 ]]
}

start_center 18079
wait_for_health 18079
for _ in {1..90}; do
  database_counts_ready && break
  sleep 1
done
if ! database_counts_ready; then
  echo "agent-center database path did not produce all required rows" >&2
  exit 1
fi

printf 'database_counts_before_restart latest=%s metric=%s disk_latest=%s disk_history=%s db_latest=%s db_history=%s check_latest=%s check_history=%s\n' \
  "$latest" "$metric" "$disk_latest" "$disk_history" "$db_latest" "$db_history" \
  "$check_latest" "$check_history" | tee "$run_dir/counts.txt"

# Restart recovery gate: the second process must reuse the same isolated volume and rows.
kill "$center_pid"
wait "$center_pid" || true
center_pid=""
start_center 18080
wait_for_health 18080
if ! database_counts_ready; then
  echo "persisted monitoring rows were not recovered after restart" >&2
  exit 1
fi
printf 'database_counts_after_restart latest=%s metric=%s disk_latest=%s disk_history=%s db_latest=%s db_history=%s check_latest=%s check_history=%s\n' \
  "$latest" "$metric" "$disk_latest" "$disk_history" "$db_latest" "$db_history" \
  "$check_latest" "$check_history" | tee -a "$run_dir/counts.txt"

wait "$center_pid"
