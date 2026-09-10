/**
 * 展示名保留用户输入；目录名去掉路径分隔符 / 控制字符。
 * Host 建项目文件夹（桌面壳 directoryPicker 是 native，没有 createDirectory）。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertProjectInsideLibrary, ProjectPathError } from './paths.ts';
import { MAX_PROJECT_TITLE_LENGTH } from './schema.ts';

export const MAX_DIRECTORY_ATTEMPTS = 64;

export function sanitizeFolderName(title: unknown): string {
  const trimmed = String(title ?? '').trim();
  const replaced = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')
    .replace(/[. ]+$/u, '');
  return replaced.replace(/^\.+$/u, '');
}

export function folderNameAttempt(base: string, attempt: number): string {
  if (attempt <= 0) return base;
  return `${base} (${attempt + 1})`;
}

export function validateProjectTitle(raw: unknown):
  { ok: true; title: string; folderName: string } | { ok: false; error: string } {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'title-required' };
  }
  const title = raw.trim();
  if (title.length > MAX_PROJECT_TITLE_LENGTH) {
    return { ok: false, error: 'title-too-long' };
  }
  const folderName = sanitizeFolderName(title);
  if (folderName === '') return { ok: false, error: 'title-invalid' };
  return { ok: true, title, folderName };
}

/**
 * 在默认库下一层 mkdir 非 recursive。重名走 `名称 (2)`。
 * 不 rm、不覆盖已有项目。
 */
export function allocateUniqueProjectFolder(libraryRoot: string, baseName: string): string {
  const validated = sanitizeFolderName(baseName);
  if (validated === '') {
    throw new ProjectPathError('title-invalid', 'folder name is empty after sanitizing');
  }
  const root = resolve(libraryRoot);
  for (let attempt = 0; attempt < MAX_DIRECTORY_ATTEMPTS; attempt += 1) {
    const name = folderNameAttempt(validated, attempt);
    const target = join(root, name);
    assertProjectInsideLibrary(target, root);
    if (existsSync(target)) continue;
    try {
      mkdirSync(target);
      return target;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      if (code === 'EEXIST') continue;
      throw new ProjectPathError(
        'directory-create-failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  throw new ProjectPathError('directory-create-failed', 'could not allocate a unique project folder');
}
