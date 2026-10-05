import { readFileSync, writeFileSync } from 'node:fs';

const [legacyPath, agentPath, outputPath] = process.argv.slice(2);
if (!legacyPath || !agentPath) {
  process.stderr.write(
    '사용법: node tools/shadow-compare.mjs legacy.json agent.json [result.json]\n',
  );
  process.exit(2);
}

function load(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const legacy = new Map(load(legacyPath).results.map((result) => [result.check_id, result]));
const agent = new Map(load(agentPath).results.map((result) => [result.check_id, result]));
const checkIds = [...new Set([...legacy.keys(), ...agent.keys()])].sort();
const results = checkIds.map((checkId) => {
  const legacyStatus = legacy.get(checkId)?.status ?? 'MISSING';
  const agentStatus = agent.get(checkId)?.status ?? 'MISSING';
  return {
    check_id: checkId,
    legacy_status: legacyStatus,
    agent_status: agentStatus,
    matches: legacyStatus === agentStatus,
  };
});
const report = {
  compared_at: new Date().toISOString(),
  total: results.length,
  mismatches: results.filter((result) => !result.matches).length,
  results,
};
const text = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) writeFileSync(outputPath, text);
else process.stdout.write(text);
process.exitCode = report.mismatches === 0 ? 0 : 1;
