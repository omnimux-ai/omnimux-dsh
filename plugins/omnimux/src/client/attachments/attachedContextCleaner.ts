/**
 * 用户气泡清洁：会话关联上下文只喂给模型，不上屏。
 *
 * 提交时 `AttachmentSubmitBridge` 把 `### 会话关联上下文 (Attached Context):`
 * 数据块追加进草稿，模型因此拿得到附件真源；但那块结构化文本对用户是噪音，
 * 会随消息一起渲染进用户气泡。这里在气泡渲染后把该数据块从**可见节点**中剥离：
 * 只改界面，不动提交内容，也删不掉消息文本本身（供搜索 / 复制 / 重放的正确性）。
 */

/** 附加数据块的起始标记，与 `prompt-assembly.ts` 的 `buildAttachedContextBlock` 同源。 */
export const ATTACHED_CONTEXT_MARKER = '### 会话关联上下文';
export const ATTACHED_CONTEXT_MARKER_EN = '### Attached Context';
/** 数据块前导分隔线（紧贴在标记之前，同属数据块，必须一起清掉）。 */
const LEADING_RULE = /\n{0,2}-{3,}\s*$/;
/** 已清洁标记：记录该气泡已被处理过（便于排查与后续扫描）。 */
export const CLEANED_ATTR = 'data-omx-context-hidden';

/** 该文本里是否出现了附加数据块的起始标记。 */
export function hasAttachedContextMarker(text: unknown): boolean {
  return typeof text === 'string'
    && (text.includes(ATTACHED_CONTEXT_MARKER) || text.includes(ATTACHED_CONTEXT_MARKER_EN));
}

/** 取文本中附加数据块的起始下标；没有返回 -1。 */
export function findAttachedContextStart(text: string): number {
  const zh = text.indexOf(ATTACHED_CONTEXT_MARKER);
  const en = text.indexOf(ATTACHED_CONTEXT_MARKER_EN);
  if (zh < 0) return en;
  if (en < 0) return zh;
  return Math.min(zh, en);
}

/**
 * 在气泡内按文档顺序收集文本节点。
 * @param bubbleEl 气泡根元素
 * @param doc 宿主文档
 */
function collectTextNodes(bubbleEl: Element, doc: Document): Text[] {
  const nodeFilter = typeof NodeFilter !== 'undefined' ? NodeFilter : doc.defaultView?.NodeFilter;
  const showText = nodeFilter?.SHOW_TEXT ?? 4;
  const walker = doc.createTreeWalker(bubbleEl, showText, null);
  const nodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

/**
 * 把附加数据块从气泡里摘下。
 *
 * 数据块总是落在消息尾部，因此先定位含标记的文本节点，截断它，
 * 再移除其后所有可见兄弟文本节点，最后清掉标记前残留的分隔线。
 *
 * @param bubbleEl 用户消息气泡
 * @param doc 宿主文档
 * @returns 是否真的移除了数据块
 */
export function hideAttachedContextBlock(bubbleEl: Element | null, doc: Document = document): boolean {
  if (!bubbleEl || typeof (bubbleEl as Element).querySelectorAll !== 'function') return false;

  const nodes = collectTextNodes(bubbleEl, doc);
  let markerIndex = -1;
  let markerOffset = -1;
  for (let i = 0; i < nodes.length; i += 1) {
    const offset = findAttachedContextStart(nodes[i].nodeValue || '');
    if (offset >= 0) {
      markerIndex = i;
      markerOffset = offset;
      break;
    }
  }
  if (markerIndex < 0) return false;

  // 1. 数据块所在节点：截到标记之前，并清掉紧贴的分隔线
  const markerNode = nodes[markerIndex];
  markerNode.nodeValue = (markerNode.nodeValue || '').slice(0, markerOffset).replace(LEADING_RULE, '');

  // 2. 标记之后的所有可见文本节点同属数据块，整段摘除
  for (let i = markerIndex + 1; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.nodeValue) node.nodeValue = '';
    node.remove?.();
  }

  // 3. 数据块可能自带一条独立的 `<hr>` 分隔线（宿主按 Markdown 渲染）：
  //    它自身不贡献任何文本，摘文本节点摘不掉，留着就是用户看得见的一条孤线。
  //    判据是「它之后已经没有可见文本」——数据块总在消息尾部，此时它已无承载内容。
  const bubble = bubbleEl as Element;
  const rules = bubble.querySelectorAll?.('hr');
  if (rules && rules.length > 0) {
    for (const rule of Array.from(rules)) {
      if (rule.nextSibling && hasVisibleTextAfter(rule)) continue;
      rule.remove?.();
    }
  }

  return true;
}

/** 该节点之后是否还有可见文本（跨越整个兄弟链）。 */
function hasVisibleTextAfter(node: ChildNode): boolean {
  let sibling: ChildNode | null = node;
  while (sibling) {
    if ((sibling.textContent || '').trim()) return true;
    sibling = sibling.nextSibling;
  }
  return false;
}
