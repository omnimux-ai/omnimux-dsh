export const GUIDE_STYLE_ID = 'omnimux-session-guide-style'
export const GUIDE_CSS = `
[data-omnimux-starter-host] [data-conversation-scroll] { justify-content:flex-start!important; }
[data-omnimux-starter-host] [data-composer-seat] {
  flex:1 0 auto!important; min-height:100%; display:flex; flex-direction:column;
  justify-content:center!important; padding-block:32px; box-sizing:border-box;
}
/* 宿主内容总栈：大屏下拓展至 1200px，让下方内容与卡片网格从容展开、更有商业大作底气 */
[data-omnimux-starter-host] [class*="composerStack"] {
  flex:0 0 auto!important; display:flex; flex-direction:column; justify-content:center!important;
  gap:18px; padding-bottom:0!important;
  width:100%!important;
  max-width:min(1200px, calc(100% - 32px))!important;
  margin-inline:auto!important;
}
[data-omnimux-starter-host] [class*="composerHero"] > :first-child {
  margin-top:0!important; margin-bottom:4px!important;
}
[data-omnimux-starter-host] [data-slot="conversation.composer.bar"] > * { order:2; }

/* 输入框与工作区选择行独立收敛：优雅居中，760px~780px 舒适打字宽度，不与下方内容区生硬对齐两侧，形成清晰视觉层次 */
[data-omnimux-starter-host] [data-composer-card],
[data-omnimux-starter-host] [class*="heroWorkspaceRow"] {
  width:100%!important;
  max-width:min(780px, calc(100% - 24px))!important;
  margin-inline:auto!important;
}

/* 热门入门方式与任务指引内容区：自适应宽屏 1200px，舒展大气，层次分明 */
.omnimux-starter-guide {
  order:3;
  width:100%!important;
  max-width:1200px!important;
  box-sizing:border-box;
  margin-inline:auto;
  min-width:0;
  color:var(--dsw-alias-label-primary);
  font-family:inherit;
  font-size:13px;
  line-height:1.5;
  container-type:inline-size;
  container-name:starter-guide;
  padding-top:12px;
}
.omnimux-starter-groups { display:flex; justify-content:center; flex-wrap:wrap; row-gap:20px; width:100%; max-width:100%; margin-inline:auto; }
.omnimux-starter-group { position:relative; min-width:0; padding-inline:24px; }
.omnimux-starter-group:first-child { padding-left:4px; }
.omnimux-starter-group:last-child { padding-right:4px; }
.omnimux-starter-group:not(:last-child)::after {
  content:""; position:absolute; right:0; top:50%; height:40px; transform:translateY(-50%);
  border-right:1px solid var(--dsw-alias-border-l2);
}
.omnimux-starter-group h2 { margin:0 0 12px; color:var(--dsw-alias-label-secondary); font-size:11px; line-height:16.5px; font-weight:400; text-align:center; }
.omnimux-starter-cards { display:flex; align-items:flex-start; gap:4px; }
.omnimux-starter-cards button {
  display:flex; flex-direction:column; align-items:center; gap:6px;
  flex:none; width:72px; min-width:0; padding:8px 4px; box-sizing:border-box;
  border:0; border-radius:14px; background:transparent;
  color:var(--dsw-alias-label-secondary); text-align:center; font:inherit; font-size:11px; font-weight:400; cursor:pointer;
}
/* The requested reference uses 36px icon tiles inside 72px task buttons. */
.omnimux-starter-icon {
  display:flex; align-items:center; justify-content:center; flex:none; width:36px; height:36px;
  box-sizing:border-box; border:1px solid var(--dsw-alias-border-l2); border-radius:8px;
  background:var(--dsw-alias-bg-layer-1); box-shadow:inset 0 1px 2px var(--dsw-alias-bg-base);
  transition:background-color 120ms ease,border-color 120ms ease;
}
.omnimux-starter-icon svg { width:20px; height:20px; }
.omnimux-starter-label { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:32px; font-size:11px; font-weight:400; line-height:16px; }
.omnimux-starter-cards button:hover { background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); }
.omnimux-starter-cards button:hover .omnimux-starter-icon { border-color:var(--dsw-alias-label-secondary); }
.omnimux-starter-guide button:focus-visible {
  outline:2px solid var(--dsw-alias-label-primary); outline-offset:2px;
}
.omnimux-starter-notice button {
  box-sizing:border-box; height:32px; padding:4px 10px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px;
  font:inherit; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); cursor:pointer;
}
.omnimux-starter-notice button { margin-left:8px; }
.omnimux-starter-notice { margin-bottom:12px; }

/* ==================== 热门入门方式 (Popular Starters) ==================== */
.omnimux-popular-section {
  width: 100%;
  margin-top: 24px;
  padding-top: 0;
  border-top: 0;
}
.omnimux-popular-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin: 0 0 18px 2px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-popular-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  width: 100%;
  box-sizing: border-box;
}
.omnimux-popular-card {
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  cursor: pointer;
  text-align: left;
  padding: 8px 8px 10px 8px;
  box-sizing: border-box;
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
  position: relative;
  outline: none;
}
.omnimux-popular-card:hover {
  transform: translateY(-3px);
  border-color: var(--dsw-alias-border-l3);
  box-shadow: 0 12px 32px var(--dsw-alias-bg-base);
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-popular-card:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.omnimux-popular-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.omnimux-popular-cover svg,
.omnimux-popular-cover img,
.omnimux-popular-cover-img {
  width: 100%;
  height: 100%;
  display: block;
}
.omnimux-popular-cover img,
.omnimux-popular-cover-img {
  object-fit: cover;
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omnimux-popular-card:hover .omnimux-popular-cover img,
.omnimux-popular-card:hover .omnimux-popular-cover-img {
  transform: scale(1.03);
}
.omnimux-popular-footer {
  padding: 0 2px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  background: transparent;
  width: 100%;
  box-sizing: border-box;
}
.omnimux-popular-card-title,
.omnimux-popular-footer > span:first-child {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  line-height: 1.3;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omnimux-popular-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  margin-left: auto;
}

/* ==================== 营销洞察模态框 (Marketing Insight Modal) ==================== */
/* ==================== 通用左右分栏弹窗 (Split Modal Dialog) ==================== */
.omnimux-split-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  animation: omnimuxFadeIn 160ms ease;
}
.omnimux-split-modal-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 96vw;
  max-height: 92vh;
}
.omnimux-modal-close-btn,
.omnimux-split-modal-close {
  position: absolute;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 120ms ease, border-color 140ms ease;
  z-index: 100002;
  pointer-events: auto;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-base);
  box-sizing: border-box;
  padding: 0;
}
.omnimux-modal-close-btn:hover,
.omnimux-split-modal-close:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l2);
  transform: scale(1.08);
}
.omnimux-modal-close-btn:active,
.omnimux-split-modal-close:active {
  transform: scale(0.96);
}
.omnimux-modal-close-btn svg,
.omnimux-split-modal-close svg {
  pointer-events: none;
  display: block;
}

/* 外悬浮定位 (SplitModalDialog 默认) */
.omnimux-modal-close-btn.is-external,
.omnimux-split-modal-close {
  top: 0px;
  right: -50px;
}
@media (max-width: 1280px) {
  .omnimux-modal-close-btn.is-external,
  .omnimux-split-modal-close {
    top: 14px;
    right: 14px;
    background: var(--dsw-alias-bg-layer-3);
  }
}

/* 内部右上角定位 (用于单栏/普通弹窗) */
.omnimux-modal-close-btn.is-top-right {
  position: absolute;
  top: 16px;
  right: 16px;
}

/* 行内模式 */
.omnimux-modal-close-btn.is-inline {
  position: static;
  flex-shrink: 0;
}
.omnimux-split-modal-container {
  position: relative;
  width: 1140px;
  max-width: 96vw;
  height: 700px;
  max-height: 92vh;
  background: var(--dsw-alias-bg-elevated);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  box-shadow: 0 24px 64px var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  animation: omnimuxScaleUp 180ms ease;
}
.omnimux-split-modal-left {
  width: 480px;
  flex: none;
  border-right: 1px solid var(--dsw-alias-border-l1);
  padding: 32px 28px 24px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-1);
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 260ms ease;
}
.omnimux-split-modal-left::-webkit-scrollbar {
  width: 6px;
}
.omnimux-split-modal-left::-webkit-scrollbar-track {
  background: transparent;
}
.omnimux-split-modal-left::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background-color 260ms ease;
}
.omnimux-split-modal-left.is-scrolling,
.omnimux-split-modal-left:hover {
  scrollbar-color: var(--dsw-alias-border-l3) transparent;
}
.omnimux-split-modal-left.is-scrolling::-webkit-scrollbar-thumb,
.omnimux-split-modal-left:hover::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l3);
}
.omnimux-split-modal-left-header {
  margin-bottom: 20px;
  flex: none;
}
.omnimux-split-modal-left-header h1 {
  font-size: 20px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  margin: 0 0 6px;
}
.omnimux-split-modal-left-header p {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
  margin: 0;
  line-height: 1.5;
}
.omnimux-split-modal-left-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.omnimux-split-modal-right {
  flex: 1;
  padding: 32px 36px 20px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-elevated);
}
.omnimux-split-modal-right-header {
  margin-bottom: 14px;
  flex: none;
}
.omnimux-split-modal-right-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin: 0;
}
.omnimux-split-modal-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  padding-right: 8px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 260ms ease;
}
.omnimux-split-modal-content::-webkit-scrollbar {
  width: 6px;
}
.omnimux-split-modal-content::-webkit-scrollbar-track {
  background: transparent;
}
.omnimux-split-modal-content::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background-color 260ms ease;
}
.omnimux-split-modal-content.is-scrolling,
.omnimux-split-modal-content:hover {
  scrollbar-color: var(--dsw-alias-border-l3) transparent;
}
.omnimux-split-modal-content.is-scrolling::-webkit-scrollbar-thumb,
.omnimux-split-modal-content:hover::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l3);
}
.omnimux-split-modal-content::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-label-tertiary);
}
.omnimux-split-modal-footer {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 18px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  margin-top: 16px;
}
.omnimux-split-modal-submit,
.omnimux-insight-submit,
.omnimux-u2v-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 28px;
  border-radius: 10px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  font-size: 15px;
  font-weight: 600;
  border: 0;
  cursor: pointer;
  transition: opacity 140ms ease, transform 120ms ease;
  box-shadow: 0 4px 14px var(--dsw-alias-bg-base);
}
.omnimux-split-modal-submit:hover,
.omnimux-insight-submit:hover,
.omnimux-u2v-submit:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}
.omnimux-split-modal-submit:active,
.omnimux-insight-submit:active,
.omnimux-u2v-submit:active {
  transform: translateY(0);
}

/* 兼容类名 */
.omnimux-insight-overlay { position: fixed; inset: 0; z-index: 99999; }
.omnimux-insight-modal { position: relative; }
.omnimux-insight-close { display: flex; }
.omnimux-insight-submit { display: inline-flex; }
.omnimux-insight-left-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.omnimux-insight-left-top h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin: 0;
}
.omnimux-insight-refresh {
  background: transparent;
  border: 0;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 120ms ease;
}
.omnimux-insight-refresh:hover {
  color: var(--dsw-alias-label-primary);
}
.omnimux-insight-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.omnimux-insight-item {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 84px;
  padding: 12px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  cursor: pointer;
  text-align: left;
  transition: all 140ms ease;
  color: var(--dsw-alias-label-secondary);
  box-sizing: border-box;
}
.omnimux-insight-item:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}
.omnimux-insight-item[aria-selected="true"] {
  border: 1.5px solid var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-active);
  box-shadow: 0 0 16px var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-label-primary);
}
.omnimux-insight-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--dsw-alias-brand-primary);
}
.omnimux-insight-item-header svg {
  width: 18px;
  height: 18px;
}
.omnimux-insight-arrow {
  color: var(--dsw-alias-label-tertiary);
  font-size: 14px;
}
.omnimux-insight-item[aria-selected="true"] .omnimux-insight-arrow {
  color: var(--dsw-alias-brand-primary);
}
.omnimux-insight-item-title {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.omnimux-insight-right {
  flex: 1;
  padding: 20px 28px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  box-sizing: border-box;
}
.omnimux-insight-right h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin: 0 0 12px;
}
.omnimux-insight-form-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
}
.omnimux-insight-header-banner {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-insight-scenario-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-insight-scenario-desc {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1.5;
}
.omnimux-insight-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  margin-bottom: 14px;
  animation: omnimuxFadeIn 120ms ease;
}
.omnimux-insight-fields-flow {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 4px;
  padding-bottom: 16px;
}
.omnimux-insight-field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.omnimux-insight-field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-insight-required-tag {
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-state-error-primary);
}
.omnimux-insight-optional-tag {
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-insight-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  outline: none;
  transition: border-color 140ms ease, background 140ms ease;
}
.omnimux-insight-input:focus {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-insight-input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-insight-text-field {
  height: 38px;
}
.omnimux-insight-textarea-field {
  resize: vertical;
  min-height: 64px;
  line-height: 1.5;
}
.omnimux-insight-textarea-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  box-sizing: border-box;
  transition: border-color 150ms ease;
}
.omnimux-insight-textarea-box:focus-within {
  border-color: var(--dsw-alias-brand-primary);
}
.omnimux-insight-textarea {
  width: 100%;
  height: 100%;
  background: transparent;
  border: 0;
  outline: none;
  resize: none;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-primary);
  box-sizing: border-box;
}

/* ==================== 浮层提示 (Toast Pill) ==================== */
.omnimux-toast-pill {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--dsw-alias-bg-elevated);
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 12px;
  padding: 16px 24px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-shadow: 0 16px 40px var(--dsw-alias-bg-base);
  z-index: 100000;
  animation: omnimuxScaleUp 150ms ease;
  pointer-events: none;
}
.omnimux-toast-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-brand-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ==================== 视频网址模态框 (URL to Video Modal) ==================== */
.omnimux-u2v-overlay { position: fixed; inset: 0; z-index: 99999; }
.omnimux-u2v-modal { position: relative; }
.omnimux-u2v-carousel-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  width: 100%;
}
.omnimux-u2v-carousel {
  position: relative;
  width: 100%;
  height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1000px;
}
.omnimux-u2v-card {
  position: absolute;
  width: 210px;
  height: 360px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--dsw-alias-bg-elevated);
  transition: transform 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 320ms ease, box-shadow 320ms ease;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.omnimux-u2v-card[data-pos="center"] {
  transform: translateX(0) scale(1) rotateY(0deg);
  z-index: 3;
  box-shadow: 0 16px 40px var(--dsw-alias-bg-base);
  border: 1.5px solid var(--dsw-alias-brand-primary);
  opacity: 1;
}
.omnimux-u2v-card[data-pos="left"] {
  transform: translateX(-70px) scale(0.85) rotateY(16deg);
  z-index: 2;
  opacity: 0.55;
  pointer-events: none;
  border: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-u2v-card[data-pos="right"] {
  transform: translateX(70px) scale(0.85) rotateY(-16deg);
  z-index: 2;
  opacity: 0.55;
  pointer-events: none;
  border: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-u2v-card-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
  font-weight: 500;
  z-index: 5;
  backdrop-filter: blur(4px);
}
.omnimux-u2v-card-media {
  flex: 1;
  width: 100%;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.omnimux-u2v-card-media svg,
.omnimux-u2v-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omnimux-u2v-card-info {
  padding: 10px 12px;
  background: var(--dsw-alias-bg-elevated);
  border-top: 1px solid var(--dsw-alias-border-l1);
  flex: none;
}
.omnimux-u2v-card-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omnimux-u2v-card-desc {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omnimux-u2v-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: background 120ms ease;
}
.omnimux-u2v-nav-btn:hover {
  background: var(--dsw-alias-bg-layer-3);
}
.omnimux-u2v-nav-btn.prev { left: 10px; }
.omnimux-u2v-nav-btn.next { right: 10px; }
.omnimux-u2v-dots {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
}
.omnimux-u2v-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--dsw-alias-border-l3);
  transition: all 160ms ease;
  cursor: pointer;
}
.omnimux-u2v-dot.active {
  width: 18px;
  background: var(--dsw-alias-brand-primary);
}

.omnimux-u2v-form-flow {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
.omnimux-u2v-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.omnimux-u2v-field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.omnimux-u2v-field-label svg {
  color: var(--dsw-alias-brand-primary);
}
.omnimux-u2v-input {
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 140ms ease;
}
.omnimux-u2v-input:focus {
  border-color: var(--dsw-alias-brand-primary);
}
.omnimux-u2v-input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

/* 视觉风格 3 列网格 */
.omnimux-u2v-styles-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.omnimux-u2v-style-btn {
  height: 32px;
  box-sizing: border-box;
  padding: 0 8px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  transition: all 120ms ease;
}
.omnimux-u2v-style-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l3);
}
.omnimux-u2v-style-btn[aria-checked="true"] {
  border: 1.5px solid var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 10px var(--dsw-alias-state-business-tertiary);
}

/* 目标时长控件 */
.omnimux-u2v-duration-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px 12px;
  height: 40px;
  box-sizing: border-box;
}
.omnimux-u2v-auto-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 120ms ease;
  flex: none;
}
.omnimux-u2v-auto-btn[aria-pressed="true"] {
  border: 1.5px solid var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
}
.omnimux-u2v-slider-track {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
}
.omnimux-u2v-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2);
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
  outline: none;
  margin: 0;
  transition: opacity 120ms ease;
}
.omnimux-u2v-slider.is-auto {
  opacity: 0.75;
}
.omnimux-u2v-slider:hover,
.omnimux-u2v-slider:active {
  opacity: 1;
}
.omnimux-u2v-slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-u2v-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary);
  border: 2px solid var(--dsw-alias-brand-primary);
  cursor: pointer;
  margin-top: -5px;
  box-shadow: 0 1px 4px var(--dsw-alias-bg-base);
  transition: transform 120ms ease;
}
.omnimux-u2v-slider:active::-webkit-slider-thumb {
  transform: scale(1.15);
}
.omnimux-u2v-duration-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  min-width: 36px;
  text-align: right;
  flex: none;
}
.omnimux-u2v-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  margin-top: 2px;
}

/* 画幅比例 6 选项网格 */
.omnimux-u2v-ratios-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.omnimux-u2v-ratio-btn {
  height: 54px;
  box-sizing: border-box;
  padding: 6px 4px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 120ms ease;
}
.omnimux-u2v-ratio-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}
.omnimux-u2v-ratio-btn[aria-checked="true"] {
  border: 1.5px solid var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 10px var(--dsw-alias-state-business-tertiary);
}
.omnimux-u2v-error {
  color: var(--dsw-alias-state-error-primary);
  font-size: 11px;
}
.omnimux-u2v-ratio-box {
  width: var(--ratio-w, 24px);
  height: var(--ratio-h, 18px);
  border: 1.5px solid currentColor;
  border-radius: 2px;
  box-sizing: border-box;
}
.omnimux-u2v-ratio-text {
  font-size: 11px;
  font-weight: 500;
}

/* Popular Card Cover Illustrations */
.cover-bg-mesh { fill: var(--dsw-alias-bg-layer-2); }
.cover-bg-alt { fill: var(--dsw-alias-bg-layer-2); }
.cover-screen { fill: var(--dsw-alias-bg-elevated); stroke: var(--dsw-alias-border-l3); }
.cover-display { fill: var(--dsw-alias-bg-base); }
.cover-brand-badge { fill: var(--dsw-alias-interactive-bg-active); stroke: var(--dsw-alias-brand-primary); }
.cover-text-white { fill: var(--dsw-alias-label-primary); font-family: inherit; }
.cover-text-muted { fill: var(--dsw-alias-label-secondary); font-family: inherit; }
.cover-node-purple { fill: var(--dsw-alias-interactive-bg-active); stroke: var(--dsw-alias-brand-primary); }
.cover-node-pink { fill: var(--dsw-alias-interactive-bg-hover); stroke: var(--dsw-alias-border-l3); }
.cover-node-blue { fill: var(--dsw-alias-bg-layer-1); stroke: var(--dsw-alias-border-l3); }
.cover-line { stroke: var(--dsw-alias-border-l2); }
.cover-stand { fill: var(--dsw-alias-border-l3); }
.cover-stand-base { fill: var(--dsw-alias-border-l2); }
.cover-circle-halo { fill: var(--dsw-alias-interactive-bg-hover); }
.cover-url-bar { fill: var(--dsw-alias-bg-elevated); stroke: var(--dsw-alias-brand-primary); }
.cover-url-icon { stroke: var(--dsw-alias-label-secondary); fill: none; }
.cover-circle-btn { fill: var(--dsw-alias-button-primary-fill); }
.cover-play-triangle { fill: var(--dsw-alias-brand-primary); }
.cover-grid-card { fill: var(--dsw-alias-bg-elevated); stroke: var(--dsw-alias-border-l2); }

/* ==================== 复刻爆款视频（重现病毒式广告）模态框 ==================== */
.omnimux-recreate-left-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  align-items: center;
  position: relative;
  padding: 10px 0;
}
.omnimux-recreate-carousel-box {
  position: relative;
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: auto 0;
}
.omnimux-recreate-dots {
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}
.omnimux-recreate-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dsw-alias-border-l2);
  transition: all 160ms ease;
}
.omnimux-recreate-dot.active {
  background: var(--dsw-alias-label-primary);
  height: 14px;
  border-radius: 3px;
}
.omnimux-recreate-nav-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 20;
  transition: all 140ms ease;
  box-shadow: 0 4px 12px var(--dsw-alias-bg-base);
}
.omnimux-recreate-nav-btn:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  transform: scale(1.08);
}
.omnimux-recreate-nav-up {
  margin-bottom: 12px;
}
.omnimux-recreate-nav-down {
  margin-top: 12px;
}
.omnimux-recreate-stage {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.omnimux-recreate-compare-card {
  position: relative;
  width: 100%;
  height: 280px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 16px 40px var(--dsw-alias-bg-base);
}
.omnimux-recreate-sample-tag {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 5;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1);
  letter-spacing: 0.5px;
}
.omnimux-recreate-split-visual {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
}
.omnimux-recreate-half {
  flex: 1;
  height: 100%;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-recreate-half-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.omnimux-recreate-half-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.omnimux-recreate-placeholder-accent {
  color: var(--dsw-alias-brand-primary);
}
.omnimux-recreate-half-badge {
  position: absolute;
  bottom: 10px;
  left: 10px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
}
.omnimux-recreate-badge-accent {
  left: auto;
  right: 10px;
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary);
}
.omnimux-recreate-divider-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: var(--dsw-alias-label-primary);
  transform: translateX(-50%);
  z-index: 4;
}
.omnimux-recreate-divider-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px var(--dsw-alias-bg-base);
}

/* 右栏表单结构 */
.omnimux-recreate-form-flow {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.omnimux-recreate-field-group {
  display: flex;
  flex-direction: column;
}
.omnimux-recreate-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-recreate-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.omnimux-recreate-icon-prefix {
  display: flex;
  align-items: center;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-recreate-icon-sparkle {
  color: var(--dsw-alias-brand-primary);
  font-size: 14px;
}
.omnimux-recreate-required-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-recreate-optional-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
}

/* 克隆模式卡片选择 */
.omnimux-clone-modes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 8px;
}
.omnimux-clone-mode-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  cursor: pointer;
  text-align: left;
  transition: all 140ms ease;
  color: inherit;
  font-family: inherit;
}
.omnimux-clone-mode-card:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
}
.omnimux-clone-mode-card.active {
  background: var(--dsw-alias-interactive-bg-active);
  border: 1.5px solid var(--dsw-alias-brand-primary);
  box-shadow: 0 4px 16px var(--dsw-alias-bg-base);
}
.omnimux-clone-mode-icon {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
  margin-top: 2px;
}
.omnimux-clone-mode-card.active .omnimux-clone-mode-icon {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-brand-primary);
}
.omnimux-clone-mode-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-clone-mode-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-clone-mode-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1.4;
}

/* 拖拽上传框与点击上传 */
.omnimux-recreate-upload-dropzone {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 12px;
  border: 1px dashed var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer;
  transition: all 140ms ease;
}
.omnimux-recreate-upload-dropzone:hover,
.omnimux-recreate-upload-dropzone.is-drag-over {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-recreate-upload-dropzone.has-error {
  border-color: var(--dsw-alias-state-error-primary);
}
.omnimux-recreate-upload-add-btn {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary);
}
.omnimux-recreate-upload-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.omnimux-recreate-upload-main {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-recreate-upload-sub {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}

/* 已选目标视频卡片 */
.omnimux-recreate-selected-file-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1.5px solid var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-active);
}
.omnimux-recreate-file-icon-box {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-brand-primary);
}
.omnimux-recreate-file-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.omnimux-recreate-file-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omnimux-recreate-file-size {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-recreate-file-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-recreate-file-action-btn {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  transition: all 120ms ease;
}
.omnimux-recreate-file-action-btn:hover {
  background: var(--dsw-alias-bg-layer-3);
}
.omnimux-recreate-file-remove-btn {
  background: transparent;
  border: 0;
  padding: 6px;
  border-radius: 6px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 120ms ease;
}
.omnimux-recreate-file-remove-btn:hover {
  color: var(--dsw-alias-state-error-primary);
}

/* 文本域 */
.omnimux-recreate-textarea {
  width: 100%;
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.omnimux-recreate-textarea:focus {
  border-color: var(--dsw-alias-brand-primary);
  outline: none;
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary);
}
.omnimux-recreate-textarea::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

/* 参考素材列表与药丸 */
.omnimux-recreate-ref-limit-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  margin-top: 6px;
}
.omnimux-recreate-ref-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.omnimux-recreate-ref-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  max-width: 240px;
}
.omnimux-recreate-ref-thumb {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: cover;
}
.omnimux-recreate-ref-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-recreate-ref-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.omnimux-recreate-ref-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omnimux-recreate-ref-size {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-recreate-ref-del-btn {
  background: transparent;
  border: 0;
  padding: 2px;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: color 120ms ease;
}
.omnimux-recreate-ref-del-btn:hover {
  color: var(--dsw-alias-state-error-primary);
}

/* 错误与提交提示 */
.omnimux-recreate-field-error {
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
  margin-top: 4px;
}
.omnimux-recreate-footer-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.omnimux-recreate-error-msg {
  font-size: 13px;
  color: var(--dsw-alias-state-error-primary);
  font-weight: 500;
}
.omnimux-recreate-submit-btn {
  background: var(--dsw-alias-brand-primary) !important;
  color: var(--dsw-alias-button-primary-text) !important;
  box-shadow: 0 4px 16px var(--dsw-alias-interactive-bg-active) !important;
}
.omnimux-recreate-submit-btn:hover {
  opacity: 0.94;
  transform: translateY(-1px);
}

/* ==================== 批量创建广告（Bulk Create Ads）模态框 ==================== */
.omnimux-bulk-left-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  align-items: center;
  position: relative;
  padding: 10px 0;
}
.omnimux-bulk-fan-stage {
  position: relative;
  width: 100%;
  max-width: 420px;
  height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.omnimux-bulk-cards-fan {
  position: relative;
  width: 220px;
  height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.omnimux-bulk-fan-slot {
  position: absolute;
  width: 100%;
  height: 100%;
  transition: all 260ms cubic-bezier(0.25, 1, 0.5, 1);
}
.omnimux-bulk-fan-left {
  transform: translateX(-46px) rotate(-7deg) scale(0.88);
  z-index: 1;
  opacity: 0.65;
  filter: brightness(0.72);
}
.omnimux-bulk-fan-center {
  transform: translateX(0) rotate(0deg) scale(1.02);
  z-index: 3;
  opacity: 1;
  filter: none;
}
.omnimux-bulk-fan-right {
  transform: translateX(46px) rotate(7deg) scale(0.88);
  z-index: 1;
  opacity: 0.65;
  filter: brightness(0.72);
}
.omnimux-bulk-fan-card {
  width: 100%;
  height: 100%;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 16px 40px var(--dsw-alias-bg-base);
  position: relative;
  box-sizing: border-box;
}
.omnimux-bulk-sample-tag {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 5;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1);
  letter-spacing: 0.6px;
}
.omnimux-bulk-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omnimux-bulk-card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-bulk-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: all 140ms ease;
  box-shadow: 0 4px 14px var(--dsw-alias-bg-base);
}
.omnimux-bulk-nav-prev {
  left: 6px;
}
.omnimux-bulk-nav-next {
  right: 6px;
}
.omnimux-bulk-nav-btn:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  transform: translateY(-50%) scale(1.08);
}
.omnimux-bulk-dots {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}
.omnimux-bulk-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-border-l2);
  transition: all 160ms ease;
}
.omnimux-bulk-dot.active {
  background: var(--dsw-alias-label-primary);
  width: 16px;
  border-radius: 3px;
}

/* 右栏表单流 */
.omnimux-bulk-form-flow {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.omnimux-bulk-field-group {
  display: flex;
  flex-direction: column;
}
.omnimux-bulk-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-bulk-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.omnimux-bulk-icon-prefix {
  display: flex;
  align-items: center;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-bulk-optional-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-bulk-textarea {
  width: 100%;
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
  margin-top: 8px;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.omnimux-bulk-textarea:focus {
  border-color: var(--dsw-alias-brand-primary);
  outline: none;
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary);
}
.omnimux-bulk-textarea::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

/* 上传卡片与素材列表 */
.omnimux-bulk-upload-dropzone {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 12px;
  border: 1px dashed var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer;
  transition: all 140ms ease;
}
.omnimux-bulk-upload-dropzone:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-bulk-upload-add-btn {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary);
}
.omnimux-bulk-upload-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.omnimux-bulk-upload-main {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-bulk-upload-sub {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-bulk-ref-limit-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  margin-top: 6px;
}
.omnimux-bulk-ref-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.omnimux-bulk-ref-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  max-width: 240px;
}
.omnimux-bulk-ref-thumb {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: cover;
}
.omnimux-bulk-ref-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-bulk-ref-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.omnimux-bulk-ref-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omnimux-bulk-ref-size {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-bulk-ref-del-btn {
  background: transparent;
  border: 0;
  padding: 2px;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: color 120ms ease;
}
.omnimux-bulk-ref-del-btn:hover {
  color: var(--dsw-alias-state-error-primary);
}

/* 画幅比例网格 */
.omnimux-bulk-ratios-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-top: 8px;
}
.omnimux-bulk-ratio-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 6px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: all 120ms ease;
}
.omnimux-bulk-ratio-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
}
.omnimux-bulk-ratio-btn.active {
  background: var(--dsw-alias-bg-layer-3);
  border: 1.5px solid var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  box-shadow: 0 2px 8px var(--dsw-alias-bg-base);
}
.omnimux-bulk-ratio-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
.omnimux-bulk-ratio-text {
  font-size: 12px;
}

/* 时长滑块 */
.omnimux-bulk-duration-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omnimux-bulk-duration-badge {
  padding: 2px 10px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-bulk-slider-box {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
}
.omnimux-bulk-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2);
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
  margin: 0;
}
.omnimux-bulk-slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  margin-top: 6px;
}

/* 步进计数器 */
.omnimux-bulk-stepper-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omnimux-bulk-stepper-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.omnimux-bulk-stepper-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  margin: 0;
}
.omnimux-bulk-stepper {
  display: inline-flex;
  align-items: center;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  padding: 2px;
}
.omnimux-bulk-stepper-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  transition: background 120ms ease;
}
.omnimux-bulk-stepper-btn:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-3);
}
.omnimux-bulk-stepper-btn:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: not-allowed;
}
.omnimux-bulk-stepper-value {
  min-width: 32px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

/* 底部操作栏 */
.omnimux-bulk-footer-container {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.omnimux-bulk-submit-btn {
  width: 100%;
  height: 40px;
  border-radius: 10px;
  background: var(--dsw-alias-brand-primary) !important;
  color: var(--dsw-alias-button-primary-text) !important;
  font-size: 15px;
  font-weight: 600;
  border: 0;
  cursor: pointer;
  transition: opacity 140ms ease, transform 120ms ease;
  box-shadow: 0 4px 16px var(--dsw-alias-interactive-bg-active) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.omnimux-bulk-submit-btn:hover {
  opacity: 0.94;
  transform: translateY(-1px);
}
.omnimux-bulk-error-msg {
  font-size: 13px;
  color: var(--dsw-alias-state-error-primary);
  font-weight: 500;
}

@keyframes omnimuxFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes omnimuxScaleUp {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

@container starter-guide (max-width:920px) {
  .omnimux-starter-group, .omnimux-starter-group:first-child, .omnimux-starter-group:last-child { padding-inline:12px; }
  .omnimux-starter-group::after { display:none; }
  .omnimux-popular-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .omnimux-insight-modal { height: 92vh; }
  .omnimux-insight-body { flex-direction: column; }
  .omnimux-insight-left { width: 100%; border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1); max-height: 240px; }
}
@media (prefers-reduced-motion:reduce) {
  .omnimux-starter-icon, .omnimux-popular-card, .omnimux-insight-modal, .omnimux-toast-pill { transition:none; animation:none; }
}

/* ==================== 爆款对标视频与一键复刻 (Trending Videos, Ready to Replicate) ==================== */
.omx-trending {
  --omnimux-trending-accent-0:var(--dsw-alias-brand-primary);
  --omnimux-trending-accent-1:var(--dsw-alias-state-error-primary);
  --omnimux-trending-accent-2:var(--dsw-alias-state-business-primary);
  --omnimux-trending-accent-3:var(--dsw-alias-state-warn-primary);
  --omnimux-trending-cover-base:var(--dsw-static-neutral-900);
  --omnimux-trending-cover-deep:var(--dsw-static-neutral-1000);
  --omnimux-trending-cover-soft:color-mix(in srgb, var(--dsw-static-neutral-00) 7%, transparent);
  --omnimux-trending-cover-hover:color-mix(in srgb, var(--dsw-static-neutral-00) 24%, transparent);
  --omnimux-trending-cover-line:color-mix(in srgb, var(--dsw-static-neutral-00) 16%, transparent);
  --omnimux-trending-cover-text:color-mix(in srgb, var(--dsw-static-neutral-00) 92%, transparent);
  --omnimux-trending-cover-text-strong:var(--dsw-static-neutral-00);
  --omnimux-trending-card-scrim:color-mix(in srgb, var(--dsw-static-neutral-1000) 55%, transparent);
  --omnimux-trending-card-scrim-strong:color-mix(in srgb, var(--dsw-static-neutral-1000) 92%, transparent);
  --omnimux-trending-region-bg:color-mix(in srgb, var(--dsw-static-neutral-1000) 45%, transparent);
  --omnimux-trending-metric-muted:color-mix(in srgb, var(--dsw-static-neutral-00) 45%, transparent);
  --omnimux-trending-dock-bg:color-mix(in srgb, var(--dsw-static-neutral-800) 92%, transparent);
  --omnimux-trending-dock-ring:var(--dsw-alias-border-l2);
  --omnimux-trending-dock-highlight:color-mix(in srgb, var(--dsw-static-neutral-00) 20%, transparent);
  --omnimux-trending-dock-rim:color-mix(in srgb, var(--dsw-static-neutral-1000) 85%, transparent);
  width:100%!important;
  max-width:1200px!important;
  box-sizing:border-box;
  margin:32px auto 8px;
  min-width:0;
  container-type:inline-size;
  container-name:trending;
  color:var(--dsw-alias-label-primary);
  font-size:13px;
  line-height:1.5;
}
.omx-trending-head { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
.omx-trending-title {
  margin:0; font-size:18px; font-weight:700; letter-spacing:-0.01em;
  color:var(--dsw-alias-label-primary);
}
.omx-trending-subtitle {
  margin:0; font-size:13px; color:var(--dsw-alias-label-tertiary); max-width:760px;
}

/* 复合筛选工具栏 */
.omx-trending-toolbar {
  display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
  padding:8px 12px; margin-bottom:16px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:14px;
  background:var(--dsw-alias-bg-layer-1);
}
.omx-trending-toolbar-left { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
.omx-trending-toolbar-right { display:flex; align-items:center; gap:12px; margin-left:auto; }
.omx-trending-select-with-info, .omx-trending-range { display:inline-flex; align-items:center; gap:4px; }
.omx-trending-range-icon { display:inline-flex; width:14px; height:14px; color:var(--dsw-alias-label-tertiary); }
.omx-trending-range-icon > svg { width:14px; height:14px; }
.omx-trending-info-mark {
  display:inline-flex; width:13px; height:13px; color:var(--dsw-alias-label-tertiary);
  opacity:0.7; cursor:help;
}
.omx-trending-info-mark > svg { width:13px; height:13px; }
.omx-trending-select { min-width:0; }
.omx-trending-select-field { position:relative; display:inline-flex; }

/* 轻量下拉：触发器 + role=listbox 弹层 */
.omx-trending-select-trigger {
  display:inline-flex; align-items:center; gap:6px; height:32px; box-sizing:border-box;
  padding:0 10px; cursor:pointer; font:inherit; font-size:12px; font-weight:600;
  border:0; border-radius:10px; background:transparent;
  color:var(--dsw-alias-label-secondary);
  transition:background-color 160ms ease-out, color 160ms ease-out;
  max-width:220px;
}
.omx-trending-select-trigger:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.omx-trending-select-trigger[aria-expanded="true"] { background:var(--dsw-alias-interactive-bg-active); color:var(--dsw-alias-label-primary); }
.omx-trending-select-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.omx-trending-select-caret { display:inline-flex; width:14px; height:14px; opacity:0.75; }
.omx-trending-select-caret > svg { width:14px; height:14px; }
.omx-trending-select-menu {
  position:absolute; top:calc(100% + 6px); z-index:60;
  left:0; min-width:100%; max-height:280px; overflow-y:auto;
  margin:0; padding:4px; list-style:none;
  border:1px solid var(--dsw-alias-border-l2); border-radius:12px;
  background:var(--dsw-alias-bg-elevated);
  box-shadow:0 12px 32px var(--omnimux-trending-dock-rim);
}
.omx-trending-select.is-end .omx-trending-select-menu { left:auto; right:0; }
.omx-trending-select-option {
  display:block; width:100%; box-sizing:border-box; text-align:left;
  padding:6px 10px; cursor:pointer; font:inherit; font-size:12px;
  border:0; border-radius:8px; background:transparent;
  color:var(--dsw-alias-label-secondary); white-space:nowrap;
}
.omx-trending-select-option:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.omx-trending-select-option.is-active { color:var(--dsw-alias-brand-primary); font-weight:600; }
.omx-trending-count { font-size:12px; color:var(--dsw-alias-label-tertiary); white-space:nowrap; }
.omx-trending-reset {
  appearance:none; border:0; background:transparent; cursor:pointer; padding:4px 6px;
  font:inherit; font-size:12px; color:var(--dsw-alias-brand-primary); border-radius:8px;
}
.omx-trending-reset:hover { background:var(--dsw-alias-interactive-bg-hover); }

/* 卡片矩阵 */
.omx-trending-grid {
  display:grid; gap:16px;
  grid-template-columns:repeat(2, minmax(0, 1fr));
}
.omx-trending-card {
  position:relative; display:block; aspect-ratio:9/16; overflow:hidden;
  border-radius:16px; background:var(--omnimux-trending-cover-base);
  border:1px solid var(--dsw-alias-border-l1);
  isolation:isolate;
}
.omx-trending-card-media {
  position:absolute; inset:0; transition:transform 300ms cubic-bezier(0.2,0.9,0.3,1);
}
.omx-trending-card:hover .omx-trending-card-media,
.omx-trending-card:focus-within .omx-trending-card-media { transform:scale(1.015); }
.omx-trending-cover-svg, .omx-trending-cover-img {
  position:absolute; inset:0; width:100%; height:100%; display:block; object-fit:cover;
}
.omx-trending-card-topshade {
  position:absolute; inset-inline:0; top:0; height:22%;
  background:linear-gradient(to bottom, var(--omnimux-trending-card-scrim), transparent);
  pointer-events:none;
}
.omx-trending-card-shade {
  position:absolute; inset-inline:0; bottom:0; height:48%;
  background:linear-gradient(to top, var(--omnimux-trending-card-scrim-strong), transparent);
  pointer-events:none;
}
.omx-trending-card-region {
  position:absolute; left:12px; top:12px; max-width:70%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  padding:3px 9px; border-radius:999px; font-size:11px; font-weight:500;
  color:var(--omnimux-trending-cover-text); background:var(--omnimux-trending-region-bg);
  border:1px solid var(--omnimux-trending-cover-line); backdrop-filter:blur(8px);
}
.omx-trending-card-body {
  position:absolute; inset-inline:0; bottom:0; padding:12px;
  transform:translateY(0); transition:transform 300ms ease-out;
}
.omx-trending-card:hover .omx-trending-card-body,
.omx-trending-card:focus-within .omx-trending-card-body { transform:translateY(-50px); }
.omx-trending-card-metrics {
  display:grid; grid-template-columns:repeat(2, minmax(0, 1fr));
  border-bottom:1px solid var(--omnimux-trending-cover-line); padding-bottom:10px;
}
.omx-trending-card-metric { min-width:0; padding-inline:10px; text-align:center; }
.omx-trending-card-metric.is-divider { border-left:1px solid var(--omnimux-trending-cover-line); }
.omx-trending-card-metric-value {
  margin:0; font-size:13px; font-weight:700; line-height:1.35;
  color:var(--omnimux-trending-cover-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.omx-trending-card-metric-label {
  display:block; margin-top:2px; font-size:9px; font-weight:500;
  letter-spacing:0.06em; text-transform:uppercase; color:var(--omnimux-trending-metric-muted);
}
.omx-trending-card-title {
  margin:8px 0 0; min-height:34px;
  font-size:12px; font-weight:500; line-height:17px; color:var(--omnimux-trending-cover-text);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
.omx-trending-card-action {
  position:absolute; inset-inline:12px; bottom:12px;
  opacity:0; transform:translateY(12px); pointer-events:none;
  transition:opacity 300ms ease-out, transform 300ms ease-out;
}
.omx-trending-card:hover .omx-trending-card-action,
.omx-trending-card:focus-within .omx-trending-card-action {
  opacity:1; transform:translateY(0); pointer-events:auto;
}
.omx-trending-recreate-btn {
  display:flex; align-items:center; justify-content:center; gap:6px;
  width:100%; height:40px; box-sizing:border-box; cursor:pointer;
  border-radius:12px; font:inherit; font-size:12px; font-weight:600;
  color:var(--omnimux-trending-cover-text);
  background:var(--omnimux-trending-cover-soft);
  border:1px solid var(--omnimux-trending-cover-line);
  backdrop-filter:blur(10px);
  transition:background-color 200ms ease-out, color 200ms ease-out;
}
.omx-trending-recreate-btn:hover:not(:disabled) {
  background:var(--omnimux-trending-cover-hover);
  color:var(--omnimux-trending-cover-text-strong);
}
.omx-trending-recreate-btn:disabled { cursor:wait; opacity:0.55; }
.omx-trending-recreate-icon { display:inline-flex; width:13px; height:13px; }
.omx-trending-recreate-icon > svg { width:13px; height:13px; }

/* 矢量封面：六个构图原型 */
.omx-trending-cover-svg[data-accent="0"] { --omnimux-trending-accent:var(--omnimux-trending-accent-0); }
.omx-trending-cover-svg[data-accent="1"] { --omnimux-trending-accent:var(--omnimux-trending-accent-1); }
.omx-trending-cover-svg[data-accent="2"] { --omnimux-trending-accent:var(--omnimux-trending-accent-2); }
.omx-trending-cover-svg[data-accent="3"] { --omnimux-trending-accent:var(--omnimux-trending-accent-3); }
.omx-trending-cover-base { fill:var(--omnimux-trending-cover-base); }
.omx-trending-cover-slat { fill:var(--omnimux-trending-cover-soft); }
.omx-trending-cover-skin { fill:var(--omnimux-trending-accent); opacity:0.55; }
.omx-trending-cover-garment { fill:var(--omnimux-trending-accent); opacity:0.85; }
.omx-trending-cover-seam { stroke:var(--omnimux-trending-cover-deep); stroke-width:1; opacity:0.45; }
.omx-trending-cover-outline { fill:none; stroke:var(--omnimux-trending-cover-line); stroke-width:1; }
.omx-trending-cover-layer-1 { fill:var(--omnimux-trending-accent); opacity:0.28; }
.omx-trending-cover-layer-2 { fill:var(--omnimux-trending-accent); opacity:0.5; }
.omx-trending-cover-layer-3 { fill:var(--omnimux-trending-accent); opacity:0.78; }
.omx-trending-cover-tagline { fill:var(--omnimux-trending-cover-soft); }
.omx-trending-cover-scale { stroke:var(--omnimux-trending-cover-line); stroke-width:1; }
.omx-trending-cover-ring-outer { fill:var(--omnimux-trending-accent); opacity:0.22; }
.omx-trending-cover-ring-inner { fill:var(--omnimux-trending-accent); opacity:0.55; }
.omx-trending-cover-core { fill:var(--omnimux-trending-accent); }
.omx-trending-cover-axis { stroke:var(--omnimux-trending-cover-line); stroke-width:1; stroke-dasharray:3 4; }
.omx-trending-cover-teeth { stroke:var(--omnimux-trending-accent); stroke-width:2.5; opacity:0.7; }
.omx-trending-cover-before { fill:var(--omnimux-trending-cover-deep); }
.omx-trending-cover-after { fill:var(--omnimux-trending-accent); opacity:0.8; }
.omx-trending-cover-divider { stroke:var(--omnimux-trending-cover-text); stroke-width:1.4; opacity:0.85; }
.omx-trending-cover-handle { fill:var(--omnimux-trending-cover-base); stroke:var(--omnimux-trending-cover-text); stroke-width:1; }
.omx-trending-cover-handle-arrow { stroke:var(--omnimux-trending-cover-text); stroke-width:1.2; fill:none; }
.omx-trending-cover-halo { fill:var(--omnimux-trending-accent); opacity:0.25; }
.omx-trending-cover-product { fill:var(--omnimux-trending-accent); opacity:0.9; }
.omx-trending-cover-product-cap { fill:var(--omnimux-trending-cover-text); opacity:0.8; }
.omx-trending-cover-label { fill:var(--omnimux-trending-cover-base); opacity:0.55; }
.omx-trending-cover-shadow { fill:var(--omnimux-trending-cover-deep); opacity:0.6; }
.omx-trending-cover-box { fill:var(--omnimux-trending-accent); opacity:0.62; }
.omx-trending-cover-box-fold { stroke:var(--omnimux-trending-cover-deep); stroke-width:1.2; fill:none; opacity:0.7; }
.omx-trending-cover-item-1 { fill:var(--omnimux-trending-accent); opacity:0.45; }
.omx-trending-cover-item-2 { fill:var(--omnimux-trending-accent); opacity:0.9; }
.omx-trending-cover-item-3 { fill:var(--omnimux-trending-accent); opacity:0.65; }

/* 空态 */
.omx-trending-empty {
  display:flex; flex-direction:column; align-items:center; gap:10px; padding:40px 16px;
  border:1px dashed var(--dsw-alias-border-l2); border-radius:16px;
  color:var(--dsw-alias-label-tertiary);
}
.omx-trending-empty > p { margin:0; font-size:13px; }

/* 吸底浮动输入框：视口底部接管输入，顶部 Hero 输入框让位 */
.omx-trending-dock {
  position:fixed; bottom:0; z-index:45;
  left:var(--omnimux-dock-left, 0px);
  width:var(--omnimux-dock-width, 100vw);
  box-sizing:border-box;
  padding:56px 20px 20px;
  pointer-events:none;
  display:flex; justify-content:center;
  animation:omxTrendingDockIn 180ms ease-out both;
}
.omx-trending-dock-card {
  pointer-events:auto;
  width:100%; max-width:800px;
  box-sizing:border-box;
  display:flex; flex-direction:column; gap:10px;
  padding:12px;
  border-radius:16px;
  border:1px solid var(--omnimux-trending-dock-ring);
  background:var(--omnimux-trending-dock-bg);
  backdrop-filter:blur(24px);
  box-shadow:inset 0 1px 0 0 var(--omnimux-trending-dock-highlight), inset 0 -1px 0 0 var(--omnimux-trending-dock-rim), 0 18px 48px var(--omnimux-trending-dock-rim);
}
.omx-trending-dock-chips { display:flex; align-items:center; gap:8px; min-width:0; }
.omx-trending-dock-thumb {
  position:relative; display:inline-block; flex:0 0 auto;
  width:36px; height:64px; overflow:hidden; border-radius:8px;
  border:1px solid var(--omnimux-trending-dock-ring); background:var(--omnimux-trending-cover-base);
}
.omx-trending-dock-chip {
  display:inline-flex; align-items:center; gap:8px; min-width:0;
  padding:5px 10px; border-radius:10px;
  border:1px solid var(--omnimux-trending-dock-ring);
  background:var(--omnimux-trending-cover-soft);
  max-width:100%;
}
.omx-trending-dock-chip-region {
  flex:0 0 auto; font-size:9px; font-weight:600; letter-spacing:0.06em;
  color:var(--dsw-alias-label-tertiary);
}
.omx-trending-dock-chip-label {
  font-size:12px; font-weight:500; color:var(--dsw-alias-label-primary);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.omx-trending-dock-input {
  width:100%; box-sizing:border-box; resize:none;
  border:0; outline:none; background:transparent;
  font:inherit; font-size:13px; line-height:1.6;
  color:var(--dsw-alias-label-primary);
  padding:2px 4px;
}
.omx-trending-dock-input::placeholder { color:var(--dsw-alias-label-tertiary); }
.omx-trending-dock-footer {
  display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
}
.omx-trending-dock-footer-left, .omx-trending-dock-footer-right {
  display:flex; align-items:center; gap:8px; min-width:0;
}
.omx-trending-dock-icon {
  display:inline-flex; align-items:center; justify-content:center;
  width:28px; height:28px; box-sizing:border-box; cursor:pointer;
  border:0; border-radius:8px; background:transparent;
  color:var(--dsw-alias-label-secondary);
  transition:background-color 160ms ease-out, color 160ms ease-out;
}
.omx-trending-dock-icon:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.omx-trending-dock-icon > svg { width:16px; height:16px; }
.omx-trending-dock-expert {
  display:inline-flex; align-items:center; gap:6px;
  padding:4px 10px; border-radius:10px; font-size:12px;
  border:1px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-secondary);
}
.omx-trending-dock-expert-icon { display:inline-flex; width:14px; height:14px; }
.omx-trending-dock-expert-icon > svg { width:14px; height:14px; }
.omx-trending-dock-model {
  display:inline-flex; align-items:center; gap:4px;
  font-size:12px; color:var(--dsw-alias-label-secondary); white-space:nowrap;
}
.omx-trending-dock-model-caret { display:inline-flex; width:14px; height:14px; }
.omx-trending-dock-model-caret > svg { width:14px; height:14px; }
.omx-trending-dock-send {
  display:inline-flex; align-items:center; justify-content:center;
  width:32px; height:32px; box-sizing:border-box; cursor:pointer;
  border:0; border-radius:999px;
  background:var(--dsw-alias-button-primary-fill);
  color:var(--dsw-alias-button-primary-text);
  transition:opacity 160ms ease-out;
}
.omx-trending-dock-send:hover:not(:disabled) { opacity:0.88; }
.omx-trending-dock-send:disabled { cursor:not-allowed; opacity:0.45; }
.omx-trending-dock-send > svg { width:16px; height:16px; }

/* 接管期间顶部 Hero 输入框让位，形成「输入框迁移到底部」的连续观感 */
[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card],
[data-omnimux-starter-host][data-omnimux-dock-open] [class*="heroWorkspaceRow"] {
  opacity:0!important; pointer-events:none!important;
}

@keyframes omxTrendingDockIn {
  from { opacity:0; transform:translateY(14px); }
  to { opacity:1; transform:translateY(0); }
}

@container trending (min-width:640px) {
  .omx-trending-grid { grid-template-columns:repeat(3, minmax(0, 1fr)); }
}
@container trending (min-width:880px) {
  .omx-trending-grid { grid-template-columns:repeat(4, minmax(0, 1fr)); }
}
@container trending (min-width:1080px) {
  .omx-trending-grid { grid-template-columns:repeat(5, minmax(0, 1fr)); }
}
@container trending (max-width:639px) {
  .omx-trending-toolbar { align-items:stretch; }
  .omx-trending-toolbar-right { margin-left:0; }
  .omx-trending-dock { padding:48px 12px 12px; }
}
@media (prefers-reduced-motion:reduce) {
  .omx-trending-card-media, .omx-trending-card-body, .omx-trending-card-action { transition:none; }
  .omx-trending-dock { animation:none; }
}
`

export function installGuideStyles(doc) {
  const style = doc.createElement('style')
  style.id = GUIDE_STYLE_ID
  style.textContent = GUIDE_CSS
  doc.head.appendChild(style)
  return () => style.remove()
}
