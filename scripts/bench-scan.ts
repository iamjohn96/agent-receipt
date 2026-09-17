// Measures the main technical risk: filesystem scan cost per hook call.
// Usage: npm run bench -- [fileCount=10000]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ContentStore } from '../src/store/cas.js';
import { scanTree, type ScanStats } from '../src/snapshot/scan.js';

const count = Number(process.argv[2] ?? 10_000);
const root = mkdtempSync(join(tmpdir(), 'ar-bench-proj-'));
const home = mkdtempSync(join(tmpdir(), 'ar-bench-home-'));
const perDir = 200;
for (let i = 0; i < count; i += 1) {
  const dir = join(root, `pkg${Math.floor(i / perDir)}`);
  if (i % perDir === 0) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `file${i}.ts`), `export const v${i} = ${i};\n`.repeat(20));
}
const store = new ContentStore(home);
const run = (label: string, previous?: ReturnType<typeof scanTree>) => {
  const stats: ScanStats = { statted: 0, hashed: 0, reused: 0, ms: 0 };
  const index = scanTree(root, store, previous, undefined, stats);
  console.log(`${label.padEnd(28)} ${String(stats.ms).padStart(6)} ms  hashed=${stats.hashed} reused=${stats.reused}`);
  return index;
};
const cold = run(`cold scan (${count} files)`);
const warm = run('warm scan (no changes)', cold);
writeFileSync(join(root, 'pkg0', 'file0.ts'), 'changed');
run('warm scan (1 change)', warm);

// Whole hook process: node startup + lock + scan + ledger append.
const cli = resolve('dist/src/cli/main.js');
const env = { ...process.env, AGENT_RECEIPT_HOME: home };
const hook = (payload: object) => {
  const started = Date.now();
  spawnSync(process.execPath, [cli, 'hook', 'claude'], { input: JSON.stringify({ session_id: 'bench', cwd: root, ...payload }), env });
  return Date.now() - started;
};
console.log(`hook SessionStart (baseline) ${String(hook({ hook_event_name: 'SessionStart' })).padStart(6)} ms`);
const times: number[] = [];
for (let i = 0; i < 5; i += 1) {
  times.push(hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: `b${i}`, tool_input: { command: 'ls' } }));
  times.push(hook({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: `b${i}`, tool_input: { command: 'ls' } }));
}
times.sort((a, b) => a - b);
console.log(`hook Pre/Post Bash (median)  ${String(times[Math.floor(times.length / 2)]).padStart(6)} ms  (max ${times.at(-1)} ms)`);
rmSync(root, { recursive: true, force: true });
rmSync(home, { recursive: true, force: true });
