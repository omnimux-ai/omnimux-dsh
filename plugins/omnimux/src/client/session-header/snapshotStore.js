/**
 * Session Snapshot Store (方案 B: 会话分支快照管理)
 *
 * 将会话历史打快照归档并按 canvasWorkspaceId 聚合，
 * 使得用户清空上下文后可以随时回溯、查阅历史对话分支。
 */

export const SNAPSHOT_STORAGE_PREFIX = 'omnimux:canvas-snapshots:';

/**
 * @typedef {{
 *   id: string,
 *   sessionId: string,
 *   canvasWorkspaceId: string,
 *   createdAt: string,
 *   title: string,
 *   excerpt?: string,
 *   nodeCount?: number,
 * }} SessionSnapshot
 */

function resolveStorage() {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * 读取指定画布工作区的所有快照，按时间倒序排列
 * @param {string} canvasWorkspaceId
 * @returns {SessionSnapshot[]}
 */
export function getCanvasSnapshots(canvasWorkspaceId) {
  if (!canvasWorkspaceId || typeof canvasWorkspaceId !== 'string') return [];
  const storage = resolveStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(`${SNAPSHOT_STORAGE_PREFIX}${canvasWorkspaceId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1;
      }
      return a.id < b.id ? 1 : -1;
    });
  } catch {
    return [];
  }
}

/**
 * 保存一条新的会话快照
 * @param {{
 *   sessionId: string,
 *   canvasWorkspaceId: string,
 *   title?: string,
 *   excerpt?: string,
 *   nodeCount?: number,
 * }} params
 * @returns {SessionSnapshot | null}
 */
export function saveSessionSnapshot(params) {
  const { sessionId, canvasWorkspaceId, title, excerpt, nodeCount } = params || {};
  if (!sessionId || !canvasWorkspaceId) return null;
  const storage = resolveStorage();
  if (!storage) return null;

  const now = new Date().toISOString();
  const snapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sessionId: String(sessionId),
    canvasWorkspaceId: String(canvasWorkspaceId),
    title: (title && String(title).trim()) || '未命名对话快照',
    createdAt: now,
    excerpt: excerpt ? String(excerpt).slice(0, 120) : undefined,
    nodeCount: typeof nodeCount === 'number' ? nodeCount : undefined,
  };

  try {
    const existing = getCanvasSnapshots(canvasWorkspaceId);
    // 限制单画布最多保留 50 个快照
    const updated = [snapshot, ...existing.filter((s) => s.sessionId !== sessionId)].slice(0, 50);
    storage.setItem(`${SNAPSHOT_STORAGE_PREFIX}${canvasWorkspaceId}`, JSON.stringify(updated));
    return snapshot;
  } catch {
    return null;
  }
}

/**
 * 删除指定快照
 * @param {string} canvasWorkspaceId
 * @param {string} snapshotId
 * @returns {boolean}
 */
export function removeSessionSnapshot(canvasWorkspaceId, snapshotId) {
  if (!canvasWorkspaceId || !snapshotId) return false;
  const storage = resolveStorage();
  if (!storage) return false;
  try {
    const existing = getCanvasSnapshots(canvasWorkspaceId);
    const updated = existing.filter((s) => s.id !== snapshotId);
    storage.setItem(`${SNAPSHOT_STORAGE_PREFIX}${canvasWorkspaceId}`, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}
