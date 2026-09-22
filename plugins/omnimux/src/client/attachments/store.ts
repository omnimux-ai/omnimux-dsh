import type {
  AttachmentPayload,
  ConversationAttachment,
} from './types.ts';

export const MAX_ATTACHMENTS_PER_SESSION = 8;

export interface AddAttachmentResult {
  ok: boolean;
  reason?: 'duplicate' | 'quota-exceeded' | 'invalid-payload';
  attachment?: ConversationAttachment;
}

export interface AttachmentStore {
  getSnapshot(sessionId: string): readonly ConversationAttachment[];
  subscribe(sessionId: string, listener: () => void): () => void;
  addAttachment(sessionId: string, payload: AttachmentPayload): AddAttachmentResult;
  removeAttachment(sessionId: string, attachmentId: string): void;
  clear(sessionId: string): void;
  getActiveSessionId(): string;
  setActiveSessionId(sessionId: string): void;
  /**
   * 将 `'default'` 待挂载附件认领迁移到目标会话。
   * 跨插件 Stage 未携带 sessionId 时，附件会先落入 default；
   * 会话 Tray 挂载后调用本方法完成迁移。
   * @returns 成功迁移的数量
   */
  claimPendingAttachments(targetSessionId: string): number;
  installGlobalEvents(): () => void;
  /** 任意会话的素材增删。@ 菜单用它刷新候选，不绑定某一个会话。 */
  subscribeRoster(listener: () => void): () => void;
}

/**
 * 提取文件全大写格式扩展名（如 MD, HTABLE, PNG 等）
 */
export function inferExtension(title: string, relativePath: string, explicitExt?: string): string {
  if (explicitExt) {
    return explicitExt.replace(/^\./, '').toUpperCase();
  }
  const target = relativePath || title;
  const match = target.match(/\.([a-zA-Z0-9_-]+)$/);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  return 'FILE';
}

/**
 * 计算附件唯一指纹
 */
export function generateFingerprint(payload: AttachmentPayload): string {
  const parts = [
    payload.sourcePlugin || 'unknown',
    payload.kind || 'file',
    payload.entityId || '',
    payload.relativePath || payload.title || '',
  ];
  return parts.join('::');
}

/**
 * 创建附件响应式 Store 实例
 */
export function createAttachmentStore(): AttachmentStore {
  const sessionMap = new Map<string, ConversationAttachment[]>();
  const listenersMap = new Map<string, Set<() => void>>();
  const rosterListeners = new Set<() => void>();
  let activeSessionId = 'default';
  /** 同一 store 实例只允许注册一套全局事件监听（单例创建与插件 effect 各调用一次）。 */
  let globalEventsInstalled = false;

  function notify(sessionId: string) {
    const listeners = listenersMap.get(sessionId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener();
        } catch (err) {
          console.error('[AttachmentStore] listener error:', err);
        }
      }
    }
    for (const listener of rosterListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[AttachmentStore] roster listener error:', err);
      }
    }
  }

  const EMPTY_LIST: readonly ConversationAttachment[] = Object.freeze([]);

  /**
   * 将 `'default'` 分组中的待挂载附件依次迁移到目标会话。
   * 遵循指纹去重与单会话容量上限；无论是否全部迁入，都会清空 default 分组。
   */
  function claimPendingAttachments(targetSessionId: string): number {
    if (!targetSessionId || targetSessionId === 'default') {
      return 0;
    }
    const pending = sessionMap.get('default');
    if (!pending || pending.length === 0) {
      return 0;
    }

    const currentList = [...(sessionMap.get(targetSessionId) || [])];
    const fingerprints = new Set(currentList.map((item) => item.fingerprint));
    let migrated = 0;

    for (const item of pending) {
      if (currentList.length >= MAX_ATTACHMENTS_PER_SESSION) {
        break;
      }
      const fingerprint = item.fingerprint || generateFingerprint(item);
      if (fingerprints.has(fingerprint)) {
        continue;
      }
      fingerprints.add(fingerprint);
      currentList.push({
        ...item,
        fingerprint,
        sessionId: targetSessionId,
      });
      migrated += 1;
    }

    sessionMap.set('default', []);
    if (migrated > 0) {
      sessionMap.set(targetSessionId, currentList);
      notify(targetSessionId);
      notify('default');
    } else {
      // default 已清空但目标会话未新增（全部去重或已满），仍需通知 default 订阅者
      notify('default');
    }

    return migrated;
  }

  function addAttachment(sessionId: string, payload: AttachmentPayload): AddAttachmentResult {
    if (!payload || !payload.title) {
      return { ok: false, reason: 'invalid-payload' };
    }
    const targetId = sessionId || (activeSessionId !== 'default' ? activeSessionId : 'default');
    const currentList = sessionMap.get(targetId) || [];

    // 1. 容量上限检查 (最大 8 项)
    if (currentList.length >= MAX_ATTACHMENTS_PER_SESSION) {
      return { ok: false, reason: 'quota-exceeded' };
    }

    // 2. 指纹去重检查
    const fingerprint = generateFingerprint(payload);
    const existingIndex = currentList.findIndex((item) => item.fingerprint === fingerprint);
    if (existingIndex >= 0) {
      // 已存在：触发微更新通知（让前端触发呼吸高亮），但不重复追加
      notify(targetId);
      return { ok: false, reason: 'duplicate', attachment: currentList[existingIndex] };
    }

    // 3. 构建新 Attachment
    const extension = inferExtension(payload.title, payload.relativePath, payload.extension);
    const now = Date.now();
    const id = `att_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const newAttachment: ConversationAttachment = {
      id,
      fingerprint,
      sessionId: targetId,
      sourcePlugin: payload.sourcePlugin,
      kind: payload.kind,
      entityId: payload.entityId,
      title: payload.title,
      extension,
      relativePath: payload.relativePath,
      absolutePath: payload.absolutePath,
      previewUrl: payload.previewUrl,
      duration: payload.duration,
      status: 'ready',
      metadata: payload.metadata,
      createdAt: now,
    };

    sessionMap.set(targetId, [...currentList, newAttachment]);
    notify(targetId);

    return { ok: true, attachment: newAttachment };
  }

  function removeAttachment(sessionId: string, attachmentId: string) {
    const targetId = sessionId || activeSessionId;
    const currentList = sessionMap.get(targetId);
    if (!currentList || currentList.length === 0) return;

    const filtered = currentList.filter((item) => item.id !== attachmentId);
    if (filtered.length === currentList.length) return;

    sessionMap.set(targetId, filtered);
    notify(targetId);
  }

  function clear(sessionId: string) {
    const targetId = sessionId || activeSessionId;
    const currentList = sessionMap.get(targetId);
    if (!currentList || currentList.length === 0) return;

    sessionMap.set(targetId, []);
    notify(targetId);
  }

  return {
    getActiveSessionId() {
      return activeSessionId;
    },

    setActiveSessionId(sessionId: string) {
      if (sessionId && sessionId !== 'default') {
        activeSessionId = sessionId;
        claimPendingAttachments(sessionId);
        return;
      }
      if (sessionId) {
        activeSessionId = sessionId;
      }
    },

    getSnapshot(sessionId: string): readonly ConversationAttachment[] {
      const targetId = sessionId || activeSessionId;
      return sessionMap.get(targetId) || EMPTY_LIST;
    },

    subscribe(sessionId: string, listener: () => void): () => void {
      const targetId = sessionId || activeSessionId;
      let set = listenersMap.get(targetId);
      if (!set) {
        set = new Set();
        listenersMap.set(targetId, set);
      }
      set.add(listener);
      return () => {
        set?.delete(listener);
        if (set?.size === 0) {
          listenersMap.delete(targetId);
        }
      };
    },

    addAttachment,

    claimPendingAttachments,

    removeAttachment,

    clear,

    subscribeRoster(listener: () => void): () => void {
      rosterListeners.add(listener);
      return () => {
        rosterListeners.delete(listener);
      };
    },

    installGlobalEvents(): () => void {
      if (typeof window === 'undefined') return () => {};
      // 幂等：`getGlobalAttachmentStore()` 与插件 effect 各安装一次，重复注册会让同一事件被处理两次。
      // 返回空清理函数而非真实卸载器，避免后安装方撤销先安装方的监听。
      if (globalEventsInstalled) return () => {};
      globalEventsInstalled = true;

      const handleAdd = (e: Event) => {
        const customEvent = e as CustomEvent<AttachmentPayload & { sessionId?: string }>;
        const detail = customEvent.detail;
        if (!detail) return;
        // 跨插件 Stage 未携带 sessionId 时落入 '' → addAttachment 解析为 default（或当前活跃会话）
        const targetSession = detail.sessionId || '';
        addAttachment(targetSession, detail);
      };

      const handleRemove = (e: Event) => {
        const customEvent = e as CustomEvent<{ id: string; sessionId?: string }>;
        const detail = customEvent.detail;
        if (!detail?.id) return;
        const targetSession = detail.sessionId || activeSessionId;
        removeAttachment(targetSession, detail.id);
      };

      const handleClear = (e: Event) => {
        const customEvent = e as CustomEvent<{ sessionId?: string }>;
        const targetSession = customEvent.detail?.sessionId || activeSessionId;
        clear(targetSession);
      };

      window.addEventListener('omnimux:add-to-conversation', handleAdd);
      window.addEventListener('omnimux:remove-from-conversation', handleRemove);
      window.addEventListener('omnimux:clear-conversation-attachments', handleClear);

      return () => {
        globalEventsInstalled = false;
        window.removeEventListener('omnimux:add-to-conversation', handleAdd);
        window.removeEventListener('omnimux:remove-from-conversation', handleRemove);
        window.removeEventListener('omnimux:clear-conversation-attachments', handleClear);
      };
    },
  };
}

/**
 * 获取或初始化全局唯一的 AttachmentStore 单例
 */
export function getGlobalAttachmentStore(): AttachmentStore {
  if (typeof window !== 'undefined') {
    if (!(window as any).__omnimuxAttachments) {
      const store = createAttachmentStore();
      (window as any).__omnimuxAttachments = store;
      store.installGlobalEvents();
    }
    return (window as any).__omnimuxAttachments;
  }
  return createAttachmentStore();
}
