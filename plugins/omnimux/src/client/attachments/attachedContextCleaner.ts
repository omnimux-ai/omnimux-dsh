/**
 * 用户气泡清洁：会话关联上下文只喂给模型，不上屏。
 *
 * 历史版本的提交桥接把 `### 会话关联上下文 (Attached Context):` 数据块追加进草稿，
 * 模型因此拿得到附件真源；但那块结构化文本对用户是噪音，会随消息一起渲染进用户气泡。
 * 提交侧已改为只走宿主原生 `agent/pre-step` 注入，本模块保留为**历史消息**的清洁通道：
 * 早期落库的消息正文里仍带着数据块，渲染后必须在可见 DOM 里整块拆除。
 *
 * 关键约束：数据块在宿主气泡里既可能是纯文本，也可能是「图标 + 文件名」的引用块
 * （`@path` 被 `projectUserText` 解析成元素节点）。只摘 Text 节点会把被掏空的引用块
 * 留在气泡里 —— 那正是用户看到的「空行 + 孤立小图标」。因此这里按**结构**拆除：
 * 标记之后的所有同级节点（含元素节点）连并变空的包装节点一起摘掉。
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

/** 引用被展开后写进消息的素材说明，形如「- [图像] 名称 (`FILE`):」。 */
const MATERIAL_LINE = /(?:^|\n)\s*-\s*\[[^\]]+\]\s+\S/;

/** 取文本中附加数据块的起始下标；没有返回 -1。 */
export function findAttachedContextStart(text: string): number {
  const zh = text.indexOf(ATTACHED_CONTEXT_MARKER);
  const en = text.indexOf(ATTACHED_CONTEXT_MARKER_EN);
  const marked = zh < 0 ? en : en < 0 ? zh : Math.min(zh, en);
  const line = text.search(MATERIAL_LINE);
  if (marked < 0) return line;
  if (line < 0) return marked;
  return Math.min(marked, line);
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

/** 该节点是否还有可见文本（用于判断包装节点是否已经空掉）。 */
function hasVisibleText(node: Node | null): boolean {
  return Boolean(node && (node.textContent || '').trim());
}

/**
 * 把「标记之后」的全部内容从可见 DOM 里摘掉。
 *
 * 数据块总在消息尾部，因此标记之后的可见顺序等价于数据块本身：
 * 先逐级摘掉标记节点的同级后续节点（**含元素节点**，被掏空的引用块就在这一层），
 * 再自下而上摘掉因此变空的包装节点（Markdown 渲染下的 `<h3>` 等）。
 * 还留着用户正文的节点一律保留，气泡根本身绝不摘除。
 *
 * @param markerNode 数据块标记所在的文本节点
 * @param bubbleEl 气泡根元素
 */
function dropTailBlock(markerNode: Text, bubbleEl: Element): void {
  let node: Node | null = markerNode;
  while (node && node !== bubbleEl) {
    const parent: Node | null = node.parentNode;
    if (!parent) break;
    for (let sibling = node.nextSibling; sibling; ) {
      const next = sibling.nextSibling;
      (sibling as ChildNode).remove?.();
      sibling = next;
    }
    if (parent === bubbleEl) break;
    node = parent;
  }

  let wrapper: Node | null = markerNode.parentNode;
  while (wrapper && wrapper !== bubbleEl) {
    const outer: Node | null = wrapper.parentNode;
    if (hasVisibleText(wrapper)) break;
    (wrapper as ChildNode).remove?.();
    wrapper = outer;
  }
}

/**
 * 把附加数据块从气泡里摘下。
 *
 * 数据块总是落在消息尾部，因此先定位含标记的文本节点，截断它，
 * 再按结构拆除其后的全部内容，最后清掉标记前残留的分隔线。
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

  // 2. 标记之后的可见内容同属数据块，按结构整段摘除
  dropTailBlock(markerNode, bubbleEl as Element);

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
