const url = process.argv[2] ?? 'http://127.0.0.1:8080/actuator/health';
const attempts = Number(process.argv[3] ?? 3);
for (let index = 0; index < attempts; index += 1) {
  const started = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  const body = await response.text();
  if (response.status !== 200) throw new Error(`HTTP_${response.status}`);
  const parsed = JSON.parse(body);
  if (parsed.status !== 'UP') throw new Error('HEALTH_NOT_UP');
  console.log(`attempt=${index + 1} status=200 bytes=${Buffer.byteLength(body)} elapsed_ms=${Math.round(performance.now() - started)}`);
}
