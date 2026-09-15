import type { ReferenceContext } from './types.ts';

export interface StoredShadowContext {
  entityId: string;
  context: ReferenceContext;
  registeredAt: number;
}

export interface ShadowContextStore {
  /** 注册一条隐形伴随上下文 */
  registerContext(sessionId: string, entityId: string, context: ReferenceContext): void;
  /** 移除指定实体的隐形上下文 */
  removeContext(sessionId: string, entityId: string): void;
  /** 读取指定会话的所有隐形上下文快照 */
  getSnapshot(sessionId: string): readonly StoredShadowContext[];
  /** 消费并清空指定会话的隐形上下文 (用于本轮请求递送) */
  consume(sessionId: string): readonly StoredShadowContext[];
  /** 清空指定会话 */
  clear(sessionId: string): void;
  /** 订阅上下文变化 */
  subscribe(sessionId: string, listener: () => void): () => void;
  /** 格式化为给 Agent 内部系统/伴随上下文通道的消息块 (正文界面不可见) */
  formatSystemContext(sessionId: string): string;
}

const EMPTY_LIST: readonly StoredShadowContext[] = Object.freeze([]);

export function createShadowContextStore(): ShadowContextStore {
  const store = new Map<string, StoredShadowContext[]>();
  const listenersMap = new Map<string, Set<() => void>>();

  function notify(sessionId: string) {
    const listeners = listenersMap.get(sessionId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener();
        } catch (err) {
          console.error('[ShadowContextStore] listener error:', err);
        }
      }
    }
  }

  return {
    registerContext(sessionId: string, entityId: string, context: ReferenceContext) {
      const targetSession = sessionId || 'default';
      const list = store.get(targetSession) || [];
      // 实体去重，更新最新的场景上下文
      const filtered = list.filter((item) => item.entityId !== entityId);
      filtered.push({
        entityId,
        context,
        registeredAt: Date.now(),
      });
      store.set(targetSession, filtered);
      notify(targetSession);
    },

    removeContext(sessionId: string, entityId: string) {
      const targetSession = sessionId || 'default';
      const list = store.get(targetSession);
      if (!list || list.length === 0) return;
      const next = list.filter((item) => item.entityId !== entityId);
      store.set(targetSession, next);
      notify(targetSession);
    },

    getSnapshot(sessionId: string): readonly StoredShadowContext[] {
      const targetSession = sessionId || 'default';
      return store.get(targetSession) || EMPTY_LIST;
    },

    consume(sessionId: string): readonly StoredShadowContext[] {
      const targetSession = sessionId || 'default';
      const items = store.get(targetSession) || [];
      store.delete(targetSession);
      notify(targetSession);
      return items;
    },

    clear(sessionId: string) {
      const targetSession = sessionId || 'default';
      store.delete(targetSession);
      notify(targetSession);
    },

    subscribe(sessionId: string, listener: () => void): () => void {
      const targetSession = sessionId || 'default';
      let set = listenersMap.get(targetSession);
      if (!set) {
        set = new Set();
        listenersMap.set(targetSession, set);
      }
      set.add(listener);
      return () => {
        set?.delete(listener);
        if (set?.size === 0) {
          listenersMap.delete(targetSession);
        }
      };
    },

    formatSystemContext(sessionId: string): string {
      const targetSession = sessionId || 'default';
      const items = store.get(targetSession);
      if (!items || items.length === 0) return '';

      const lines: string[] = ['[场景附加上下文 / Scene Enrichment Context]:'];
      for (const item of items) {
        const { scene, summary, metadata } = item.context;
        lines.push(`- 实体: ${item.entityId} (场景: ${scene})`);
        if (summary) {
          lines.push(`  摘要: ${summary}`);
        }
        if (metadata && Object.keys(metadata).length > 0) {
          lines.push(`  元数据: ${JSON.stringify(metadata)}`);
        }
      }
      return lines.join('\n');
    },
  };
}

let globalShadowContextStore: ShadowContextStore | null = null;

export function getGlobalShadowContextStore(): ShadowContextStore {
  if (typeof window !== 'undefined') {
    if (!(window as any).__omnimuxShadowContext) {
      (window as any).__omnimuxShadowContext = createShadowContextStore();
    }
    return (window as any).__omnimuxShadowContext;
  }
  if (!globalShadowContextStore) {
    globalShadowContextStore = createShadowContextStore();
  }
  return globalShadowContextStore;
}
