# agent-receipt

See what your coding agent actually changed — **including files touched by Bash** — and restore them one file at a time.

Claude Code's `/rewind` only tracks its own file-editing tools: "Checkpointing does not track files modified by Bash
commands." A newer setting (`bashEditDiffEnabled`) will show a diff when a Bash call edits a file, similar to what
Edit/Write already show — but that's a diff on a modification, not a record of what was deleted, and not something
you can restore from. agent-receipt snapshots your project folder around every Bash/Write/Edit call, so an `rm -rf`
or a `git clean` shows up on a receipt and can be undone — including untracked and gitignored files like `.env`.

![agent-receipt demo: a Bash rm -rf deletes tracked and gitignored files, agent-receipt show reveals what happened, restore brings it all back](docs/demo.gif)

## Install

```sh
npm install -g @jonnylab/agent-receipt
agent-receipt init
```

`init` adds observe-only hooks to `~/.claude/settings.json` and backs up the file first. The hooks never block, delay, or
change what the agent does — they only watch. Remove them any time with `agent-receipt uninstall`.

A global install is deliberate: the hooks need a stable path to call, and npx cache paths get garbage-collected, so `init`
refuses to wire one.

## Use it

Work in Claude Code as usual, then:

```sh
agent-receipt show                     # what happened in this project's last session
agent-receipt restore last --deleted   # bring the deleted files back
```

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

Restoring is itself reversible — the previous contents are saved before anything is written back.

## Commands

| Command | What it does |
|---|---|
| `init` / `uninstall` | Add or remove the Claude Code hooks (`--project` for this repo only, `--yes` to skip prompts) |
| `list` | Recent sessions |
| `show [session\|last]` | Build and print the receipt (`--share` masks paths and secrets, `--json`, `--all`) |
| `restore [session\|last] [paths...]` | Restore files (`--deleted`, `--modified`, `--include-created`, `--force`, `--yes`) |
| `verify [session\|last]` | Check the session's event hash chain |

## Privacy

Everything stays on your machine, always — there is no telemetry, no network call of any kind, nothing to opt in or
out of. Receipts, snapshots, and the event ledger live in `~/.agent-receipt` (0700, override with
`AGENT_RECEIPT_HOME`). Snapshots can contain secrets — that is the point, it is how `.env` comes back — so the
directory is private and content is pruned on a retention window. `--share` masks paths and secret-looking values
before you post a receipt anywhere.

## What it does not see

Changes outside the project folder, content of files over 5 MB, `.git` and `node_modules`. It watches the Bash/Write/Edit
tool calls Claude Code hands it — a child process a Bash command spawns that makes its own file changes outside that
call's own lifecycle is not fully observed, since nothing hooks into the child directly. Sessions that started before
`init` are not recorded, and costs are estimates at list price.

This is an observation tool, not a guardrail: it does not block or warn before a destructive command runs, only
records what happened so it can be undone.

## Status

Pre-release, Claude Code only, maintained best-effort — no roadmap or support commitment beyond what's here today.
Codex and Cursor adapters are not built.

Issues and feedback: https://github.com/iamjohn96/agent-receipt/issues

## License

Apache-2.0
