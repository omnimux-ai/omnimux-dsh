import { isVideoUrl, resolvePlatformName } from './mediaUrlDetector.ts';

const EDITOR_SELECTORS = [
  '[data-composer-card] [contenteditable="true"]',
  '[data-lexical-editor="true"]',
  '[data-composer-input="true"]',
  'div[role="textbox"][contenteditable="true"]',
].join(', ');

function findComposerEditor(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector(EDITOR_SELECTORS) as HTMLElement | null;
}

function restoreSavedSelection(editor: HTMLElement, savedRange?: Range | null): void {
  if (!savedRange || !editor.contains(savedRange.commonAncestorContainer)) {
    return;
  }
  try {
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  } catch {
    // Ignore selection restoration failure
  }
}

function getLexicalEditorInstance(editor: HTMLElement): any {
  const keys = Object.keys(editor);
  const lexicalKey = keys.find((k) => k.startsWith('__lexicalEditor'));
  return lexicalKey ? (editor as any)[lexicalKey] : null;
}

function getChipConstructor(lexicalEditor: any): any {
  const nodes = lexicalEditor ? lexicalEditor._nodes : null;
  if (!nodes || typeof nodes.get !== 'function') {
    return null;
  }
  const chipReg = nodes.get('reference-chip');
  return chipReg ? chipReg.klass : null;
}

function appendChipToRoot(editorState: any, chip: any): void {
  const nodeMap = editorState ? editorState._nodeMap : null;
  if (!nodeMap || typeof nodeMap.get !== 'function') {
    return;
  }
  const root = nodeMap.get('root');
  if (!root) {
    return;
  }
  const getLast = root.getLastChild;
  const getFirst = root.getFirstChild;
  const target = typeof getLast === 'function' ? getLast.call(root) : null;
  const fallback = typeof getFirst === 'function' ? getFirst.call(root) : null;
  const targetBlock = target || fallback;
  if (targetBlock && typeof targetBlock.append === 'function') {
    targetBlock.append(chip);
  }
}

function insertLexicalChip(lexicalEditor: any, trimmedUrl: string, platform: string): boolean {
  if (!lexicalEditor || typeof lexicalEditor.update !== 'function') {
    return false;
  }
  const ChipKlass = getChipConstructor(lexicalEditor);
  if (!ChipKlass) {
    return false;
  }

  const isVideo = isVideoUrl(trimmedUrl);
  const markdownTag = isVideo ? '视频' : '链接';

  try {
    lexicalEditor.update(() => {
      const chip = new ChipKlass({
        source: 'link',
        ref: trimmedUrl,
        label: platform,
        appearance: 'link',
        clipboardText: `[${markdownTag}](${trimmedUrl})`,
      });
      appendChipToRoot(lexicalEditor._editorState, chip);
    });
    return true;
  } catch (err) {
    console.warn('[omnimux] Lexical chip insert failed, falling back:', err);
    return false;
  }
}

function insertFallbackText(trimmedUrl: string): boolean {
  try {
    const isVideo = isVideoUrl(trimmedUrl);
    const markdownTag = isVideo ? '视频' : '链接';
    return document.execCommand('insertText', false, `[${markdownTag}](${trimmedUrl}) `);
  } catch {
    return false;
  }
}

export function insertNativeVideoChip(url: string, savedRange?: Range | null): boolean {
  if (typeof document === 'undefined') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const editor = findComposerEditor();
  if (!editor) return false;

  editor.focus();
  restoreSavedSelection(editor, savedRange);

  const platform = resolvePlatformName(trimmed);
  const lexicalEditor = getLexicalEditorInstance(editor);
  const inserted = insertLexicalChip(lexicalEditor, trimmed, platform);

  if (inserted) {
    return true;
  }

  return insertFallbackText(trimmed);
}
