export const GUIDE_STYLE_ID = 'omnimux-session-guide-style'
export const GUIDE_CSS = `
[data-omnimux-starter-host] [data-conversation-scroll] { justify-content:flex-start!important; }
[data-omnimux-starter-host] [data-composer-seat] {
  flex:1 0 auto!important; min-height:100%; display:flex; flex-direction:column;
  justify-content:center!important; padding-block:32px; box-sizing:border-box;
}
[data-omnimux-starter-host] [class*="composerStack"] {
  flex:0 0 auto!important; display:flex; flex-direction:column; justify-content:center!important;
  gap:16px; padding-bottom:0!important;
}
[data-omnimux-starter-host] [class*="composerHero"] > :first-child {
  margin-top:0!important; margin-bottom:4px!important;
}
[data-omnimux-starter-host] [data-slot="conversation.composer.bar"] > * { order:2; }
.omnimux-starter-guide { order:3; }
.omnimux-starter-guide {
  width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px));
  max-width:var(--dsh-chat-content-width); box-sizing:border-box; margin-inline:auto;
  min-width:0; color:var(--dsw-alias-label-primary); font-family:inherit; font-size:13px; line-height:1.5;
}
.omnimux-starter-guide { container-type:inline-size; container-name:starter-guide; padding-top:8px; max-width:928px; }
.omnimux-starter-groups { display:flex; justify-content:center; flex-wrap:wrap; row-gap:24px; width:max-content; max-width:100%; margin-inline:auto; }
.omnimux-starter-group { position:relative; min-width:0; padding-inline:20px; }
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
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-popular-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin: 0 0 16px 2px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-popular-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}
.omnimux-popular-card {
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  padding: 0;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  position: relative;
  outline: none;
}
.omnimux-popular-card:hover {
  transform: translateY(-2px);
  border-color: var(--dsw-alias-border-l3);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-base);
}
.omnimux-popular-card:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.omnimux-popular-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.omnimux-popular-cover svg {
  width: 100%;
  height: 100%;
  display: block;
}
.omnimux-popular-footer {
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-popular-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
}

/* ==================== 营销洞察模态框 (Marketing Insight Modal) ==================== */
.omnimux-insight-overlay {
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
.omnimux-insight-modal {
  position: relative;
  width: 1040px;
  max-width: 95vw;
  height: 660px;
  max-height: 90vh;
  background: var(--dsw-alias-bg-elevated);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  animation: omnimuxScaleUp 180ms ease;
}
.omnimux-insight-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
  z-index: 10;
}
.omnimux-insight-close:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
}
.omnimux-insight-header {
  padding: 24px 32px 16px;
  text-align: center;
  flex: none;
}
.omnimux-insight-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  margin: 0 0 6px;
}
.omnimux-insight-header p {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
  margin: 0 auto;
  max-width: 600px;
  line-height: 1.5;
}
.omnimux-insight-body {
  display: flex;
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-insight-left {
  width: 440px;
  flex: none;
  border-right: 1px solid var(--dsw-alias-border-l1);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  box-sizing: border-box;
}
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
.omnimux-insight-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex: none;
}
.omnimux-insight-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  padding: 0 20px;
  border-radius: 8px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-inverted);
  font-size: 14px;
  font-weight: 600;
  border: 0;
  cursor: pointer;
  transition: background-color 150ms ease, transform 120ms ease;
  box-shadow: 0 2px 8px var(--dsw-alias-state-business-tertiary);
}
.omnimux-insight-submit:hover {
  background: var(--dsw-alias-button-primary-hover);
  transform: translateY(-1px);
}
.omnimux-insight-submit:active {
  transform: translateY(0);
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
.omnimux-u2v-overlay {
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
.omnimux-u2v-modal {
  position: relative;
  width: 1040px;
  max-width: 95vw;
  height: 680px;
  max-height: 90vh;
  background: var(--dsw-alias-bg-elevated);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  animation: omnimuxScaleUp 180ms ease;
}
.omnimux-u2v-header {
  padding: 24px 32px 16px;
  text-align: center;
  flex: none;
}
.omnimux-u2v-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  margin: 0 0 6px;
}
.omnimux-u2v-header p {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
  margin: 0 auto;
  max-width: 600px;
  line-height: 1.5;
}
.omnimux-u2v-body {
  display: flex;
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-u2v-left {
  width: 440px;
  flex: none;
  border-right: 1px solid var(--dsw-alias-border-l1);
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-1);
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
.omnimux-u2v-card-media svg {
  width: 100%;
  height: 100%;
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

.omnimux-u2v-right {
  flex: 1;
  padding: 20px 28px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  box-sizing: border-box;
  min-width: 0;
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
  cursor: pointer;
  accent-color: var(--dsw-alias-brand-primary);
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

.omnimux-u2v-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  flex: none;
}
.omnimux-u2v-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  padding: 0 20px;
  border-radius: 8px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-inverted);
  font-size: 14px;
  font-weight: 600;
  border: 0;
  cursor: pointer;
  transition: background-color 150ms ease, transform 120ms ease;
  box-shadow: 0 2px 8px var(--dsw-alias-state-business-tertiary);
}
.omnimux-u2v-submit:hover {
  background: var(--dsw-alias-button-primary-hover);
  transform: translateY(-1px);
}
.omnimux-u2v-submit:active {
  transform: translateY(0);
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

@keyframes omnimuxFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes omnimuxScaleUp {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

@container starter-guide (max-width:871px) {
  .omnimux-starter-group, .omnimux-starter-group:first-child, .omnimux-starter-group:last-child { padding-inline:12px; }
  .omnimux-starter-group::after { display:none; }
  .omnimux-popular-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .omnimux-insight-modal { height: 92vh; }
  .omnimux-insight-body { flex-direction: column; }
  .omnimux-insight-left { width: 100%; border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1); max-height: 240px; }
}
@media (prefers-reduced-motion:reduce) {
  .omnimux-starter-icon, .omnimux-popular-card, .omnimux-insight-modal, .omnimux-toast-pill { transition:none; animation:none; }
}
`

export function installGuideStyles(doc) {
  const style = doc.createElement('style')
  style.id = GUIDE_STYLE_ID
  style.textContent = GUIDE_CSS
  doc.head.appendChild(style)
  return () => style.remove()
}
