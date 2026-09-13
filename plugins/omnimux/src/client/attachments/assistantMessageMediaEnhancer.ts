/**
 * Assistant Message Media Enhancer
 * Observes assistant messages in the conversation stream and attaches
 * an interactive preview card to the tail of completed generation turns,
 * automatically synchronizing with the right sidebar media viewer.
 */

import { useEffect } from 'react';
import { getGlobalMediaViewerStore, MEDIA_VIEWER_TAB_ID } from '../media-viewer/media-viewer-store.js';
import { injectMediaViewerStyles } from '../media-viewer/styles.js';

const ASSISTANT_BUBBLE_SELECTOR = 'div[class*="assistantRow"] div[class*="bubble"], div[class*="assistantStack"] div[class*="bubble"], [data-slot="conversation.message.assistant"]';
const ENHANCED_ATTR = 'data-omx-media-enhanced';

export interface DetectedMedia {
  url: string;
  type: 'image' | 'video';
  title?: string;
}

/**
 * Scan an element for generated images or videos
 */
export function extractMediaFromElement(el: HTMLElement): DetectedMedia[] {
  const mediaList: DetectedMedia[] = [];
  const seen = new Set<string>();

  // 1. Check img tags
  const imgs = el.querySelectorAll<HTMLImageElement>('img');
  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:image/svg') && !seen.has(src)) {
      seen.add(src);
      mediaList.push({
        url: src,
        type: 'image',
        title: img.getAttribute('alt') || '生成图片',
      });
    }
  }

  // 2. Check video tags
  const videos = el.querySelectorAll<HTMLVideoElement>('video');
  for (const vid of videos) {
    const src = vid.getAttribute('src');
    if (src && !seen.has(src)) {
      seen.add(src);
      mediaList.push({
        url: src,
        type: 'video',
        title: vid.getAttribute('title') || '生成视频',
      });
    }
  }

  return mediaList;
}

/**
 * Create DOM element for the message tail preview card
 */
export function createMediaTailElement(items: readonly DetectedMedia[], doc: Document = document): HTMLElement {
  const container = doc.createElement('div');
  container.className = 'omx-chat-media-tail';
  container.setAttribute('data-omx-media-tail', 'true');

  const openInSidebar = (item: DetectedMedia) => {
    const store = getGlobalMediaViewerStore();
    const media = store.addMedia({
      url: item.url,
      type: item.type,
      title: item.title,
    });
    store.setActiveId(media.id);
    store.setSubViewMode('single');

    try {
      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      if (win && (win as any).__omnimuxWorkbench?.openWorkbench) {
        (win as any).__omnimuxWorkbench.openWorkbench({ tabId: MEDIA_VIEWER_TAB_ID });
      }
    } catch {
      // ignore
    }
  };

  if (items.length === 1) {
    const item = items[0];
    const card = doc.createElement('div');
    card.className = 'omx-chat-media-tail__card';
    card.title = '点击在右侧查看大图';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const img = doc.createElement('img');
    img.src = item.url;
    img.alt = item.title || '生成预览';
    img.className = 'omx-chat-media-tail__img';
    card.appendChild(img);

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      openInSidebar(item);
    });

    const actionBar = doc.createElement('div');
    actionBar.className = 'omx-chat-media-tail__actions';

    const copyBtn = doc.createElement('button');
    copyBtn.className = 'omx-chat-media-tail__btn';
    copyBtn.title = '复制图片链接';
    copyBtn.setAttribute('aria-label', '复制图片链接');
    copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText?.(item.url);
    });

    const openBtn = doc.createElement('button');
    openBtn.className = 'omx-chat-media-tail__btn';
    openBtn.title = '在右侧侧边栏打开大图';
    openBtn.setAttribute('aria-label', '在右侧侧边栏打开大图');
    openBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openInSidebar(item);
    });

    actionBar.appendChild(copyBtn);
    actionBar.appendChild(openBtn);
    card.appendChild(actionBar);
    container.appendChild(card);
  } else {
    // Multi-card horizontal grid
    const grid = doc.createElement('div');
    grid.className = 'omx-chat-media-tail__grid';

    for (const item of items) {
      const card = doc.createElement('div');
      card.className = 'omx-chat-media-tail__card';
      card.title = '点击在右侧查看大图';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      const img = doc.createElement('img');
      img.src = item.url;
      img.alt = item.title || '预览';
      img.className = 'omx-chat-media-tail__img';
      card.appendChild(img);

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        openInSidebar(item);
      });

      grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  return container;
}

/**
 * Enhance a single assistant bubble
 */
export function enhanceAssistantBubble(bubbleEl: HTMLElement, doc: Document = document): boolean {
  if (!bubbleEl || bubbleEl.getAttribute(ENHANCED_ATTR) === 'true') return false;

  const mediaItems = extractMediaFromElement(bubbleEl);
  if (mediaItems.length === 0) return false;

  bubbleEl.setAttribute(ENHANCED_ATTR, 'true');

  // Register all items into global store
  const store = getGlobalMediaViewerStore();
  for (const m of mediaItems) {
    store.addMedia({
      url: m.url,
      type: m.type,
      title: m.title,
    });
  }

  // If a preview card is not already in the bubble, append it
  if (!bubbleEl.querySelector('.omx-chat-media-tail')) {
    const tail = createMediaTailElement(mediaItems, doc);
    bubbleEl.appendChild(tail);
  }

  return true;
}

/**
 * Scan all bubbles in the container
 */
export function scanAndEnhanceAssistantBubbles(root: ParentNode = (typeof document !== 'undefined' ? document : (null as any))): number {
  if (!root) return 0;
  const targetDoc = (root.nodeType === 9 ? (root as Document) : (root.ownerDocument || (typeof document !== 'undefined' ? document : undefined)));
  if (targetDoc) {
    injectMediaViewerStyles(targetDoc);
  }
  const bubbles = root.querySelectorAll<HTMLElement>(ASSISTANT_BUBBLE_SELECTOR);
  let count = 0;
  for (const bubble of bubbles) {
    if (enhanceAssistantBubble(bubble, targetDoc)) {
      count++;
    }
  }
  return count;
}

/**
 * Install DOM observer to automatically enhance assistant messages as they finish generating
 */
export function installAssistantMessageMediaEnhancer(targetDoc: Document = (typeof document !== 'undefined' ? document : (null as any))): () => void {
  if (!targetDoc) return () => {};
  injectMediaViewerStyles(targetDoc);

  let timer: any = null;
  const scheduleScan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      scanAndEnhanceAssistantBubbles(targetDoc);
    }, 150);
  };

  const ObserverClass = targetDoc.defaultView?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  if (!ObserverClass) {
    scheduleScan();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }

  const observer = new ObserverClass(() => {
    scheduleScan();
  });

  observer.observe(targetDoc.body || targetDoc.documentElement, {
    childList: true,
    subtree: true,
  });

  scheduleScan();

  return () => {
    if (timer) clearTimeout(timer);
    observer.disconnect();
  };
}

export function useAssistantMessageMediaEnhancer(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    return installAssistantMessageMediaEnhancer(document);
  }, []);
}
