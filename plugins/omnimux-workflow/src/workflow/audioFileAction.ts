/** Native actions only for validated audio inside a bound project. */
import { spawn } from 'node:child_process';
import { closeSync, openSync, readSync, realpathSync, fstatSync } from 'node:fs';
import { extname } from 'node:path';
import type { ProjectAssetsStore } from './workspace/ProjectAssetsStore.ts';

export interface AudioFileActionDeps {
  platform?: NodeJS.Platform;
  run?: (command: string, args: string[]) => Promise<void>;
}

export class AudioFileActionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'AudioFileActionError';
    this.code = code;
    this.status = status;
  }
}

import { isAudioHeader } from './audioHeader.ts';
export { isAudioHeader } from './audioHeader.ts';

function runNative(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: 'ignore', timeout: 10_000 });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error('native-action-failed')));
  });
}

let running = false;

export async function audioFileAction(
  store: Pick<ProjectAssetsStore, 'resolveProjectFile'>,
  workspaceId: string,
  body: { action?: unknown; relativePath?: unknown },
  deps: AudioFileActionDeps = {},
): Promise<void> {
  if ((body.action !== 'open' && body.action !== 'reveal') || typeof body.relativePath !== 'string'
    || !body.relativePath || body.relativePath.includes('\0')) {
    throw new AudioFileActionError('audio-action-invalid', 400);
  }
  // The shared resolver enforces workspace binding, traversal, symlink containment and regular files.
  const resolved = store.resolveProjectFile(workspaceId, body.relativePath);
  const real = realpathSync(resolved);
  const fd = openSync(real, 'r');
  try {
    if (!fstatSync(fd).isFile()) throw new AudioFileActionError('not-a-file', 400);
    const head = Buffer.alloc(4096);
    const count = readSync(fd, head, 0, head.length, 0);
    if (!isAudioHeader(extname(real), head.subarray(0, count))) {
      throw new AudioFileActionError('unsupported-audio', 415);
    }
  } finally {
    closeSync(fd);
  }
  if ((deps.platform ?? process.platform) !== 'darwin') {
    throw new AudioFileActionError('audio-action-unsupported', 501);
  }
  if (running) throw new AudioFileActionError('audio-action-busy', 409);
  // Re-resolve immediately before launch to avoid acting on a changed symlink target.
  if (realpathSync(store.resolveProjectFile(workspaceId, body.relativePath)) !== real) {
    throw new AudioFileActionError('audio-file-changed', 409);
  }
  running = true;
  try {
    await (deps.run ?? runNative)('/usr/bin/open', body.action === 'reveal' ? ['-R', '--', real] : ['--', real]);
  } catch {
    throw new AudioFileActionError('audio-action-failed', 500);
  } finally {
    running = false;
  }
}
