/**
 * omnimux-workflow canvas island entry — the IIFE global API.
 *
 * build-canvas.mjs bundles this file (React 19 included) into
 * lib/canvas.js with globalName `__omnimuxWorkflowCanvas`. The host React 18
 * CanvasBridge calls mountCanvas(el, props) / unmountCanvas(el).
 *
 * HARD RULE: props crossing this boundary are plain data + callbacks
 * only — never React elements, refs, context, or component types.
 */

import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { injectCanvasStyles } from './injectStyles';
import { transitionDirectorCanvas } from './bridge/directorLifecycle';
export { registerDirectorCloseGuard, prepareDirectorClose } from './bridge/directorLifecycle';

export interface CanvasIslandProps {
  onClose?: () => void;
  onError?: (error: Error) => void;
  /** 宿主语言通道（W1 i18n 骨架）：'zh' | 'en'，未知值回退 zh。 */
  locale?: 'zh' | 'en';
  /** 专属工作区/画布 ID */
  workspaceId?: string;
  /** 「项目」页「AI应用」卡片「编辑」的目标工作流组 id（纯数据 prop）。 */
  focusGroupId?: string;
}

interface RootEntry {
  root: Root;
  lastProps: CanvasIslandProps;
}

const roots = new WeakMap<HTMLElement, RootEntry>();
const receipts = new WeakMap<HTMLElement, Promise<boolean>>();

function recordTransition(el: HTMLElement, receipt: Promise<boolean>): Promise<boolean> {
  if (el) receipts.set(el, receipt);
  return receipt;
}

/** Await the island-owned receipt even when a host wrapper drops its return value. */
export function settleCanvas(el: HTMLElement): Promise<boolean> {
  return receipts.get(el) ?? Promise.resolve(false);
}
// Canvas and table stores are shared by the island: only one root may own them.
let activeElement: HTMLElement | null = null;

function disposeRoot(el: HTMLElement): void {
  const entry = roots.get(el);
  if (!entry) return;
  entry.root.unmount();
  roots.delete(el);
  if (activeElement === el) activeElement = null;
}

function renderRoot(el: HTMLElement, entry: RootEntry, props: CanvasIslandProps): void {
  entry.lastProps = props;
  entry.root.render(<App {...props} onClose={() => {
    void unmountCanvas(el).then(closed => { if (closed) props.onClose?.(); });
  }} />);
}

function createCanvasRoot(el: HTMLElement, props: CanvasIslandProps): void {
  injectCanvasStyles();
  const entry = { root: createRoot(el), lastProps: props };
  roots.set(el, entry);
  activeElement = el;
  renderRoot(el, entry, props);
}

async function guardedTransition(props: CanvasIslandProps, action: () => void, needsClose: () => boolean): Promise<boolean> {
  try {
    const confirmed = await transitionDirectorCanvas(action, needsClose);
    if (!confirmed) props.onError?.(new Error('导演台修改尚未确认保存，原画布已保留，请重试关闭'));
    return confirmed;
  } catch (error) {
    props.onError?.(error instanceof Error ? error : new Error('导演台关闭未完成，原画布已保留'));
    return false;
  }
}

export function mountCanvas(el: HTMLElement, props: CanvasIslandProps): Promise<boolean> {
  return recordTransition(el, guardedTransition(props, () => {
    if (!el) return;
    const existing = roots.get(el);
    if (existing && existing.lastProps.workspaceId === props.workspaceId) {
      renderRoot(el, existing, props);
      return;
    }
    if (activeElement) disposeRoot(activeElement);
    createCanvasRoot(el, props);
  }, () => {
    const existing = roots.get(el);
    return Boolean(el && activeElement && (!existing || existing.lastProps.workspaceId !== props.workspaceId));
  }));
}

/** Same-workspace prop updates keep the existing root and canvas state. */
export function updateCanvas(el: HTMLElement, props: CanvasIslandProps): Promise<boolean> {
  return recordTransition(el, guardedTransition(props, () => {
    const entry = roots.get(el);
    if (!entry) return;
    if (entry.lastProps.workspaceId !== props.workspaceId) {
      disposeRoot(el);
      createCanvasRoot(el, props);
      return;
    }
    renderRoot(el, entry, props);
  }, () => {
    const entry = roots.get(el);
    return Boolean(entry && entry.lastProps.workspaceId !== props.workspaceId);
  }));
}

/** A denied close retains the root, its DOM reference and its registered draft guards. */
export function unmountCanvas(el: HTMLElement): Promise<boolean> {
  const props = roots.get(el)?.lastProps ?? {};
  return recordTransition(el, guardedTransition(props, () => disposeRoot(el), () => roots.has(el)));
}

export interface CanvasRootState {
  mounted: boolean;
  active: boolean;
  workspaceId?: string;
}

/** Plain-data proof for hosts that wrap island methods without forwarding receipts. */
export function getCanvasState(el: HTMLElement): CanvasRootState {
  const entry = roots.get(el);
  return { mounted: Boolean(entry), active: activeElement === el, workspaceId: entry?.lastProps.workspaceId };
}

export function closeActiveCanvas(): Promise<boolean> {
  return activeElement ? unmountCanvas(activeElement) : Promise.resolve(true);
}

export { useTextStageStore } from './store/textStageStore';

