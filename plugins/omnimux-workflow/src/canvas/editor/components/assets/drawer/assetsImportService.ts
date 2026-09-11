import { toast } from '../../../../ui';
import { pickLocalFiles } from '../../../../bridge/apiClient';
import { createAssetsLibraryClient } from '../../../../bridge/assetsLibraryClient';
import { interpretPickResponse } from '../../../../bridge/assetsLibraryMapper';
import type { AssetItem } from '../types';

export interface AssetRecord {
  id: string;
  name: string;
  type: string;
  description?: string;
  /** Absolute native path only. */
  real_path?: string;
  relative_path?: string;
  workspaceId?: string;
  previewUrl?: string;
  files?: Array<{ id: string; name: string; path: string }>;
  tags?: string[];
  updatedAt?: number;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus']);

export function basenameOf(filePath: string): string {
  const trimmed = filePath.replace(/[/\\]+$/, '');
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

export function typeFromName(name: string): AssetItem['type'] {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return 'doc';
}

export function reportPickFailure(interpretation: { kind: string; message?: string }): void {
  if (interpretation.kind === 'cancel') return;
  if (interpretation.kind === 'unsupported') {
    toast.warning('当前环境不支持原生文件选择器');
    return;
  }
  const msg = interpretation.kind === 'error' ? (interpretation.message || '选择文件失败') : '选择文件失败';
  toast.error(msg);
}

export interface CanvasImportOptions {
  guard: { capture: () => any; isCurrent: (ticket: any) => boolean };
  onInsertAsset?: (asset: AssetRecord) => void;
}

export async function executeCanvasImport(options: CanvasImportOptions): Promise<void> {
  const ticket = options.guard.capture();
  if (!options.guard.isCurrent(ticket)) return;

  const result = await pickLocalFiles().catch(() => null);
  if (!options.guard.isCurrent(ticket)) return;

  if (!result) {
    toast.error('选择文件失败');
    return;
  }

  const interpretation = interpretPickResponse(result);
  if (interpretation.kind !== 'ok') {
    reportPickFailure(interpretation);
    return;
  }

  for (const filePath of interpretation.paths) {
    const name = basenameOf(filePath);
    options.onInsertAsset?.({
      id: filePath,
      name,
      type: typeFromName(name),
      real_path: filePath,
    });
  }
  toast.success(`已导入 ${String(interpretation.paths.length)} 个文件到画布`);
}

export interface AssetsImportOptions {
  guard: { capture: () => any; isCurrent: (ticket: any) => boolean };
  projectAssets: {
    indexPaths: (paths: string[]) => Promise<boolean>;
    error?: string | null;
  };
}

const assetsPickClient = createAssetsLibraryClient();

export async function executeAssetsImport(options: AssetsImportOptions): Promise<void> {
  const ticket = options.guard.capture();
  if (!options.guard.isCurrent(ticket)) return;

  const result = await assetsPickClient.pickAssets('file');
  if (!options.guard.isCurrent(ticket)) return;

  const interpretation = result.interpretation;
  if (interpretation.kind !== 'ok') {
    reportPickFailure(interpretation);
    return;
  }

  const ok = await options.projectAssets.indexPaths(interpretation.paths);
  if (!options.guard.isCurrent(ticket)) return;

  if (ok) {
    toast.success(`已导入 ${String(interpretation.paths.length)} 个文件`);
  } else {
    toast.error(options.projectAssets.error || '写入项目资产失败');
  }
}

export interface CreateFolderOptions {
  guard: { capture: () => any; isCurrent: (ticket: any) => boolean };
  projectAssets: {
    mkdir: (name: string) => Promise<boolean>;
    error?: string | null;
  };
}

export async function executeCreateFolder(options: CreateFolderOptions): Promise<void> {
  const ticket = options.guard.capture();
  const name = prompt('请输入新文件夹名称：', '新建素材文件夹');
  if (!name || !name.trim()) return;

  const folderName = name.trim();
  const ok = await options.projectAssets.mkdir(folderName);
  if (!options.guard.isCurrent(ticket)) return;

  if (ok) {
    toast.success(`已新建文件夹：${folderName}`);
  } else {
    toast.error(options.projectAssets.error || '新建文件夹失败');
  }
}
