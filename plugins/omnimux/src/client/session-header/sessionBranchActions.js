/**
 * Session Branch Actions (方案 B: 会话分支流转调度器)
 *
 * 处理 [清空并归档] 的完整流水线：
 * 1. 抓取当前会话上下文 (sessionId, title, canvasWorkspaceId)
 * 2. 写入快照记录
 * 3. 创建/打开纯净新会话
 * 4. 登记画布继承映射，确保新会话挂载时右侧画布完好继承原画布
 */

import { saveSessionSnapshot } from './snapshotStore.js';
import { findOfficialNewSessionButton } from '../sidebar-toggle-topbar.js';
import { getWorkbenchSessions } from '../workbench/host-adapter.js';

export const SESSION_CANVAS_OVERRIDE_PREFIX = 'omnimux:session-canvas-override:';

/**
 * 记录会话继承的画布 ID
 * @param {string} sessionId
 * @param {string} canvasWorkspaceId
 */
export function registerSessionCanvasInheritance(sessionId, canvasWorkspaceId) {
  if (!sessionId || !canvasWorkspaceId) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${SESSION_CANVAS_OVERRIDE_PREFIX}${sessionId}`, String(canvasWorkspaceId));
    }
  } catch {
    // ignore
  }
}

/**
 * 获取当前界面的活跃画布工作区 ID
 * @param {string} [currentSessionId]
 * @returns {string | undefined}
 */
export function resolveCurrentCanvasWorkspaceId(currentSessionId) {
  try {
    // 1. 从 window.__omnimuxWorkbench context envelope 提取
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined;
    const view = api?.getActiveView?.(currentSessionId);
    const fromEnvelope = view?.uiContext?.view?.extra?.workspaceId;
    if (fromEnvelope && typeof fromEnvelope === 'string') return fromEnvelope;

    // 2. 从 localStorage override 提取
    if (currentSessionId && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(`${SESSION_CANVAS_OVERRIDE_PREFIX}${currentSessionId}`);
      if (stored) return stored;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * 提取当前会话标题
 * @param {string} [sessionId]
 * @returns {string}
 */
export function resolveCurrentSessionTitle(sessionId) {
  if (typeof document !== 'undefined') {
    const header = document.querySelector('[data-slot="conversation.session.header"]');
    const text = header?.textContent?.trim();
    if (text) {
      // 过滤掉子级标签文字，保留主要标题
      const mainTitle = text.split('\n')[0]?.trim();
      if (mainTitle) return mainTitle;
    }
  }
  const sessions = getWorkbenchSessions();
  const summary = sessionId ? sessions?.list?.getSnapshot?.()?.byId?.[sessionId] : null;
  if (summary?.title) return summary.title;
  return '创作会话';
}

/**
 * 触发轻量 Toast 通知
 * @param {string} message
 */
export function showHeaderToast(message) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('omnimux-session-header-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'omnimux-session-header-toast';
  toast.className = 'omnimux-session-toast';
  toast.textContent = message;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-6px)';
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

/**
 * 执行「清空会话并归档快照」核心流水线
 * @param {{
 *   sessionId: string,
 *   canvasWorkspaceId?: string,
 *   title?: string,
 * }} opts
 * @returns {Promise<{ ok: boolean, snapshot?: object, newSessionId?: string, error?: string }>}
 */
export async function executeSessionClearAndSnapshot(opts) {
  const currentSessionId = opts.sessionId;
  if (!currentSessionId) return { ok: false, error: 'no-session-id' };

  const canvasWorkspaceId = opts.canvasWorkspaceId || resolveCurrentCanvasWorkspaceId(currentSessionId);
  const title = opts.title || resolveCurrentSessionTitle(currentSessionId);

  // 1. 保存当前状态为快照
  let snapshot = null;
  if (canvasWorkspaceId) {
    snapshot = saveSessionSnapshot({
      sessionId: currentSessionId,
      canvasWorkspaceId,
      title,
    });
  }

  // 2. 获取 sessions 服务并创建/切换新会话
  const sessions = opts.sessions || getWorkbenchSessions();
  let newSessionId = null;

  try {
    if (sessions && typeof sessions.create === 'function') {
      const currentSnap = sessions.list?.getSnapshot?.();
      const currentItem = currentSnap?.byId?.[currentSessionId];
      const workspaceId = currentItem?.workspaceId;

      newSessionId = await sessions.create(workspaceId ? { workspaceId } : {});
      if (newSessionId && canvasWorkspaceId) {
        registerSessionCanvasInheritance(newSessionId, canvasWorkspaceId);
      }
      if (newSessionId && typeof sessions.open === 'function') {
        sessions.open(newSessionId);
      }
    } else if (typeof document !== 'undefined') {
      const btn = findOfficialNewSessionButton(document);
      if (btn) {
        btn.click();
      }
    }

    showHeaderToast('已保存当前快照并重置对话');
    return { ok: true, snapshot, newSessionId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
