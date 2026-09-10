/**
 * Media static route (traversal- and symlink-guarded).
 */
import { realpathSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api';
import type { RouteTry } from './dispatch';

/** Lexical containment check with a separator boundary (no prefix false-positives). */
function isInsideDir(target: string, root: string): boolean {
  return target === root || target.startsWith(root + sep);
}

export function createMediaRoutes(mediaDir: string): { tryHandle: RouteTry } {
  const mediaRoot = resolve(mediaDir);
  const mediaApiPath = `${WORKFLOW_ROUTE_PREFIX}/media/`;

  const tryHandle: RouteTry = (method, path) => {
    if (!((method === 'GET' || method === 'HEAD') && path.startsWith(mediaApiPath))) return null;
    const rel = path.slice(mediaApiPath.length);
    // Explicit '..' segment check: attempts to escape -> 403 (the
    // normalize() clamp below additionally prevents silent escapes).
    if (rel.split('/').some((segment) => segment === '..')) {
      return { status: 403, body: { error: 'path-denied', message: 'path escapes media root' } };
    }
    const target = resolve(join(mediaRoot, normalize(`/${rel}`)));
    // Lexical pre-check first (cheap, catches plain traversal)…
    if (!isInsideDir(target, mediaRoot)) {
      return { status: 403, body: { error: 'path-denied', message: 'path escapes media root' } };
    }
    // …then resolve symlinks on BOTH ends (M2 QA fix #3): a symlink
    // inside media/ pointing outside must not be served. realpath
    // failure (missing file / broken link) maps to 404.
    let realTarget: string;
    try {
      const realRoot = realpathSync(mediaRoot);
      realTarget = realpathSync(target);
      if (!isInsideDir(realTarget, realRoot)) {
        return { status: 403, body: { error: 'path-denied', message: 'path escapes media root' } };
      }
    } catch {
      return { status: 404, body: { error: 'not-found', message: 'media file not found' } };
    }
    if (!statSync(realTarget).isFile()) {
      return { status: 404, body: { error: 'not-found', message: 'media file not found' } };
    }
    return { status: 200, file: realTarget };
  };

  return { tryHandle };
}
