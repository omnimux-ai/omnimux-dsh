import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { localFilePathFromUrl } from '../../shared/localMedia.ts';
import { WorkflowStoreError } from '../workspace/WorkflowStoreError.ts';

export type ResolveExecutionProjectFile = (workspaceId: string, relativePath: string) => string;

export interface ExecutionMediaSourceOptions {
  workspaceId?: string;
  mediaDir: string;
  resolveProjectFile?: ResolveExecutionProjectFile;
}

function requireFile(path: string): string {
  try {
    if (isAbsolute(path) && statSync(path).isFile()) return path;
  } catch {
    // Report the same unavailable-source error for a missing or unreadable file.
  }
  throw new WorkflowStoreError('not-found', '输入素材文件不可用，请替换素材或移除引用');
}

/** Resolve browser media identities before a gateway consumes the input snapshot. */
export function resolveExecutionMediaSource(
  asset: { url?: string; path?: string; relativePath?: string },
  options: ExecutionMediaSourceOptions,
): string {
  const projectFile = (relativePath: string): string => {
    if (!options.workspaceId || !options.resolveProjectFile) {
      throw new WorkflowStoreError('project-required', '输入素材需要可用的项目文件，请重新绑定项目');
    }
    return options.resolveProjectFile(options.workspaceId, relativePath);
  };
  // Project identity takes precedence over an absolute path cached before a move.
  if (asset.relativePath?.trim()) return projectFile(asset.relativePath.trim());
  const url = asset.url?.trim() ?? '';
  if (url.startsWith('/omnimux-workflow/api/workspaces/')) {
    const parsed = new URL(url, 'http://localhost');
    const match = /^\/omnimux-workflow\/api\/workspaces\/([^/]+)\/file$/.exec(parsed.pathname);
    if (!match || decodeURIComponent(match[1]!) !== options.workspaceId) {
      throw new WorkflowStoreError('path-denied', '输入素材不属于当前项目，请重新选择素材');
    }
    return projectFile(parsed.searchParams.get('rel') ?? '');
  }
  if (asset.path?.trim()) return requireFile(asset.path.trim());
  if (/^https?:\/\//i.test(url) || /^data:(image|video|audio)\/[^,]+,.+/s.test(url)) return url;
  const localPath = localFilePathFromUrl(url);
  if (localPath) return requireFile(localPath);
  const mediaPrefix = ['/omnimux-workflow/media/', '/media/'].find((prefix) => url.startsWith(prefix));
  if (mediaPrefix) {
    const root = resolve(options.mediaDir);
    const path = resolve(root, decodeURIComponent(url.slice(mediaPrefix.length)));
    if (!path.startsWith(root + sep)) {
      throw new WorkflowStoreError('path-denied', '输入素材路径超出媒体目录');
    }
    const file = requireFile(path);
    if (!realpathSync(file).startsWith(realpathSync(root) + sep)) {
      throw new WorkflowStoreError('path-denied', '输入素材路径超出媒体目录');
    }
    return file;
  }
  throw new WorkflowStoreError('invalid-path', '输入素材无法解析，请替换素材或移除引用');
}
