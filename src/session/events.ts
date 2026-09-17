import type { ChangeKind } from '../snapshot/diff.js';
import type { RiskAssessment } from '../risk/scorer.js';

export type AgentName = 'claude-code' | 'codex';

export type RecordedChange = Readonly<{
  path: string;
  kind: ChangeKind;
  beforeHash: string | null;
  afterHash: string | null;
  beforeMode: number | null;
  afterMode: number | null;
  beforeLink?: string;
  afterLink?: string;
  /** Content of the pre-image was not captured (too large / unreadable / symlink target only). */
  beforeCaptured: boolean;
}>;

export type OutsideAccess = Readonly<{
  path: string;
  via: 'tool_path' | 'command_mention';
  sensitive: boolean;
}>;

export type SessionEvent =
  | Readonly<{ type: 'session_start'; at: string; agent: AgentName; sessionId: string; root: string; source?: string; baselineFiles: number; baselineTruncated: boolean; lateStart: boolean }>
  | Readonly<{ type: 'tool_call'; at: string; toolUseId: string; tool: string; summary: string; ok: boolean; changes: RecordedChange[]; concurrentWith: string[]; preObserved: boolean; outside: OutsideAccess[]; risk: RiskAssessment | null; scanned: boolean }>
  | Readonly<{ type: 'unattributed_changes'; at: string; changes: RecordedChange[] }>
  | Readonly<{ type: 'turn_end'; at: string }>
  | Readonly<{ type: 'session_end'; at: string; reason?: string }>
  | Readonly<{ type: 'restore'; at: string; path: string; restoredHash: string | null; backupHash: string | null; action: 'wrote' | 'removed' | 'symlinked' }>;
