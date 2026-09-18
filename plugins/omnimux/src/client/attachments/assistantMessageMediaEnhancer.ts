/**
 * Assistant Message Media Enhancer
 * Observes assistant messages and turn processes in the conversation stream.
 *
 * Core Business Logic (Autonomous & Guaranteed):
 * 1. Scans the ENTIRE turn (including collapsed [data-turn-process-hidden] tool steps)
 *    to extract generated media items (image_generate / display_file).
 * 2. Multi-dimensional Normalization & Fingerprint Deduplication:
 *    - Eliminates duplicate entries caused by the same asset appearing across
 *      different lifecycle stages (e.g. Base64 data stream in image_generate
 *      and persistent file URL in display_file).
 *    - Correlates filenames, aspect ratios, and turn context to converge
 *      on the canonical high-resolution source.
 * 3. Forces the extracted media preview card to be displayed at the TAIL of the
 *    assistant's final answer bubble, completely visible outside the collapsed fold.
 * 4. Automatically opens the right sidebar workbench via business logic,
 *    without relying on manual user clicks or agent instructions.
 */

import { useEffect } from 'react';
import { getGlobalMediaViewerStore, MEDIA_VIEWER_TAB_ID } from '../media-viewer/media-viewer-store.js';
import { injectMediaViewerStyles } from '../media-viewer/styles.js';
import { currentSessionId } from '../workbench/host-adapter.js';

const ENHANCED_ATTR = 'data-omx-media-enhanced';

export interface DetectedMedia {
  id?: string;
  url: string;
  type: 'image' | 'video';
  title?: string;
  timestamp?: number;
  filename?: string;
  canonicalKey?: string;
  isDataUrl?: boolean;
  score?: number;
  sessionId?: string;
}

// Track URLs and canonical keys that have already triggered auto-opening the right sidebar
const autoOpenedKeys = new Set<string>();

export function markAutoOpened(key: string): void {
  if (key) autoOpenedKeys.add(key);
}

export function hasAutoOpened(key: string): boolean {
  return Boolean(key && autoOpenedKeys.has(key));
}

export function resetAutoOpenedForTests(): void {
  autoOpenedKeys.clear();
}

/**
 * Extract a canonical filename (e.g. "image-2026-09-14T...jpg") from a URL,
 * alt attribute, title attribute, or nearby path strings.
 */
export function extractFilename(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;

  // 1. Check query parameters (?path=..., ?file=..., ?target=...)
  const queryMatch = raw.match(/[?&](?:path|file|target)=([^&#]+)/i);
  if (queryMatch && queryMatch[1]) {
    try {
      const decoded = decodeURIComponent(queryMatch[1]);
      const base = decoded.split(/[\\/]/).pop();
      if (base && /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|ogg)$/i.test(base)) {
        return base;
      }
    } catch {
      // ignore decode error
    }
  }

  // 2. Direct path or filename pattern
  const fileMatch = raw.match(/(?:^|[\\/])([a-zA-Z0-9_\-\.\%]+\.(?:png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|ogg))(?:\?|#|$)/i);
  if (fileMatch && fileMatch[1]) {
    try {
      return decodeURIComponent(fileMatch[1]);
    } catch {
      return fileMatch[1];
    }
  }

  return undefined;
}

/**
 * 是否属于用户消息行：用户附件图不是「生成结果」，不得扫入助手媒体尾卡。
 */
export function isUserMessageNode(el: Element | null | undefined): boolean {
  if (!el || typeof (el as Element).closest !== 'function') return false;
  if ((el as Element).closest('div[class*="userRow"], div[class*="userStack"]')) return true;
  const className = typeof (el as Element).className === 'string' ? (el as Element).className : '';
  return /userRow|userStack/.test(className);
}

/**
 * 判定当前 turn 或消息节点是否属于视频分镜拆解或视频分析场景。
 * 视频分镜分析（.vbreakdown）属于专业高优先级工作台，在此场景下应屏蔽底层媒体嗅探器的强制抢占弹窗，
 * 保证右侧栏优先由「视频分析工作台」接管，普通视频素材只静默收录至全局媒体库供画廊使用，绝不横向抢焦。
 */
export function isBreakdownOrAnalysisTurn(nodesOrElement: readonly HTMLElement[] | Element | null | undefined): boolean {
  if (!nodesOrElement) return false;
  const nodes = Array.isArray(nodesOrElement) ? nodesOrElement : [nodesOrElement as HTMLElement];

  for (const node of nodes) {
    if (!node) continue;
    // 1. 检查是否存在 .vbreakdown 或相关属性/链接/类名工件标记
    if (
      node.querySelector?.(
        '[data-is-breakdown="true"], [data-breakdown-path], [class*="breakdown"], [class*="vbreakdown"], a[href*=".vbreakdown"], a[href*="vbreakdown"]'
      )
    ) {
      return true;
    }

    // 2. 检查节点内文本是否包含视频分镜分析的核心特征
    const text = node.textContent || '';
    if (
      text.includes('.vbreakdown') ||
      text.includes('video_breakdown_analyze') ||
      text.includes('Video Breakdown') ||
      (text.includes('分镜') && (text.includes('关键帧') || text.includes('镜头语言') || text.includes('落地建议') || text.includes('复刻与落地'))) ||
      (text.includes('视频分析') && (text.includes('时间轴') || text.includes('拆解') || text.includes('分镜清单') || text.includes('工作台')))
    ) {
      return true;
    }

    // 3. 检查类名或工具调用标记
    const className = typeof node.className === 'string' ? node.className : '';
    if (className.includes('breakdown') || className.includes('vbreakdown')) {
      return true;
    }
  }

  return false;
}

/**
 * Scan an element or subtree for generated images or videos,
 * ignoring avatars, icons, and small UI glyphs.
 * Computes normalization features (filename, canonicalKey, priority score).
 */
export function extractMediaFromElement(el: HTMLElement): DetectedMedia[] {
  const mediaList: DetectedMedia[] = [];
  // 用户气泡/附件行里的图是输入素材，不是助手生成结果
  if (isUserMessageNode(el)) return mediaList;

  // Context-level filename hint (e.g. from .dshview-path or toolview text)
  const pathElem = el.querySelector('.dshview-path');
  const contextPath = pathElem?.getAttribute('title') || pathElem?.textContent || el.getAttribute('data-target-path') || undefined;
  const contextFilename = extractFilename(contextPath) || extractFilename(el.textContent);

  // 1. Check img tags
  const imgs = el.querySelectorAll<HTMLImageElement>('img');
  for (const img of imgs) {
    // 跳过嵌套在用户行内的图片（整轮扫描时父节点可能是 turn 容器）
    if (isUserMessageNode(img)) continue;
    const src = img.getAttribute('src');
    if (!src) continue;
    // Exclude SVG badges and micro avatars
    if (src.startsWith('data:image/svg') || img.classList.contains('avatar') || img.width === 16 || img.height === 16) {
      continue;
    }

    const alt = img.getAttribute('alt') || '';
    const titleAttr = img.getAttribute('title') || '';
    const filename = extractFilename(src) || extractFilename(alt) || extractFilename(titleAttr) || contextFilename;
    const isData = src.startsWith('data:');
    const isBlob = src.startsWith('blob:');

    let canonicalKey: string;
    let score = 20; // Default persistent URL score
    if (filename) {
      canonicalKey = `file:${filename.toLowerCase()}`;
      if (isData) score = 5;
      else if (isBlob) score = 10;
    } else if (isData) {
      canonicalKey = `data:${src.length}:${src.slice(0, 100)}`;
      score = 5;
    } else if (isBlob) {
      canonicalKey = `blob:${src}`;
      score = 10;
    } else {
      canonicalKey = `url:${src.split('?')[0].split('#')[0].toLowerCase()}`;
      score = 20;
    }

    mediaList.push({
      url: src,
      type: 'image',
      title: (alt && !alt.startsWith('data:') && alt !== '生成图片' && alt !== '预览') ? alt : (filename || '生成图片'),
      filename,
      canonicalKey,
      isDataUrl: isData,
      score,
    });
  }

  // 2. Check video tags
  const videos = el.querySelectorAll<HTMLVideoElement>('video');
  for (const vid of videos) {
    if (isUserMessageNode(vid)) continue;
    const src = vid.getAttribute('src');
    if (!src) continue;

    const titleAttr = vid.getAttribute('title') || '';
    const filename = extractFilename(src) || extractFilename(titleAttr) || contextFilename;
    const isBlob = src.startsWith('blob:');

    let canonicalKey: string;
    let score = 20;
    if (filename) {
      canonicalKey = `file:${filename.toLowerCase()}`;
      if (isBlob) score = 10;
    } else if (isBlob) {
      canonicalKey = `blob:${src}`;
      score = 10;
    } else {
      canonicalKey = `url:${src.split('?')[0].split('#')[0].toLowerCase()}`;
    }

    mediaList.push({
      url: src,
      type: 'video',
      title: titleAttr || filename || '生成视频',
      filename,
      canonicalKey,
      isDataUrl: false,
      score,
    });
  }

  return mediaList;
}

/**
 * Deduplicate and normalize media items collected within a conversation turn:
 * 1. Merges data stream previews and persistent file views referencing the same filename.
 * 2. If a single data URL generation item and a single persistent viewer item exist in the turn,
 *    correlates them into the canonical persistent item.
 * 3. Preserves distinct files (multi-image generation) in multiple cards.
 * 4. Selects the highest quality persistent source for downstream display and right sidebar.
 */
export function deduplicateTurnMedia(rawItems: readonly DetectedMedia[]): DetectedMedia[] {
  if (rawItems.length <= 1) return [...rawItems];

  // 1. Check for single generation (unnamed data URL) + single viewer (named persistent URL)
  const persistentNamed = rawItems.filter((item) => !item.isDataUrl && item.filename);
  const unnamedDataUrls = rawItems.filter((item) => item.isDataUrl && !item.filename);

  if (persistentNamed.length === 1 && unnamedDataUrls.length === 1 && persistentNamed[0].type === unnamedDataUrls[0].type) {
    unnamedDataUrls[0].canonicalKey = persistentNamed[0].canonicalKey;
    unnamedDataUrls[0].filename = persistentNamed[0].filename;
  }

  // 2. Cluster items by canonicalKey
  const clusters = new Map<string, DetectedMedia[]>();
  for (const item of rawItems) {
    const key = item.canonicalKey || item.url;
    if (!clusters.has(key)) {
      clusters.set(key, []);
    }
    clusters.get(key)!.push(item);
  }

  // 3. For each cluster, elect the highest-scoring canonical representative
  const result: DetectedMedia[] = [];
  for (const group of clusters.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    // Sort by score descending (persistent > blob > data URL)
    group.sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      // Prefer item with a specific filename/title over generic
      const aTitleValid = a.title && a.title !== '生成图片' && a.title !== '预览' ? 1 : 0;
      const bTitleValid = b.title && b.title !== '生成图片' && b.title !== '预览' ? 1 : 0;
      return bTitleValid - aTitleValid;
    });
    result.push(group[0]);
  }

  return result;
}

/**
 * Create DOM element for the message tail preview card
 */
export function createMediaTailElement(items: readonly DetectedMedia[], doc: Document = document): HTMLElement {
  const container = doc.createElement('div');
  container.className = 'omx-chat-media-tail';
  container.setAttribute('data-omx-media-tail', 'true');

  const triggerOpenWorkbench = async (tabId: string = MEDIA_VIEWER_TAB_ID, shouldCollapseConversation: boolean = false): Promise<boolean> => {
    try {
      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      const wb = (win as any)?.__omnimuxWorkbench;
      if (!wb) return false;
      const openFn = wb.openWorkbench || wb.open;
      if (typeof openFn !== 'function') return false;

      const res = await openFn.call(wb, { tabId });
      if (res !== false && shouldCollapseConversation) {
        // Expand right sidebar to full width and collapse conversation column
        wb.setConversationCollapsed?.(true);
        wb.setFocus?.('gui');
        try {
          doc.documentElement?.setAttribute('data-omnimux-conversation-collapsed', 'true');
        } catch {
          // ignore
        }
      }
      return res !== false;
    } catch (err) {
      console.warn('[MediaEnhancer] openWorkbench failed:', err);
      return false;
    }
  };

  const openInSidebar = (item: DetectedMedia) => {
    const store = getGlobalMediaViewerStore();
    const media = store.addMedia({
      url: item.url,
      type: item.type,
      title: item.title,
      sessionId: item.sessionId || currentSessionId(),
    });
    store.setActiveId(media.id);
    store.setSubViewMode('single');
    // Enter full canvas mode (2-column layout with middle conversation collapsed)
    store.setLayoutMode('2col');

    void triggerOpenWorkbench(MEDIA_VIEWER_TAB_ID, true);
  };

  const buildCardElement = (item: DetectedMedia): HTMLElement => {
    const card = doc.createElement('div');
    card.className = 'omx-chat-media-tail__card';
    card.title = '点击进入图像生成';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const img = doc.createElement('img');
    img.src = item.url;
    img.alt = item.title || '生成预览';
    img.className = 'omx-chat-media-tail__img';
    card.appendChild(img);

    // Pill canvas button in top-right corner (reveals on hover, matching Image 2)
    const canvasBtn = doc.createElement('button'); // exempt-ui01: 消息卡片悬浮画布按钮
    canvasBtn.className = 'omx-chat-media-tail__canvas-btn';
    canvasBtn.title = '进入图像生成';
    canvasBtn.setAttribute('aria-label', '进入图像生成');
    canvasBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
      </svg>
      <span>图像生成</span>
    `;

    canvasBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openInSidebar(item);
    });

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      openInSidebar(item);
    });

    card.appendChild(canvasBtn);
    return card;
  };

  if (items.length === 1) {
    container.appendChild(buildCardElement(items[0]));
  } else {
    // Multi-card gallery: 1 Main Stage + N Thumbnail Rail (Left Main, Right Thumbnails)
    container.classList.add('omx-chat-media-tail--gallery');
    container.setAttribute('tabindex', '0');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', '媒体素材画廊');

    let activeIndex = 0;

    const mainStage = doc.createElement('div');
    mainStage.className = 'omx-chat-media-tail__main';
    mainStage.setAttribute('role', 'button');
    mainStage.setAttribute('tabindex', '0');
    mainStage.title = '点击进入图像生成';

    const mainContent = doc.createElement('div');
    mainContent.className = 'omx-chat-media-tail__main-content';
    mainStage.appendChild(mainContent);

    // Pill canvas button in top-right corner
    const canvasBtn = doc.createElement('button'); // exempt-ui01: 消息卡片悬浮画布按钮
    canvasBtn.className = 'omx-chat-media-tail__canvas-btn';
    canvasBtn.title = '进入图像生成';
    canvasBtn.setAttribute('aria-label', '进入图像生成');
    canvasBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
      </svg>
      <span>图像生成</span>
    `;
    canvasBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openInSidebar(items[activeIndex]);
    });
    mainStage.addEventListener('click', (e) => {
      e.stopPropagation();
      openInSidebar(items[activeIndex]);
    });
    mainStage.appendChild(canvasBtn);

    const rail = doc.createElement('div');
    rail.className = 'omx-chat-media-tail__rail';

    const updateRailScrollHint = () => {
      const up = rail.scrollTop > 2;
      const down = rail.scrollTop + rail.clientHeight < rail.scrollHeight - 2;
      rail.classList.toggle('cs-up', up);
      rail.classList.toggle('cs-down', down);
    };
    rail.addEventListener('scroll', updateRailScrollHint);

    const thumbElements: HTMLElement[] = [];

    const renderActive = () => {
      const item = items[activeIndex];

      // Clear previous main media and pause any video
      const prevVideo = mainContent.querySelector('video');
      if (prevVideo) {
        try { prevVideo.pause(); } catch {}
      }
      mainContent.innerHTML = '';

      if (item.type === 'video') {
        const vid = doc.createElement('video');
        vid.src = item.url;
        vid.className = 'omx-chat-media-tail__video';
        vid.controls = true;
        vid.preload = 'metadata';
        vid.setAttribute('playsinline', '');
        vid.addEventListener('click', (e) => e.stopPropagation());
        const applyVideoRatio = () => {
          if (vid.videoWidth && vid.videoHeight) {
            mainStage.style.aspectRatio = `${vid.videoWidth} / ${vid.videoHeight}`;
          }
        };
        vid.addEventListener('loadedmetadata', applyVideoRatio);
        if (vid.videoWidth && vid.videoHeight) {
          applyVideoRatio();
        } else {
          mainStage.style.aspectRatio = '16 / 9';
        }
        mainContent.appendChild(vid);
      } else {
        const img = doc.createElement('img');
        img.src = item.url;
        img.alt = item.title || '生成预览';
        img.className = 'omx-chat-media-tail__img';
        const applyRatio = () => {
          if (img.naturalWidth && img.naturalHeight) {
            mainStage.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
          }
        };
        img.onload = applyRatio;
        applyRatio();
        mainContent.appendChild(img);
      }

      thumbElements.forEach((t, i) => {
        const isActive = i === activeIndex;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      const activeThumb = thumbElements[activeIndex];
      if (activeThumb && typeof activeThumb.scrollIntoView === 'function') {
        try {
          activeThumb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch {}
      }
      updateRailScrollHint();
    };

    items.forEach((item, index) => {
      const thumb = doc.createElement('button'); // exempt-ui01: 缩略图点选按钮
      thumb.className = 'omx-chat-media-tail__thumb';
      thumb.setAttribute('type', 'button');
      thumb.setAttribute('aria-label', `查看素材 ${index + 1}: ${item.title || item.filename || ''}`);
      thumb.setAttribute('aria-selected', index === 0 ? 'true' : 'false');

      if (item.type === 'video') {
        const vid = doc.createElement('video');
        vid.src = item.url ? `${item.url}#t=0.001` : '';
        vid.preload = 'metadata';
        vid.muted = true;
        vid.setAttribute('playsinline', '');
        thumb.appendChild(vid);

        const dur = doc.createElement('span');
        dur.className = 'omx-chat-media-tail__dur';
        dur.textContent = '视频';
        thumb.appendChild(dur);
      } else {
        const img = doc.createElement('img');
        img.src = item.url;
        img.alt = item.title || '';
        thumb.appendChild(img);
      }

      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        activeIndex = index;
        renderActive();
      });

      thumbElements.push(thumb);
      rail.appendChild(thumb);
    });

    container.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        renderActive();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        activeIndex = (activeIndex + 1) % items.length;
        renderActive();
      }
    });

    renderActive();
    container.appendChild(mainStage);
    container.appendChild(rail);
  }

  return container;
}

/**
 * Enhance a conversation Turn:
 * 1. Find all nodes belonging to this turn (including collapsed/hidden tool rows).
 * 2. Extract and deduplicate/normalize generated media.
 * 3. Locate the final assistant answer bubble in this turn.
 * 4. Mount the media tail card onto the bottom of the assistant bubble.
 * 5. Automatically trigger openWorkbench in right sidebar for the canonical asset.
 */
export function enhanceTurnMedia(turnId: string, turnNodes: readonly HTMLElement[], doc: Document = document): boolean {
  if (!turnNodes || turnNodes.length === 0) return false;

  // Check if turn already has an active tail
  const alreadyHasTail = turnNodes.some((node) => node.querySelector('.omx-chat-media-tail'));
  if (alreadyHasTail) return false;

  // 1. Aggregate all media in this turn (scans hidden tool results, image_generate, dshview)
  const rawMedia: DetectedMedia[] = [];

  for (const node of turnNodes) {
    const items = extractMediaFromElement(node);
    rawMedia.push(...items);
  }

  // Deduplicate and normalize multi-source media across this turn
  const allMedia = deduplicateTurnMedia(rawMedia);

  if (allMedia.length === 0) return false;

  // 2. Locate the final assistant answer bubble in this turn（绝不挂到用户气泡）
  let targetBubble: HTMLElement | null = null;
  // Search backward from last node to first
  for (let i = turnNodes.length - 1; i >= 0; i--) {
    const node = turnNodes[i];
    if (isUserMessageNode(node)) continue;
    // Candidate 1: standard bubble inside assistantRow or assistant-step
    const bubbles = node.querySelectorAll<HTMLElement>('div[class*="bubble"]');
    for (let j = bubbles.length - 1; j >= 0; j--) {
      const bubble = bubbles[j];
      if (isUserMessageNode(bubble)) continue;
      targetBubble = bubble;
      break;
    }
    if (targetBubble) break;
    // Candidate 2: node itself is an assistant row or bubble
    if (node.classList.contains('bubble') || node.getAttribute('data-chat-flow-kind') === 'assistant-step') {
      targetBubble = node;
      break;
    }
  }

  if (!targetBubble || isUserMessageNode(targetBubble)) {
    // 尚无助手气泡时不挂尾卡，避免把大预览塞进用户消息
    return false;
  }

  // 3. Register canonical media into Global Media Viewer Store
  const store = getGlobalMediaViewerStore();
  let firstAddedId = '';
  let shouldAutoOpen = false;
  const activeSessionId = currentSessionId();

  for (const m of allMedia) {
    if (!m.sessionId && activeSessionId) {
      m.sessionId = activeSessionId;
    }
    const added = store.addMedia({
      url: m.url,
      type: m.type,
      title: m.title,
      sessionId: m.sessionId || activeSessionId,
    });
    if (!firstAddedId) firstAddedId = added.id;
    const trackingKey = m.canonicalKey || m.url;
    if (!hasAutoOpened(trackingKey)) {
      shouldAutoOpen = true;
      markAutoOpened(trackingKey);
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
  // 排他性门禁：当检测到当前 turn 属于视频分镜拆解或视频分析场景时，
  // 必须把右侧工作台留给高优先级的「视频分析工作台」（.vbreakdown），
  // 严格阻止底层媒体嗅探器强制抢占焦点，避免把分析工作台顶掉。
  const isBreakdownScene = isBreakdownOrAnalysisTurn(turnNodes);
  if (shouldAutoOpen && !isBreakdownScene) {
    try {
      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      const wb = (win as any)?.__omnimuxWorkbench;
      const openFn = wb?.openWorkbench || wb?.open;
      if (typeof openFn === 'function') {
        openFn.call(wb, { tabId: MEDIA_VIEWER_TAB_ID });
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
      const rawMedia = extractMediaFromElement(bubble);
      const media = deduplicateTurnMedia(rawMedia);
      const activeSessionId = currentSessionId();
      for (const m of media) {
        if (!m.sessionId && activeSessionId) m.sessionId = activeSessionId;
      }
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
