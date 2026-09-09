import React from 'react';
import { createRoot } from 'react-dom/client';
import { injectSessionHeaderStyles } from './sessionHeaderStyles.js';
import { currentSessionId, getWorkbenchSessions } from '../workbench/host-adapter.js';

export const SESSION_HEADER_SLOT_NAME = 'conversation.session.header.utilities';
export const SESSION_HEADER_ENTRY_ID = 'omnimux-session-header-actions';

/**
 * 注册会话顶栏操作插槽 (清空与历史快照)
 * @param {{ slots: { inject: Function, register: Function }, effect?: Function }} ctx
 * @param {unknown} [component] React component (SessionHeaderActions)
 */
export function installSessionHeaderSlot(ctx, component) {
  if (typeof document !== 'undefined') {
    injectSessionHeaderStyles(document);
  }

  // 1. 官方 Slot 挂载 (优先第一路径)
  if (ctx && ctx.slots && typeof ctx.slots.inject === 'function' && component) {
    ctx.slots.inject(SESSION_HEADER_SLOT_NAME, () => ctx.slots.register({
      name: SESSION_HEADER_SLOT_NAME,
      id: SESSION_HEADER_ENTRY_ID,
      order: 10,
      inject: () => {
        const sessions = getWorkbenchSessions();
        const sessionId = currentSessionId(sessions) || '';
        return { sessionId };
      },
    }, component));
  }

  // 2. DOM 守卫 (当官方 Slot 在特定布局下未挂出时的兜底渲染)
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || !component) {
    return () => {};
  }

  let observer = null;
  const roots = new WeakMap();

  function mountDomFallback() {
    const header = document.querySelector('[data-slot="conversation.session.header"]');
    if (!header) return;
    if (header.querySelector('[data-omnimux-session-actions]')) return;

    const target = header.querySelector('[class*="headerUtilities"], [class*="headerActions"]') || header;
    if (target.querySelector('[data-omnimux-session-actions]')) return;

    const mountPoint = document.createElement('div');
    mountPoint.className = 'omnimux-session-header-mount-point';
    target.appendChild(mountPoint);

    try {
      const root = createRoot(mountPoint);
      roots.set(mountPoint, root);
      const sessionId = currentSessionId() || '';
      root.render(React.createElement(component, { sessionId }));
    } catch {
      // ignore
    }
  }

  observer = new MutationObserver(() => {
    mountDomFallback();
  });

  try {
    observer.observe(document.body, { childList: true, subtree: true });
    mountDomFallback();
  } catch {
    // ignore
  }

  return () => {
    observer?.disconnect?.();
  };
}
