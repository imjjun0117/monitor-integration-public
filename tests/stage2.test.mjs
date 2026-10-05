import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const base='collector/src/main/java/com/monitoring/collector/';
const required=['MonitorCollectorConfigurer.java','MonitorCollectorBuilder.java','MonitorCheck.java','DbPoolMetricsProvider.java','BoundedCheckExecutor.java','TokenVerifier.java','MonitorRuntime.java','servlet/MonitorServlet.java'];

test('단계 2 Agent SPI와 Servlet이 존재한다',()=>{for(const p of required) assert.equal(existsSync(base+p),true,p);});
test('Agent 코드는 Java 7 금지 API를 사용하지 않는다',()=>{
 const source=required.map(p=>readFileSync(base+p,'utf8')).join('\n');
 for(const forbidden of ['java.time','CompletableFuture','Map.of(','List.of(','jakarta.','->']) assert.equal(source.includes(forbidden),false,forbidden);
});
test('토큰은 빈 설정을 거부하고 constant-time 비교한다',()=>{
 const s=readFileSync(base+'TokenVerifier.java','utf8');
 assert.match(s,/configuredToken == null|configuredToken\.length\(\) == 0/);
 assert.match(s,/MessageDigest\.isEqual/);
});
test('Servlet은 4개 표준 endpoint와 no-store를 제공한다',()=>{
 const s=readFileSync(base+'servlet/MonitorServlet.java','utf8');
 for(const path of ['/info','/snapshot','/checks/run','/checks/results','no-store']) assert.ok(s.includes(path),path);
});
