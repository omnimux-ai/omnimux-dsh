import { useCallback, useEffect, useRef, useState } from 'react';
import {
  extractPromptSlots,
  type PromptSlot,
  PROMPT_SLOT_REGEX,
} from './promptSlotDetector.ts';

const COMPOSER_EDITOR_SELECTORS = [
  '[data-composer-card] [contenteditable="true"]',
  '[data-lexical-editor="true"]',
  '[data-composer-input="true"]',
  'div[role="textbox"][contenteditable="true"]',
].join(', ');

export function findComposerEditor(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector(COMPOSER_EDITOR_SELECTORS) as HTMLElement | null;
}

export function updateEditorHighlightRanges(editor: HTMLElement): PromptSlot[] {
  const text = editor.innerText || editor.textContent || '';
  const slots = extractPromptSlots(text);

  if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
    try {
      const ranges: Range[] = [];
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const nodeText = node.nodeValue || '';
        PROMPT_SLOT_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = PROMPT_SLOT_REGEX.exec(nodeText)) !== null) {
          try {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            ranges.push(range);
          } catch {
            // Ignore boundary errors on transient text updates
          }
        }
      }

      if (ranges.length > 0) {
        const highlight = new (window as any).Highlight(...ranges);
        (CSS as any).highlights.set('omx-prompt-slot', highlight);
      } else {
        (CSS as any).highlights.delete('omx-prompt-slot');
      }
    } catch {
      // Ignore if CSS highlights API is unavailable
    }
  }

  return slots;
}

export function selectSlotInEditor(slot: PromptSlot): boolean {
  const editor = findComposerEditor();
  if (!editor) return false;
  editor.focus();

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const nodeText = node.nodeValue || '';
    const idx = nodeText.indexOf(slot.raw);
    if (idx !== -1) {
      try {
        const range = document.createRange();
        const hasBrackets =
          (slot.raw.startsWith('[') && slot.raw.endsWith(']')) ||
          (slot.raw.startsWith('{') && slot.raw.endsWith('}'));
        const startOffset = hasBrackets ? idx + 1 : idx;
        const endOffset = hasBrackets ? idx + slot.raw.length - 1 : idx + slot.raw.length;
        range.setStart(node, startOffset);
        range.setEnd(node, endOffset);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        }
      } catch {
        return false;
      }
    }
  }
  return false;
}

export function replaceSlotTextInEditor(slot: PromptSlot, newRaw: string): boolean {
  const editor = findComposerEditor();
  if (!editor) return false;
  editor.focus();

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const nodeText = node.nodeValue || '';
    const idx = nodeText.indexOf(slot.raw);
    if (idx !== -1) {
      try {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + slot.raw.length);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('insertText', false, newRaw);
          return true;
        }
      } catch {
        return false;
      }
    }
  }
  return false;
}

export function fillSlotInEditor(slot: PromptSlot, newValue: string): boolean {
  const selected = selectSlotInEditor(slot);
  if (!selected) return false;
  try {
    return document.execCommand('insertText', false, newValue);
  } catch {
    return false;
  }
}

export function usePromptSlotEnhancer() {
  const [slots, setSlots] = useState<readonly PromptSlot[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  const refreshSlots = useCallback(() => {
    const editor = findComposerEditor();
    if (!editor) {
      setSlots([]);
      return;
    }
    const detected = updateEditorHighlightRanges(editor);
    setSlots(detected);
  }, []);

  const handleSelectSlot = useCallback((slot: PromptSlot, index: number) => {
    setActiveSlotIndex(index);
    selectSlotInEditor(slot);
  }, []);

  const handleReplaceSlot = useCallback(
    (slot: PromptSlot, newRaw: string) => {
      replaceSlotTextInEditor(slot, newRaw);
      refreshSlots();
    },
    [refreshSlots],
  );

  const handleFillSlot = useCallback(
    (slot: PromptSlot, value: string) => {
      fillSlotInEditor(slot, value);
      refreshSlots();
    },
    [refreshSlots],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    refreshSlots();

    const editor = findComposerEditor();
    if (!editor) return undefined;

    const onInput = () => {
      refreshSlots();
    };

    editor.addEventListener('input', onInput);
    editor.addEventListener('keyup', onInput);

    // 观察 DOM 子树变动（如快捷预设点击注入、粘贴、清除）
    const observer = new MutationObserver(() => {
      refreshSlots();
    });
    observer.observe(editor, { childList: true, subtree: true, characterData: true });
    observerRef.current = observer;

    return () => {
      editor.removeEventListener('input', onInput);
      editor.removeEventListener('keyup', onInput);
      observer.disconnect();
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        try {
          (CSS as any).highlights.delete('omx-prompt-slot');
        } catch {}
      }
    };
  }, [refreshSlots]);

  return {
    slots,
    activeSlotIndex,
    selectSlot: handleSelectSlot,
    replaceSlot: handleReplaceSlot,
    fillSlot: handleFillSlot,
    refreshSlots,
  };
}
