/**
 * User Message Link Enhancer
 * Observes user chat bubbles in the conversation stream and converges raw URLs
 * into clean, interactive inline link pills (matching Figure 2).
 */

import { useEffect } from 'react';
import { detectMessageLinks, type DetectedLinkItem } from './linkPillMetadata.ts';
import { CLEANED_ATTR, hideAttachedContextBlock } from './attachedContextCleaner.ts';

const USER_BUBBLE_SELECTOR = 'div[class*="userRow"] div[class*="bubble"], div[class*="userStack"] div[class*="bubble"]';
const UNENHANCED_USER_BUBBLE_SELECTOR = 'div[class*="userRow"] div[class*="bubble"]:not([data-omx-link-enhanced="true"]), div[class*="userStack"] div[class*="bubble"]:not([data-omx-link-enhanced="true"])';
const PILL_CLASS = 'omx-chat-link-pill';
const PILL_STYLE_ID = 'omx-chat-link-pill-styles';

const PILL_CSS = `
.${PILL_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px 0 6px;
  margin: 0 4px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 9999px;
  vertical-align: middle;
  cursor: pointer;
  user-select: none;
  text-decoration: none;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  box-sizing: border-box;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.${PILL_CLASS}:hover {
  background: var(--dsw-alias-bg-layer-3);
  border-color: var(--dsw-alias-border-l3);
  transform: translateY(-0.5px);
}

.${PILL_CLASS}__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.${PILL_CLASS}__title {
  max-width: 200px;
  font-size: 13px;
  line-height: 1;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;

/**
 * Inject the required pill styles once into document head
 */
export function injectLinkPillStyles(doc: Document = document): void {
  if (doc.getElementById(PILL_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = PILL_STYLE_ID;
  style.textContent = PILL_CSS;
  doc.head.appendChild(style);
}

/**
 * Create a DOM node for a single link pill
 */
export function createLinkPillElement(item: DetectedLinkItem, doc: Document = document): HTMLElement {
  const pill = doc.createElement('span');
  pill.className = PILL_CLASS;
  pill.setAttribute('data-omx-link-pill', 'true');
  pill.setAttribute('data-raw-url', item.url);
  pill.setAttribute('title', item.url);
  pill.setAttribute('role', 'button');
  pill.setAttribute('tabindex', '0');

  const iconContainer = doc.createElement('span');
  iconContainer.className = `${PILL_CLASS}__icon`;
  iconContainer.innerHTML = item.iconSvg;

  const titleSpan = doc.createElement('span');
  titleSpan.className = `${PILL_CLASS}__title`;
  titleSpan.textContent = item.title;

  pill.appendChild(iconContainer);
  pill.appendChild(titleSpan);

  const handleClick = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (typeof window !== 'undefined') {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Ignore navigation failure
    }
  };

  pill.addEventListener('click', handleClick);
  pill.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick(e);
    }
  });

  return pill;
}

/**
 * Self-shielding flag to prevent re-entrant mutation loops while enhancing DOM
 */
let isEnhancing = false;

/**
 * Scan and transform all raw URLs inside a single user message bubble
 */
export function enhanceUserBubble(bubbleEl: HTMLElement, doc: Document = document): boolean {
  if (!bubbleEl || typeof bubbleEl !== 'object') return false;
  if (bubbleEl.getAttribute('data-omx-link-enhanced') === 'true') {
    return false;
  }
  if (isEnhancing) return false;

  isEnhancing = true;
  try {
    // 先把「会话关联上下文」数据块从可见节点里摘掉：它只喂给模型，
    // 不属于用户自己写的内容；其中的附件路径也不该被收敛成链接胶囊。
    // 标记只在真摘到东西时才留：它是排查用的凭据，不能变成「走过这条路」的记号。
    if (hideAttachedContextBlock(bubbleEl, doc)) {
      bubbleEl.setAttribute(CLEANED_ATTR, 'true');
    }

    const nodeFilter = typeof NodeFilter !== 'undefined' ? NodeFilter : doc.defaultView?.NodeFilter;
    const showText = nodeFilter?.SHOW_TEXT ?? 4;
    const filterAccept = nodeFilter?.FILTER_ACCEPT ?? 1;
    const filterReject = nodeFilter?.FILTER_REJECT ?? 2;

    const walker = doc.createTreeWalker(bubbleEl, showText, {
      acceptNode: (node: Node) => {
        // Skip text inside already enhanced pills
        const parent = node.parentElement;
        if (parent && parent.closest(`.${PILL_CLASS}`)) {
          return filterReject;
        }
        return filterAccept;
      },
    });

    const textNodesToReplace: { node: Text; links: readonly DetectedLinkItem[] }[] = [];
    let current: Node | null;

    while ((current = walker.nextNode())) {
      const textNode = current as Text;
      const val = textNode.nodeValue || '';
      const links = detectMessageLinks(val);
      if (links.length > 0) {
        textNodesToReplace.push({ node: textNode, links });
      }
    }

    if (textNodesToReplace.length === 0) {
      bubbleEl.setAttribute('data-omx-link-enhanced', 'true');
      return false;
    }

    for (const { node, links } of textNodesToReplace) {
      const parent = node.parentNode;
      if (!parent) continue;

      const fullText = node.nodeValue || '';
      const fragment = doc.createDocumentFragment();
      let lastIndex = 0;

      for (const link of links) {
        if (link.start > lastIndex) {
          fragment.appendChild(doc.createTextNode(fullText.slice(lastIndex, link.start)));
        }
        const pill = createLinkPillElement(link, doc);
        fragment.appendChild(pill);
        lastIndex = link.end;
      }

      if (lastIndex < fullText.length) {
        fragment.appendChild(doc.createTextNode(fullText.slice(lastIndex)));
      }

      parent.replaceChild(fragment, node);
    }

    bubbleEl.setAttribute('data-omx-link-enhanced', 'true');
    return true;
  } finally {
    isEnhancing = false;
  }
}

/**
 * 摘掉气泡里所有「会话关联上下文」数据块。
 * 与链接胶囊不同，这一步必须覆盖**全部**气泡（含已增强过的）：
 * 宿主重渲染会把提交时的完整文本写回 DOM，而已增强标记会拦住二次增强，
 * 因此每次扫描都要重新对账。
 */
export function cleanUserBubbles(root: ParentNode = document): number {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  const doc = root.ownerDocument || (root as Document);
  const bubbles = root.querySelectorAll(USER_BUBBLE_SELECTOR);
  let cleaned = 0;
  bubbles.forEach((bubble) => {
    if (hideAttachedContextBlock(bubble as HTMLElement, doc)) {
      (bubble as HTMLElement).setAttribute(CLEANED_ATTR, 'true');
      cleaned += 1;
    }
  });
  return cleaned;
}

/**
 * Scan all matching unenhanced user bubbles currently in document or container
 */
export function scanAndEnhanceAllBubbles(root: ParentNode = document): number {
  if (isEnhancing) return 0;
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  cleanUserBubbles(root);
  const bubbles = root.querySelectorAll(UNENHANCED_USER_BUBBLE_SELECTOR);
  let enhancedCount = 0;
  bubbles.forEach((bubble) => {
    if (enhanceUserBubble(bubble as HTMLElement, root.ownerDocument || (root as Document))) {
      enhancedCount++;
    }
  });
  return enhancedCount;
}

/**
 * Install a MutationObserver to watch and enhance user message bubbles.
 * Target is strictly converged to [data-conversation-scroll] instead of global body.
 */
export function installUserMessageLinkEnhancer(targetDoc: Document = document): () => void {
  if (!targetDoc || typeof targetDoc.createElement !== 'function') {
    return () => {};
  }

  injectLinkPillStyles(targetDoc);

  let timer: any = null;
  const debouncedScan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const scrollEl = targetDoc.querySelector('[data-conversation-scroll]');
      if (scrollEl) {
        scanAndEnhanceAllBubbles(scrollEl);
      } else {
        scanAndEnhanceAllBubbles(targetDoc);
      }
    }, 50);
  };

  let scrollObserver: MutationObserver | null = null;
  let currentScrollTarget: Element | null = null;

  const bindScrollObserver = () => {
    const scrollTarget = targetDoc.querySelector('[data-conversation-scroll]');
    if (!scrollTarget || scrollTarget === currentScrollTarget) return;

    if (scrollObserver) {
      try { scrollObserver.disconnect(); } catch { /* ignore */ }
      scrollObserver = null;
    }
    currentScrollTarget = scrollTarget;

    const Observer = targetDoc.defaultView?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined);
    if (Observer) {
      scrollObserver = new Observer((mutations) => {
        if (isEnhancing) return;
        let shouldScan = false;
        for (const mutation of mutations) {
          // 宿主重渲染可能只改文本（把整段提交文本写回文本节点），
          // 只盯新增节点会漏掉这种改写，数据块就有机会重新上屏。
          if (mutation.addedNodes.length > 0 || mutation.type === 'characterData') {
            shouldScan = true;
            break;
          }
        }
        if (shouldScan) {
          debouncedScan();
        }
      });

      scrollObserver.observe(scrollTarget, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  };

  bindScrollObserver();
  const initialScroll = targetDoc.querySelector('[data-conversation-scroll]');
  if (initialScroll) {
    scanAndEnhanceAllBubbles(initialScroll);
  } else {
    scanAndEnhanceAllBubbles(targetDoc);
  }

  // Periodic/event-based detection if scrollTarget mounts later
  let probeTimer: any = null;
  let probeCount = 0;
  const maxProbes = 20;
  const probeScroll = () => {
    if (currentScrollTarget) return;
    const scrollTarget = targetDoc.querySelector('[data-conversation-scroll]');
    if (scrollTarget) {
      bindScrollObserver();
      scanAndEnhanceAllBubbles(scrollTarget);
      return;
    }
    probeCount++;
    if (probeCount < maxProbes) {
      probeTimer = setTimeout(probeScroll, 250);
    }
  };
  if (!currentScrollTarget && typeof setTimeout !== 'undefined') {
    probeTimer = setTimeout(probeScroll, 250);
  }

  return () => {
    if (timer) clearTimeout(timer);
    if (probeTimer) clearTimeout(probeTimer);
    if (scrollObserver) {
      try { scrollObserver.disconnect(); } catch { /* ignore */ }
      scrollObserver = null;
    }
    currentScrollTarget = null;
  };
}

/**
 * React Hook to auto-enable User Message Link Enhancer in current active conversation view
 */
export function useUserMessageLinkEnhancer(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    return installUserMessageLinkEnhancer(document);
  }, []);
}

