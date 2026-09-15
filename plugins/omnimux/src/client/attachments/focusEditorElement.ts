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

/** 把焦点交回原生 composer 输入框；找不到输入框时静默返回。 */
export function focusEditorElement(): void {
  if (typeof document === 'undefined') return;
  const editor = document.querySelector(COMPOSER_EDITOR_SELECTOR) as HTMLElement | null;
  if (editor) {
    editor.focus();
  }
}
