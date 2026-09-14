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
   3. 单图大画布与右侧多图候选滚动栏 (Single Stage & Thumbnails Rail)
   ======================================================== */
.omx-mv-single-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.omx-mv-thumbnails-rail {
  position: absolute;
  top: 24px;
  right: 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
  z-index: 10;
  scrollbar-width: thin;
}

.omx-mv-thumbnails-rail__item {
  width: 108px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 4px 14px var(--dsw-alias-bg-layer-1); /* exempt-ui03: 缩略图卡片微投影 */
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s, box-shadow 0.15s;
  flex-shrink: 0;
  position: relative;
}

.omx-mv-thumbnails-rail__item:hover {
  transform: scale(1.02);
  border-color: var(--dsw-alias-brand-primary);
}

.omx-mv-thumbnails-rail__item.active {
  border-color: var(--dsw-alias-brand-primary) !important; /* 对标截图高亮蓝框 */
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary), 0 6px 20px var(--dsw-alias-bg-layer-1) !important; /* exempt-ui03: 选中态光晕 */
  transform: scale(1.02);
}

.omx-mv-thumbnails-rail__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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
  border: none !important;
  outline: none !important;
  transition: transform 0.2s, box-shadow 0.2s;
}

.omx-mv-timeline__card-multi:hover {
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
  border: none !important;
  outline: none !important;
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
  border: none !important;
  outline: none !important;
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
`;

export function injectMediaViewerStyles(doc = typeof document !== 'undefined' ? document : undefined) {
  if (!doc) return;
  if (doc.getElementById(MEDIA_VIEWER_STYLE_ID)) return;
  const tag = doc.createElement('style');
  tag.id = MEDIA_VIEWER_STYLE_ID;
  tag.textContent = MEDIA_VIEWER_CSS;
  doc.head.appendChild(tag);
}
