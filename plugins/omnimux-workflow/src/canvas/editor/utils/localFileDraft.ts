/**
 * Build LocalFileDraft from an absolute disk path (Electron File.path or native pick).
 * Canvas-island safe: no node:path.
 */
import {
  localFileMediaUrl,
  looksAbsolutePath,
  materialTypeFromFilename,
  mimeFromFilename,
} from '../../../shared/localMedia.ts';
import type { LocalFileDraft } from './resourcePickerPolicy.ts';

export function nativePathOf(file: File): string {
  const path = (file as File & { path?: string }).path;
  return typeof path === 'string' ? path : '';
}

function baseName(realPath: string): string {
  const trimmed = realPath.replace(/[/\\]+$/, '');
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || realPath;
}

export function draftFromRealPath(
  realPath: string,
  extras: { name?: string; mime?: string; size?: number } = {},
): LocalFileDraft | null {
  if (!looksAbsolutePath(realPath)) return null;
  const name = extras.name || baseName(realPath);
  const mime = extras.mime || mimeFromFilename(name) || mimeFromFilename(realPath) || '';
  const materialType = materialTypeFromFilename(name, mime);
  if (!materialType) return null;
  return {
    id: `${realPath}-${extras.size ?? 0}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    mime,
    size: extras.size ?? 0,
    realPath,
    materialType,
    previewUrl: localFileMediaUrl(realPath),
  };
}

export function draftsFromPickedPaths(paths: string[]): LocalFileDraft[] {
  const drafts: LocalFileDraft[] = [];
  for (const path of paths) {
    const draft = draftFromRealPath(path);
    if (draft) drafts.push(draft);
  }
  return drafts;
}
