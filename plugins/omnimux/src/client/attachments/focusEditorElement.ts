/**
 * 原生 composer 输入框聚焦。
 *
 * 独立成模块（零依赖）的原因：附件导轨与提交桥接都需要它，而桥接不应为了一个
 * DOM 查询去 import 整个导轨组件模块（会连带 dsh-ui-kit 等组件依赖）。
 */
/**
 * 原生 composer 输入框选择器。导轨的选区捕获与聚焦取同一组候选，避免两处字面量漂移。
 */
export const COMPOSER_EDITOR_SELECTOR = [
  '[data-composer-card] [contenteditable="true"]',
  '[data-lexical-editor="true"]',
  '[data-composer-input="true"]',
  'div[role="textbox"][contenteditable="true"]',
].join(', ');

/** 显式作用域缺失时不回退到其他会话；无参数调用保留既有全局入口。
 * 兼容 Window / Document 类 scope，其余 scope 必须是已连接的 DOM 节点。
 */
export function focusEditorElement(root?: ParentNode | Window | null): void {
  const scope = arguments.length === 0
    ? (typeof document === 'undefined' ? null : document)
    : root;
  if (!scope) return;
  const container = (scope as { document?: Document | null }).document ?? (scope as ParentNode);
  if (!container || typeof container.querySelector !== 'function') return;
  const isConnected = (container as Node).nodeType === 9
    ? (typeof (container as Node).isConnected === 'boolean' ? (container as Node).isConnected : Boolean((container as Document).documentElement))
    : Boolean((container as Node).isConnected);
  if (!isConnected) return;
  const editor = container.querySelector(COMPOSER_EDITOR_SELECTOR) as HTMLElement | null;
  editor?.focus();
}
