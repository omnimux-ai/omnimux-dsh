import { useEffect } from 'react';
import { isValidUrl } from './mediaUrlDetector.ts';
import { insertNativeVideoChip } from './nativeVideoChip.ts';
import { isQuickLinkChipTarget } from '../composer-quick-shortcuts/linkChip.js';

const COMPOSER_EDITOR_SELECTORS = [
  '[data-composer-card] [contenteditable="true"]',
  '[data-lexical-editor="true"]',
  '[data-composer-input="true"]',
  'div[role="textbox"][contenteditable="true"]',
].join(', ');

function handlePasteEvent(event: ClipboardEvent): void {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return;
  const text = clipboardData.getData('text');
  if (!isValidUrl(text)) {
    return;
  }
  // 快捷链接胶囊自带的输入框：粘贴归胶囊自己（它才是等着这条链接的控件），
  // 宿主通道不得截走——否则用户往胶囊里粘贴视频链接，会变成在草稿里插原生胶囊。
  if (isQuickLinkChipTarget(event.target)) {
    return;
  }
  const editor = document.querySelector(COMPOSER_EDITOR_SELECTORS);
  if (!editor || !editor.contains(event.target as Node)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  insertNativeVideoChip(text.trim());
}

export function usePasteVideoInterceptor(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    window.addEventListener('paste', handlePasteEvent, true);
    return () => {
      window.removeEventListener('paste', handlePasteEvent, true);
    };
  }, []);
}
