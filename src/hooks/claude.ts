import type { HookCall, ToolDescription } from './recorder.js';

// Claude Code hook stdin (https://code.claude.com/docs/en/hooks): session_id, transcript_path,
// cwd, hook_event_name, and for tool events tool_name, tool_input, tool_response, tool_use_id.
type ClaudeHookInput = {
  session_id?: unknown;
  transcript_path?: unknown;
  cwd?: unknown;
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
  tool_use_id?: unknown;
  source?: unknown;
  reason?: unknown;
};

const MUTATING = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const PATH_KEYS = ['file_path', 'notebook_path', 'path'] as const;

export function parseClaudeHook(raw: string): HookCall | undefined {
  const input = JSON.parse(raw) as ClaudeHookInput;
  const sessionId = str(input.session_id);
  const cwd = str(input.cwd);
  if (sessionId === undefined || cwd === undefined) return undefined;
  const base = { sessionId, cwd, ...(str(input.transcript_path) !== undefined ? { transcriptPath: str(input.transcript_path) as string } : {}) };
  const event = str(input.hook_event_name);

  switch (event) {
    case 'SessionStart':
      return { kind: 'session_start', ...base, ...(str(input.source) !== undefined ? { source: str(input.source) as string } : {}) };
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure': {
      const tool = describeTool(str(input.tool_name) ?? 'unknown', input.tool_input);
      const toolUseId = str(input.tool_use_id) ?? `anon-${Date.now()}`;
      return event === 'PreToolUse'
        ? { kind: 'pre_tool', ...base, toolUseId, tool }
        : { kind: 'post_tool', ...base, toolUseId, tool, ok: event === 'PostToolUse' };
    }
    case 'Stop':
      return { kind: 'turn_end', ...base };
    case 'SessionEnd':
      return { kind: 'session_end', ...base, ...(str(input.reason) !== undefined ? { reason: str(input.reason) as string } : {}) };
    default:
      return undefined;
  }
}

function describeTool(name: string, toolInput: unknown): ToolDescription {
  const record = typeof toolInput === 'object' && toolInput !== null ? toolInput as Record<string, unknown> : {};
  const command = name === 'Bash' ? str(record.command) : undefined;
  let path: string | undefined;
  for (const key of PATH_KEYS) {
    path = str(record[key]);
    if (path !== undefined) break;
  }
  return {
    name,
    mutating: MUTATING.has(name) || name.startsWith('mcp__'),
    ...(command !== undefined ? { command } : {}),
    ...(path !== undefined ? { path } : {}),
  };
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
