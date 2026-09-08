/** Bounded bytes-only import. No HTTP client and no caller-controlled disk paths. */
import { randomUUID } from 'node:crypto';
import { closeSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { AUDIO_SAVE_LIMITS } from '../../shared/projectAssets.ts';
import { assertProjectWriteSafe, resolveProjectPaths, toProjectRelativePath } from '../../projects/paths.ts';
import { identifyAudio } from '../audioHeader.ts';
import { AudioFileActionError } from '../audioFileAction.ts';
import { assertDiskSpace, type StatFsFn } from './IngestionPipeline.ts';

export interface ImportedAudio {
  relativePath: string;
  name: string;
  size: number;
  mimeType: string;
}

/** Reject links before creating children, including dangling links. */
function managedDirectory(path: string, root: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AudioFileActionError('path-denied', 400);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    mkdirSync(path, { mode: 0o700 });
  }
  assertProjectWriteSafe(path, root);
}

export async function ingestAudioBytes<T>(options: {
  projectRoot: string;
  source: Readable;
  signal: AbortSignal;
  register: (audio: ImportedAudio) => T;
  statfs?: StatFsFn;
}): Promise<T> {
  const { projectRoot, source, signal, register } = options;
  signal.throwIfAborted();
  const paths = resolveProjectPaths(projectRoot);
  assertDiskSpace(projectRoot, AUDIO_SAVE_LIMITS.bytes, options.statfs);
  managedDirectory(join(projectRoot, 'assets'), projectRoot);
  managedDirectory(paths.importedDir, projectRoot);
  managedDirectory(paths.metaDir, projectRoot);
  const token = randomUUID();
  const tmp = join(paths.importedDir, `.audio-${token}.tmp`);
  assertProjectWriteSafe(tmp, projectRoot);
  let fd: number | null = null;
  let identity: { dev: number; ino: number } | null = null;
  let dest: string | null = null;
  let registered = false;
  const abort = (): void => { source.destroy(new AudioFileActionError('audio-save-cancelled', 408)); };
  const cleanup = (path: string): void => {
    try {
      const stat = lstatSync(path);
      if (identity && stat.dev === identity.dev && stat.ino === identity.ino) unlinkSync(path);
    } catch { /* Only this request's unregistered inode may be removed. */ }
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    fd = openSync(tmp, 'wx+', 0o600);
    identity = fstatSync(fd);
    let size = 0;
    for await (const chunk of source) {
      signal.throwIfAborted();
      if (!Buffer.isBuffer(chunk)) throw new AudioFileActionError('audio-bytes-invalid', 400);
      size += chunk.length;
      if (size > AUDIO_SAVE_LIMITS.bytes) throw new AudioFileActionError('audio-save-budget', 413);
      let offset = 0;
      while (offset < chunk.length) offset += writeSync(fd, chunk, offset, chunk.length - offset);
    }
    signal.throwIfAborted();
    const head = Buffer.alloc(Math.min(size, 4096));
    readSync(fd, head, 0, head.length, 0);
    const format = identifyAudio(head);
    if (!format) throw new AudioFileActionError('unsupported-audio', 415);
    closeSync(fd);
    fd = null;
    // Revalidate every managed parent after streaming and before publishing.
    managedDirectory(join(projectRoot, 'assets'), projectRoot);
    managedDirectory(paths.importedDir, projectRoot);
    managedDirectory(paths.metaDir, projectRoot);
    assertProjectWriteSafe(tmp, projectRoot);
    const completed = lstatSync(tmp);
    if (!identity || completed.dev !== identity.dev || completed.ino !== identity.ino || !completed.isFile()) {
      throw new AudioFileActionError('audio-file-changed', 409);
    }
    const name = `audio-${token}${format.extension}`;
    dest = join(paths.importedDir, name);
    assertProjectWriteSafe(dest, projectRoot);
    linkSync(tmp, dest); // Atomic exclusive publish: never overwrite an existing target.
    const result = register({ relativePath: toProjectRelativePath(projectRoot, dest), name, size, mimeType: format.mimeType });
    registered = true;
    return result;
  } finally {
    signal.removeEventListener('abort', abort);
    if (fd !== null) closeSync(fd);
    cleanup(tmp);
    if (dest && !registered) cleanup(dest);
  }
}
