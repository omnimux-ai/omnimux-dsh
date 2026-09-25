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

  const isTextNode = typeof anchorNode.isText === 'function'
    ? anchorNode.isText()
    : (anchorNode.__type === 'text' || typeof anchorNode.__text === 'string');

  if (isTextNode) {
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
    return;
  }

  // 若 anchorNode 为 Element 节点（如光标在胶囊与文本节点边界，offset 为 children 索引）
  if (typeof anchorNode.getChildren === 'function' && typeof selection.anchor?.offset === 'number') {
    const children = anchorNode.getChildren();
    const childIndex = selection.anchor.offset;
    for (let i = childIndex - 1; i >= 0; i--) {
      const child = children[i];
      if (!child) continue;
      const childText = typeof child.getTextContent === 'function' ? child.getTextContent() : '';
      const atIndex = childText.lastIndexOf('@');
      if (atIndex >= 0) {
        const writable = typeof child.getWritable === 'function' ? child.getWritable() : child;
        if (writable && typeof writable.setTextContent === 'function') {
          writable.setTextContent(childText.slice(0, atIndex));
        }
        break;
      }
      if (childText.includes('\n')) break;
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

/**
 * 从当前光标选区向左检索触发 @ 字符及紧随其后的搜索词，并构建待替换的 Range。
 * 覆盖 Text 节点内部以及 Element 节点边界（如刚插入胶囊后的节点间隙）。
 */
function findPrecedingAtRange(editor: HTMLElement, range: Range): Range | null {
  const container = range.startContainer;
  const offset = range.startOffset;

  // 1. 光标位于文本节点内部
  if (container.nodeType === 3 /* Node.TEXT_NODE */) {
    const textNode = container as Text;
    const text = textNode.data || '';
    const before = text.slice(0, offset);
    const atIdx = before.lastIndexOf('@');
    if (atIdx >= 0) {
      const replaceRange = document.createRange();
      replaceRange.setStart(textNode, atIdx);
      replaceRange.setEnd(textNode, offset);
      return replaceRange;
    }
  }

  // 2. 光标位于元素节点边界（例如刚插入胶囊后，光标落在容器节点边界 childNodes[offset] 前）
  if (container.nodeType === 1 /* Node.ELEMENT_NODE */) {
    const el = container as HTMLElement;
    for (let i = offset - 1; i >= 0; i--) {
      let node: Node | null = el.childNodes[i];
      if (!node) continue;

      // 若为元素节点，深入至其最右侧的叶子文本节点
      while (node && node.nodeType === 1 && node.lastChild) {
        node = node.lastChild;
      }

      if (node && node.nodeType === 3 /* Node.TEXT_NODE */) {
        const textNode = node as Text;
        const text = textNode.data || '';
        const atIdx = text.lastIndexOf('@');
        if (atIdx >= 0) {
          const replaceRange = document.createRange();
          replaceRange.setStart(textNode, atIdx);
          replaceRange.setEnd(el, offset);
          return replaceRange;
        }
        if (text.includes('\n')) {
          break;
        }
      } else {
        // 遇到非文本节点（如其他已存在胶囊元素）阻断，停止跨越查找
        break;
      }
    }
  }

  // 3. 通用 DOM 回溯：当前文本节点开头或空节点，向左沿兄弟节点回溯
  let prevNode: Node | null = null;
  if (container.nodeType === 3 && offset === 0) {
    prevNode = container.previousSibling;
  } else if (container.nodeType === 1 && offset === 0) {
    prevNode = container.previousSibling;
  }

  while (prevNode) {
    let target: Node | null = prevNode;
    while (target && target.nodeType === 1 && target.lastChild) {
      target = target.lastChild;
    }
    if (target && target.nodeType === 3) {
      const textNode = target as Text;
      const text = textNode.data || '';
      const atIdx = text.lastIndexOf('@');
      if (atIdx >= 0) {
        const replaceRange = document.createRange();
        replaceRange.setStart(textNode, atIdx);
        replaceRange.setEnd(container, offset);
        return replaceRange;
      }
    }
    break;
  }

  return null;
}

function insertFallbackEntityText(editor: HTMLElement, name: string, savedRange?: Range | null): boolean {
  try {
    if (typeof document === 'undefined') return false;

    // 1. 若有持久化的选区，先恢复选区
    restoreSavedSelection(editor, savedRange);

    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    let targetRange: Range | null = null;

    // 2. 如果当前有选区且在 editor 内，统一检索并准备替换光标左侧触发的 @ 字符及其搜索词
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        const atRange = findPrecedingAtRange(editor, range);
        if (atRange) {
          targetRange = atRange;
          sel.removeAllRanges();
          sel.addRange(atRange);
        }
      }
    }

    // 3. 统一尝试在当前选区执行一次 execCommand（单点调用，消除冗余重复）
    if (typeof document.execCommand === 'function') {
      try {
        if (document.execCommand('insertText', false, `@${name} `)) {
          return true;
        }
      } catch {
        // fallback to DOM replacement / insertion below
      }
    }

    // 4. 后备 DOM 替换：若存在前导 @ 选区，通过 DOM 操作安全删除并插入文本
    if (targetRange && sel) {
      targetRange.deleteContents();
      const textToInsert = document.createTextNode(`@${name} `);
      targetRange.insertNode(textToInsert);
      targetRange.setStartAfter(textToInsert);
      targetRange.setEndAfter(textToInsert);
      sel.removeAllRanges();
      sel.addRange(targetRange);
      return true;
    }

    // 5. 后备 DOM 插入：若无前导 @，在 savedRange 指定位置或末尾插入文本节点
    const fallbackNode = document.createTextNode(`@${name} `);
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
      try {
        const container = savedRange.startContainer;
        const offset = savedRange.startOffset;
        if (container.nodeType === 3 /* Node.TEXT_NODE */) {
          const textNode = container as Text;
          const afterNode = textNode.splitText(offset);
          textNode.parentNode?.insertBefore(fallbackNode, afterNode);
        } else if (container.nodeType === 1 /* Node.ELEMENT_NODE */) {
          const el = container as HTMLElement;
          const referenceChild = el.childNodes[offset] || null;
          el.insertBefore(fallbackNode, referenceChild);
        } else {
          savedRange.insertNode(fallbackNode);
        }
        return true;
      } catch {
        // 若插入到选区相应位置失败，平滑降级至末尾 appendChild
      }
    }

    editor.appendChild(fallbackNode);
    return true;
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

  return insertFallbackEntityText(editor, name, options.savedRange);
}
