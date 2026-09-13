/**
 * Styles for Media Viewer & Assistant Message Media Enhancer.
 * Follows OmniMux design tokens (--dsw-alias-*).
 */

export const MEDIA_VIEWER_STYLE_ID = 'omnimux-media-viewer-styles';

export const MEDIA_VIEWER_CSS = `
/* ========================================================
   1. 助手消息尾部图片预览卡片 (Message Tail Preview Card)
   ======================================================== */
.omx-chat-media-tail {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 360px;
  user-select: none;
}

.omx-chat-media-tail__grid {
  display: flex;
  gap: 8px;
  width: 100%;
}

.omx-chat-media-tail__card {
  flex: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 4px 16px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 消息卡片微投影 */
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s, box-shadow 0.2s;
  position: relative;
}

.omx-chat-media-tail__card:hover {
  border-color: var(--dsw-alias-border-l3);
  transform: translateY(-1.5px);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 消息卡片悬浮微投影 */
}

.omx-chat-media-tail__img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  display: block;
}

.omx-chat-media-tail__grid .omx-chat-media-tail__img {
  height: 140px;
}

.omx-chat-media-tail__actions {
  height: 34px;
  padding: 0 8px;
  background: var(--dsw-alias-bg-layer-1);
  display: flex;
  align-items: center;
  gap: 4px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}

.omx-chat-media-tail__btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.omx-chat-media-tail__btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

/* ========================================================
   2. 右侧媒体工作台容器与工具栏 (Media Viewer Stage)
   ======================================================== */
.omx-media-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  position: relative;
}

.omx-mv-toolbar {
  height: 46px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  flex-shrink: 0;
  z-index: 10;
}

.omx-mv-toolbar__left,
.omx-mv-toolbar__center,
.omx-mv-toolbar__right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.omx-mv-capsule {
  display: flex;
  align-items: center;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.omx-mv-capsule__btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}

.omx-mv-capsule__btn.active {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
}

.omx-mv-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-interactive-bg-hover);
  border: 1px solid var(--dsw-alias-border-l2);
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.15s;
}

.omx-mv-btn:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l3);
}

.omx-mv-stage-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* 时间线模式：强制隐藏左侧小图栏！ */
.omx-mv-stage-wrapper[data-subview="grid"] .omx-mv-filmstrip {
  display: none !important;
}

/* 大图单图模式：展开左侧小图胶卷 */
.omx-mv-stage-wrapper[data-subview="single"] .omx-mv-filmstrip {
  display: flex !important;
}

/* ========================================================
   3. 左侧纵向小图胶卷栏 (Filmstrip, 仅在大图模式显示)
   ======================================================== */
.omx-mv-filmstrip {
  width: 70px;
  background: var(--dsw-alias-bg-base);
  border-right: 1px solid var(--dsw-alias-border-l2);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 0;
  gap: 10px;
  flex-shrink: 0;
  overflow-y: auto;
  z-index: 5;
}

.omx-mv-filmstrip__item {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  border: 2px solid transparent;
  background: var(--dsw-alias-bg-layer-2);
  transition: all 0.15s;
  flex-shrink: 0;
}

.omx-mv-filmstrip__item:hover {
  border-color: var(--dsw-alias-border-l3);
}

.omx-mv-filmstrip__item.active {
  border-color: var(--dsw-alias-brand-primary);
}

.omx-mv-filmstrip__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.omx-mv-filmstrip__badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: var(--dsw-alias-bg-base);
  border-radius: 3px;
  padding: 1px 3px;
  font-size: 9px;
  color: var(--dsw-alias-label-primary);
  line-height: 1;
  font-weight: 500;
}

/* ========================================================
   4. 时间线瀑布流 (Timeline Feed, 支持单时间线多图横排)
   ======================================================== */
.omx-mv-timeline {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 20px 32px 100px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 28px;
}

.omx-mv-timeline__group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 820px;
}

.omx-mv-timeline__date {
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
  font-weight: 400;
  letter-spacing: 0.2px;
}

.omx-mv-timeline__card-single {
  width: 380px;
  max-width: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 4px 20px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 时间线卡片投影 */
  cursor: pointer;
  position: relative;
  transition: transform 0.2s, box-shadow 0.2s;
}

.omx-mv-timeline__card-single.selected {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}

.omx-mv-timeline__card-single img {
  width: 100%;
  height: 270px;
  object-fit: cover;
  display: block;
}

/* 核心：同一时间线下多图横排 */
.omx-mv-timeline__row {
  display: flex;
  gap: 12px;
  width: 100%;
}

.omx-mv-timeline__card-multi {
  flex: 1;
  height: 220px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 4px 20px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 时间线卡片投影 */
  cursor: pointer;
  position: relative;
  border: 1px solid var(--dsw-alias-border-l2);
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
}

.omx-mv-timeline__card-multi:hover {
  border-color: var(--dsw-alias-border-l3);
  transform: translateY(-2px);
}

.omx-mv-timeline__card-multi img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ========================================================
   5. 大图/大视频居中视口 (Main Display Viewport)
   ======================================================== */
.omx-mv-viewport {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 24px;
  position: relative;
  background: var(--dsw-alias-bg-base);
}

.omx-mv-display {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 16px 56px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 大图视口深色投影 */
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  max-width: 90%;
  max-height: 90%;
  display: flex;
  position: relative;
}

.omx-mv-display img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(100vh - 170px);
  object-fit: contain;
  display: block;
}

/* ========================================================
   6. 底部居中悬浮输入框 (仅在两栏模式浮现)
   ======================================================== */
.omx-mv-composer {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 640px;
  max-width: calc(100% - 100px);
  background: var(--dsw-alias-bg-layer-2);
  backdrop-filter: blur(20px);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 18px;
  box-shadow: 0 20px 48px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 悬浮输入框投影 */
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 100;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.omx-mv-composer.hidden {
  display: none !important;
}

.omx-mv-composer__elapsed {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.omx-mv-composer__body {
  display: flex;
  align-items: center;
  gap: 12px;
}

.omx-mv-composer__thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l3);
  flex-shrink: 0;
}

.omx-mv-composer__thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.omx-mv-composer__textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  resize: none;
  min-height: 26px;
}

.omx-mv-composer__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--dsw-alias-border-l1);
  padding-top: 8px;
}

.omx-mv-composer__bottom-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.omx-mv-composer__perm-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-interactive-bg-hover);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
}

.omx-mv-composer__bottom-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.omx-mv-composer__model-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.omx-mv-composer__send-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s;
}

.omx-mv-composer__send-btn:hover {
  transform: scale(1.06);
}

/* ========================================================
   7. 生成中点阵与流体微光动效 (OrganicShimmer)
   ======================================================== */
@keyframes omx-shimmer-sweep {
  0% { transform: translate3d(-69.697%, -69.697%, 0); }
  100% { transform: translate3d(0, 0, 0); }
}

.omx-generating-box {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--dsw-alias-bg-layer-2);
  position: relative;
  overflow: hidden;
}

.omx-dot-matrix {
  position: absolute;
  inset: 0;
  opacity: 0.85;
  z-index: 1;
}

.omx-shimmer-overlay {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  z-index: 2;
  pointer-events: none;
}

.omx-shimmer-canvas {
  position: absolute;
  inset: -20px;
}

.omx-shimmer-field {
  position: absolute;
  inset: 0;
}

.omx-shimmer-distortion {
  position: absolute;
  top: 0;
  left: 0;
  width: 330%;
  height: 330%;
  background-size: 100% 100%;
  transform: translate3d(-69.697%, -69.697%, 0);
  animation: omx-shimmer-sweep 4000ms linear infinite alternate;
}
`;

export function injectMediaViewerStyles(doc = typeof document !== 'undefined' ? document : undefined) {
  if (!doc) return;
  if (doc.getElementById(MEDIA_VIEWER_STYLE_ID)) return;
  const tag = doc.createElement('style');
  tag.id = MEDIA_VIEWER_STYLE_ID;
  tag.textContent = MEDIA_VIEWER_CSS;
  doc.head.appendChild(tag);
}
