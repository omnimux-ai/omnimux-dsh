/**
 * Styles for Media Viewer & Assistant Message Media Enhancer.
 * Follows OmniMux design tokens (--dsw-alias-*).
 */

export const MEDIA_VIEWER_STYLE_ID = 'omnimux-media-viewer-styles';

export const MEDIA_VIEWER_CSS = `
.omx-mv-generation-tasks { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; padding: 16px; width: 100%; box-sizing: border-box; flex: 0 0 auto; }
.omx-mv-viewport[data-has-generation] { flex-direction: column; justify-content: flex-start; }
.omx-mv-viewport[data-has-generation] > .omx-mv-single-stage { flex: 0 0 auto; }
.omx-mv-generation-tasks:empty { display: none; }
.omx-mv-generation-task { width: min(100%, 480px); overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
.omx-mv-generation-task__label { padding: 12px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.omx-mv-generation-task > .omx-generating-box { height: 240px; position: relative; }
.omx-mv-generation-task > img, .omx-mv-generation-task > video { display: block; width: 100%; max-height: 480px; object-fit: contain; }
.omx-generating-box[data-generation-phase="pending"] .omx-shimmer-overlay { display: none; }

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

.omx-chat-media-tail--gallery {
  display: flex !important;
  flex-direction: row !important;
  align-items: flex-start !important;
  position: relative !important;
  box-sizing: border-box !important;
  width: fit-content !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: min(440px, 50vh) !important;
  min-height: 0 !important;
  padding-right: 106px !important;
  overflow: hidden !important;
  outline: none !important;
}

.omx-chat-media-tail__main {
  position: relative;
  flex: 0 1 auto !important;
  width: auto !important;
  min-width: 0;
  height: auto;
  max-height: min(440px, 50vh);
  border-radius: 12px;
  overflow: hidden;
  background: transparent !important;
  border: none !important;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 消息卡片微投影 */
  cursor: pointer;
  outline: none;
}

.omx-chat-media-tail__main-content {
  width: auto;
  height: auto;
  position: relative;
  overflow: hidden;
}

.omx-chat-media-tail__main-content img,
.omx-chat-media-tail__main-content video {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(440px, 50vh);
  object-fit: contain;
  background: transparent !important;
  border-radius: 10px;
  display: block;
}

.omx-chat-media-tail__rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 96px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  height: auto;
  padding: 2px 3px 2px 3px;
  overscroll-behavior-y: contain;
  scrollbar-width: none;
}

.omx-chat-media-tail__rail::-webkit-scrollbar {
  display: none;
}

.omx-chat-media-tail__rail.cs-down {
  mask-image: linear-gradient(to bottom, black 0, black calc(100% - 16px), transparent 100%); /* exempt-ui03: 缩图栏下边缘滚动渐隐遮罩 */
  -webkit-mask-image: linear-gradient(to bottom, black 0, black calc(100% - 16px), transparent 100%); /* exempt-ui03: 缩图栏下边缘滚动渐隐遮罩 */
}

.omx-chat-media-tail__rail.cs-up {
  mask-image: linear-gradient(to bottom, transparent 0, black 16px, black 100%); /* exempt-ui03: 缩图栏上边缘滚动渐隐遮罩 */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 16px, black 100%); /* exempt-ui03: 缩图栏上边缘滚动渐隐遮罩 */
}

.omx-chat-media-tail__rail.cs-up.cs-down {
  mask-image: linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%); /* exempt-ui03: 缩图栏两端滚动渐隐遮罩 */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%); /* exempt-ui03: 缩图栏两端滚动渐隐遮罩 */
}

.omx-chat-media-tail__thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: 8px;
  overflow: hidden;
  padding: 0;
  margin: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  cursor: pointer;
  opacity: 0.68;
  flex: 0 0 auto;
  transition: opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  outline: none;
}

.omx-chat-media-tail__thumb:hover {
  opacity: 0.95;
  border-color: var(--dsw-alias-border-l3);
}

.omx-chat-media-tail__thumb.is-active,
.omx-chat-media-tail__thumb[aria-selected="true"] {
  opacity: 1;
  border-color: var(--dsw-alias-brand-primary) !important;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary) !important;
}

.omx-chat-media-tail__thumb img,
.omx-chat-media-tail__thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.omx-chat-media-tail__dur {
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-size: 9px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-bg-mask-1);
  pointer-events: none;
}

.omx-chat-media-tail__grid {
  display: flex;
  gap: 8px;
  width: 100%;
}

.omx-chat-media-tail__card {
  flex: 1;
  border-radius: 14px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  border: none !important;
  outline: none !important;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 消息卡片微投影 */
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
  position: relative;
}

.omx-chat-media-tail__card:hover {
  transform: translateY(-1.5px);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 消息卡片悬浮微投影 */
}

.omx-chat-media-tail__canvas-btn {
  position: absolute;
  top: auto;
  bottom: 10px;
  right: 10px;
  z-index: 3;
  height: 26px;
  padding: 0 11px 0 9px;
  border-radius: 9999px;
  background: rgba(20, 20, 24, 0.85); /* exempt-ui03: 磨砂深黑胶囊底色 */
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.14); /* exempt-ui03: 胶囊高光描边 */
  color: #ffffff; /* exempt-ui03: 胶囊按钮纯白字体 */
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); /* exempt-ui03: 悬浮按钮投影 */
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px) scale(0.96);
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s;
}

.omx-chat-media-tail__card:hover .omx-chat-media-tail__canvas-btn {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.omx-chat-media-tail__canvas-btn:hover {
  background: rgba(36, 36, 42, 0.95); /* exempt-ui03: 悬浮加亮底色 */
  border-color: rgba(255, 255, 255, 0.28); /* exempt-ui03: 胶囊悬浮高亮描边 */
  transform: translateY(0) scale(1.02);
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

/* ========================================================
   3. 单图大画布与左上角 1:1 居中悬浮缩略图栏 (Single Stage & Floating Rail)
   ======================================================== */
.omx-mv-single-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  user-select: none;
}

.omx-mv-thumbnails-rail {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 68px;
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 6px;
  z-index: 30;
  scrollbar-width: none;
  background: var(--dsw-alias-bg-layer-2);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 18px;
  box-shadow: 0 12px 36px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 悬浮胶囊外阴影 */
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.omx-mv-thumbnails-rail::-webkit-scrollbar {
  display: none;
}

.omx-mv-thumbnails-rail__item {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-2);
  aspect-ratio: 1 / 1;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

/* 可选（非当前）状态：1:1 正方形、更小、清晰透亮（无压暗滤镜，确保内容清晰可读）、左右绝对居中 */
.omx-mv-thumbnails-rail__item.inactive,
.omx-mv-thumbnails-rail__item:not(.active) {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  opacity: 0.72;
  border: 1px solid var(--dsw-alias-border-l2);
}

.omx-mv-thumbnails-rail__item.inactive:hover,
.omx-mv-thumbnails-rail__item:not(.active):hover {
  opacity: 0.95;
  transform: scale(1.06);
  border-color: var(--dsw-alias-border-l3);
}

/* 当前选中状态：1:1 正方形、极简克制白边（无刺眼漫射发光光晕）、左右居中 */
.omx-mv-thumbnails-rail__item.active {
  width: 50px;
  height: 50px;
  border-radius: 11px;
  opacity: 1;
  border: 2px solid var(--dsw-alias-label-primary) !important;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-layer-1) !important; /* exempt-ui03: 选中态微投影 */
  transform: scale(1);
}

.omx-mv-thumbnails-rail__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.omx-mv-thumbnails-rail__play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-base);
  opacity: 0.85;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary);
  pointer-events: none;
  border: 1px solid var(--dsw-alias-border-l3);
}

.omx-mv-thumbnails-rail__badge {
  position: absolute;
  bottom: 3px;
  right: 3px;
  background: var(--dsw-alias-bg-base);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 10px;
  color: var(--dsw-alias-label-primary);
  line-height: 1.2;
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

.omx-mv-timeline__card-single img,
.omx-mv-timeline__card-single video {
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
  border: none !important;
  outline: none !important;
  transition: transform 0.2s, box-shadow 0.2s;
}

.omx-mv-timeline__card-multi:hover {
  transform: translateY(-2px);
}

.omx-mv-timeline__card-multi img,
.omx-mv-timeline__card-multi video {
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

.omx-mv-stage-wrapper[data-subview="single"] .omx-mv-viewport {
  padding: 0 !important;
  overflow: hidden !important;
}

.omx-mv-display {
  border-radius: 8px;
  overflow: visible;
  border: none !important;
  outline: none !important;
  box-shadow: 0 16px 56px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 大图视口深色投影 */
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transform-origin: center center;
  transition: transform 0.05s linear;
}

.omx-mv-display img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(100vh - 120px);
  object-fit: contain;
  display: block;
  border: none !important;
  outline: none !important;
  border-radius: 6px;
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
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  resize: none;
  min-height: 26px;
}

.omx-mv-composer__textarea:focus,
.omx-mv-composer__textarea:focus-visible {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
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

/* ========================================================
   7. 图片局部打点评论标注 (Image Annotations & Popover)
   ======================================================== */
.omx-mv-btn--comment {
  height: 28px;
  padding: 0 12px;
  border-radius: 9999px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.omx-mv-btn--comment:hover {
  background: var(--dsw-alias-bg-layer-3);
  border-color: var(--dsw-alias-border-l3);
}

.omx-mv-btn--comment.active {
  background: #2563eb !important; /* exempt-ui03: 标注激活态经典亮蓝高光 */
  border: 1px solid #2563eb !important; /* exempt-ui03: 蓝框 */
  color: #ffffff !important; /* exempt-ui03: 激活态纯白高亮字 */
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.4) !important; /* exempt-ui03: 激活微光晕 */
}

/* 顶栏评论状态胶囊 */
.omx-mv-toolbar-comments-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--dsw-alias-bg-layer-2);
  padding: 3px 6px 3px 12px;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l2);
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
}

.omx-mv-toolbar-comments-bar__count {
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  color: var(--dsw-alias-label-primary);
  user-select: none;
  white-space: nowrap;
}

.omx-mv-toolbar-comments-bar__btn-send {
  height: 22px;
  padding: 0 10px;
  border-radius: 9999px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.omx-mv-toolbar-comments-bar__btn-close {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}

/* 画布大图打点图层 */
.omx-mv-display.is-annotating {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M14 2C7.37 2 2 7.15 2 13.5c0 3.1 1.28 5.92 3.39 7.97L4 26l5.22-1.38C10.74 25.07 12.33 25.5 14 25.5c6.63 0 12-5.15 12-11.5S20.63 2 14 2z' fill='%232563eb' stroke='%23ffffff' stroke-width='2'/%3E%3Cpath d='M14 9v10M9 14h10' stroke='%23ffffff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") 14 14, crosshair !important; /* exempt-ui03: 自定义气泡指针数据源 */
}

.omx-mv-annotation-layer {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  z-index: 15;
}

/* 蓝色圆角气泡标记 (Pin) 对标图2/3/4 */
.omx-mv-annotation-pin {
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 50% 50% 50% 4px; /* 气泡下尖角 */
  background: #2563eb !important; /* exempt-ui03: 经典亮蓝打点底色 */
  color: #ffffff !important; /* exempt-ui03: 图钉纯白数字 */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  border: 2px solid #ffffff !important; /* exempt-ui03: 白色高亮外边框 */
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4) !important; /* exempt-ui03: 阴影 */
  transform: translate(-50%, -100%);
  cursor: pointer;
  user-select: none;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.omx-mv-annotation-pin:hover {
  transform: translate(-50%, -100%) scale(1.1);
}

/* 弹出输入框 (Popover) 对标图3/4 - 无边框极简黑底胶囊 */
.omx-mv-annotation-popover {
  position: absolute;
  top: 0;
  left: 0;
  transform: translate(-14px, -100%);
  display: flex;
  align-items: center;
  background: rgba(30, 30, 34, 0.95); /* exempt-ui03: 磨砂深黑胶囊底色 */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 4px 6px 4px 5px;
  border-radius: 9999px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5); /* exempt-ui03: 弹窗投影 */
  border: none !important;
  outline: none !important;
  z-index: 20;
  gap: 8px;
  min-width: 240px;
  max-width: 340px;
}

.omx-mv-annotation-popover__badge {
  width: 24px;
  height: 24px;
  border-radius: 50% 50% 50% 4px;
  background: #2563eb !important; /* exempt-ui03: 经典亮蓝徽标底色 */
  color: #ffffff !important; /* exempt-ui03: 徽标白字 */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  border: 1.5px solid #ffffff !important; /* exempt-ui03: 徽标白描边 */
  flex-shrink: 0;
}

.omx-mv-annotation-popover__input {
  flex: 1;
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  color: #ffffff !important; /* exempt-ui03: 纯白输入字 */
  font-size: 13px;
  line-height: 1.4;
  padding: 4px 0;
}

.omx-mv-annotation-popover__submit {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff; /* exempt-ui03: 提交按钮白底 */
  color: #000000; /* exempt-ui03: 黑色箭头 */
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.1s;
}

.omx-mv-annotation-popover__submit:hover {
  transform: scale(1.08);
}

/* 底部原生输入框内嵌挂件 (Composer Attachment Bar) 对标图5/6与红框精准位置 */
.omx-composer-comment-bar {
  order: -1 !important;
  width: 100%;
  padding: 10px 14px 2px 14px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.omx-mv-composer-attachment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: 9999px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid rgba(37, 99, 235, 0.4) !important; /* exempt-ui03: 亮蓝微光圈 */
  color: #60a5fa !important; /* exempt-ui03: 亮蓝文字 */
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s;
}

.omx-mv-composer-attachment:hover {
  background: var(--dsw-alias-bg-layer-3);
  border-color: #2563eb !important; /* exempt-ui03: 亮蓝边框 */
}

.omx-mv-composer-attachment__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #60a5fa !important; /* exempt-ui03: 蓝色加号 */
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.omx-mv-composer-attachment__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: var(--dsw-alias-label-tertiary);
  margin-left: 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: color 0.15s;
}

.omx-mv-composer-attachment__close:hover {
  color: var(--dsw-alias-label-primary);
}

.omx-mv-composer-attachment:hover {
  background: var(--dsw-alias-bg-layer-3);
}

.omx-mv-composer-attachment__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: var(--dsw-alias-label-tertiary);
  margin-left: 2px;
}
.omx-mv-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  user-select: none;
}
.omx-mv-empty-state__icon {
  opacity: 0.4;
}
.omx-mv-empty-state__text {
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
}

/* ========================================================
   8. 图像/视频生成专用输入面板与画布级联参数浮层 (MediaViewerComposer)
   ======================================================== */
.omx-mv-composer-root {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 24px);
  max-width: 860px;
  z-index: 60;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  padding: 14px 16px 12px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.65); /* exempt-ui03: 悬浮面板深度阴影 */
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.omx-mv-composer-root:focus-within {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 2px rgba(121, 97, 242, 0.25), 0 20px 48px rgba(0, 0, 0, 0.7); /* exempt-ui03: 极光紫微光焦点与深度阴影 */
}

/* 素材卡槽：锁定 64×64 1:1 尺寸。位置只通过 --slot-* 变量传入，不写内联尺寸。 */
.omx-slot-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-height: 70px;
}
.omx-slot-group {
  position: relative;
  height: 70px;
  flex: none;
}
.omx-slot-fan {
  position: relative;
  height: 66px;
  width: var(--slot-fan-width);
}
.omx-slot-card,
.omx-slot-add {
  position: absolute;
  top: 2px;
  left: 0;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  transform: translateX(var(--slot-shift, 0px));
  transition: transform 220ms ease, opacity 180ms ease;
}
.omx-slot-badge-mark {
  position: absolute;
  top: 3px;
  left: 3px;
  z-index: 6;
  font-size: 10px;
  line-height: 1.2;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-mask-1);
  color: var(--dsw-alias-label-primary);
  backdrop-filter: blur(4px);
  pointer-events: none;
}
.omx-slot-group.is-piled:not(.is-open) .omx-slot-add { transform: translateX(92px); }
.omx-slot-group.is-piled:not(.is-open) .omx-slot-card.is-depth-0 { transform: translate(2px, 2px) rotate(0deg); }
.omx-slot-group.is-piled:not(.is-open) .omx-slot-card.is-depth-1 { transform: translate(-2px, 5px) rotate(-6deg); }
.omx-slot-group.is-piled:not(.is-open) .omx-slot-card.is-depth-2 { transform: translate(6px, 6px) rotate(5deg); }
.omx-slot-card {
  z-index: var(--slot-z, 1);
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35); /* exempt-ui03: 叠卡层次 */
}
.omx-slot-card.is-depth-1 { transform: translate(var(--slot-shift), 5px) rotate(-6deg); }
.omx-slot-card.is-depth-2 { transform: translate(var(--slot-shift), 6px) rotate(5deg); }
.omx-slot-card.is-hidden { opacity: 0; pointer-events: none; }
.omx-slot-card img,
.omx-slot-card video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omx-slot-audio {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary);
}
.omx-slot-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  padding: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.62); /* exempt-ui03: 缩略图上的移除按钮 */
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.omx-slot-card:hover .omx-slot-remove,
.omx-slot-card:focus-within .omx-slot-remove { display: flex; }
.omx-slot-add {
  z-index: 8;
  border: 1px dashed var(--dsw-alias-border-l3);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  padding: 0;
}
.omx-slot-add span {
  font-size: 11px;
  line-height: 1;
  color: var(--dsw-alias-label-tertiary);
}
.omx-slot-add:hover { border-color: var(--dsw-alias-border-l4); }
.omx-slot-count {
  position: absolute;
  left: 50px;
  bottom: 2px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  font-size: 12px;
  font-weight: 650;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9;
}
.omx-slot-file { display: none; }
.omx-slot-modes {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}
.omx-slot-mode {
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  flex: none;
}
.omx-slot-mode.is-active {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
}
.omx-slot-notice {
  position: fixed;
  top: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45); /* exempt-ui03: 顶部提示浮层 */
}
.omx-mv-prompt-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.omx-mv-prompt-row .omx-mv-prompt-box { flex: 1; min-width: 0; }

.omx-mv-ref-row {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow-x: auto;
  scrollbar-width: none;
}

.omx-mv-ref-row::-webkit-scrollbar {
  display: none;
}

.omx-mv-ref-thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
  background: var(--dsw-alias-bg-layer-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.omx-mv-ref-thumb:hover {
  transform: translateY(-2px);
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 4px 12px rgba(121, 97, 242, 0.25); /* exempt-ui03: 悬浮高亮微光 */
}

.omx-mv-ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.omx-mv-ref-tag {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(0, 0, 0, 0.75); /* exempt-ui03: 引用标签暗黑半透明底 */
  color: var(--dsw-alias-label-primary);
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 4px;
}

.omx-mv-prompt-box {
  width: 100%;
}

.omx-mv-prompt-textarea {
  width: 100%;
  height: 52px;
  min-height: 52px;
  /* 10 行可见：ceil(10 × 14px × 1.6 + 4) = 228px，与 prompt-textarea-height.js 同一公式 */
  max-height: 228px;
  overflow-y: auto;
  background: transparent;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  resize: none;
  box-sizing: border-box;
}

.omx-mv-prompt-textarea:focus,
.omx-mv-prompt-textarea:focus-visible {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.omx-mv-prompt-textarea::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

.omx-mv-toolbar-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: nowrap;
}

.omx-mv-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  flex: 1;
  min-width: 0;
}

/* 「生成方式 / 模型 / 参数」三件套的容器：抽出共享控件前后必须是同一套单行布局。
   三个子节点都是 .omx-popover-anchor（块级盒），容器不设弹性布局就会各占一行。 */
.omx-media-config-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
}

/* 当前模型回执：只在快捷方式消费方渲染，给一个克制的次要文字样式 */
.omx-media-config-summary {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.omx-capsule-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 120ms ease;
  box-sizing: border-box;
}

.omx-capsule-trigger svg {
  display: block;
  flex-shrink: 0;
  vertical-align: middle;
}

.omx-capsule-trigger:hover {
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
  border-color: var(--dsw-alias-border-hover);
}

.omx-capsule-trigger.is-active {
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
  border-color: var(--dsw-alias-brand-primary);
}

.omx-capsule-trigger.is-active .omx-chevron-icon {
  transform: rotate(180deg);
}

.omx-chevron-icon {
  color: var(--dsw-alias-label-tertiary);
  transition: transform 150ms ease;
}

.omx-param-compact-label { display: none; }

.omx-capsule-divider {
  width: 1px;
  height: 18px;
  background: var(--dsw-alias-border-l1);
  margin: 0 2px;
  flex-shrink: 0;
}

.omx-dot {
  display: inline-block;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1;
  margin: 0 1px;
  user-select: none;
}

.omx-param-duration-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  line-height: 1;
}

.omx-popover-anchor {
  position: relative;
}

.omx-popover-shell {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.75), 0 2px 10px rgba(0, 0, 0, 0.4); /* exempt-ui03: 浮层暗黑微光阴影 */
  z-index: 160;
  display: flex;
  animation: omx-pop 0.14s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.omx-op-mode-popover {
  min-width: 150px;
  padding: 6px;
  flex-direction: column;
  gap: 3px;
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
}

.omx-menu-row {
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: all 0.12s ease;
  box-sizing: border-box;
}

.omx-menu-row:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

.omx-menu-row.is-selected {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}

/* 截图二：级联模型面板 */
.omx-cascade-panel {
  width: 760px;
  height: 340px;
  overflow: hidden;
  padding: 0;
  flex-direction: row;
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
}

.omx-cascade-col {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.omx-col-brand {
  width: 180px;
  border-right: 1px solid var(--dsw-alias-border-l1);
  padding: 10px 8px;
  gap: 4px;
  background: rgba(0, 0, 0, 0.2); /* exempt-ui03: 品牌列分栏底色 */
}

.omx-brand-tile {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  transition: all 120ms ease;
  width: 100%;
  text-align: left;
  box-sizing: border-box;
}

.omx-brand-tile:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.omx-brand-tile.is-active {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: var(--dsw-alias-border-hover);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.omx-brand-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.omx-col-model {
  width: 250px;
  border-right: 1px solid var(--dsw-alias-border-l1);
  padding: 10px 8px;
  gap: 8px;
}

.omx-model-card-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  transition: all 120ms ease;
  box-sizing: border-box;
}

.omx-model-card-tile:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-hover);
  color: var(--dsw-alias-label-primary);
}

.omx-model-card-tile.is-active {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary);
}

.omx-model-card-head {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.omx-model-card-desc {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  line-height: 1.35;
}

.omx-col-version {
  flex: 1;
  padding: 10px 12px;
  gap: 6px;
}

.omx-version-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin-bottom: 2px;
}

.omx-version-row {
  width: 100%;
  color: inherit;
  font: inherit;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1);
  background: transparent;
  transition: all 120ms ease;
  box-sizing: border-box;
}

.omx-version-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-hover);
}

.omx-version-row.is-active {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: var(--dsw-alias-label-primary);
}

.omx-version-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}

.omx-version-name {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.omx-version-pts {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.omx-version-badge {
  font-size: 10px;
  background: var(--dsw-alias-bg-layer-2);
  padding: 1px 5px;
  border-radius: 4px;
}

.omx-version-tag {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
}

/* 截图三：模型参数配置面板 */
.omx-params-panel {
  width: 480px;
  padding: 18px 20px;
  flex-direction: column;
  gap: 16px;
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
}

.omx-param-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.omx-param-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary);
}

.omx-mode-track {
  height: 32px;
  padding: 2px;
  gap: 2px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.omx-mode-pill {
  flex: 1;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  transition: all 140ms cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
  cursor: pointer;
}

.omx-mode-pill.is-active {
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); /* exempt-ui03: 激活态分段胶囊微阴影 */
}

.omx-inline-flex-center {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  line-height: 1;
  vertical-align: middle;
}
.omx-inline-flex-center svg {
  display: block;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  color: currentColor;
}
.omx-inline-flex-center span {
  font-size: 12px;
  line-height: 1;
}

.omx-ratio-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.omx-ratio-card {
  padding: 0;
  color: inherit;
  font: inherit;
  height: 64px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 120ms ease;
  box-sizing: border-box;
}

.omx-ratio-card:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-hover);
}

.omx-ratio-card.is-active {
  background: var(--dsw-alias-interactive-bg-active);
  border: 1.5px solid var(--dsw-alias-label-primary);
}

.omx-ratio-wire-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.omx-ratio-wire {
  border: 1.5px solid var(--dsw-alias-label-secondary);
  border-radius: 2px;
  box-sizing: border-box;
  display: block;
}

.omx-ratio-card.is-active .omx-ratio-wire {
  border-color: var(--dsw-alias-label-primary);
}

.ratio-1-1 { width: 16px; height: 16px; }
.ratio-16-9 { width: 20px; height: 11px; }
.ratio-9-16 { width: 11px; height: 20px; }
.ratio-4-3 { width: 18px; height: 14px; }
.ratio-3-4 { width: 14px; height: 18px; }
.ratio-21-9 { width: 20px; height: 9px; }
.ratio-auto { width: 16px; height: 12px; border-style: dashed; }

.omx-ratio-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}

.omx-ratio-card.is-active .omx-ratio-label {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.omx-clarity-sound-row {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

.omx-param-subcol {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.omx-mv-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.omx-send-cta-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.omx-send-cta-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 16px rgba(121, 97, 242, 0.25); /* exempt-ui03: 提交按钮悬浮高亮微光 */
}

.omx-send-cta-btn:active {
  transform: scale(0.95);
}

/* ========================================================
   8. 外置垂直模式切换胶囊与参考选择面板 (Interactive Spec)
   ======================================================== */
.omx-mv-composer-outer {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 10px;
  width: calc(100% - 24px);
  max-width: 920px;
  z-index: 60;
}

.omx-mv-composer-outer .omx-mv-composer-root {
  position: static;
  transform: none;
  width: auto;
  flex: 1;
}

.omx-external-mode-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 20px;
  flex-shrink: 0;
  margin-bottom: 2px;
}

.omx-external-mode-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.omx-external-mode-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.omx-external-mode-btn.is-active {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.omx-external-mode-text {
  font-size: 9px;
  line-height: 1;
  font-weight: 500;
}

.omx-ref-picker-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 120;
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: omx-fade-in 0.15s ease-out;
}

.omx-ref-picker-header {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}

.omx-ref-picker-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.omx-ref-picker-tab {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.omx-ref-picker-tab:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.omx-ref-picker-tab.is-active {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-active);
  font-weight: 500;
}

.omx-ref-picker-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.omx-ref-picker-filter-mine {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.omx-ref-picker-filter-text {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}

.omx-ref-picker-switch {
  width: 28px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  position: relative;
  cursor: pointer;
  padding: 0;
  transition: background 0.2s ease;
}

.omx-ref-picker-switch.is-checked {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
}

.omx-ref-picker-switch-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary);
  transition: transform 0.2s ease;
}

.omx-ref-picker-switch.is-checked .omx-ref-picker-switch-thumb {
  transform: translateX(12px);
}

.omx-ref-picker-close-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.omx-ref-picker-close-btn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.omx-ref-picker-body {
  padding: 12px 14px;
  max-height: 210px;
  overflow-y: auto;
}

.omx-ref-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
}

.omx-ref-picker-upload-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  aspect-ratio: 1 / 1;
  border: 1px dashed var(--dsw-alias-border-l3);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 8px;
}

.omx-ref-picker-upload-card:hover {
  border-color: var(--dsw-alias-border-l4);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.omx-ref-picker-upload-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.omx-ref-picker-upload-text {
  font-size: 11px;
  line-height: 1.2;
  text-align: center;
  font-weight: 500;
}

.omx-ref-picker-asset-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.15s ease;
}

.omx-ref-picker-asset-card:hover {
  transform: translateY(-2px);
}

.omx-ref-picker-asset-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
}

.omx-ref-picker-asset-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.omx-ref-picker-asset-title {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.omx-ref-picker-asset-card:hover .omx-ref-picker-asset-title {
  color: var(--dsw-alias-label-primary);
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
