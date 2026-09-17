import { describe, expect, it } from 'vitest';
import { chmodSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import { Recorder, type HookCall } from '../src/hooks/recorder.js';
import { parseClaudeHook } from '../src/hooks/claude.js';
import { SessionStore } from '../src/session/store.js';
import { ContentStore } from '../src/store/cas.js';
import { buildReceipt } from '../src/receipt/build.js';
import { renderText } from '../src/receipt/render-text.js';
import { executeRestore, planRestore } from '../src/restore/restore.js';
import { tempDir, writeTree } from './helpers.js';

function claude(recorder: Recorder, payload: Record<string, unknown>): void {
  const call = parseClaudeHook(JSON.stringify(payload));
  if (call !== undefined) recorder.handle(call as HookCall);
}

describe('Claude Code session: Bash deletes files, receipt shows it, restore brings them back', () => {
  it('records, attributes, renders, and restores', () => {
    const home = tempDir('home');
    const root = tempDir('proj');
    writeTree(root, { 'src/a.ts': 'export const a = 1;\n', 'src/b.ts': 'b', 'notes/todo.md': 'uncommitted work', '.env': 'OPENAI_API_KEY=sk-live-should-come-back', 'keep.txt': 'keep' });
    chmodSync(join(root, 'src/a.ts'), 0o640);
    const recorder = new Recorder(home, 'claude-code');
    const base = { session_id: 'sess-1', cwd: root, transcript_path: join(root, 'no-transcript.jsonl') };

    claude(recorder, { ...base, hook_event_name: 'SessionStart', source: 'startup' });

    // Bash: rm -rf src notes .env
    claude(recorder, { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'rm -rf src notes .env' } });
    rmSync(join(root, 'src'), { recursive: true });
    rmSync(join(root, 'notes'), { recursive: true });
    rmSync(join(root, '.env'));
    claude(recorder, { ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'rm -rf src notes .env' } });

    // Human edits keep.txt between tool calls
    writeFileSync(join(root, 'keep.txt'), 'edited by human');

    // Write tool creates a file
    claude(recorder, { ...base, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_use_id: 't2', tool_input: { file_path: join(root, 'new.ts'), content: 'x' } });
    writeFileSync(join(root, 'new.ts'), 'x');
    claude(recorder, { ...base, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_use_id: 't2', tool_input: { file_path: join(root, 'new.ts') } });

    // Read outside the project
    claude(recorder, { ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_use_id: 't3', tool_input: { file_path: '/etc/hosts' } });
    // Read inside the project is not noise
    claude(recorder, { ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_use_id: 't4', tool_input: { file_path: join(root, 'keep.txt') } });

    claude(recorder, { ...base, hook_event_name: 'Stop' });

    const store = new ContentStore(home);
    const session = new SessionStore(home, 'claude-code', 'sess-1');
    const receipt = buildReceipt(session, store);

    expect(receipt.chain.ok).toBe(true);
    expect(receipt.summary).toMatchObject({ deleted: 4, created: 1, modified: 1, unattributedChanges: 1, highRiskCommands: 1, outside: 1, sensitiveOutside: 1, restorableDeleted: 4 });
    const byPath = Object.fromEntries(receipt.files.map((f) => [f.path, f]));
    expect(byPath['.env']?.net).toBe('deleted');
    expect(byPath['.env']?.touches[0]).toMatchObject({ tool: 'Bash', attribution: 'tool' });
    expect(byPath['keep.txt']?.touches[0]?.attribution).toBe('unattributed');
    expect(byPath['new.ts']?.touches[0]?.tool).toBe('Write');
    expect(receipt.commands[0]?.risk?.signals.map((s) => s.code)).toEqual(['recursive_delete', 'secret_file']); // 4 deletions: below the mass_delete threshold of 5
    expect(receipt.commands.every((c) => c.preObserved)).toBe(true);
    expect(existsSync(session.receiptPath())).toBe(true);

    const text = renderText(receipt, { share: true, color: false, maxRows: 10 });
    expect(text).toContain('DELETED');
    expect(text).toContain('.env restorable');
    expect(text).not.toContain(root);
    expect(text).not.toContain('sk-live');

    // Restore deleted files (not the human-edited keep.txt, not the created file)
    const plan = planRestore(receipt, store, { paths: [], deleted: true, modified: false, includeCreated: false }, false);
    expect(plan.filter((p) => p.status === 'ready').map((p) => p.path)).toEqual(['.env', 'notes/todo.md', 'src/a.ts', 'src/b.ts']);
    const done = executeRestore(session, store, receipt, plan);
    expect(done).toHaveLength(4);
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe('OPENAI_API_KEY=sk-live-should-come-back');
    expect(readFileSync(join(root, 'notes/todo.md'), 'utf8')).toBe('uncommitted work');
    expect(statSync(join(root, 'src/a.ts')).mode & 0o777).toBe(0o640);
    expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('edited by human');
    expect(existsSync(join(root, 'new.ts'))).toBe(true);

    // The restore must not show up as an unattributed change on the next hook
    claude(recorder, { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 't5', tool_input: { command: 'ls' } });
    claude(recorder, { ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 't5', tool_input: { command: 'ls' } });
    const after = buildReceipt(session, store);
    expect(after.summary.unattributedChanges).toBe(1);
    expect(after.summary.deleted).toBe(0);
    expect(after.summary.restored).toBe(4);
    expect(after.chain.ok).toBe(true);

    // Re-planning is idempotent
    const again = planRestore(after, store, { paths: ['.env'], deleted: false, modified: false, includeCreated: false }, false);
    expect(again[0]?.status).toBe('already_restored');
  });

  it('refuses to overwrite a file changed after the session recorded it', () => {
    const home = tempDir('home');
    const root = tempDir('proj');
    writeTree(root, { 'a.txt': 'original' });
    const recorder = new Recorder(home, 'claude-code');
    const base = { session_id: 'sess-2', cwd: root };
    claude(recorder, { ...base, hook_event_name: 'SessionStart' });
    claude(recorder, { ...base, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_use_id: 'e1', tool_input: { file_path: join(root, 'a.txt') } });
    writeFileSync(join(root, 'a.txt'), 'agent edit');
    claude(recorder, { ...base, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_use_id: 'e1', tool_input: { file_path: join(root, 'a.txt') } });
    writeFileSync(join(root, 'a.txt'), 'human kept working');

    const store = new ContentStore(home);
    const session = new SessionStore(home, 'claude-code', 'sess-2');
    const receipt = buildReceipt(session, store);
    const plan = planRestore(receipt, store, { paths: ['a.txt'], deleted: false, modified: false, includeCreated: false }, false);
    expect(plan[0]?.status).toBe('conflict');
    const forced = planRestore(receipt, store, { paths: ['a.txt'], deleted: false, modified: false, includeCreated: false }, true);
    executeRestore(session, store, receipt, forced);
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('original');
    // the overwritten human version was backed up
    const restoreEvent = session.events().map((r) => r.event).find((e) => e.type === 'restore');
    expect(restoreEvent?.type === 'restore' && restoreEvent.backupHash !== null && store.read(restoreEvent.backupHash).toString()).toBe('human kept working');
  });

  it('marks changes during parallel tool calls as shared', () => {
    const home = tempDir('home');
    const root = tempDir('proj');
    writeTree(root, { 'x.txt': '1' });
    const recorder = new Recorder(home, 'claude-code');
    const base = { session_id: 'sess-3', cwd: root };
    claude(recorder, { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'p1', tool_input: { command: 'a' } });
    claude(recorder, { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'p2', tool_input: { command: 'b' } });
    rmSync(join(root, 'x.txt'));
    claude(recorder, { ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'p1', tool_input: { command: 'a' } });
    claude(recorder, { ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'p2', tool_input: { command: 'b' } });
    const receipt = buildReceipt(new SessionStore(home, 'claude-code', 'sess-3'), new ContentStore(home));
    expect(receipt.files[0]?.touches[0]?.attribution).toBe('shared');
    expect(receipt.limitations.lateStart).toBe(true);
  });
});

describe('CLI hook entry point', () => {
  const cli = resolve('dist/src/cli/main.js');
  it('prints nothing and exits 0, even on garbage input', () => {
    const home = tempDir('home');
    for (const input of ['not json', '{}', JSON.stringify({ hook_event_name: 'SessionStart', session_id: '../../x', cwd: '/' })]) {
      const result = spawnSync(process.execPath, [cli, 'hook', 'claude'], { input, env: { ...process.env, AGENT_RECEIPT_HOME: home }, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    }
    expect(readFileSync(join(home, 'errors.log'), 'utf8')).toMatch(/Refusing to snapshot/);
  });
  it('records a real session through stdin and shows it', () => {
    const home = tempDir('home');
    const root = tempDir('proj');
    writeTree(root, { 'gone.txt': 'bye' });
    const env = { ...process.env, AGENT_RECEIPT_HOME: home, NO_COLOR: '1' };
    const send = (payload: object) => spawnSync(process.execPath, [cli, 'hook', 'claude'], { input: JSON.stringify({ session_id: 'cli-1', cwd: root, ...payload }), env, encoding: 'utf8' });
    send({ hook_event_name: 'SessionStart' });
    send({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'c1', tool_input: { command: 'rm gone.txt' } });
    rmSync(join(root, 'gone.txt'));
    send({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'c1', tool_input: { command: 'rm gone.txt' } });
    send({ hook_event_name: 'SessionEnd', reason: 'exit' });
    const shown = spawnSync(process.execPath, [cli, 'show', 'last'], { env, encoding: 'utf8', cwd: root });
    expect(shown.stdout).toContain('gone.txt restorable');
    const restored = spawnSync(process.execPath, [cli, 'restore', 'last', 'gone.txt', '--yes'], { env, encoding: 'utf8', cwd: root });
    expect(restored.status).toBe(0);
    expect(readFileSync(join(root, 'gone.txt'), 'utf8')).toBe('bye');
    expect(spawnSync(process.execPath, [cli, 'verify', 'last'], { env, encoding: 'utf8', cwd: root }).status).toBe(0);
  });
});
