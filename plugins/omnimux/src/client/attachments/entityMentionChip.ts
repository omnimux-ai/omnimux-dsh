/**
 * 实体引用胶囊插入与输入框 @ 字符清理
 * 复用 nativeVideoChip.ts 中的 Lexical Chip 节点机制
 */

const EDITOR_SELECTORS = [
  '[data-composer-card] [contenteditable="true"]',
  '[data-lexical-editor="true"]',
  '[data-composer-input="true"]',
  'div[role="textbox"][contenteditable="true"]',
].join(', ');

export interface InsertEntityChipOptions {
  name: string;
  ref: string;
  type?: 'character' | 'product' | string;
  savedRange?: Range | null;
}

export function findComposerEditor(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector(EDITOR_SELECTORS) as HTMLElement | null;
}

export function restoreSavedSelection(editor: HTMLElement, savedRange?: Range | null): void {
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

export function getLexicalEditorInstance(editor: HTMLElement): any {
  const keys = Object.keys(editor);
  const lexicalKey = keys.find((k) => k.startsWith('__lexicalEditor'));
  return lexicalKey ? (editor as any)[lexicalKey] : null;
}

export function getChipConstructor(lexicalEditor: any): any {
  const nodes = lexicalEditor ? lexicalEditor._nodes : null;
  if (!nodes || typeof nodes.get !== 'function') {
    return null;
  }
  const chipReg = nodes.get('reference-chip');
  return chipReg ? chipReg.klass : null;
}

function appendChipToRoot(lexicalEditor: any, chip: any): void {
  const activeState = lexicalEditor._pendingEditorState || lexicalEditor._editorState;
  const nodeMap = activeState ? activeState._nodeMap : null;
  if (!nodeMap || typeof nodeMap.get !== 'function') {
    return;
  }
  const root = nodeMap.get('root');
  if (!root) {
    return;
  }
  const writableRoot = typeof root.getWritable === 'function' ? root.getWritable() : root;
  const getLast = typeof writableRoot.getLastChild === 'function' ? writableRoot.getLastChild() : null;
  const getFirst = typeof writableRoot.getFirstChild === 'function' ? writableRoot.getFirstChild() : null;
  let targetBlock = getLast || getFirst || writableRoot;
  if (targetBlock && typeof targetBlock.getWritable === 'function') {
    targetBlock = targetBlock.getWritable();
  }
  if (targetBlock && typeof targetBlock.append === 'function') {
    targetBlock.append(chip);
  }
}

/**
 * 清除光标前方的 @ 触发字符与紧跟的搜索词
 */
function removeTriggerAtFromLexical(lexicalEditor: any, selection: any): void {
  if (!selection) return;

  const activeState = lexicalEditor._pendingEditorState || lexicalEditor._editorState;
  const nodeMap = activeState ? activeState._nodeMap : null;

  // 1. 尝试从 selection.anchor 提取节点
  let anchorNode: any = null;
  if (typeof selection.anchor?.getNode === 'function') {
    try {
      anchorNode = selection.anchor.getNode();
    } catch {
      // ignore
    }
  }
  if (!anchorNode && selection.anchor?.key && nodeMap && typeof nodeMap.get === 'function') {
    anchorNode = nodeMap.get(selection.anchor.key);
  }

  if (!anchorNode) return;

  const text = typeof anchorNode.getTextContent === 'function'
    ? anchorNode.getTextContent()
    : (anchorNode.__text || '');

  const offset = typeof selection.anchor?.offset === 'number' ? selection.anchor.offset : text.length;
  const beforeCaret = text.slice(0, offset);
  const atIndex = beforeCaret.lastIndexOf('@');

  if (atIndex >= 0) {
    const writable = typeof anchorNode.getWritable === 'function' ? anchorNode.getWritable() : anchorNode;
    if (writable && typeof writable.setTextContent === 'function') {
      const newText = text.slice(0, atIndex) + text.slice(offset);
      writable.setTextContent(newText);
      if (selection.anchor) {
        selection.anchor.offset = atIndex;
      }
      if (selection.focus) {
        selection.focus.offset = atIndex;
      }
      if (typeof selection.setTextNodeRange === 'function') {
        try {
          selection.setTextNodeRange(writable, atIndex, writable, atIndex);
        } catch {
          // ignore
        }
      }
    }
  }
}

/**
 * 插入 Lexical 实体胶囊节点，并移除 @ 触发词
 */
export function insertLexicalEntityChip(
  lexicalEditor: any,
  options: InsertEntityChipOptions,
): boolean {
  if (!lexicalEditor || typeof lexicalEditor.update !== 'function') {
    return false;
  }
  const ChipKlass = getChipConstructor(lexicalEditor);
  if (!ChipKlass) {
    return false;
  }

  const { name, ref, type = 'product' } = options;

  try {
    let inserted = false;
    lexicalEditor.update(() => {
      const activeState = lexicalEditor._pendingEditorState || lexicalEditor._editorState;
      const selection = activeState?._selection;

      // 移除原有的 @ 符号
      removeTriggerAtFromLexical(lexicalEditor, selection);

      const chip = new ChipKlass({
        source: 'material',
        ref,
        label: name,
        appearance: 'file',
        clipboardText: name,
        entityType: type,
      });

      if (selection && typeof selection.insertNodes === 'function') {
        selection.insertNodes([chip]);
        inserted = true;
      } else {
        appendChipToRoot(lexicalEditor, chip);
        if (typeof chip.selectEnd === 'function') {
          chip.selectEnd();
        }
        inserted = true;
      }
    }, { discrete: true });

    const editorEl = lexicalEditor.getRootElement ? lexicalEditor.getRootElement() : findComposerEditor();
    if (editorEl && typeof editorEl.focus === 'function') {
      editorEl.focus();
    }

    return inserted;
  } catch (err) {
    console.warn('[omnimux] Lexical entity chip insert failed, falling back:', err);
    return false;
  }
}

function insertFallbackEntityText(name: string): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const editor = findComposerEditor();
    if (editor) {
      const text = editor.textContent || '';
      const atIdx = text.lastIndexOf('@');
      if (atIdx >= 0) {
        editor.textContent = text.slice(0, atIdx) + `@${name} `;
        return true;
      }
    }
    return document.execCommand('insertText', false, `@${name}`);
  } catch {
    return false;
  }
}

/**
 * 在输入框光标处插入标准实体胶囊，并自动移除原键入的 @ 字符
 */
export function insertEntityMentionChip(options: InsertEntityChipOptions): boolean {
  if (typeof document === 'undefined') return false;
  const { name, ref } = options;
  if (!name || !ref) return false;

  const editor = findComposerEditor();
  if (!editor) return false;

  editor.focus();
  restoreSavedSelection(editor, options.savedRange);

  const lexicalEditor = getLexicalEditorInstance(editor);
  const inserted = insertLexicalEntityChip(lexicalEditor, options);

  if (inserted) {
    return true;
  }

  return insertFallbackEntityText(name);
}
