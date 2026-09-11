import { useEffect } from 'react';
import { isValidUrl } from './mediaUrlDetector.ts';
import { insertNativeVideoChip } from './nativeVideoChip.ts';

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
