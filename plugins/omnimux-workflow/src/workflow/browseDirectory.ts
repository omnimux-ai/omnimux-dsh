/**
 * 弹窗内浏览本机文件夹：列出子目录，不弹系统选窗。
 * 只返回一层文件夹，不递归、不返回文件。范围限制在用户主目录内。
 */
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import { basename, dirname, isAbsolute, join, sep } from 'node:path';

const LIST_LIMIT = 200;

export interface BrowseDirectoryEntry {
  name: string;
  path: string;
}

export interface BrowseDirectoryResult {
  path: string;
  parent: string | null;
  entries: BrowseDirectoryEntry[];
}

export interface BrowseDirectoryDeps {
  homedir?: () => string;
  exists?: (path: string) => boolean;
  readdir?: typeof readdirSync;
  realpath?: typeof realpathSync;
  stat?: typeof statSync;
}

function homeOf(deps: BrowseDirectoryDeps): string {
  return typeof deps.homedir === 'function' ? deps.homedir() : osHomedir();
}

function canonicalize(path: string, realpath: typeof realpathSync): string {
  try {
    return realpath(path);
  } catch {
    return path;
  }
}

function isUnderHome(resolved: string, home: string): boolean {
  if (resolved === home) return true;
  const prefix = home.endsWith(sep) ? home : home + sep;
  return resolved.startsWith(prefix);
}

function parentOf(path: string, home: string): string | null {
  if (path === '/' || path === home) return null;
  const parent = dirname(path);
  if (parent === path) return null;
  if (!isUnderHome(parent, home) && parent !== home) return null;
  return parent;
}

export function defaultBrowseRoot(deps: BrowseDirectoryDeps = {}): string {
  const home = homeOf(deps);
  const desktop = join(home, 'Desktop');
  const exists = deps.exists ?? existsSync;
  if (exists(desktop)) return desktop;
  return home;
}

/**
 * @param {unknown} rawPath 空则落到桌面或用户主目录
 */
export function browseDirectory(rawPath: unknown, deps: BrowseDirectoryDeps = {}): BrowseDirectoryResult {
  const exists = deps.exists ?? existsSync;
  const readdir = deps.readdir ?? readdirSync;
  const realpath = deps.realpath ?? realpathSync;
  const stat = deps.stat ?? statSync;
  const home = canonicalize(homeOf(deps), realpath);
  const requested = typeof rawPath === 'string' && rawPath.trim() !== '' ? rawPath.trim() : defaultBrowseRoot(deps);
  if (!isAbsolute(requested)) {
    throw Object.assign(new Error('path must be absolute'), { code: 'invalid-path' });
  }
  if (!exists(requested)) {
    throw Object.assign(new Error('directory not found'), { code: 'not-found' });
  }
  let resolved: string;
  try {
    resolved = realpath(requested);
  } catch {
    throw Object.assign(new Error('directory not found'), { code: 'not-found' });
  }
  if (!isUnderHome(resolved, home)) {
    throw Object.assign(new Error('path outside home'), { code: 'path-denied' });
  }
  let st;
  try {
    st = stat(resolved);
  } catch {
    throw Object.assign(new Error('directory not found'), { code: 'not-found' });
  }
  if (!st.isDirectory()) {
    throw Object.assign(new Error('not a directory'), { code: 'not-directory' });
  }
  let names: string[] = [];
  try {
    names = readdir(resolved);
  } catch {
    throw Object.assign(new Error('directory unreadable'), { code: 'unreadable' });
  }
  const entries: BrowseDirectoryEntry[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = join(resolved, name);
    try {
      if (!stat(full).isDirectory()) continue;
      const childReal = canonicalize(full, realpath);
      if (!isUnderHome(childReal, home)) continue;
    } catch {
      continue;
    }
    entries.push({ name: basename(full), path: full });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return {
    path: resolved,
    parent: parentOf(resolved, home),
    entries: entries.slice(0, LIST_LIMIT),
  };
}

export { LIST_LIMIT };
