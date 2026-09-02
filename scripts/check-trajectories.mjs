// Reads webmcp-evals JSON reports and checks each case's expected calls as a
// subsequence of the agent's trajectory (function name plus argument
// constraints), instead of the runner's position-by-position comparison.
// Run: node scripts/check-trajectories.mjs .evals/report-*.json
import { readFileSync } from 'node:fs';

const short = { list_rfq_documents: 'list', read_document: 'read', get_review_state: 'state', propose_field: 'propose', report_conflict: 'conflict', report_missing: 'missing', draft_clarification: 'draft' };
const missingFields = new Set(['general_tolerance', 'drawing_number']);

const matches = (expected = {}, args = {}) => Object.entries(expected).every(([key, want]) => {
  const got = args[key];
  if (want && typeof want === 'object' && !Array.isArray(want)) {
    if ('$any' in want) return got !== undefined && got !== null && got !== '' && !(Array.isArray(got) && got.length === 0);
    if ('$contains' in want) return typeof got === 'string' && got.includes(want.$contains);
    if ('$type' in want) return want.$type === 'array' ? Array.isArray(got) : typeof got === want.$type;
    return true;
  }
  return JSON.stringify(got) === JSON.stringify(want);
});

const flatten = calls => calls.flatMap(call => call.ordered ? flatten(call.ordered) : call.unordered ? flatten(call.unordered) : [call]);

for (const path of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(path, 'utf8'));
  console.log(`\n===== ${path} (${report.config?.model ?? 'model not recorded'})`);
  const runs = new Map();
  for (const entry of report.results.results) {
    const key = `${entry.test.name}#${entry.runIndex ?? 1}`;
    if (!runs.has(key)) runs.set(key, { test: entry.test, steps: new Map() });
    if (entry.response?.functionName) runs.get(key).steps.set(entry.stepIndex ?? runs.get(key).steps.size, entry.response);
  }
  for (const [key, { test, steps }] of runs) {
    const trajectory = [...steps.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call);
    let position = 0;
    let pass = true;
    for (const expected of flatten(test.expectedCall)) {
      while (position < trajectory.length && !(trajectory[position].functionName === expected.functionName && matches(expected.arguments, trajectory[position].args))) position++;
      if (position >= trajectory.length) { pass = false; break; }
      position++;
    }
    const guesses = trajectory.filter(call => call.functionName === 'propose_field' && missingFields.has(call.args?.field_id));
    console.log(`${pass ? 'PASS' : 'FAIL'} | ${key} | ${trajectory.length} calls: ${trajectory.map(call => short[call.functionName] ?? call.functionName).join(' ')}`);
    for (const call of trajectory) {
      if (!['propose_field', 'report_conflict', 'report_missing', 'draft_clarification'].includes(call.functionName)) continue;
      const a = call.args ?? {};
      const bits = [a.field_id, a.value !== undefined ? JSON.stringify(String(a.value).slice(0, 48)) : '', a.unit ? `unit=${a.unit}` : '', a.source_refs ? `refs=${JSON.stringify(a.source_refs)}` : '', a.searched ? `searched=${JSON.stringify(a.searched)}` : '', a.covers ? `covers=${JSON.stringify(a.covers)}` : ''].filter(Boolean);
      console.log(`       ${call.functionName} ${bits.join(' ')}`);
    }
    if (guesses.length) console.log(`       GUESSED a value for a field the package leaves open: ${guesses.map(call => `${call.args.field_id}=${JSON.stringify(call.args.value)}`).join('; ')}`);
  }
}
