# agent-receipt

See what your coding agent actually changed — **including files touched by Bash** — and restore them one by one.

Claude Code's `/rewind` only tracks its own file-editing tools: "Checkpointing does not track files modified by Bash commands."
agent-receipt snapshots your project folder around every Bash/Write/Edit call, so an `rm -rf` or a `git clean` shows up on a
receipt and can be undone — including untracked and gitignored files like `.env`.

```
AGENT RECEIPT  claude-code · 2026-09-17 14:02–14:31
<my-app>
────────────────────────────────────────────────────────────────
DELETED     3
   .env restorable  ← Bash: rm -rf build .env
   notes/todo.md restorable  ← Bash: rm -rf build .env
MODIFIED    2
CREATED     1
────────────────────────────────────────────────────────────────
COMMANDS   14   ⚠ 1 high risk
   ⚠ rm -rf build .env  (recursive_delete, secret_file)
COST      ≈ $1.84 est.  2.1M tokens, list price
────────────────────────────────────────────────────────────────
restore:  agent-receipt restore <session> --deleted
```

## Status
Pre-release (v0, Claude Code only). Local only: nothing leaves your machine.

## Try it (from source)
```sh
npm install && npm run build
node dist/src/cli/main.js init          # adds observe-only hooks to ~/.claude/settings.json (backup made)
# use Claude Code as usual, then:
node dist/src/cli/main.js show
node dist/src/cli/main.js restore last --deleted
node dist/src/cli/main.js uninstall
```

## What it does not see
Changes outside the project folder, network effects, content of files over 5 MB, `.git` and `node_modules`.
Changes are recorded as "happened during this tool call", not proven causation. Every receipt lists these limits.
