/**
 * Table file path resolver and traversal guards (.htable).
 *
 * Conforms to project bound vs unbound directory rules.
 * L2 tabular documents live in:
 * - Bound project: `<ProjectRoot>/.omnimux/tables/<tableId>.htable`
 * - Unbound workspace: `<workspacesDir>/<workspaceId>/tables/<tableId>.htable`
 */

import { existsSync } from 'node:fs';
import { isAbsolute, normalize, resolve, join, sep, win32 } from 'node:path';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';

export class TablePathError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TablePathError';
    this.code = code;
  }
}

/** Validate tableId token format (alphanumeric, underscore, hyphen). */
export function validateTableId(tableId: string): boolean {
  if (typeof tableId !== 'string') return false;
  return /^[a-zA-Z0-9_-]{1,128}$/.test(tableId);
}

/** Canonical relative path stored in canvas.json L1 index. */
export function resolveTableRelativePath(tableId: string): string {
  if (!validateTableId(tableId)) {
    throw new TablePathError('invalid-id', `Invalid tableId: ${tableId}`);
  }
  return `.omnimux/tables/${tableId}.htable`;
}

/** Parse a canonical or legacy table reference without normalizing unsafe input. */
export function extractTableIdFromRelPath(tablePath: string): string {
  if (typeof tablePath !== 'string' || isAbsolute(tablePath) || win32.isAbsolute(tablePath)
    || tablePath.includes('\0') || tablePath.split(/[\\/]/).includes('..')) {
    throw new TablePathError('path-denied', 'Table path must be relative and must not contain traversal');
  }
  const match = /^\.(?:omnimux|hilo)\/tables\/([a-zA-Z0-9_-]{1,128})\.htable$/.exec(tablePath);
  if (!match?.[1]) {
    throw new TablePathError('invalid-path', 'Expected .omnimux/tables/<tableId>.htable');
  }
  return match[1];
}

/** Ensure path is strictly contained within root. */
function assertContained(candidate: string, rootDir: string): void {
  const normCandidate = normalize(resolve(candidate));
  const normRoot = normalize(resolve(rootDir));
  if (normCandidate !== normRoot && !normCandidate.startsWith(normRoot + sep)) {
    throw new TablePathError('path-denied', `Path traversal attempt rejected: ${candidate}`);
  }
}

/**
 * Resolve absolute .htable file path for a given workspaceId and tableId.
 * On read (if checkLegacy === true), falls back to .hilo/tables/<tableId>.htable if existing.
 */
export function resolveTableAbsPath(
  workspaceStore: WorkspaceStore,
  workspaceId: string,
  tableId: string,
  opts: { checkLegacy?: boolean } = {},
): string {
  if (typeof workspaceId !== 'string' || !/^ws_[a-zA-Z0-9_-]{1,128}$/.test(workspaceId)) {
    throw new TablePathError('invalid-id', `Invalid workspaceId: ${workspaceId}`);
  }
  if (!validateTableId(tableId)) {
    throw new TablePathError('invalid-id', `Invalid tableId: ${tableId}`);
  }

  const bound = workspaceStore.resolveProjectRoot(workspaceId);
  if (bound && bound.path) {
    const projectRoot = bound.path;
    const canonicalDir = join(projectRoot, '.omnimux', 'tables');
    const canonicalFile = join(canonicalDir, `${tableId}.htable`);
    assertContained(canonicalFile, projectRoot);

    if (opts.checkLegacy && !existsSync(canonicalFile)) {
      const legacyFile = join(projectRoot, '.hilo', 'tables', `${tableId}.htable`);
      if (existsSync(legacyFile)) {
        assertContained(legacyFile, projectRoot);
        return legacyFile;
      }
    }
    return canonicalFile;
  }

  const wsDir = join(workspaceStore.workspacesDir, workspaceId);
  const tablesDir = join(wsDir, 'tables');
  const canonicalFile = join(tablesDir, `${tableId}.htable`);
  assertContained(canonicalFile, workspaceStore.workspacesDir);

  if (opts.checkLegacy && !existsSync(canonicalFile)) {
    const legacyFile = join(wsDir, '.hilo', 'tables', `${tableId}.htable`);
    if (existsSync(legacyFile)) {
      assertContained(legacyFile, workspaceStore.workspacesDir);
      return legacyFile;
    }
  }

  return canonicalFile;
}
