import { closeSync, openSync, rmSync, statSync, writeSync } from 'node:fs';

const STALE_MS = 120_000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Cross-process exclusive lock using O_EXCL file creation. Hooks run as separate
 * processes and Claude Code can run tool calls in parallel, so every session mutation
 * is serialized through this.
 */
export function withLock<T>(lockPath: string, operation: () => T, timeoutMs = 20_000): T {
  const deadline = Date.now() + timeoutMs;
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = openSync(lockPath, 'wx', 0o600);
      writeSync(fd, `${process.pid}\n`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > STALE_MS) rmSync(lockPath, { force: true });
      } catch { /* lock vanished between checks */ }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for lock ${lockPath}`);
      sleep(25);
    }
  }
  try {
    return operation();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}
