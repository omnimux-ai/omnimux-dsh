/**
 * Assistant Message Media Enhancer
 * Observes assistant messages and turn processes in the conversation stream.
 *
 * Core Business Logic (Autonomous & Guaranteed):
 * 1. Scans the ENTIRE turn (including collapsed [data-turn-process-hidden] tool steps)
 *    to extract generated media items (image_generate / display_file).
 * 2. Forces the extracted media preview card to be displayed at the TAIL of the
 *    assistant's final answer bubble, completely visible outside the collapsed fold.
 * 3. Automatically opens the right sidebar workbench via business logic,
 *    without relying on manual user clicks or agent instructions.
 */

import { useEffect } from 'react';
import { getGlobalMediaViewerStore, MEDIA_VIEWER_TAB_ID } from '../media-viewer/media-viewer-store.js';
import { injectMediaViewerStyles } from '../media-viewer/styles.js';

const ENHANCED_ATTR = 'data-omx-media-enhanced';
const TURN_PROCESSED_ATTR = 'data-omx-turn-media-scanned';

export interface DetectedMedia {
  id?: string;
  url: string;
  type: 'image' | 'video';
  title?: string;
  timestamp?: number;
}

// Track URLs that have already triggered auto-opening the right sidebar
const autoOpenedUrls = new Set<string>();

export function markAutoOpened(url: string): void {
  if (url) autoOpenedUrls.add(url);
}

export function hasAutoOpened(url: string): boolean {
  return Boolean(url && autoOpenedUrls.has(url));
}

export function resetAutoOpenedForTests(): void {
  autoOpenedUrls.clear();
}

/**
 * Scan an element or subtree for generated images or videos,
 * ignoring avatars, icons, and small UI glyphs.
 */
export function extractMediaFromElement(el: HTMLElement): DetectedMedia[] {
  const mediaList: DetectedMedia[] = [];
  const seen = new Set<string>();

  // 1. Check img tags
  const imgs = el.querySelectorAll<HTMLImageElement>('img');
  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (!src) continue;
    // Exclude SVG badges and micro avatars
    if (src.startsWith('data:image/svg') || img.classList.contains('avatar') || img.width === 16 || img.height === 16) {
      continue;
    }
    if (!seen.has(src)) {
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

    const copyBtn = doc.createElement('button'); // exempt-ui01: 消息尾部快捷操作按钮
    copyBtn.className = 'omx-chat-media-tail__btn';
    copyBtn.title = '复制图片链接';
    copyBtn.setAttribute('aria-label', '复制图片链接');
    copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText?.(item.url);
    });

    const openBtn = doc.createElement('button'); // exempt-ui01: 消息尾部展开侧边栏按钮
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
 * Enhance a conversation Turn:
 * 1. Find all nodes belonging to this turn (including collapsed/hidden tool rows).
 * 2. Extract generated media.
 * 3. Locate the final visible assistant text bubble of this turn.
 * 4. Mount the media tail card onto the bottom of the assistant bubble.
 * 5. Automatically trigger openWorkbench in right sidebar.
 */
export function enhanceTurnMedia(turnId: string, turnNodes: readonly HTMLElement[], doc: Document = document): boolean {
  if (!turnNodes || turnNodes.length === 0) return false;

  // Check if turn already has an active tail
  const alreadyHasTail = turnNodes.some((node) => node.querySelector('.omx-chat-media-tail'));
  if (alreadyHasTail) return false;

  // 1. Aggregate all media in this turn (scans hidden tool results, image_generate, dshview)
  const allMedia: DetectedMedia[] = [];
  const seenUrls = new Set<string>();

  for (const node of turnNodes) {
    const items = extractMediaFromElement(node);
    for (const item of items) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        allMedia.push(item);
      }
    }
  }

  if (allMedia.length === 0) return false;

  // 2. Locate the final assistant answer bubble in this turn
  let targetBubble: HTMLElement | null = null;
  // Search backward from last node to first
  for (let i = turnNodes.length - 1; i >= 0; i--) {
    const node = turnNodes[i];
    // Candidate 1: standard bubble inside assistantRow or assistant-step
    const bubble = node.querySelector<HTMLElement>('div[class*="bubble"]');
    if (bubble) {
      targetBubble = bubble;
      break;
    }
    // Candidate 2: node itself is an assistant row or bubble
    if (node.classList.contains('bubble') || node.getAttribute('data-chat-flow-kind') === 'assistant-step') {
      targetBubble = node;
      break;
    }
  }

  if (!targetBubble) {
    // Fallback: append to the last node of the turn
    targetBubble = turnNodes[turnNodes.length - 1];
  }

  // 3. Register media into Global Media Viewer Store
  const store = getGlobalMediaViewerStore();
  let firstAddedId = '';
  let shouldAutoOpen = false;

  for (const m of allMedia) {
    const added = store.addMedia({
      url: m.url,
      type: m.type,
      title: m.title,
    });
    if (!firstAddedId) firstAddedId = added.id;
    if (!hasAutoOpened(m.url)) {
      shouldAutoOpen = true;
      markAutoOpened(m.url);
    }
  }

  if (firstAddedId) {
    store.setActiveId(firstAddedId);
  }

  // 4. Mount the media tail to the bottom of the target bubble (outside the collapsed process)
  const tail = createMediaTailElement(allMedia, doc);
  targetBubble.appendChild(tail);
  targetBubble.setAttribute(ENHANCED_ATTR, 'true');

  // 5. Autonomous business logic: automatically trigger right sidebar open!
  if (shouldAutoOpen) {
    try {
      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      if (win && (win as any).__omnimuxWorkbench?.openWorkbench) {
        (win as any).__omnimuxWorkbench.openWorkbench({ tabId: MEDIA_VIEWER_TAB_ID });
      }
    } catch (err) {
      console.warn('[MediaEnhancer] Auto-open workbench failed:', err);
    }
  }

  return true;
}

/**
 * Scan all conversation turns in the container and enhance them
 */
export function scanAndEnhanceTurns(root: ParentNode = (typeof document !== 'undefined' ? document : (null as any))): number {
  if (!root) return 0;
  const targetDoc = (root.nodeType === 9 ? (root as Document) : (root.ownerDocument || (typeof document !== 'undefined' ? document : undefined)));
  if (targetDoc) {
    injectMediaViewerStyles(targetDoc);
  }

  // Group flowItems by turn
  const flowItems = root.querySelectorAll<HTMLElement>('[data-chat-turn]');
  const turnMap = new Map<string, HTMLElement[]>();

  for (const item of flowItems) {
    const turn = item.getAttribute('data-chat-turn');
    if (!turn) continue;
    if (!turnMap.has(turn)) {
      turnMap.set(turn, []);
    }
    turnMap.get(turn)!.push(item);
  }

  let enhancedCount = 0;
  for (const [turnId, nodes] of turnMap.entries()) {
    if (enhanceTurnMedia(turnId, nodes, targetDoc)) {
      enhancedCount++;
    }
  }

  // Fallback scan: also check individual assistant bubbles that might not have data-chat-turn
  const isolatedBubbles = root.querySelectorAll<HTMLElement>('div[class*="assistantRow"] div[class*="bubble"]:not([data-omx-media-enhanced="true"])');
  for (const bubble of isolatedBubbles) {
    const parentTurn = bubble.closest('[data-chat-turn]');
    if (!parentTurn) {
      const media = extractMediaFromElement(bubble);
      if (media.length > 0 && !bubble.querySelector('.omx-chat-media-tail')) {
        bubble.setAttribute(ENHANCED_ATTR, 'true');
        const tail = createMediaTailElement(media, targetDoc);
        bubble.appendChild(tail);
        enhancedCount++;
      }
    }
  }

  return enhancedCount;
}

/**
 * Install DOM observer to automatically enhance conversation as new tools/images resolve
 */
export function installAssistantMessageMediaEnhancer(targetDoc: Document = (typeof document !== 'undefined' ? document : (null as any))): () => void {
  if (!targetDoc) return () => {};
  injectMediaViewerStyles(targetDoc);

  let timer: any = null;
  const scheduleScan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      scanAndEnhanceTurns(targetDoc);
    }, 120);
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
    attributes: true,
    attributeFilter: ['hidden', 'data-turn-process-hidden', 'src'],
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
