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

export interface CanvasIslandProps {
  onClose?: () => void;
  /** 宿主语言通道（W1 i18n 骨架）：'zh' | 'en'，未知值回退 zh。 */
  locale?: 'zh' | 'en';
  /** 专属工作区/画布 ID */
  workspaceId?: string;
}

interface RootEntry {
  root: Root;
  lastProps: CanvasIslandProps;
}

const roots = new WeakMap<HTMLElement, RootEntry>();
// Canvas and table stores are shared by the island: only one root may own them.
let activeElement: HTMLElement | null = null;

export function mountCanvas(el: HTMLElement, props: CanvasIslandProps): void {
  if (!el || roots.has(el)) return;
  if (activeElement) unmountCanvas(activeElement);
  injectCanvasStyles();
  const root = createRoot(el);
  roots.set(el, { root, lastProps: props });
  activeElement = el;
  root.render(<App {...props} />);
}

/**
 * W4 T4.1: 宿主语言 live 切换通道 —— 同一 root 重 render 新 props
 * （禁止 unmount/remount：会丢 island 内存中的画布状态）。
 */
export function updateCanvas(el: HTMLElement, props: CanvasIslandProps): void {
  const entry = roots.get(el);
  if (!entry) return;
  if (entry.lastProps.workspaceId !== props.workspaceId) {
    unmountCanvas(el);
    mountCanvas(el, props);
    return;
  }
  entry.lastProps = props;
  entry.root.render(<App {...props} />);
}

export function unmountCanvas(el: HTMLElement): void {
  const entry = roots.get(el);
  if (!entry) return;
  entry.root.unmount();
  roots.delete(el);
  if (activeElement === el) activeElement = null;
}

export { useTextStageStore } from './store/textStageStore';
export { useCanvasStore } from './store/canvasStore';

