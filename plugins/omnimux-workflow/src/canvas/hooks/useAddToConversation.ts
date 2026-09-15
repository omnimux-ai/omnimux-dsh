import { useCallback } from 'react';
import { toast } from '../ui/toast';

export interface AddToConversationPayload {
  sourcePlugin?: 'omnimux-workflow' | 'omnimux-assets' | 'omnimux-products' | 'omnimux-inspiration' | 'omnimux-clip';
  kind: 'image' | 'video' | 'audio' | 'table' | 'document' | 'canvas' | 'asset' | 'product';
  entityId: string;
  title: string;
  extension?: string;
  relativePath: string;
  absolutePath?: string;
  previewUrl?: string;
  duration?: string;
  metadata?: Record<string, unknown>;
  /** 目标会话落点；缺省时由中枢按当前活跃会话归属。 */
  sessionId?: string;
}

const KIND_LABELS: Record<string, string> = {
  table: '表格',
  video: '视频',
  image: '图像',
  audio: '音频',
  document: '文档',
  canvas: '工作流',
  asset: '资产',
  product: '产品',
};

/** 中枢附件 store 的同步回执（`AddAttachmentResult` 的结构子集）。 */
export interface AttachmentAddReceipt {
  ok?: boolean;
  reason?: string;
}

interface WorkbenchApi {
  getConversationCollapsed?: () => boolean;
  setConversationCollapsed?: (collapsed: boolean, opts?: Record<string, unknown>) => void;
  setFocus?: (mode: 'split' | 'gui' | 'chat') => void;
  getSnapshot?: () => { sessionId?: string } | null | undefined;
  /**
   * 中枢提供的「让对话可见」统一入口：同时处理**宿主右侧栏全屏**与**插件折叠键**两层状态。
   * 缺失（老内核）时退回下面的 `getConversationCollapsed` + `setFocus` 路径。
   */
  ensureConversationVisible?: () => { hostFullscreenExited?: boolean; collapseCleared?: boolean } | undefined;
}

interface AttachmentStoreApi {
  addAttachment?: (sessionId: string, payload: unknown) => AttachmentAddReceipt | null | undefined;
}

interface ComposerActionsApi {
  revealAttachments?: () => void;
}

/** 画布与宿主同文档共享的全局对象；全部可选，缺失时必须静默跳过。 */
export interface CanvasHostWindow {
  __omnimuxWorkbench?: WorkbenchApi;
  __omnimuxAttachments?: AttachmentStoreApi;
  __omnimuxComposerActions?: ComposerActionsApi;
  dispatchEvent?: (event: Event) => boolean;
}

/** 会话栏露出结果：`skipped` 已展开无需动作，`unavailable` 读不到中枢 API。 */
export type RevealOutcome = 'skipped' | 'revealed' | 'unavailable';

export interface DeliverResult {
  /** 附件是否确实进入会话（回执 `ok` 或 `duplicate`，或无 store 时的兼容回退）。 */
  attached: boolean;
  revealed: RevealOutcome;
  receipt: AttachmentAddReceipt | null;
}

function readHostWindow(): CanvasHostWindow | undefined {
  return typeof window !== 'undefined' ? (window as unknown as CanvasHostWindow) : undefined;
}

function readActiveSessionId(targetWindow?: CanvasHostWindow): string | undefined {
  try {
    const sessionId = targetWindow?.__omnimuxWorkbench?.getSnapshot?.()?.sessionId;
    return typeof sessionId === 'string' && sessionId ? sessionId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 按需露出中间会话栏。
 *
 * 已展开时不写任何布局（避免无谓跳动）；折叠或读不到时展开并切回分栏焦点，
 * 随后再读一次确认——折叠位可能被外部状态压回，此时补一次。
 *
 * 注意：`getConversationCollapsed()` 只回答「是否被折叠」，不回答「是否被覆盖」。
 * 若宿主原生全屏（`[data-sidebar-right-panel="fullscreen"]`）在未折叠状态下覆盖会话列，
 * 本函数按「已展开」契约跳过，插件侧无 API 可判别该差异。
 */
export function revealConversationColumn(targetWindow?: CanvasHostWindow): RevealOutcome {
  const workbench = (targetWindow ?? readHostWindow())?.__omnimuxWorkbench;
  if (!workbench) return 'unavailable';

  // 优先走中枢的统一入口：它同时退出「宿主右侧栏全屏」并清折叠键。
  // 只清折叠键在宿主全屏下无效——全屏由宿主自己的状态键驱动，此刻折叠键往往是 false，
  // 于是「读到 false 就跳过」的写法会让会话栏永远不被带出来（提示成功、界面不动）。
  if (typeof workbench.ensureConversationVisible === 'function') {
    try {
      const result = workbench.ensureConversationVisible();
      if (result && typeof result === 'object') {
        return result.hostFullscreenExited || result.collapseCleared ? 'revealed' : 'skipped';
      }
    } catch {
      /* 中枢入口异常时落到下面的兜底路径，绝不打断添加 */
    }
  }

  const readCollapsed = (): boolean | undefined => {
    try {
      return typeof workbench.getConversationCollapsed === 'function'
        ? workbench.getConversationCollapsed()
        : undefined;
    } catch {
      return undefined;
    }
  };

  if (readCollapsed() === false) return 'skipped';

  const expand = (): void => {
    try {
      workbench.setConversationCollapsed?.(false);
    } catch {
      /* 缺 API 或调用失败都不能阻断后续添加 */
    }
    try {
      workbench.setFocus?.('split');
    } catch {
      /* 同上 */
    }
  };

  expand();
  // 兜底一次：`setConversationCollapsed` 在真实宿主是同步写内存态的，正常路径下此处读回必为 false，
  // 只有「设置器抛错 / 未挂载，持久化的旧值仍被读到」这类退化路径才会命中，命中后也只是重复一次同样的调用（无循环）。
  if (readCollapsed() === true) expand();

  return 'revealed';
}

function addToAttachmentStore(
  targetWindow: CanvasHostWindow | undefined,
  detail: AddToConversationPayload,
): AttachmentAddReceipt | null {
  const api = targetWindow?.__omnimuxAttachments;
  if (!api || typeof api.addAttachment !== 'function') return null;
  try {
    // 落点由第一参数决定：'' 交给中枢按当前活跃会话解析（与 assets 的 add-to-chat 同惯例）。
    // `detail.sessionId` 只在下面的事件回退路径被中枢 handleAdd 读取，这里刻意不传，避免绕过导轨的会话归属。
    const result = api.addAttachment('', detail);
    return result && typeof result === 'object' ? result : null;
  } catch {
    return null;
  }
}

function dispatchAddEvent(targetWindow: CanvasHostWindow | undefined, detail: AddToConversationPayload): void {
  try {
    targetWindow?.dispatchEvent?.(new CustomEvent('omnimux:add-to-conversation', { detail }));
  } catch {
    /* 事件通道不可用不影响剪贴板兜底 */
  }
}

function writeClipboardFallback(payload: AddToConversationPayload): void {
  const kindLabel = KIND_LABELS[payload.kind] || '文件';
  const clipText = `[${kindLabel}: ${payload.title}](@${payload.relativePath})`;
  navigator.clipboard?.writeText?.(clipText).catch(() => {});
}

/**
 * 交付一次「添加到会话」：先按需露出会话栏，再落库并按同步回执提示。
 *
 * 拿到回执时不再派发事件（避免二次入桶）；拿不到全局 store 时回退到既有事件通道。
 * 剪贴板兜底在所有分支保留。
 *
 * @param payload 画布侧构造的附件描述
 * @param targetWindow 宿主 window（缺省取当前 window），供单测注入
 */
export function deliverToConversation(
  payload: AddToConversationPayload,
  targetWindow: CanvasHostWindow | undefined = readHostWindow(),
): DeliverResult {
  const sourcePlugin = payload.sourcePlugin || 'omnimux-workflow';
  const sessionId = payload.sessionId || readActiveSessionId(targetWindow);
  const detail: AddToConversationPayload = sessionId
    ? { ...payload, sourcePlugin, sessionId }
    : { ...payload, sourcePlugin };

  // 1. 先检查会话栏：已展开则不做任何布局动作
  const revealed = revealConversationColumn(targetWindow);

  // 2. 落库并拿同步回执，由回执决定提示文案
  const receipt = addToAttachmentStore(targetWindow, detail);
  let attached: boolean;
  if (receipt) {
    attached = receipt.ok === true || receipt.reason === 'duplicate';
    if (attached) {
      toast.success(`已添加到会话：${payload.title}`);
    } else if (receipt.reason === 'quota-exceeded') {
      toast.warning('附件最多 8 个，请先移除一个再添加');
    } else {
      toast.warning('添加失败，请重试');
    }
  } else {
    // 回退到既有行为：派发事件 + 成功提示，保持向后兼容
    dispatchAddEvent(targetWindow, detail);
    toast.success(`已添加到会话：${payload.title}`);
    attached = true;
  }

  // 3. 剪贴板兜底
  writeClipboardFallback(payload);

  // 4. 成功后把用户视线带到附件区（拿不到能力则静默跳过）
  if (attached) {
    try {
      targetWindow?.__omnimuxComposerActions?.revealAttachments?.();
    } catch {
      /* 中枢未挂载视线引导能力时忽略 */
    }
  }

  return { attached, revealed, receipt };
}

export function useAddToConversation() {
  const addToConversation = useCallback((payload: AddToConversationPayload) => {
    if (!payload || !payload.title) return;

    deliverToConversation(payload);
  }, []);

  return { addToConversation };
}
