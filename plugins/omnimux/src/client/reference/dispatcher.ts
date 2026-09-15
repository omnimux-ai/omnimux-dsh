import { getGlobalAttachmentStore } from '../attachments/store.ts';
import { focusEditorElement } from '../attachments/focusEditorElement.ts';
import { getGlobalShadowContextStore } from './shadow-context.ts';
import type {
  UnifiedReference,
  DeliverReferenceOptions,
  DeliverReferenceReceipt,
} from './types.ts';

export interface HostWindowContext {
  __omnimuxWorkbench?: {
    getConversationCollapsed?: () => boolean;
    setConversationCollapsed?: (collapsed: boolean, opts?: Record<string, unknown>) => void;
    setFocus?: (mode: string) => void;
    getSnapshot?: () => { sessionId?: string } | null | undefined;
    ensureConversationVisible?: () => { hostFullscreenExited?: boolean; collapseCleared?: boolean } | undefined;
  };
  __omnimuxAttachments?: {
    addAttachment?: (sessionId: string, payload: unknown) => { ok?: boolean; reason?: string } | null | undefined;
    getActiveSessionId?: () => string;
  };
  __omnimuxComposerActions?: {
    setDraft?: (text: string) => void;
    getDraft?: () => string;
    revealAttachments?: () => void;
  };
  dispatchEvent?: (event: Event) => boolean;
  navigator?: {
    clipboard?: {
      writeText?: (text: string) => Promise<void>;
    };
  };
}

function resolveHostWindow(customWin?: unknown): HostWindowContext | undefined {
  if (customWin) return customWin as HostWindowContext;
  return typeof window !== 'undefined' ? (window as unknown as HostWindowContext) : undefined;
}

function resolveSessionId(win?: HostWindowContext, explicitId?: string): string {
  if (explicitId) return explicitId;
  try {
    const fromWb = win?.__omnimuxWorkbench?.getSnapshot?.()?.sessionId;
    if (typeof fromWb === 'string' && fromWb) return fromWb;
    const fromAtt = win?.__omnimuxAttachments?.getActiveSessionId?.();
    if (typeof fromAtt === 'string' && fromAtt && fromAtt !== 'default') return fromAtt;
  } catch {
    // ignore read errors
  }
  return '';
}

/**
 * 展开中间会话栏 (分栏显示)
 */
export function ensureConversationVisible(win?: HostWindowContext): boolean {
  const wb = win?.__omnimuxWorkbench;
  if (!wb) return false;

  // 1. 优先使用中枢统一的「让会话可见」API
  if (typeof wb.ensureConversationVisible === 'function') {
    try {
      wb.ensureConversationVisible();
      return true;
    } catch {
      // ignore
    }
  }

  // 2. 检查折叠并展开
  try {
    const isCollapsed = wb.getConversationCollapsed?.();
    if (isCollapsed !== false) {
      wb.setConversationCollapsed?.(false);
      wb.setFocus?.('split');
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * 将 UnifiedReference 转换为底座 AttachmentPayload
 */
function toAttachmentPayload(ref: UnifiedReference) {
  const sourcePlugin = ref.source === 'workflow'
    ? 'omnimux-workflow'
    : ref.source === 'asset'
    ? 'omnimux-assets'
    : ref.source === 'product'
    ? 'omnimux-products'
    : ref.source === 'inspiration'
    ? 'omnimux-inspiration'
    : 'omnimux';

  const ext = ref.file.extension
    || (ref.file.relativePath ? ref.file.relativePath.split('.').pop()?.toUpperCase() : '')
    || 'FILE';

  return {
    sourcePlugin,
    kind: ref.kind,
    entityId: ref.id,
    title: ref.title,
    extension: ext,
    relativePath: ref.file.relativePath,
    absolutePath: ref.file.absolutePath,
    previewUrl: ref.file.previewUrl,
    duration: ref.file.duration,
    metadata: {
      reference_id: ref.id,
      source: ref.source,
      scene: ref.context?.scene,
      summary: ref.context?.summary,
      ...(ref.context?.metadata || {}),
    },
  };
}

/**
 * 轻量级状态通知 (环境自适应)
 */
function notifyToast(win: HostWindowContext | undefined, message: string, type: 'success' | 'warning' = 'success') {
  try {
    // 派发全局 toast 事件供 UI 框架捕获
    if (typeof win?.dispatchEvent === 'function') {
      win.dispatchEvent(new CustomEvent('omnimux:toast', { detail: { message, type } }));
    }
  } catch {
    // ignore
  }
}

/**
 * 全平台统一引用分发调度器
 */
export async function deliverReference(
  ref: UnifiedReference,
  options: DeliverReferenceOptions = {},
  customWin?: unknown
): Promise<DeliverReferenceReceipt> {
  const win = resolveHostWindow(customWin);
  const targetSession = resolveSessionId(win, options.sessionId);

  // 1. 自动展开会话分栏
  if (options.revealMode !== 'keep') {
    ensureConversationVisible(win);
  }

  // 2. 挂载本地文件到会话附件导轨
  const payload = toAttachmentPayload(ref);
  const store = win?.__omnimuxAttachments || (typeof window !== 'undefined' ? getGlobalAttachmentStore() : null);

  let ok = true;
  let reason: DeliverReferenceReceipt['reason'] = undefined;

  if (store && typeof store.addAttachment === 'function') {
    const res = store.addAttachment(targetSession, payload);
    ok = Boolean(res?.ok || res?.reason === 'duplicate');
    reason = res?.reason as DeliverReferenceReceipt['reason'];
  } else {
    // 降级派发全局事件
    try {
      win?.dispatchEvent?.(new CustomEvent('omnimux:add-to-conversation', { detail: payload }));
    } catch {
      ok = false;
      reason = 'unavailable';
    }
  }

  // 3. 注册隐形场景上下文 (只进模型伴随通道，绝不上屏，不改写 Prompt 文本)
  if (ref.context) {
    const shadowStore = getGlobalShadowContextStore();
    shadowStore.registerContext(targetSession, ref.id, ref.context);
  }

  // 4. 派发附件区高亮与聚焦动效
  if (ok) {
    try {
      win?.dispatchEvent?.(new CustomEvent('omnimux:attachments:reveal', { detail: { sessionId: targetSession } }));
    } catch {
      // ignore
    }
    focusEditorElement(win as unknown as Window);
  }

  // 5. 提示反馈
  if (options.showToast !== false) {
    if (ok) {
      notifyToast(win, `已引用：${ref.title}`, 'success');
    } else if (reason === 'quota-exceeded') {
      notifyToast(win, '附件最多 8 个，请先移除一个再添加', 'warning');
    } else {
      notifyToast(win, '引用失败，请重试', 'warning');
    }
  }

  // 6. 可选设置预填 Prompt (仅由调用方明确指定时才预填，上下文绝不混入)
  if (options.prefillPrompt && win?.__omnimuxComposerActions?.setDraft) {
    try {
      win.__omnimuxComposerActions.setDraft(options.prefillPrompt);
    } catch {
      // ignore
    }
  }

  // 7. 剪贴板兜底 (用于多端或异常情况无缝复制)
  if (ref.file.relativePath && win?.navigator?.clipboard?.writeText) {
    const clipText = `[${ref.title}](@${ref.file.relativePath})`;
    try {
      void win.navigator.clipboard.writeText(clipText);
    } catch {
      // ignore
    }
  }

  const receipt: DeliverReferenceReceipt = {
    ok,
    reason,
    referenceId: ref.id,
    fingerprint: `${ref.source}::${ref.kind}::${ref.id}`,
  };

  if (ok) {
    options.onSuccess?.(receipt);
  } else {
    options.onError?.(reason || 'unknown');
  }

  return receipt;
}
