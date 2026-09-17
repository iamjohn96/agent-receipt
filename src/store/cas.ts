import { createHash, randomUUID } from 'node:crypto';
import { constants, copyFileSync, chmodSync, existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ensurePrivateDir } from '../util/paths.js';

const HASH = /^[0-9a-f]{64}$/;

/**
 * Content-addressed blob store. Files are cloned first (APFS/Btrfs copy-on-write via
 * COPYFILE_FICLONE, falling back to a normal copy) and hashed from the private copy,
 * so the stored bytes always match their name even if the source changes mid-read.
 */
export class ContentStore {
  private readonly objectsDir: string;
  private readonly tmpDir: string;

  constructor(dataHome: string) {
    this.objectsDir = join(dataHome, 'objects');
    this.tmpDir = join(dataHome, 'tmp');
    ensurePrivateDir(this.objectsDir);
    ensurePrivateDir(this.tmpDir);
  }

  /** Store a file and return its sha256 hex digest. */
  putFile(sourcePath: string): string {
    const tmp = join(this.tmpDir, randomUUID());
    try {
      copyFileSync(sourcePath, tmp, constants.COPYFILE_FICLONE);
      chmodSync(tmp, 0o600);
      const hash = createHash('sha256').update(readFileSync(tmp)).digest('hex');
      const target = this.pathFor(hash);
      if (existsSync(target)) {
        rmSync(tmp, { force: true });
      } else {
        ensurePrivateDir(join(this.objectsDir, hash.slice(0, 2)));
        renameSync(tmp, target);
      }
      return hash;
    } catch (error) {
      rmSync(tmp, { force: true });
      throw error;
    }
  }

  has(hash: string): boolean {
    return HASH.test(hash) && existsSync(this.pathFor(hash));
  }

  read(hash: string): Buffer {
    const data = readFileSync(this.pathFor(hash));
    const actual = createHash('sha256').update(data).digest('hex');
    if (actual !== hash) throw new Error(`Stored object ${hash.slice(0, 12)} is corrupted`);
    return data;
  }

  sizeOf(hash: string): number {
    return statSync(this.pathFor(hash)).size;
  }

  pathFor(hash: string): string {
    if (!HASH.test(hash)) throw new Error('Invalid object hash');
    return join(this.objectsDir, hash.slice(0, 2), hash.slice(2));
  }
}
