import React from 'react';
import { toast } from '../../../../ui';
import type { AssetItem, CanvasNodeItem, ViewMode } from '../types';

export interface ItemPathCandidate {
  name: string;
  real_path?: string;
  relative_path?: string;
}

export function itemPath(item: ItemPathCandidate): string {
  if (item.relative_path) return item.relative_path;
  if (item.real_path) return item.real_path;
  return item.name;
}

export function revealInFinder(item: ItemPathCandidate): void {
  const path = itemPath(item);
  navigator.clipboard?.writeText(path);
  window.dispatchEvent(
    new CustomEvent('omnimux:reveal-in-finder', { detail: { path, name: item.name } }),
  );
  toast.success(`已复制路径，可在访达中定位：${path}`);
}

export interface ConversationItemCandidate {
  id?: string;
  name: string;
  previewUrl?: string;
  real_path?: string;
  relative_path?: string;
  type?: string;
}

export function createConversationItem(
  item: ConversationItemCandidate,
  kind: 'canvas' | 'asset',
) {
  const extMatch = item.name.match(/\.([a-zA-Z0-9_-]+)$/);
  let extension = 'FILE';
  if (extMatch && extMatch[1]) {
    extension = extMatch[1].toUpperCase();
  }
  const sourcePlugin: 'omnimux-workflow' | 'omnimux-assets' =
    kind === 'canvas' ? 'omnimux-workflow' : 'omnimux-assets';

  return {
    sourcePlugin,
    kind: 'asset' as const,
    entityId: item.id || item.name,
    title: item.name,
    extension,
    relativePath: itemPath(item),
    previewUrl: item.previewUrl,
  };
}

export async function dispatchAddToSubjects(
  item: { name: string; real_path?: string },
  subjectLibrary: { createSubject: (name: string, files?: Array<{ real_path?: string; original_name: string }>) => Promise<any> },
  guard: { isCurrent: (ticket: any) => boolean },
  ticket: any,
): Promise<void> {
  const name = item.name.replace(/\.[^/.]+$/, '') || item.name;
  const created = await subjectLibrary.createSubject(name, [{
    real_path: item.real_path,
    original_name: item.name,
  }]);
  if (!guard.isCurrent(ticket)) return;
  if (created) {
    toast.success(`已添加到主体库：${created.name}`);
  } else {
    toast.warning('主体库暂不可用');
  }
}

export async function dispatchSaveToAssets(
  item: { name: string; real_path?: string },
  projectAssets: { indexPaths: (paths: string[]) => Promise<boolean> },
  guard: { isCurrent: (ticket: any) => boolean },
  ticket: any,
): Promise<void> {
  if (!item.real_path) return;
  const ok = await projectAssets.indexPaths([item.real_path]);
  if (!guard.isCurrent(ticket)) return;
  if (ok) {
    toast.success(`已存到项目资产：${item.name}`);
  } else {
    toast.error('写入项目资产失败');
  }
}

function handlePreview(item: CanvasNodeItem): void {
  if (item.previewUrl) {
    window.open(item.previewUrl, '_blank', 'noopener,noreferrer');
    toast.success('已打开预览');
    return;
  }
  toast.warning('当前素材暂无预览');
}

function handleCopy(item: CanvasNodeItem, type: 'path' | 'file'): void {
  if (type === 'path') {
    const p = itemPath(item);
    navigator.clipboard?.writeText(p);
    toast.success(`已复制路径：${p}`);
    return;
  }
  navigator.clipboard?.writeText(item.name);
  toast.success(`已复制文件名：${item.name}`);
}

function handleToggleView(
  setCanvasViewMode: React.Dispatch<React.SetStateAction<ViewMode>>,
  canvasViewMode: ViewMode,
): void {
  const nextMode = canvasViewMode === 'tree' ? 'grid' : 'tree';
  setCanvasViewMode(nextMode);
  toast.success(canvasViewMode === 'tree' ? '已切换到网格视图' : '已切换到树形视图');
}

type CanvasUtilityHandler = (
  item: CanvasNodeItem,
  setCanvasViewMode: React.Dispatch<React.SetStateAction<ViewMode>>,
  canvasViewMode: ViewMode,
) => void;

const CANVAS_UTILITY_HANDLERS: Record<string, CanvasUtilityHandler> = {
  'open-preview': (item) => handlePreview(item),
  'reveal-in-finder': (item) => revealInFinder(item),
  'copy-path': (item) => handleCopy(item, 'path'),
  'copy-file': (item) => handleCopy(item, 'file'),
  'toggle-tree-view': (_item, setMode, mode) => handleToggleView(setMode, mode),
  'duplicate': () => toast.info('请在画布上复制节点'),
  'rename': () => toast.info('请在画布上重命名节点'),
  'delete': () => toast.info('请在画布上删除节点'),
};

export function dispatchCanvasUtilityAction(
  action: string,
  item: CanvasNodeItem,
  setCanvasViewMode: React.Dispatch<React.SetStateAction<ViewMode>>,
  canvasViewMode: ViewMode,
): void {
  const handler = CANVAS_UTILITY_HANDLERS[action];
  if (handler) {
    handler(item, setCanvasViewMode, canvasViewMode);
    return;
  }
  toast.warning(`未识别的菜单动作：${action}`);
}

async function handleMoveToNode(
  item: AssetItem,
  projectAssets: {
    assets: AssetItem[];
    moveNode: (id: string, targetId: string | null) => Promise<boolean>;
  },
  guard: { isCurrent: (ticket: any) => boolean },
  ticket: any,
): Promise<void> {
  const folders = projectAssets.assets.filter((row) => row.type === 'folder' && row.id !== item.id);
  const names = folders.map((folder) => folder.name).join(' / ') || '根目录';
  const target = prompt(`移动至目标文件夹（${names}）：`, folders[0]?.name || '');
  if (!target || !target.trim()) return;
  const targetName = target.trim();
  const folder = folders.find((row) => row.name === targetName);
  const ok = await projectAssets.moveNode(item.id, folder?.id ?? null);
  if (!guard.isCurrent(ticket)) return;
  if (ok) {
    toast.success(`已移动到：${targetName}`);
  } else {
    toast.error('移动失败');
  }
}

async function handleFolderRename(
  item: AssetItem,
  projectAssets: { renameFolder: (id: string, name: string) => Promise<boolean> },
  guard: { isCurrent: (ticket: any) => boolean },
  ticket: any,
): Promise<void> {
  const newName = prompt('重命名文件夹：', item.name);
  if (!newName || !newName.trim()) return;
  const ok = await projectAssets.renameFolder(item.id, newName.trim());
  if (!guard.isCurrent(ticket)) return;
  if (ok) {
    toast.success('文件夹已重命名');
  } else {
    toast.error('重命名失败');
  }
}

async function handleDeleteNode(
  item: AssetItem,
  projectAssets: { deleteNode: (id: string) => Promise<boolean> },
  guard: { isCurrent: (ticket: any) => boolean },
  ticket: any,
  label = '',
): Promise<void> {
  const ok = await projectAssets.deleteNode(item.id);
  if (!guard.isCurrent(ticket)) return;
  if (ok) {
    const text = label ? `已删除${label}：${item.name}` : `已删除：${item.name}`;
    toast.success(text);
  } else {
    toast.error('删除失败');
  }
}

export interface AssetMenuActionOptions {
  guard: { isCurrent: (ticket: any) => boolean };
  ticket: any;
  onInsertAsset?: (asset: AssetItem) => void;
  insertToConversation: (item: AssetItem, kind: 'canvas' | 'asset') => void;
  projectAssets: {
    assets: AssetItem[];
    moveNode: (id: string, targetId: string | null) => Promise<boolean>;
    deleteNode: (id: string) => Promise<boolean>;
  };
}

const CONVERSATION_ACTIONS = new Set(['add-to-agent', 'add-to-chat', 'add-to-conversation']);

export async function executeAssetMenuAction(
  action: string,
  item: AssetItem,
  options: AssetMenuActionOptions,
): Promise<void> {
  const { guard, ticket, onInsertAsset, insertToConversation, projectAssets } = options;
  if (action === 'add-to-canvas') {
    onInsertAsset?.(item);
    toast.success(`已添加到画布：${item.name}`);
    return;
  }
  if (CONVERSATION_ACTIONS.has(action)) {
    insertToConversation(item, 'asset');
    return;
  }
  if (action === 'reveal-in-finder') {
    revealInFinder(item);
    return;
  }
  if (action === 'move-to') {
    await handleMoveToNode(item, projectAssets, guard, ticket);
    return;
  }
  if (action === 'delete') {
    await handleDeleteNode(item, projectAssets, guard, ticket);
    return;
  }
  toast.warning(`未识别的菜单动作：${action}`);
}

export interface FolderMenuActionOptions {
  guard: { isCurrent: (ticket: any) => boolean };
  ticket: any;
  projectAssets: {
    assets: AssetItem[];
    renameFolder: (id: string, name: string) => Promise<boolean>;
    moveNode: (id: string, targetId: string | null) => Promise<boolean>;
    deleteNode: (id: string) => Promise<boolean>;
  };
}

export async function executeFolderMenuAction(
  action: string,
  item: AssetItem,
  options: FolderMenuActionOptions,
): Promise<void> {
  const { guard, ticket, projectAssets } = options;
  if (action === 'reveal-in-finder') {
    revealInFinder(item);
    return;
  }
  if (action === 'rename') {
    await handleFolderRename(item, projectAssets, guard, ticket);
    return;
  }
  if (action === 'move-to') {
    await handleMoveToNode(item, projectAssets, guard, ticket);
    return;
  }
  if (action === 'delete') {
    await handleDeleteNode(item, projectAssets, guard, ticket, '文件夹');
    return;
  }
  toast.warning(`未识别的菜单动作：${action}`);
}

export async function instantiateSubjectToProject(
  subject: { id: string; name: string },
  projectAssets: { instantiateSubject: (id: string) => Promise<boolean>; error?: string | null },
  guard: { isCurrent: (ticket: any) => boolean },
  ticket: any,
  onSuccess: () => void,
): Promise<void> {
  const ok = await projectAssets.instantiateSubject(subject.id);
  if (!guard.isCurrent(ticket)) return;
  if (ok) {
    toast.success(`已实例化到项目：${subject.name}`);
    onSuccess();
  } else {
    toast.error(projectAssets.error || '实例化失败');
  }
}

export async function createNewSubject(
  subjectLibrary: { createSubject: (name: string) => Promise<any> },
  guard: { isCurrent: (ticket: any) => boolean },
  ticket: any,
): Promise<void> {
  const name = prompt('请输入新主体名称：', '新主体');
  if (!name || !name.trim()) return;
  const created = await subjectLibrary.createSubject(name.trim());
  if (!guard.isCurrent(ticket)) return;
  if (created) {
    toast.success(`已新建主体：${created.name}`);
  } else {
    toast.warning('主体库暂不可用，未能创建');
  }
}
