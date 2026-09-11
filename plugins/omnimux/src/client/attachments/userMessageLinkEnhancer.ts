/**
 * User Message Link Enhancer
 * Observes user chat bubbles in the conversation stream and converges raw URLs
 * into clean, interactive inline link pills (matching Figure 2).
 */

import { useEffect } from 'react';
import { detectMessageLinks, type DetectedLinkItem } from './linkPillMetadata.ts';

const USER_BUBBLE_SELECTOR = 'div[class*="userRow"] div[class*="bubble"], div[class*="userStack"] div[class*="bubble"]';
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
 * Scan and transform all raw URLs inside a single user message bubble
 */
export function enhanceUserBubble(bubbleEl: HTMLElement, doc: Document = document): boolean {
  if (!bubbleEl || typeof bubbleEl !== 'object') return false;

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
}

/**
 * Scan all matching user bubbles currently in document
 */
export function scanAndEnhanceAllBubbles(root: ParentNode = document): number {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  const bubbles = root.querySelectorAll(USER_BUBBLE_SELECTOR);
  let enhancedCount = 0;
  bubbles.forEach((bubble) => {
    if (enhanceUserBubble(bubble as HTMLElement, root.ownerDocument || (root as Document))) {
      enhancedCount++;
    }
  });
  return enhancedCount;
}

/**
 * Install a MutationObserver to continuously watch and enhance user message bubbles
 */
export function installUserMessageLinkEnhancer(targetDoc: Document = document): () => void {
  if (!targetDoc || typeof targetDoc.createElement !== 'function') {
    return () => {};
  }

  injectLinkPillStyles(targetDoc);
  scanAndEnhanceAllBubbles(targetDoc);

  let timer: any = null;
  const debouncedScan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      scanAndEnhanceAllBubbles(targetDoc);
    }, 50);
  };

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      debouncedScan();
    }
  });

  const rootTarget = targetDoc.body || targetDoc.documentElement;
  if (rootTarget) {
    observer.observe(rootTarget, {
      childList: true,
      subtree: true,
    });
  }

  return () => {
    if (timer) clearTimeout(timer);
    observer.disconnect();
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

