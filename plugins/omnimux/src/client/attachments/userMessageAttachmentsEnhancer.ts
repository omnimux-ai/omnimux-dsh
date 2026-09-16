/**
 * User Message Attachments Enhancer
 * 在用户消息卡片左上角上方依次展示发送时附带的附件（图片/视频/音频/文件）。
 */
import { currentSessionId } from '../workbench/host-adapter.js';
import { submittedAttachmentStore } from './submittedAttachmentStore.ts';
import type { ConversationAttachment } from './types.ts';

const USER_BUBBLE_SELECTOR = 'div[class*="userRow"] div[class*="bubble"], div[class*="userStack"] div[class*="bubble"]';
const RAIL_CONTAINER_CLASS = 'omx-user-attachments-rail';
const ENHANCED_ATTR = 'data-omx-user-attachments';
const STYLES_ID = 'omx-user-attachments-styles';
/** 官方宿主在用户气泡上方渲染的大图/文件附件行（MessageItem.attachmentRow）。 */
const NATIVE_ATTACHMENTS_SELECTOR = '[data-message-attachments]';
const HIDDEN_NATIVE_ATTR = 'data-omx-native-attachments-hidden';

const STYLES_CSS = `
.${RAIL_CONTAINER_CLASS} {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  justify-content: flex-start;
  align-self: flex-start;
  width: 100%;
  box-sizing: border-box;
}

/* OmniMux 已在上方挂紧凑素材轨时，隐藏官方大图附件行，避免同一份素材显示两次。 */
${NATIVE_ATTACHMENTS_SELECTOR}[${HIDDEN_NATIVE_ATTR}="true"] {
  display: none !important;
}

.omx-user-att-card {
  position: relative;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  user-select: none;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.omx-user-att-card:hover {
  transform: translateY(-1px);
}

/* 图像与视频缩略图卡片 */
.omx-user-att-card--media {
  width: 44px;
  min-width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  cursor: pointer;
}

.omx-user-att-card--media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 视频播放小图标与角标 */
.omx-user-att-play-badge {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--dsw-alias-backdrop-overlay, rgba(0, 0, 0, 0.6)); /* exempt-ui03 半透明视频蒙层 */
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary-foreground, #ffffff); /* exempt-ui03 高反差图标色 */
  pointer-events: none;
}

.omx-user-att-play-badge svg {
  width: 10px;
  height: 10px;
  fill: currentColor;
  margin-left: 1px;
}

.omx-user-att-duration {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 9px;
  line-height: 1;
  padding: 2px 3px;
  border-radius: 3px;
  background: var(--dsw-alias-backdrop-overlay, rgba(0, 0, 0, 0.7)); /* exempt-ui03 半透明时长角标底色 */
  color: var(--dsw-alias-label-primary-foreground, #ffffff); /* exempt-ui03 高反差文字色 */
  font-family: ui-monospace, monospace;
}

/* 文件/文档/表格/音频胶囊 */
.omx-user-att-card--file {
  height: 30px;
  padding: 0 10px 0 6px;
  gap: 6px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  cursor: default;
  max-width: 200px;
}

.omx-user-att-ext-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary);
  flex-shrink: 0;
  font-family: ui-monospace, monospace;
}

.omx-user-att-title {
  font-size: 12px;
  line-height: 1;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;

function ensureStyles(doc: Document) {
  if (doc.getElementById(STYLES_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLES_ID;
  style.textContent = STYLES_CSS;
  doc.head.appendChild(style);
}

/**
 * 构造单个附件展示卡片 DOM
 */
export function createAttachmentCardElement(att: ConversationAttachment, doc: Document = document): HTMLElement {
  const isImage = att.kind === 'image' || (att.extension && /^(PNG|JPG|JPEG|WEBP|GIF)$/i.test(att.extension));
  const isVideo = att.kind === 'video' || (att.extension && /^(MP4|MOV|WEBM|MKV)$/i.test(att.extension));

  if (isImage || isVideo) {
    const card = doc.createElement('div');
    card.className = 'omx-user-att-card omx-user-att-card--media';
    card.title = att.title || '媒体文件';

    const img = doc.createElement('img');
    img.src = att.previewUrl || att.relativePath || '';
    img.alt = att.title || '';
    img.loading = 'lazy';
    card.appendChild(img);

    if (isVideo) {
      const play = doc.createElement('span');
      play.className = 'omx-user-att-play-badge';
      play.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
      card.appendChild(play);

      if (att.duration) {
        const dur = doc.createElement('span');
        dur.className = 'omx-user-att-duration';
        dur.textContent = att.duration;
        card.appendChild(dur);
      }
    }

    return card;
  }

  // 文件/表格/音频胶囊
  const card = doc.createElement('div');
  card.className = 'omx-user-att-card omx-user-att-card--file';
  card.title = att.title || '附件文件';

  const ext = doc.createElement('span');
  ext.className = 'omx-user-att-ext-badge';
  ext.textContent = (att.extension || 'FILE').slice(0, 5);

  const title = doc.createElement('span');
  title.className = 'omx-user-att-title';
  title.textContent = att.title || '未命名附件';

  card.appendChild(ext);
  card.appendChild(title);

  return card;
}

/**
 * 隐藏用户行内的官方大图附件行（与 OmniMux 紧凑素材轨重复）。
 * 作用域限定在 userRow/userStack，不影响助手消息。
 */
export function hideNativeMessageAttachments(scope: Element | null): number {
  if (!scope || typeof (scope as Element).querySelectorAll !== 'function') return 0;
  const row = (scope as Element).closest?.('div[class*="userRow"], div[class*="userStack"]') || scope;
  const natives = Array.from((row as Element).querySelectorAll<HTMLElement>(NATIVE_ATTACHMENTS_SELECTOR));
  let hidden = 0;
  for (const node of natives) {
    if (node.getAttribute(HIDDEN_NATIVE_ATTR) === 'true') continue;
    // 只隐藏真正的官方附件行，不碰 OmniMux 自己的 rail
    if (node.classList.contains(RAIL_CONTAINER_CLASS) || node.getAttribute('data-omx-user-attachments-rail') === 'true') {
      continue;
    }
    node.setAttribute(HIDDEN_NATIVE_ATTR, 'true');
    hidden += 1;
  }
  return hidden;
}

/**
 * 扫描并增强会话流中的用户气泡
 */
export function scanAndEnhanceUserAttachments(root: Element | Document = document): number {
  const doc = (root as Document).defaultView ? (root as Document) : (root as Element).ownerDocument || document;
  ensureStyles(doc);

  const bubbles = Array.from(root.querySelectorAll<HTMLElement>(USER_BUBBLE_SELECTOR));
  if (bubbles.length === 0) return 0;

  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sessionId = (win as any)?.__omnimuxWorkbench?.getSnapshot?.()?.sessionId || currentSessionId() || 'default';
  let enhancedCount = 0;

  bubbles.forEach((bubble, index) => {
    if (bubble.getAttribute(ENHANCED_ATTR) === 'true') {
      // 已增强：仍要对账隐藏官方大图行（宿主可能晚于我们重绘）
      hideNativeMessageAttachments(bubble.parentElement || bubble);
      return;
    }

    // 检查气泡文本
    const text = bubble.textContent || '';
    const attachments = submittedAttachmentStore.getTurnForBubble(sessionId, text, index);

    if (attachments && attachments.length > 0) {
      // 在气泡上方创建 rail
      const rail = doc.createElement('div');
      rail.className = RAIL_CONTAINER_CLASS;
      rail.setAttribute('data-omx-user-attachments-rail', 'true');

      for (const att of attachments) {
        rail.appendChild(createAttachmentCardElement(att, doc));
      }

      // 插入到消息卡片正上方
      const parent = bubble.parentElement;
      if (parent) {
        parent.insertBefore(rail, bubble);
        bubble.setAttribute(ENHANCED_ATTR, 'true');
        hideNativeMessageAttachments(parent);
        enhancedCount += 1;
      }
    }
  });

  return enhancedCount;
}

/**
 * 安装用户消息附件增强器全局监听
 */
export function installUserMessageAttachmentsEnhancer(doc: Document = (typeof document !== 'undefined' ? document : null as any)): () => void {
  if (!doc || typeof doc.querySelector !== 'function') return () => {};

  ensureStyles(doc);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const debouncedScan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const scrollEl = doc.querySelector('[data-conversation-scroll]');
      scanAndEnhanceUserAttachments(scrollEl || doc);
    }, 50);
  };

  const handleSubmitted = () => {
    debouncedScan();
    // 延迟补充扫描一次，等待 DSH 虚拟列表完成首次 DOM 渲染
    setTimeout(debouncedScan, 150);
    setTimeout(debouncedScan, 400);
  };

  const Observer = doc.defaultView?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined);
  let observer: MutationObserver | null = null;

  if (Observer) {
    observer = new Observer(() => {
      debouncedScan();
    });
    observer.observe(doc.body || doc.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  win?.addEventListener?.('omnimux:user-message-submitted', handleSubmitted);

  // 初始扫描
  debouncedScan();

  return () => {
    if (timer) clearTimeout(timer);
    observer?.disconnect?.();
    win?.removeEventListener?.('omnimux:user-message-submitted', handleSubmitted);
  };
}
