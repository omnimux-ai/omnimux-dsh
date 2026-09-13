export const GUIDE_STYLE_ID = 'omnimux-session-guide-style'
export const GUIDE_CSS = `
/* 浮层底色必须不透明：本 Host 主题没有定义 --dsw-alias-bg-elevated，
   裸用 var() 会把这个属性算成 transparent，浮层与弹窗会整片透出底层内容。 */
[data-omnimux-starter-host] {
  --omnimux-surface-dialog:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-2, var(--dsw-static-neutral-800)));
}
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
  background: var(--omnimux-surface-dialog);
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
  background: var(--omnimux-surface-dialog);
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
  background: var(--omnimux-surface-dialog);
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
  background: var(--omnimux-surface-dialog);
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
  background: var(--omnimux-surface-dialog);
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
.omnimux-trending {
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
  /* 浮层底色必须不透明：--dsw-alias-bg-elevated 在本 Host 主题未定义，
     裸用 var() 会让整个下拉菜单的计算值退化成 transparent。 */
  --omnimux-trending-menu-bg:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-3, var(--dsw-static-neutral-800)));
  --omnimux-trending-menu-ring:var(--dsw-alias-border-l2);
  --omnimux-trending-menu-shadow:color-mix(in srgb, var(--dsw-static-neutral-1000) 55%, transparent);
  /* 示例数据标注：底色同样必须不透明；描边用标签色混合，浅色主题下也可见。
     封面用的 cover-line 是「白 16%」，只适用于深色封面之上，不能拿来当页面底上的描边。 */
  --omnimux-trending-chip-bg:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-3, var(--dsw-static-neutral-800)));
  --omnimux-trending-chip-line:color-mix(in srgb, var(--dsw-alias-label-tertiary) 42%, transparent);
  /* 吸顶栏遮罩：底色取自 design.md 的页面主背景 Token（深色 #111113 / 浅色 #fff），
     并以近乎不透明的权重混合——卡片从下方穿行时必须被彻底挡住，
     毛玻璃只负责边缘过渡，不承担遮字职责。 */
  --omnimux-trending-sticky-fade:color-mix(in srgb, var(--dsw-alias-bg-base) 88%, transparent);
  --omnimux-trending-sticky-solid:color-mix(in srgb, var(--dsw-alias-bg-base) 94%, transparent);
  /* 吸附偏移：宿主顶部若有自己的吸顶条，由宿主覆盖本变量让开高度，避免两条吸顶互相压盖 */
  --omnimux-trending-sticky-top:0px;
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
.omnimux-trending-head { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }

/* 吸顶栏：双 Tab 与当前 Tab 的工具栏共用一条 sticky 容器。
   1. position:sticky 相对最近的滚动祖先（宿主会话滚动列）吸附，不劫持滚动；
   2. z-index 卡在「卡片(0~10)」之上、「下拉浮层(60)」之下，弹层永远压得住吸顶栏；
   3. 底色近乎不透明 + backdrop-filter，暗色模式下卡片文字不会透上来。 */
.omnimux-trending-sticky-header {
  position:sticky; top:var(--omnimux-trending-sticky-top); z-index:30;
  overflow:visible;
  padding:12px 0 0;
  background:var(--omnimux-trending-sticky-solid);
  -webkit-backdrop-filter:blur(12px) saturate(140%);
  backdrop-filter:blur(12px) saturate(140%);
  border-bottom:1px solid transparent;
  transition:border-color 200ms ease-out, box-shadow 200ms ease-out;
}
/* 边缘柔化：吸顶栏与卡片之间不留硬切线，只做 12px 的渐隐过渡 */
.omnimux-trending-sticky-header::after {
  content:''; position:absolute; left:0; right:0; top:100%; height:12px;
  pointer-events:none;
  background:linear-gradient(to bottom, var(--omnimux-trending-sticky-fade), transparent);
}
/* 有工具栏时才画分隔线：只有双 Tab 时一条线会显得多余 */
.omnimux-trending-sticky-header.is-with-toolbar {
  border-bottom-color:var(--dsw-alias-border-l1);
}
.omnimux-trending-sticky-toolbar { position:relative; z-index:1; }
/* 工具栏进入吸顶栏后不再自带外边距，间距交给容器统一控制 */
.omnimux-trending-sticky-toolbar > .omnimux-trending-toolbar { margin-bottom:12px; }
.omnimux-trending-sticky-toolbar > .omnimux-skills-chips-bar { margin-bottom:12px; }

/* 无限滚动哨兵：加载中给一行骨架，取完给温和的末尾提示 */
.omnimux-trending-sentinel {
  display:flex; flex-direction:column; align-items:center; gap:10px;
  padding:20px 0 8px; margin-top:4px;
}
.omnimux-trending-feed-hint, .omnimux-trending-feed-end {
  margin:0; font-size:12px; line-height:18px;
  color:var(--dsw-alias-label-tertiary);
}
.omnimux-trending-feed-end {
  display:flex; align-items:center; gap:10px; width:100%;
  justify-content:center;
}
.omnimux-trending-feed-end::before, .omnimux-trending-feed-end::after {
  content:''; flex:1 1 auto; max-width:72px; height:1px;
  background:var(--dsw-alias-border-l1);
}
.omnimux-trending-feed-skeleton {
  display:grid; gap:16px; width:100%;
  grid-template-columns:repeat(2, minmax(0, 1fr));
}
.omnimux-trending-feed-skeleton-card {
  position:relative; aspect-ratio:9/16; overflow:hidden;
  border-radius:16px; background:var(--omnimux-trending-cover-base);
  border:1px solid var(--dsw-alias-border-l1);
  opacity:0.55;
}
.omnimux-trending-feed-shimmer {
  position:absolute; inset:0;
  background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-static-neutral-00) 6%, transparent) 50%, transparent 100%);
  animation:omnimux-skeleton-shimmer 1.8s infinite cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events:none;
}
@container trending (min-width:640px) {
  .omnimux-trending-feed-skeleton { grid-template-columns:repeat(3, minmax(0, 1fr)); }
}
@container trending (min-width:880px) {
  .omnimux-trending-feed-skeleton { grid-template-columns:repeat(4, minmax(0, 1fr)); }
}
@container trending (min-width:1080px) {
  .omnimux-trending-feed-skeleton { grid-template-columns:repeat(5, minmax(0, 1fr)); }
}
.omnimux-trending-title {
  display:flex; align-items:center; gap:8px;
  margin:0; font-size:18px; font-weight:700; letter-spacing:-0.01em;
  color:var(--dsw-alias-label-primary);
}
.omnimux-trending-source-badge {
  display:inline-flex; align-items:center; flex:none; padding:1px 7px; border-radius:999px;
  font-size:11px; font-weight:600; letter-spacing:0;
  color:var(--dsw-alias-label-secondary);
  background:var(--omnimux-trending-chip-bg);
  border:1px solid var(--omnimux-trending-chip-line);
}
.omnimux-trending-subtitle {
  margin:0; font-size:13px; color:var(--dsw-alias-label-tertiary); max-width:760px;
}

/* 导航双 Tab：创作灵感 / Skill */
.omnimux-guide-tabs {
  display:flex; align-items:center; gap:28px;
}
.omnimux-guide-tab {
  background:none; border:none; padding:0 0 8px 0;
  font-size:18px; font-weight:700; letter-spacing:-0.01em;
  color:var(--dsw-alias-label-tertiary); cursor:pointer;
  position:relative; display:inline-flex; align-items:center; gap:8px;
  transition:color 160ms ease; font-family:inherit;
}
.omnimux-guide-tab:hover { color:var(--dsw-alias-label-secondary); }
.omnimux-guide-tab.is-active { color:var(--dsw-alias-label-primary); }
.omnimux-guide-tab.is-active::after {
  content:''; position:absolute; left:0; right:0; bottom:0; height:2px;
  background:var(--dsw-alias-label-primary); border-radius:2px;
}

/* 技能分类胶囊栏 */
.omnimux-skills-chips-bar {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:16px;
}
.omnimux-skills-chip {
  background:var(--omnimux-trending-chip-bg);
  border:1px solid var(--omnimux-trending-chip-line);
  color:var(--dsw-alias-label-secondary);
  border-radius:999px; padding:5px 14px;
  font-size:12px; line-height:16px; cursor:pointer;
  transition:all 160ms ease; font-family:inherit;
}
.omnimux-skills-chip:hover {
  border-color:var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-primary);
}
.omnimux-skills-chip.is-active {
  background:var(--dsw-alias-interactive-bg-active, var(--dsw-alias-bg-layer-3));
  border-color:var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-primary);
  font-weight:600;
}

/* 技能卡片网格：基准 4 列，响应式折叠，对齐图 4 视觉规范 */
.omnimux-skills-grid {
  display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px;
}
@media (max-width: 1100px) {
  .omnimux-skills-grid { grid-template-columns:repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 820px) {
  .omnimux-skills-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .omnimux-skills-grid { grid-template-columns:repeat(1, minmax(0, 1fr)); }
}
.omnimux-skill-card {
  position:relative;
  background:var(--omnimux-trending-cover-base);
  border:1px solid var(--dsw-alias-border-l1);
  border-radius:12px;
  display:flex; flex-direction:column;
  overflow:hidden;
  cursor:pointer;
  transition:border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}
.omnimux-skill-card:hover {
  border-color:var(--dsw-alias-border-l2);
  transform:translateY(-2px);
  box-shadow:0 8px 24px color-mix(in srgb, var(--dsw-static-neutral-1000) 60%, transparent);
}
.omnimux-skill-card.is-active { border-color:var(--dsw-alias-brand-primary); }
.omnimux-skill-card-cover-wrapper {
  position:relative;
  width:100%;
  aspect-ratio:16 / 9;
  background:var(--dsw-alias-bg-layer-2);
  overflow:hidden;
}
.omnimux-skill-card-cover-img {
  width:100%; height:100%; object-fit:cover; display:block;
  transition:transform 240ms ease;
}
.omnimux-skill-card:hover .omnimux-skill-card-cover-img {
  transform:scale(1.03);
}
.omnimux-skill-card-cover-fallback {
  width:100%; height:100%;
  display:flex; align-items:center; justify-content:center;
  font-size:24px; font-weight:700;
  color:var(--dsw-alias-label-tertiary);
  background:linear-gradient(135deg, var(--dsw-alias-bg-layer-3) 0%, var(--dsw-alias-bg-layer-1) 100%);
}
.omnimux-skill-card-badge {
  position:absolute; top:6px; left:6px; z-index:2;
  padding:1px 6px; font-size:10px; font-weight:700; line-height:14px;
  color:var(--dsw-static-neutral-00);
  background:linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); /* exempt-ui03: H3 官方精选视觉专属品牌紫色角标 */
  border-radius:4px; text-transform:uppercase;
  box-shadow:0 2px 6px color-mix(in srgb, var(--dsw-static-neutral-1000) 35%, transparent);
}
.omnimux-skill-card-cover-hover {
  position:absolute; inset:0; z-index:3;
  display:flex; align-items:center; justify-content:center;
  background:color-mix(in srgb, var(--dsw-static-neutral-1000) 40%, transparent);
  opacity:0; transition:opacity 180ms ease;
  backdrop-filter:blur(2px);
}
.omnimux-skill-card:hover .omnimux-skill-card-cover-hover,
.omnimux-skill-card:focus-within .omnimux-skill-card-cover-hover,
.omnimux-skill-card.is-active .omnimux-skill-card-cover-hover {
  opacity:1;
}
.omnimux-skill-card-btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:6px 14px; font-size:12px; font-weight:600; line-height:16px;
  color:var(--dsw-static-neutral-1000); background:var(--dsw-static-neutral-00); border:none; border-radius:999px;
  cursor:pointer; box-shadow:0 4px 16px color-mix(in srgb, var(--dsw-static-neutral-1000) 35%, transparent);
  transition:transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
  font-family:inherit;
}
.omnimux-skill-card-btn:hover {
  transform:scale(1.05);
  background:color-mix(in srgb, var(--dsw-static-neutral-00) 90%, var(--dsw-static-neutral-1000));
  box-shadow:0 6px 20px color-mix(in srgb, var(--dsw-static-neutral-1000) 45%, transparent);
}
.omnimux-skill-card.is-active .omnimux-skill-card-btn {
  background:var(--dsw-alias-brand-primary);
  color:var(--dsw-static-neutral-00);
}
.omnimux-skill-card-btn-icon { display:inline-flex; width:13px; height:13px; }
.omnimux-skill-card-btn-icon > svg { width:13px; height:13px; }
.omnimux-skill-card-content {
  display:flex; flex-direction:column; padding:12px 14px 14px 14px; flex:1;
}
.omnimux-skill-card-header { display:flex; align-items:center; margin-bottom:6px; }
.omnimux-skill-card-title {
  font-size:15px; font-weight:600; line-height:20px;
  color:var(--dsw-alias-label-primary); margin:0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.omnimux-skill-card-summary {
  font-size:12px; line-height:18px;
  color:var(--dsw-alias-label-secondary); margin:0 0 10px 0;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden; min-height:36px; flex:1;
}
.omnimux-skill-card-attribution {
  display:flex; align-items:center; gap:4px; margin-top:auto;
}
.omnimux-skill-card-author {
  font-size:11px; line-height:15px;
  color:var(--dsw-alias-label-tertiary); font-weight:400;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.omnimux-skill-verified-icon {
  display:inline-flex; width:12px; height:12px; color:var(--dsw-alias-brand-primary); flex-shrink:0;
}

/* 复合筛选工具栏 */
.omnimux-trending-toolbar {
  display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
  padding:8px 12px; margin-bottom:16px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:14px;
  background:var(--dsw-alias-bg-layer-1);
}
.omnimux-trending-toolbar-left { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
.omnimux-trending-toolbar-right { display:flex; align-items:center; gap:12px; margin-left:auto; }
.omnimux-trending-select-with-info, .omnimux-trending-range { display:inline-flex; align-items:center; gap:4px; }
.omnimux-trending-range-icon { display:inline-flex; width:14px; height:14px; color:var(--dsw-alias-label-tertiary); }
.omnimux-trending-range-icon > svg { width:14px; height:14px; }
.omnimux-trending-info-mark {
  display:inline-flex; width:13px; height:13px; color:var(--dsw-alias-label-tertiary);
  opacity:0.7; cursor:help;
}
.omnimux-trending-info-mark > svg { width:13px; height:13px; }
.omnimux-trending-select { min-width:0; }
.omnimux-trending-select-field { position:relative; display:inline-flex; }

/* 轻量下拉：触发器 + role=listbox 弹层 */
.omnimux-trending-select-trigger {
  display:inline-flex; align-items:center; gap:6px; height:32px; box-sizing:border-box;
  padding:0 10px; cursor:pointer; font:inherit; font-size:12px; font-weight:600;
  border:0; border-radius:10px; background:transparent;
  color:var(--dsw-alias-label-secondary);
  transition:background-color 160ms ease-out, color 160ms ease-out;
  max-width:220px;
}
.omnimux-trending-select-trigger:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.omnimux-trending-select-trigger[aria-expanded="true"] { background:var(--dsw-alias-interactive-bg-active); color:var(--dsw-alias-label-primary); }
.omnimux-trending-select-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.omnimux-trending-select-caret { display:inline-flex; width:14px; height:14px; opacity:0.75; }
.omnimux-trending-select-caret > svg { width:14px; height:14px; }
.omnimux-trending-select-menu {
  position:absolute; top:calc(100% + 6px); z-index:60;
  left:0; min-width:100%; max-height:280px; overflow-y:auto;
  margin:0; padding:4px; list-style:none;
  border:1px solid var(--omnimux-trending-menu-ring); border-radius:12px;
  background:var(--omnimux-trending-menu-bg);
  box-shadow:0 12px 32px var(--omnimux-trending-menu-shadow);
}
.omnimux-trending-select.is-end .omnimux-trending-select-menu { left:auto; right:0; }
.omnimux-trending-select-option {
  display:block; width:100%; box-sizing:border-box; text-align:left;
  padding:6px 10px; cursor:pointer; font:inherit; font-size:12px;
  border:0; border-radius:8px; background:transparent;
  color:var(--dsw-alias-label-secondary); white-space:nowrap;
}
.omnimux-trending-select-option:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.omnimux-trending-select-option.is-active { color:var(--dsw-alias-brand-primary); font-weight:600; }
.omnimux-trending-reset {
  appearance:none; border:0; background:transparent; cursor:pointer; padding:4px 6px;
  font:inherit; font-size:12px; color:var(--dsw-alias-brand-primary); border-radius:8px;
}
.omnimux-trending-reset:hover { background:var(--dsw-alias-interactive-bg-hover); }

/* 骨架屏与卡片入场动画 */
@keyframes omnimux-skeleton-shimmer {
  0% { transform:translateX(-100%); }
  100% { transform:translateX(100%); }
}
@keyframes omnimux-grid-fade-in {
  from { opacity:0; transform:translateY(6px); }
  to { opacity:1; transform:translateY(0); }
}

/* 卡片矩阵 */
.omnimux-trending-grid {
  display:grid; gap:16px;
  grid-template-columns:repeat(2, minmax(0, 1fr));
}
.omnimux-trending-grid.omnimux-trending-grid-enter {
  animation:omnimux-grid-fade-in 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.omnimux-trending-grid.is-refreshing {
  opacity:0.65;
  transition:opacity 180ms ease-out;
}
.omnimux-trending-card {
  position:relative; display:block; aspect-ratio:9/16; overflow:hidden;
  border-radius:16px; background:var(--omnimux-trending-cover-base);
  border:1px solid var(--dsw-alias-border-l1);
  isolation:isolate;
  transition:border-color 200ms ease-out;
  content-visibility:auto;
  contain-intrinsic-size:200px 355px;
}
/* 当前被吸底输入框接管的样本：用描边高亮代替「禁用」，用户仍可随时改选其它卡片 */
.omnimux-trending-card.is-active { border-color:var(--dsw-alias-brand-primary); }
.omnimux-trending-card-media {
  position:absolute; inset:0; transition:transform 300ms cubic-bezier(0.2,0.9,0.3,1);
}
.omnimux-trending-card:hover .omnimux-trending-card-media,
.omnimux-trending-card:focus-within .omnimux-trending-card-media { transform:scale(1.015); }
.omnimux-trending-cover-svg {
  position:absolute; inset:0; width:100%; height:100%; display:block; object-fit:cover;
}
.omnimux-trending-cover-img {
  position:absolute; inset:0; width:100%; height:100%; display:block; object-fit:cover;
  opacity:0; transition:opacity 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omnimux-trending-cover-img.is-loaded {
  opacity:1;
}

/* 爆款对标极简骨架屏与微光扫描 */
.omnimux-trending-skeleton-grid { pointer-events:none; user-select:none; }
.omnimux-trending-skeleton-card {
  position:relative; display:block; aspect-ratio:9/16; overflow:hidden;
  border-radius:16px; background:var(--omnimux-trending-cover-base);
  border:1px solid var(--dsw-alias-border-l1);
  isolation:isolate;
}
.omnimux-trending-skeleton-shimmer {
  position:absolute; inset:0;
  background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-static-neutral-00) 6%, transparent) 50%, transparent 100%);
  animation:omnimux-skeleton-shimmer 1.8s infinite cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events:none;
}
.omnimux-trending-skeleton-top {
  position:absolute; top:12px; left:12px;
}
.omnimux-trending-skeleton-badge {
  display:block; width:38px; height:20px; border-radius:999px;
  background:color-mix(in srgb, var(--dsw-static-neutral-00) 9%, transparent);
}
.omnimux-trending-skeleton-body {
  position:absolute; inset-inline:0; bottom:0; padding:12px;
  display:flex; flex-direction:column; gap:10px;
  background:linear-gradient(to top, var(--omnimux-trending-card-scrim-strong), transparent);
}
.omnimux-trending-skeleton-metrics {
  display:grid; grid-template-columns:repeat(2, minmax(0, 1fr));
  border-bottom:1px solid var(--omnimux-trending-cover-line); padding-bottom:10px;
}
.omnimux-trending-skeleton-metric-box {
  display:flex; flex-direction:column; align-items:center; gap:4px;
}
.omnimux-trending-skeleton-metric-box.is-divider {
  border-left:1px solid var(--omnimux-trending-cover-line);
}
.omnimux-trending-skeleton-metric-val {
  display:block; width:44px; height:14px; border-radius:4px;
  background:color-mix(in srgb, var(--dsw-static-neutral-00) 12%, transparent);
}
.omnimux-trending-skeleton-metric-lbl {
  display:block; width:32px; height:9px; border-radius:3px;
  background:color-mix(in srgb, var(--dsw-static-neutral-00) 7%, transparent);
}
.omnimux-trending-skeleton-title-lines {
  display:flex; flex-direction:column; gap:6px;
}
.omnimux-trending-skeleton-title-line {
  display:block; height:12px; border-radius:4px;
  background:color-mix(in srgb, var(--dsw-static-neutral-00) 10%, transparent);
}
.omnimux-trending-skeleton-title-line.is-long { width:84%; }
.omnimux-trending-skeleton-title-line.is-short { width:58%; }
.omnimux-trending-card-topshade {
  position:absolute; inset-inline:0; top:0; height:22%;
  background:linear-gradient(to bottom, var(--omnimux-trending-card-scrim), transparent);
  pointer-events:none;
}
.omnimux-trending-card-shade {
  position:absolute; inset-inline:0; bottom:0; height:48%;
  background:linear-gradient(to top, var(--omnimux-trending-card-scrim-strong), transparent);
  pointer-events:none;
}
.omnimux-trending-card-region {
  position:absolute; left:12px; top:12px; max-width:70%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  padding:3px 9px; border-radius:999px; font-size:11px; font-weight:500;
  color:var(--omnimux-trending-cover-text); background:var(--omnimux-trending-region-bg);
  border:1px solid var(--omnimux-trending-cover-line); backdrop-filter:blur(8px);
}
.omnimux-trending-card-body {
  position:absolute; inset-inline:0; bottom:0; padding:12px;
  transform:translateY(0); transition:transform 300ms ease-out;
}
.omnimux-trending-card:hover .omnimux-trending-card-body,
.omnimux-trending-card:focus-within .omnimux-trending-card-body { transform:translateY(-50px); }
.omnimux-trending-card-metrics {
  display:grid; grid-template-columns:repeat(2, minmax(0, 1fr));
  border-bottom:1px solid var(--omnimux-trending-cover-line); padding-bottom:10px;
}
.omnimux-trending-card-metric { min-width:0; padding-inline:10px; text-align:center; }
.omnimux-trending-card-metric.is-divider { border-left:1px solid var(--omnimux-trending-cover-line); }
.omnimux-trending-card-metric-value {
  margin:0; font-size:13px; font-weight:700; line-height:1.35;
  color:var(--omnimux-trending-cover-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.omnimux-trending-card-metric-label {
  display:block; margin-top:2px; font-size:9px; font-weight:500;
  letter-spacing:0.06em; text-transform:uppercase; color:var(--omnimux-trending-metric-muted);
}
.omnimux-trending-card-title {
  margin:8px 0 0; min-height:34px;
  font-size:12px; font-weight:500; line-height:17px; color:var(--omnimux-trending-cover-text);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
.omnimux-trending-card-action {
  position:absolute; inset-inline:12px; bottom:12px;
  opacity:0; transform:translateY(12px); pointer-events:none;
  transition:opacity 300ms ease-out, transform 300ms ease-out;
}
.omnimux-trending-card:hover .omnimux-trending-card-action,
.omnimux-trending-card:focus-within .omnimux-trending-card-action {
  opacity:1; transform:translateY(0); pointer-events:auto;
}
.omnimux-trending-recreate-btn {
  display:flex; align-items:center; justify-content:center; gap:6px;
  width:100%; height:40px; box-sizing:border-box; cursor:pointer;
  border-radius:12px; font:inherit; font-size:12px; font-weight:600;
  color:var(--omnimux-trending-cover-text);
  background:var(--omnimux-trending-cover-soft);
  border:1px solid var(--omnimux-trending-cover-line);
  backdrop-filter:blur(10px);
  transition:background-color 200ms ease-out, color 200ms ease-out;
}
.omnimux-trending-recreate-btn:hover:not(:disabled) {
  background:var(--omnimux-trending-cover-hover);
  color:var(--omnimux-trending-cover-text-strong);
}
.omnimux-trending-recreate-btn:disabled { cursor:not-allowed; opacity:0.55; }
.omnimux-trending-card.is-active .omnimux-trending-recreate-btn {
  background:var(--dsw-alias-button-primary-fill);
  color:var(--dsw-alias-button-primary-text);
  border-color:transparent;
}
.omnimux-trending-recreate-icon { display:inline-flex; width:13px; height:13px; }
.omnimux-trending-recreate-icon > svg { width:13px; height:13px; }

/* 矢量封面：六个构图原型 */
.omnimux-trending-cover-svg[data-accent="0"] { --omnimux-trending-accent:var(--omnimux-trending-accent-0); }
.omnimux-trending-cover-svg[data-accent="1"] { --omnimux-trending-accent:var(--omnimux-trending-accent-1); }
.omnimux-trending-cover-svg[data-accent="2"] { --omnimux-trending-accent:var(--omnimux-trending-accent-2); }
.omnimux-trending-cover-svg[data-accent="3"] { --omnimux-trending-accent:var(--omnimux-trending-accent-3); }
.omnimux-trending-cover-base { fill:var(--omnimux-trending-cover-base); }
.omnimux-trending-cover-slat { fill:var(--omnimux-trending-cover-soft); }
.omnimux-trending-cover-skin { fill:var(--omnimux-trending-accent); opacity:0.55; }
.omnimux-trending-cover-garment { fill:var(--omnimux-trending-accent); opacity:0.85; }
.omnimux-trending-cover-seam { stroke:var(--omnimux-trending-cover-deep); stroke-width:1; opacity:0.45; }
.omnimux-trending-cover-outline { fill:none; stroke:var(--omnimux-trending-cover-line); stroke-width:1; }
.omnimux-trending-cover-layer-1 { fill:var(--omnimux-trending-accent); opacity:0.28; }
.omnimux-trending-cover-layer-2 { fill:var(--omnimux-trending-accent); opacity:0.5; }
.omnimux-trending-cover-layer-3 { fill:var(--omnimux-trending-accent); opacity:0.78; }
.omnimux-trending-cover-tagline { fill:var(--omnimux-trending-cover-soft); }
.omnimux-trending-cover-scale { stroke:var(--omnimux-trending-cover-line); stroke-width:1; }
.omnimux-trending-cover-ring-outer { fill:var(--omnimux-trending-accent); opacity:0.22; }
.omnimux-trending-cover-ring-inner { fill:var(--omnimux-trending-accent); opacity:0.55; }
.omnimux-trending-cover-core { fill:var(--omnimux-trending-accent); }
.omnimux-trending-cover-axis { stroke:var(--omnimux-trending-cover-line); stroke-width:1; stroke-dasharray:3 4; }
.omnimux-trending-cover-teeth { stroke:var(--omnimux-trending-accent); stroke-width:2.5; opacity:0.7; }
.omnimux-trending-cover-before { fill:var(--omnimux-trending-cover-deep); }
.omnimux-trending-cover-after { fill:var(--omnimux-trending-accent); opacity:0.8; }
.omnimux-trending-cover-divider { stroke:var(--omnimux-trending-cover-text); stroke-width:1.4; opacity:0.85; }
.omnimux-trending-cover-handle { fill:var(--omnimux-trending-cover-base); stroke:var(--omnimux-trending-cover-text); stroke-width:1; }
.omnimux-trending-cover-handle-arrow { stroke:var(--omnimux-trending-cover-text); stroke-width:1.2; fill:none; }
.omnimux-trending-cover-halo { fill:var(--omnimux-trending-accent); opacity:0.25; }
.omnimux-trending-cover-product { fill:var(--omnimux-trending-accent); opacity:0.9; }
.omnimux-trending-cover-product-cap { fill:var(--omnimux-trending-cover-text); opacity:0.8; }
.omnimux-trending-cover-label { fill:var(--omnimux-trending-cover-base); opacity:0.55; }
.omnimux-trending-cover-shadow { fill:var(--omnimux-trending-cover-deep); opacity:0.6; }
.omnimux-trending-cover-box { fill:var(--omnimux-trending-accent); opacity:0.62; }
.omnimux-trending-cover-box-fold { stroke:var(--omnimux-trending-cover-deep); stroke-width:1.2; fill:none; opacity:0.7; }
.omnimux-trending-cover-item-1 { fill:var(--omnimux-trending-accent); opacity:0.45; }
.omnimux-trending-cover-item-2 { fill:var(--omnimux-trending-accent); opacity:0.9; }
.omnimux-trending-cover-item-3 { fill:var(--omnimux-trending-accent); opacity:0.65; }

/* 空态 */
.omnimux-trending-empty {
  display:flex; flex-direction:column; align-items:center; gap:10px; padding:40px 16px;
  border:1px dashed var(--dsw-alias-border-l2); border-radius:16px;
  color:var(--dsw-alias-label-tertiary);
}
.omnimux-trending-empty > p { margin:0; font-size:13px; }
.omnimux-trending-empty-hint { font-size:12px; opacity:0.75; max-width:520px; text-align:center; }

/* 复刻接管：不复制任何控件，只把原生输入框搬到会话视口底部。
   附件、专家、模型、发送仍全部来自官方 Host，行为与 Hero 完全一致。 */
[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card] {
  position:fixed!important;
  left:var(--omnimux-dock-left, 0px)!important;
  width:var(--omnimux-dock-width, 100%)!important;
  max-width:none!important;
  margin:0!important;
  bottom:var(--omnimux-dock-bottom, 20px)!important;
  z-index:45!important;
}
/* 工作区行留在 Hero：输入框已经搬走，它不该继续悬空显示 */
[data-omnimux-starter-host][data-omnimux-dock-open] [class*="heroWorkspaceRow"] {
  opacity:0!important; pointer-events:none!important;
}
/* 归还原生输入框。原生输入框没有「取消」概念，这是接管期间唯一的自绘控件。 */
.omnimux-trending-undock {
  position:fixed; z-index:46;
  left:calc(var(--omnimux-dock-left, 0px) + var(--omnimux-dock-width, 100%));
  bottom:calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 8px);
  transform:translateX(calc(-100% - 4px));
  display:inline-flex; align-items:center; gap:4px;
  height:26px; box-sizing:border-box; padding:0 10px; cursor:pointer;
  font:inherit; font-size:12px; white-space:nowrap;
  border:1px solid var(--omnimux-trending-menu-ring); border-radius:999px;
  background:var(--omnimux-trending-menu-bg);
  color:var(--dsw-alias-label-secondary);
  transition:color 160ms ease-out;
}
.omnimux-trending-undock:hover { color:var(--dsw-alias-label-primary); }
.omnimux-trending-undock-icon { display:inline-flex; width:12px; height:12px; }
.omnimux-trending-undock-icon > svg { width:12px; height:12px; }

@container trending (min-width:640px) {
  .omnimux-trending-grid { grid-template-columns:repeat(3, minmax(0, 1fr)); }
}
@container trending (min-width:880px) {
  .omnimux-trending-grid { grid-template-columns:repeat(4, minmax(0, 1fr)); }
}
@container trending (min-width:1080px) {
  .omnimux-trending-grid { grid-template-columns:repeat(5, minmax(0, 1fr)); }
}
@container trending (max-width:639px) {
  .omnimux-trending-toolbar { align-items:stretch; }
  .omnimux-trending-toolbar-right { margin-left:0; }
}
@media (prefers-reduced-motion:reduce) {
  .omnimux-trending-card-media, .omnimux-trending-card-body, .omnimux-trending-card-action { transition:none; }
}
`

export function installGuideStyles(doc) {
  const style = doc.createElement('style')
  style.id = GUIDE_STYLE_ID
  style.textContent = GUIDE_CSS
  doc.head.appendChild(style)
  return () => style.remove()
}
