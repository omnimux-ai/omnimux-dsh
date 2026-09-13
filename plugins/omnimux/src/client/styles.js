export const STYLES_ID = 'omnimux-hub-styles'

/** Deep-sea school + caustic shafts (offline SVG, 1:1 with the locked poster). */
const LOGIN_GATE_SEA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 348 520" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e0b3a"/><stop offset="42%" stop-color="#4c1d95"/><stop offset="100%" stop-color="#0f172a"/></linearGradient><radialGradient id="c" cx="50%" cy="10%" r="72%"><stop offset="0%" stop-color="#fae8ff" stop-opacity=".55"/><stop offset="38%" stop-color="#c084fc" stop-opacity=".22"/><stop offset="100%" stop-color="#1e0b3a" stop-opacity="0"/></radialGradient><linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fae8ff" stop-opacity=".32"/><stop offset="100%" stop-color="#fae8ff" stop-opacity="0"/></linearGradient><radialGradient id="j" cx="50%" cy="40%" r="55%"><stop offset="0%" stop-color="#fce7f3" stop-opacity=".85"/><stop offset="55%" stop-color="#e879f9" stop-opacity=".4"/><stop offset="100%" stop-color="#6d28d9" stop-opacity="0"/></radialGradient></defs><rect width="348" height="520" fill="url(#w)"/><rect width="348" height="520" fill="url(#c)"/><g opacity=".75"><polygon points="174,-12 208,520 142,520" fill="url(#r)"/><polygon points="88,-24 72,520 28,520" fill="url(#r)" opacity=".55"/><polygon points="268,-18 312,520 262,520" fill="url(#r)" opacity=".5"/></g><g fill="#f5d0fe" opacity=".38"><circle cx="36" cy="72" r="1.2"/><circle cx="92" cy="128" r=".9"/><circle cx="148" cy="64" r="1.1"/><circle cx="210" cy="96" r=".8"/><circle cx="268" cy="58" r="1"/><circle cx="48" cy="190" r=".7"/><circle cx="310" cy="170" r=".9"/><circle cx="180" cy="150" r=".6"/><circle cx="24" cy="260" r=".8"/><circle cx="300" cy="240" r="1"/><circle cx="120" cy="300" r=".7"/><circle cx="240" cy="280" r=".8"/></g><ellipse cx="64" cy="86" rx="30" ry="34" fill="url(#j)" opacity=".5"/><ellipse cx="292" cy="124" rx="22" ry="26" fill="url(#j)" opacity=".38"/><g fill="#e9d5ff"><g opacity=".62" transform="translate(42 188) rotate(-22)"><ellipse cx="0" cy="0" rx="8" ry="2.5"/><polygon points="7 0 13.5 -3.1 13.5 3.1"/></g><g opacity=".5" transform="translate(68 206) rotate(-16)"><ellipse cx="0" cy="0" rx="6.5" ry="2.1"/><polygon points="5.5 0 11 -2.6 11 2.6"/></g><g opacity=".55" transform="translate(54 224) rotate(-28)"><ellipse cx="0" cy="0" rx="7.2" ry="2.3"/><polygon points="6.2 0 12 -2.8 12 2.8"/></g><g opacity=".42" transform="translate(96 198) rotate(-10)"><ellipse cx="0" cy="0" rx="5.8" ry="1.9"/><polygon points="5 0 10 -2.2 10 2.2"/></g><g opacity=".48" transform="translate(84 236) rotate(-20)"><ellipse cx="0" cy="0" rx="6.2" ry="2"/><polygon points="5.4 0 10.6 -2.4 10.6 2.4"/></g><g opacity=".4" transform="translate(118 218) rotate(-8)"><ellipse cx="0" cy="0" rx="5.4" ry="1.8"/><polygon points="4.6 0 9.4 -2.1 9.4 2.1"/></g><g opacity=".46" transform="translate(246 250) rotate(18)"><ellipse cx="0" cy="0" rx="7" ry="2.2"/><polygon points="-7 0 -13.2 -2.8 -13.2 2.8"/></g><g opacity=".36" transform="translate(272 268) rotate(24)"><ellipse cx="0" cy="0" rx="5.6" ry="1.8"/><polygon points="-5 0 -10.4 -2.2 -10.4 2.2"/></g><g opacity=".4" transform="translate(228 272) rotate(12)"><ellipse cx="0" cy="0" rx="6.4" ry="2"/><polygon points="-5.6 0 -11.2 -2.5 -11.2 2.5"/></g></g></svg>'
const LOGIN_GATE_SEA_URI = `url("data:image/svg+xml,${encodeURIComponent(LOGIN_GATE_SEA_SVG)}")`

/** Translucent glowing moon-jellyfish, matching the locked poster subject. */
const LOGIN_GATE_JELLY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280" preserveAspectRatio="xMidYMid meet"><defs><radialGradient id="bell" cx="50%" cy="36%" r="58%"><stop offset="0%" stop-color="#fff7fb" stop-opacity=".96"/><stop offset="22%" stop-color="#f9a8d4" stop-opacity=".82"/><stop offset="52%" stop-color="#d8b4fe" stop-opacity=".55"/><stop offset="78%" stop-color="#a855f7" stop-opacity=".22"/><stop offset="100%" stop-color="#6d28d9" stop-opacity="0"/></radialGradient><radialGradient id="core" cx="48%" cy="40%" r="28%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".95"/><stop offset="100%" stop-color="#f472b6" stop-opacity="0"/></radialGradient><linearGradient id="tent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fce7f3" stop-opacity=".9"/><stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/></linearGradient><filter id="soft" x="-25%" y="-25%" width="150%" height="170%"><feGaussianBlur stdDeviation="1.8"/></filter></defs><g fill="none" stroke="url(#tent)" stroke-linecap="round" filter="url(#soft)" opacity=".9"><path stroke-width="2.4" d="M108 128 C96 168 86 204 78 252"/><path stroke-width="2.1" d="M122 132 C112 176 116 214 108 258"/><path stroke-width="2.6" d="M140 134 C138 180 146 220 142 262"/><path stroke-width="2.2" d="M156 132 C164 176 158 216 168 258"/><path stroke-width="2.5" d="M172 128 C186 170 190 208 198 250"/><path stroke-width="1.7" d="M114 130 C104 178 98 216 94 256"/><path stroke-width="1.8" d="M166 130 C176 178 184 214 190 254"/><path stroke-width="1.5" d="M132 134 C126 186 130 222 124 260"/></g><g fill="#fbcfe8" opacity=".38" filter="url(#soft)"><ellipse cx="140" cy="152" rx="16" ry="40"/><ellipse cx="124" cy="156" rx="10" ry="32"/><ellipse cx="156" cy="156" rx="10" ry="32"/></g><ellipse cx="140" cy="108" rx="86" ry="74" fill="url(#bell)"/><ellipse cx="138" cy="98" rx="46" ry="34" fill="url(#core)"/><path d="M64 116 Q140 162 216 116" fill="none" stroke="#fce7f3" stroke-width="2.2" opacity=".55"/><path d="M78 108 Q140 96 202 108" fill="none" stroke="#ffffff" stroke-width="1.4" opacity=".4"/><ellipse cx="118" cy="92" rx="10" ry="6" fill="#ffffff" opacity=".28"/></svg>'
const LOGIN_GATE_JELLY_URI = `url("data:image/svg+xml,${encodeURIComponent(LOGIN_GATE_JELLY_SVG)}")`

export const HUB_CSS = `
/* ── OmniMux 原生蓝色元素中性化重构 (精准覆盖原生蓝色，保留 DSH 原生黑白底色与层次) ── */
:root,
body {
  /* DeepSeek 蓝系列全面中性化 (浅色模式复用原生深色中性灰阶) */
  --dsw-static-deepseek-50: var(--dsw-static-neutral-bluish-50);
  --dsw-static-deepseek-100: var(--dsw-static-neutral-bluish-100);
  --dsw-static-deepseek-200: var(--dsw-static-neutral-bluish-200);
  --dsw-static-deepseek-300: var(--dsw-static-neutral-bluish-300);
  --dsw-static-deepseek-400: var(--dsw-static-neutral-bluish-600);
  --dsw-static-deepseek-450: var(--dsw-static-neutral-bluish-700);
  --dsw-static-deepseek-500: var(--dsw-static-neutral-bluish-1000);
  --dsw-static-deepseek-600: var(--dsw-static-neutral-bluish-1000);
  --dsw-static-deepseek-700-delete: var(--dsw-static-neutral-bluish-1000);
  --dsw-static-deepseek-800: var(--dsw-static-neutral-bluish-1000);
  --dsw-static-deepseek-900: var(--dsw-static-neutral-bluish-1000);

  /* 常规蓝色系列全面中性化 */
  --dsw-static-blue-50: var(--dsw-static-neutral-bluish-50);
  --dsw-static-blue-50p: var(--dsw-static-neutral-bluish-50);
  --dsw-static-blue-75: var(--dsw-static-neutral-bluish-75);
  --dsw-static-blue-100: var(--dsw-static-neutral-bluish-100);
  --dsw-static-blue-300: var(--dsw-static-neutral-bluish-300);
  --dsw-static-blue-400: var(--dsw-static-neutral-bluish-600);
  --dsw-static-blue-450: var(--dsw-static-neutral-bluish-700);
  --dsw-static-blue-500: var(--dsw-static-neutral-bluish-800);
  --dsw-static-blue-600: var(--dsw-static-neutral-bluish-1000);
  --dsw-static-blue-800: var(--dsw-static-neutral-bluish-1000);
  --dsw-static-blue-900: var(--dsw-static-neutral-bluish-1000);
  --dsw-static-blue-950: var(--dsw-static-neutral-bluish-1000);

  /* 消除原生蓝色语义关联 */
  --dsw-alias-brand-primary-new-colorprimary-new-color: var(--dsw-alias-label-primary);
  --dsw-alias-button-info-fill: var(--dsw-alias-label-primary);
  --dsw-alias-button-info-hover: var(--dsw-alias-interactive-bg-hover);
  --dsw-alias-state-business-primary: var(--dsw-alias-label-primary);
  --dsw-alias-state-business-tertiary: var(--dsw-alias-bg-layer-2);
  --dsw-alias-label-primary-bluish: var(--dsw-alias-label-primary);
  --dsw-alias-primary: var(--dsw-alias-label-primary);
  --dsw-alias-primary-hover: var(--dsw-alias-interactive-bg-hover);
  --dsw-alias-brand: var(--dsw-alias-label-primary);
  --dsw-alias-brand-primary: var(--dsw-alias-label-primary);
  --dsw-alias-brand-accent: var(--dsw-alias-label-primary);
  --dsw-alias-accent-primary: var(--dsw-alias-label-primary);
  --dsw-alias-state-publishing: var(--dsw-alias-label-primary);
  --dsw-alias-link: var(--dsw-alias-label-primary);
  --wb-accent: var(--dsw-alias-label-primary);
  --dsw-specific-bubble-highlight: var(--dsw-alias-bg-layer-2);
  --dsw-specific-bubble: var(--dsw-alias-bg-layer-1);
  --dsw-specific-sidebar-nav-item-active-accent: var(--dsw-alias-bg-layer-2);
}

body[data-ds-dark-theme] {
  /* DeepSeek 蓝系列全面中性化 (深色模式复用原生高质感浅色灰阶与纯白) */
  --dsw-static-deepseek-50: var(--dsw-static-neutral-bluish-850);
  --dsw-static-deepseek-100: var(--dsw-static-neutral-bluish-800);
  --dsw-static-deepseek-200: var(--dsw-static-neutral-bluish-750);
  --dsw-static-deepseek-300: var(--dsw-static-neutral-bluish-600);
  --dsw-static-deepseek-400: var(--dsw-static-neutral-bluish-300);
  --dsw-static-deepseek-450: var(--dsw-static-neutral-bluish-100);
  --dsw-static-deepseek-500: var(--dsw-static-neutral-bluish-00);
  --dsw-static-deepseek-600: var(--dsw-static-neutral-bluish-00);
  --dsw-static-deepseek-700-delete: var(--dsw-static-neutral-bluish-100);
  --dsw-static-deepseek-800: var(--dsw-static-neutral-bluish-850);
  --dsw-static-deepseek-900: var(--dsw-static-neutral-bluish-900);

  /* 常规蓝色系列全面中性化 */
  --dsw-static-blue-50: var(--dsw-static-neutral-bluish-850);
  --dsw-static-blue-50p: var(--dsw-static-neutral-bluish-850);
  --dsw-static-blue-75: var(--dsw-static-neutral-bluish-800);
  --dsw-static-blue-100: var(--dsw-static-neutral-bluish-800);
  --dsw-static-blue-300: var(--dsw-static-neutral-bluish-600);
  --dsw-static-blue-400: var(--dsw-static-neutral-bluish-300);
  --dsw-static-blue-450: var(--dsw-static-neutral-bluish-100);
  --dsw-static-blue-500: var(--dsw-static-neutral-bluish-50);
  --dsw-static-blue-600: var(--dsw-static-neutral-bluish-00);
  --dsw-static-blue-800: var(--dsw-static-neutral-bluish-100);
  --dsw-static-blue-900: var(--dsw-static-neutral-bluish-200);
  --dsw-static-blue-950: var(--dsw-static-neutral-bluish-300);

  /* 消除原生蓝色语义关联 */
  --dsw-alias-brand-primary-new-colorprimary-new-color: var(--dsw-alias-label-primary);
  --dsw-alias-button-info-fill: var(--dsw-alias-label-primary);
  --dsw-alias-button-info-hover: var(--dsw-alias-interactive-bg-hover);
  --dsw-alias-state-business-primary: var(--dsw-alias-label-primary);
  --dsw-alias-state-business-tertiary: var(--dsw-alias-bg-layer-2);
  --dsw-alias-label-primary-bluish: var(--dsw-alias-label-primary);
  --dsw-alias-primary: var(--dsw-alias-label-primary);
  --dsw-alias-primary-hover: var(--dsw-alias-interactive-bg-hover);
  --dsw-alias-brand: var(--dsw-alias-label-primary);
  --dsw-alias-brand-primary: var(--dsw-alias-label-primary);
  --dsw-alias-brand-accent: var(--dsw-alias-label-primary);
  --dsw-alias-accent-primary: var(--dsw-alias-label-primary);
  --dsw-alias-state-publishing: var(--dsw-alias-label-primary);
  --dsw-alias-link: var(--dsw-alias-label-primary);
  --wb-accent: var(--dsw-alias-label-primary);
  --dsw-specific-bubble-highlight: var(--dsw-alias-bg-layer-2);
  --dsw-specific-bubble: var(--dsw-alias-bg-layer-1);
  --dsw-specific-sidebar-nav-item-active-accent: var(--dsw-alias-bg-layer-2);
}

/* 3. DSH 原生特异组件黑白化 */
/* 会话中思考/回复流光动画：由原先的蓝光转变为高质感金属银白流光 */
.turnStatus,
[class*="turnStatus"] {
  background: linear-gradient(
    90deg,
    var(--dsw-alias-label-secondary) 0%,
    var(--dsw-alias-label-secondary) 40%,
    var(--dsw-alias-label-primary) 50%,
    var(--dsw-alias-label-secondary) 60%,
    var(--dsw-alias-label-secondary) 100%
  ) !important;
  background-position: 100% 0 !important;
  background-size: 250% 100% !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}

/* 进行中状态指示点：纯净高亮白呼吸光 */
[class*="StateDot"],
[class*="stateDot"],
.dsh-state-ongoing {
  --dsh-state-ongoing: var(--dsw-alias-label-primary) !important;
}

/* 上下文容量计量条：黑白灰高对比 */
[class*="ContextMeter"],
[class*="contextMeter"],
.context-meter-fill {
  --meter-tint: var(--dsw-alias-label-secondary) !important;
}

/* 全局文字选区与 Focus Ring：去除浏览器默认蓝 */
::selection {
  background: var(--dsw-alias-label-primary) !important;
  color: var(--dsw-alias-bg-base) !important;
}

:focus-visible {
  outline: 1px solid var(--dsw-alias-border-l3) !important;
  outline-offset: 1px;
}

/* ── 复合输入控件内部不叠加原生 outline（防「双重边框」） ──
   dsh-ui-kit 的 InputField / SearchField 由外层容器绘制圆角边框与 :focus-within
   聚焦环，内部原生 input 若再吃到上面的 :focus-visible（带 !important，权重高于
   Kit 自身的 .input{outline:none}），就会在圆角框里多出一个直角框。
   聚焦可见性由外层容器保留（边框高亮 + box-shadow），键盘可达性不受影响。
   选择器权重 0,2,1 > 0,1,0 且同为 !important，故可稳定胜出。 */
[class*="InputField-control"] input:focus,
[class*="InputField-control"] input:focus-visible,
[class*="SearchField-root"] input:focus,
[class*="SearchField-root"] input:focus-visible {
  outline: none !important;
  outline-offset: 0 !important;
}

/* ── 发送/停止按钮 黑白主题高对比反色重构（根除官方写死白字导致的白底白字失真） ── */
/* 浅色模式 */
[class*="InputBar"] [class*="trailing"] button[class*="primary"],
[data-composer-card] [class*="trailing"] button[class*="primary"] {
  background: var(--dsw-specific-selector, rgba(0, 0, 0, 0.06)) !important;
  color: var(--dsw-alias-label-secondary, #71717a) !important;
  opacity: 1 !important;
  transition: background-color 150ms ease, color 150ms ease !important;
}

[class*="InputBar"] [class*="trailing"] button[class*="primary"]:not(:disabled),
[data-composer-card] [class*="trailing"] button[class*="primary"]:not(:disabled) {
  background: var(--dsw-alias-label-primary, #000000) !important;
  color: var(--dsw-alias-bg-base, #ffffff) !important;
}

[class*="InputBar"] [class*="trailing"] button[class*="primary"]:not(:disabled):hover,
[data-composer-card] [class*="trailing"] button[class*="primary"]:not(:disabled):hover {
  background: var(--dsw-alias-label-secondary, #27272a) !important;
}

/* 深色模式 */
body[data-ds-dark-theme] [class*="InputBar"] [class*="trailing"] button[class*="primary"],
body[data-ds-dark-theme] [data-composer-card] [class*="trailing"] button[class*="primary"] {
  background: var(--dsw-specific-selector, rgba(255, 255, 255, 0.08)) !important;
  color: var(--dsw-alias-label-secondary, #a1a1aa) !important;
  opacity: 1 !important;
}

body[data-ds-dark-theme] [class*="InputBar"] [class*="trailing"] button[class*="primary"]:not(:disabled),
body[data-ds-dark-theme] [data-composer-card] [class*="trailing"] button[class*="primary"]:not(:disabled) {
  background: var(--dsw-alias-label-primary, #ffffff) !important;
  color: var(--dsw-alias-bg-base, #000000) !important;
}

body[data-ds-dark-theme] [class*="InputBar"] [class*="trailing"] button[class*="primary"]:not(:disabled):hover,
body[data-ds-dark-theme] [data-composer-card] [class*="trailing"] button[class*="primary"]:not(:disabled):hover {
  background: var(--dsw-alias-label-secondary, #e4e4e7) !important;
}

/* Accounts and Inspiration already inset their entire content root by 20px. */
:is(.omnimux-assets-stage, .omnimux-products-stage, .omnimux-publish-stage,
    .omnimux-analytics-stage, .omnimux-workflow-library-page)
  > [role="separator"][aria-orientation="horizontal"] {
  width: auto;
  margin-inline: 20px;
}
.omnimux-assets-stage > [role="separator"][aria-orientation="horizontal"] {
  margin-inline: 24px;
}
.omnimux-analytics-stage > .omnimux-analytics-stage-filter {
  margin-inline: 20px;
  padding-inline: 0;
}
@media (max-width: 720px) {
  .omnimux-workflow-library-page > [role="separator"][aria-orientation="horizontal"] {
    margin-inline: 12px;
  }
}
.omnimux-apps-stage {
  position: fixed;
  z-index: 200;
  top: var(--stage-top);
  left: var(--stage-left);
  width: var(--stage-width);
  height: var(--stage-height);
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-primary, var(--dsw-bg, #111));
  color: var(--dsw-alias-label-primary, inherit);
  overflow: auto;
  pointer-events: auto;
}
.omnimux-apps-stage[data-visible="false"] {
  display: none;
  pointer-events: none;
}
.omnimux-apps-stage-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

/* ── OmniMux universal login gate (1:1 with docs/prototypes/omnimux-login-gate-modal.html) ── */
.omnimux-login-gate-backdrop,
.omnimux-login-gate-backdrop *,
.omnimux-login-gate-dialog,
.omnimux-login-gate-dialog * {
  box-sizing: border-box;
}
.omnimux-login-gate-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.75));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.omnimux-login-gate-dialog {
  /* Locked dark-card CTA: solid white on the deep-sea poster, never ghost-hover tokens. */
  --login-gate-cta-bg: #ffffff;
  --login-gate-cta-text: #09090b; /* --dsw- */
  --login-gate-cta-hover: #f4f4f5; /* --dsw- */
  --login-gate-cta-active: #e4e4e7; /* --dsw- */
  position: relative;
  width: 820px;
  height: 520px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  display: flex;
  overflow: hidden;
  border-radius: 20px;
  background: var(--dsw-alias-surface-raised, var(--dsw-alias-bg-elevated, #161618));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.1));
  box-shadow:
    0 24px 64px -12px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.75)),
    0 0 40px color-mix(in srgb, var(--dsw-alias-brand-primary, #7c3aed) 18%, transparent);
  color: var(--dsw-alias-label-primary, inherit);
}
.omnimux-modal-close-btn {
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
.omnimux-modal-close-btn:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l2);
  transform: scale(1.08);
}
.omnimux-modal-close-btn:active {
  transform: scale(0.96);
}
.omnimux-modal-close-btn svg {
  pointer-events: none;
  display: block;
}
.omnimux-modal-close-btn.is-external {
  position: absolute;
  top: 0px;
  right: -50px;
}
@media (max-width: 1280px) {
  .omnimux-modal-close-btn.is-external {
    top: 14px;
    right: 14px;
    background: var(--dsw-alias-bg-layer-3);
  }
}
.omnimux-modal-close-btn.is-top-right {
  position: absolute;
  top: 16px;
  right: 16px;
}
.omnimux-modal-close-btn.is-inline {
  position: static;
  flex-shrink: 0;
}
.omnimux-login-gate-close {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 20;
}
.omnimux-login-gate-hero {
  position: relative;
  width: 348px;
  flex: 0 0 348px;
  height: 100%;
  padding: 32px 30px 36px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  user-select: none;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--dsw-alias-brand-primary, #4c1d95) 55%, #3b0764) 0%, /* exempt-ui03: 登录门禁背景渐变深色底 */
    var(--dsw-alias-brand-primary, #6d28d9) 45%,
    #3b0764 100% /* exempt-ui03: 登录门禁背景渐变深色底 */
  );
}
.omnimux-login-gate-hero::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 48px;
  background: linear-gradient(
    to right,
    transparent 0%,
    color-mix(in srgb, var(--dsw-alias-bg-primary, #141416) 35%, transparent) 50%,
    var(--dsw-alias-bg-primary, #141416) 100%
  );
  pointer-events: none;
  z-index: 6;
}
.omnimux-login-gate-hero-glow {
  position: absolute;
  top: 15%;
  left: 50%;
  width: 220px;
  height: 220px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(
    circle at center,
    color-mix(in srgb, var(--dsw-alias-brand-primary, #ec4899) 40%, transparent) 0%,
    color-mix(in srgb, var(--dsw-alias-brand-primary, #a855f7) 25%, transparent) 40%,
    transparent 70%
  );
  filter: blur(28px);
  pointer-events: none;
  animation: omnimux-login-gate-pulse 5s ease-in-out infinite alternate;
}
.omnimux-login-gate-hero-media {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 50% 25%, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 25%, transparent) 0%, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 14%, transparent) 30%, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 5%, transparent) 55%, transparent 75%),
    url('https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80'),
    ${LOGIN_GATE_SEA_URI};
  background-size: cover;
  background-position: center 25%;
  mix-blend-mode: overlay;
  opacity: 0.92;
  transform: scale(1.04);
  animation: omnimux-login-gate-float 12s ease-in-out infinite alternate;
  pointer-events: none;
}
.omnimux-login-gate-hero-jellyfish {
  position: absolute;
  top: 15px;
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  height: 280px;
  object-fit: cover;
  object-position: center;
  background-image: ${LOGIN_GATE_JELLY_URI};
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
  mask-image: radial-gradient(ellipse at 50% 54%, black 20%, transparent 68%);
  -webkit-mask-image: radial-gradient(ellipse at 50% 54%, black 20%, transparent 68%);
  opacity: 0.92;
  filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.45)) contrast(1.15) brightness(1.08); /* exempt-ui03: 果冻发光投影 */
  pointer-events: none;
}
.omnimux-login-gate-hero-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--dsw-alias-bg-mask-1, #0f0823) 45%, transparent) 0%,
    color-mix(in srgb, var(--dsw-alias-bg-mask-1, #140a2d) 12%, transparent) 28%,
    transparent 45%,
    color-mix(in srgb, var(--dsw-alias-bg-mask-1, #140a2d) 45%, transparent) 70%,
    color-mix(in srgb, var(--dsw-alias-bg-mask-1, #0f0823) 88%, transparent) 100%
  );
  pointer-events: none;
  z-index: 5;
}
.omnimux-login-gate-hero-type {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
  padding-bottom: 8px;
  overflow: visible;
}
.omnimux-login-gate-hero-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--dsw-alias-label-primary, #e9d5ff) 88%, #c084fc); /* exempt-ui03: 门禁标签辅助色 */
  margin-bottom: 6px;
  opacity: 0.9;
}
.omnimux-login-gate-hero-tag-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary, #c084fc);
  box-shadow: 0 0 8px var(--dsw-alias-brand-primary, #c084fc);
}
.omnimux-login-gate-hero-brand {
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.8px;
  line-height: 1.05;
  color: var(--dsw-alias-label-primary, #fff);
  text-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 20px color-mix(in srgb, var(--dsw-alias-brand-primary, #a855f7) 30%, transparent); /* exempt-ui03: 品牌大字阴影 */
}
.omnimux-login-gate-hero-title,
.omnimux-login-gate-hero-ai {
  font-family: 'Cinzel', 'Playfair Display', 'Didot', 'Songti SC', 'STSong', Georgia, serif;
  font-size: 70px; /* exempt-ui10: 登录门禁 Hero 品牌大字，非一级 Stage 页头 */
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -1.5px;
  margin-top: 2px;
  padding-bottom: 6px;
  overflow: visible;
  background: linear-gradient(180deg, var(--dsw-alias-label-primary, #fff) 30%, color-mix(in srgb, var(--dsw-alias-brand-primary, #e9d5ff) 70%, #fff) 100%); /* exempt-ui03: 文字渐变 */
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  text-shadow: none;
  filter: drop-shadow(0 6px 24px rgba(0, 0, 0, 0.6)); /* exempt-ui03: 标题投影 */
}
.omnimux-login-gate-content {
  position: relative;
  width: 472px;
  flex: 1 1 472px;
  height: 100%;
  padding: 42px 40px 36px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--dsw-alias-bg-primary, #141416);
}
.omnimux-login-gate-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.omnimux-login-gate-brand-logo {
  position: relative;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 8px;
  overflow: visible;
  background: #b8b7ff; /* exempt-ui03: 登录门禁香芋紫品牌底板 */
  border: 1px solid color-mix(in srgb, #7961f2 25%, transparent); /* exempt-ui03: 品牌锁扣边框 */
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 0 10px color-mix(in srgb, #7961f2 15%, transparent); /* exempt-ui03: 品牌锁扣阴影 */
}
.omnimux-login-gate-brand-logo::before {
  content: '';
  position: absolute;
  inset: -3px;
  border: 1px dashed color-mix(in srgb, #7961f2 45%, transparent); /* exempt-ui03: 品牌虚线框 */
  border-radius: 11px;
  pointer-events: none;
}
.omnimux-login-gate-brand-logo svg {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 7px;
}
.omnimux-login-gate-brand-title {
  font-family: 'Playfair Display', 'Cinzel', 'Didot', 'Songti SC', 'STSong', Georgia, serif;
  font-size: 22px; /* exempt-ui10: 登录门禁品牌标题衬线字，非一级 Stage 页头 */
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--dsw-alias-label-primary, #fff);
}
.omnimux-login-gate-headline {
  margin: 0 0 10px;
  font-size: 22px; /* exempt-ui10: 登录门禁营销标题，非一级 Stage 页头 */
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.3px;
  color: var(--dsw-alias-label-primary, #fff);
}
.omnimux-login-gate-subdeck {
  margin: 0 0 26px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, #a1a1aa);
}
.omnimux-login-gate-features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.omnimux-login-gate-feature {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14.5px; /* exempt-ui10: 登录门禁营销正文微调，非 Stage 页头 */
  line-height: 1.45;
  color: var(--dsw-alias-label-secondary, #d4d4d8);
}
.omnimux-login-gate-bullet {
  width: 6px;
  height: 6px;
  margin-top: 7px;
  flex: 0 0 6px;
  border-radius: 1px;
  background: var(--dsw-alias-label-tertiary, #71717a);
}
.omnimux-login-gate-footer {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  margin-top: 24px;
}
.omnimux-login-gate-cta {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 40px !important;
  padding: 0 28px !important;
  font-size: 14.5px !important; /* exempt-ui10: 登录门禁营销正文微调，非 Stage 页头 */
  font-weight: 700 !important;
  border-radius: 8px !important;
  border: none !important;
  background: var(--login-gate-cta-bg, #ffffff) !important;
  color: var(--login-gate-cta-text, #09090b) !important; /* --dsw- */
  box-shadow: 0 4px 14px rgba(255, 255, 255, 0.15) !important; /* exempt-ui03: CTA发光阴影 */
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  cursor: pointer !important;
  text-decoration: none !important;
}
.omnimux-login-gate-cta:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--login-gate-cta-hover, #f4f4f5) !important; /* --dsw- */
  color: var(--login-gate-cta-text, #09090b) !important; /* --dsw- */
  transform: translateY(-1px) !important;
  box-shadow: 0 6px 20px rgba(255, 255, 255, 0.25) !important; /* exempt-ui03: CTA Hover阴影 */
}
.omnimux-login-gate-cta:active:not(:disabled):not([aria-disabled="true"]) {
  background: var(--login-gate-cta-active, #e4e4e7) !important; /* --dsw- */
  color: var(--login-gate-cta-text, #09090b) !important; /* --dsw- */
  transform: translateY(0) !important;
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.15) !important; /* exempt-ui03: CTA Active阴影 */
}
.omnimux-login-gate-waiting {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
}
.omnimux-login-gate-reopen {
  flex: 0 0 auto;
  height: 32px !important;
  padding: 0 10px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: var(--dsw-alias-label-secondary, #d4d4d8) !important;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.omnimux-login-gate-reopen:hover {
  color: var(--dsw-alias-label-primary, #ffffff) !important;
}
.omnimux-login-gate-waiting-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #d4d4d8);
}
.omnimux-login-gate-spinner {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border: 2px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.2));
  border-top-color: var(--dsw-alias-brand-primary, #a855f7);
  border-radius: 50%;
  animation: omnimux-login-gate-spin 0.8s linear infinite;
}
.omnimux-login-gate-code {
  font-family: var(--dsw-font-markdown-code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #9333ea) 25%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #9333ea) 40%, transparent);
  color: color-mix(in srgb, var(--dsw-alias-label-primary, #d8b4fe) 80%, var(--dsw-alias-brand-primary, #d8b4fe));
}
.omnimux-login-gate-hint {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, inherit);
  line-height: 1.5;
}
.omnimux-login-gate-error {
  margin: 0;
  width: 100%;
  font-size: 12px;
  color: var(--dsw-alias-label-error, var(--dsw-alias-state-error-primary, inherit));
  line-height: 1.5;
}
.omnimux-login-gate-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
@keyframes omnimux-login-gate-float {
  0% { transform: scale(1.02) translateY(0); }
  100% { transform: scale(1.06) translateY(-6px); }
}
@keyframes omnimux-login-gate-jelly {
  0% { transform: translateX(-50%) translateY(0) scale(1); }
  100% { transform: translateX(-50%) translateY(-8px) scale(1.03); }
}
@keyframes omnimux-login-gate-pulse {
  0% { opacity: 0.5; transform: translateX(-50%) scale(0.92); }
  100% { opacity: 0.95; transform: translateX(-50%) scale(1.12); }
}
@keyframes omnimux-login-gate-spin {
  to { transform: rotate(360deg); }
}
@media (max-width: 860px) {
  .omnimux-login-gate-dialog {
    width: 92vw;
    height: auto;
    max-height: calc(100vh - 24px);
    flex-direction: column;
  }
  .omnimux-login-gate-hero,
  .omnimux-login-gate-content {
    width: 100%;
    flex: none;
  }
  .omnimux-login-gate-hero {
    height: 220px;
    padding: 24px;
  }
  .omnimux-login-gate-hero-title,
  .omnimux-login-gate-hero-ai { font-size: 52px; /* exempt-ui10: Hero 品牌大字 */ line-height: 1.08; padding-bottom: 4px; }
  .omnimux-login-gate-hero-brand { font-size: 24px; }
  .omnimux-login-gate-content { padding: 28px 24px; }
}

.omnimux-profile {
  padding: 20px;
  color: var(--dsw-alias-label-primary, var(--dsw-text-primary, inherit));
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 520px;
}
.omnimux-profile-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.omnimux-profile-card {
  background: var(--dsw-alias-bg-primary, rgba(127,127,127,.08));
  border: 1px solid var(--dsw-alias-border-l2, var(--dsw-border, rgba(127,127,127,.35)));
  border-radius: 10px;
  padding: 14px 16px;
}
.omnimux-profile-card--identity,
.omnimux-profile-card--quota {
  display: flex;
  align-items: center;
}
.omnimux-profile-card--identity { gap: 12px; }
.omnimux-profile-card--quota { gap: 16px; }
.omnimux-profile-card--details { padding: 4px 16px; }
.omnimux-profile-card--signed-out {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.omnimux-profile-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.omnimux-profile-name {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-profile-username {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(127,127,127,.9)));
}
.omnimux-profile-status {
  margin-left: auto;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(127,127,127,.9)));
}
.omnimux-profile-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-label-accent, #3fb950);
}
.omnimux-profile-error {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-error, #e5534b);
  line-height: 1.5;
}
.omnimux-profile-quota {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}
.omnimux-profile-label {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(127,127,127,.9)));
}
.omnimux-profile-value {
  font-size: 13px;
  color: var(--dsw-alias-label-primary, var(--dsw-text-primary, inherit));
  word-break: break-all;
  text-align: right;
}
.omnimux-profile-quota-amount {
  font-size: 22px; /* exempt-ui10: 配额数字强调，非标题 */
  font-weight: 600;
  line-height: 1.2;
}
.omnimux-profile-quota-used {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(127,127,127,.9)));
}
.omnimux-profile-quota-track {
  height: 4px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l2, var(--dsw-border, rgba(127,127,127,.35)));
  overflow: hidden;
  margin-top: 2px;
}
.omnimux-profile-quota-fill {
  width: var(--quota-used);
  height: 100%;
  border-radius: 2px;
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary, #fff));
}
.omnimux-profile-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  padding: 9px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2, var(--dsw-border, rgba(127,127,127,.35)));
}
.omnimux-profile-row[data-last="true"] { border-bottom: none; }
.omnimux-profile-message {
  margin: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(127,127,127,.9)));
  line-height: 1.5;
}
.omnimux-profile-logout { align-self: flex-start; }
.omnimux-avatar {
  position: relative;
  cursor: pointer;
  flex: 0 0 auto;
}
.omnimux-avatar-edit {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.55));
  color: var(--dsw-alias-label-primary-inverted, #fff);
  font-size: 11px;
  opacity: 0;
  transition: opacity .15s ease;
  pointer-events: none;
}
.omnimux-avatar:hover .omnimux-avatar-edit { opacity: 1; }
.omnimux-profile-avatar-face,
.omnimux-profile-avatar-img {
  width: var(--avatar-size, 44px);
  height: var(--avatar-size, 44px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary, #fff));
  color: var(--dsw-alias-label-primary-inverted, #000);
}
.omnimux-profile-avatar-img {
  display: block;
  object-fit: cover;
  background: none;
}
.omnimux-profile-avatar-face[data-large="true"] { font-size: 28px; }
.omnimux-profile-avatar-preview { display: flex; justify-content: center; }
.omnimux-profile-hues {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.omnimux-profile-hues-label {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(127,127,127,.9)));
}
.omnimux-profile-hue-swatch {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: hsl(var(--hue) 70% 55%);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2, rgba(127,127,127,.35));
}
.omnimux-profile-hue[data-active="true"] .omnimux-profile-hue-swatch {
  box-shadow: inset 0 0 0 2px var(--dsw-alias-label-primary, inherit);
}
.omnimux-profile-avatar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.omnimux-profile-hint {
  margin: 0;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(127,127,127,.9)));
}

.omnimux-plugins {
  padding: 0 20px 24px;
  color: var(--dsw-alias-label-primary, var(--dsw-text-primary, inherit));
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.omnimux-plugins-toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
}
.omnimux-plugins-search { flex: 0 1 280px; max-width: 280px; }
.omnimux-plugins-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  align-items: stretch;
  gap: 12px;
}
.omnimux-plugins-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 176px;
  border-radius: 12px;
  padding: 16px;
  background: var(--dsw-alias-bg-secondary, rgba(255,255,255,0.04));
  border: 1px solid var(--dsw-alias-border, rgba(255,255,255,0.08));
}
.omnimux-plugins-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  outline: none;
}
.omnimux-plugins-title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.omnimux-plugins-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.10));
  color: var(--dsw-alias-label-primary, inherit);
  flex: 0 0 auto;
}
.omnimux-plugins-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  padding-right: 36px;
}
.omnimux-plugins-title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
}
.omnimux-plugins-badge {
  font-size: 11px;
  line-height: 16px;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.omnimux-plugins-badge[data-state="installed"] {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #4caf7d) 16%, transparent);
  color: var(--dsw-alias-state-success-primary, #4caf7d);
}
.omnimux-plugins-badge[data-state="update"] {
  background: color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 14%, transparent);
  color: var(--dsw-alias-label-primary, inherit);
}
.omnimux-plugins-badge[data-state="available"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.08));
  color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.72));
}
.omnimux-plugins-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  opacity: 0.72;
}
.omnimux-plugins-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.omnimux-plugins-tag {
  font-size: 11px;
  line-height: 16px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.08));
  white-space: nowrap;
}
.omnimux-plugins-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
}
.omnimux-plugins-more {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
}
.omnimux-plugins-popover {
  position: absolute;
  top: 40px;
  right: 8px;
  z-index: 5;
  min-width: 200px;
  max-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-primary, var(--dsw-bg, #16181d));
  border: 1px solid var(--dsw-alias-border, rgba(255,255,255,0.16));
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.35));
}
.omnimux-plugins-menu-item {
  width: 100%;
  justify-content: flex-start;
}
.omnimux-plugins-menu-item-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
}
.omnimux-plugins-menu-hint {
  font-size: 11px;
  line-height: 16px;
  opacity: 0.6;
}
.omnimux-plugins-muted { opacity: 0.7; font-size: 13px; margin: 0; }
.omnimux-plugins-error {
  color: var(--dsw-alias-state-error-primary, #e06c75);
  font-size: 13px;
  margin: 0;
}
.omnimux-plugins-restart { align-self: flex-start; }
.omnimux-plugins-gate {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 16px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-secondary, rgba(255,255,255,0.04));
  border: 1px solid var(--dsw-alias-border, rgba(255,255,255,0.08));
}
.omnimux-plugins-gate-code {
  margin: 0;
  font-size: 14px;
  letter-spacing: 2px;
  font-family: var(--dsw-font-markdown-code-font-family, monospace);
}
.omnimux-plugins-gate-waiting {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.omnimux-update-action {
  flex: none;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  align-self: center;
  padding-right: 2px;
}
.omnimux-update-action-btn {
  border-radius: 999px;
  height: 28px;
}
.omnimux-update-action-btn[data-status="readyToRestart"] {
  box-shadow: 0 0 10px color-mix(in srgb, var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary, #fff)) 70%, transparent);
}
.omnimux-update-action-icon {
  display: inline-flex;
  align-items: center;
}

.omnimux-models-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}
.omnimux-models-card__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-models-card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-models-card__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-models-card__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-models-card__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-models-card__field-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-models-card__label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.omnimux-models-card__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-models-card__error {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-error);
}
.omnimux-chat-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}
.omnimux-chat-toggle-btn:hover {
  background: var(--dsw-alias-bg-control-hover, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-primary, inherit);
}
.omnimux-chat-toggle-btn[data-active="true"] {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.12));
}

.omnimux-quota-gate-backdrop,
.omnimux-quota-gate-backdrop *,
.omnimux-quota-gate-dialog,
.omnimux-quota-gate-dialog * {
  box-sizing: border-box;
}
.omnimux-quota-gate-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.75));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.omnimux-quota-gate-dialog {
  position: relative;
  width: min(420px, calc(100vw - 32px));
  padding: 24px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.1));
  border-radius: 16px;
  background: var(--dsw-alias-surface-raised, var(--dsw-alias-bg-elevated, #161618));
  color: var(--dsw-alias-label-primary, inherit);
  box-shadow: 0 16px 48px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.75));
}
.omnimux-quota-gate-dialog h2 { margin: 0 0 8px; font-size: 20px; }
.omnimux-quota-gate-dialog p { margin: 0 0 16px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.omnimux-quota-gate-close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; }
.omnimux-quota-gate-icon { display: grid; place-items: center; width: 32px; height: 32px; margin-bottom: 16px; border-radius: 50%; background: var(--dsw-alias-label-warning); color: var(--dsw-alias-bg-elevated); font-weight: 700; }
.omnimux-quota-gate-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* ── Defensive hiding of official StatsLine in composer dock ── */
[class*="StatsLine_root"],
.FJxK0a_root {
  display: none !important;
}

/* ── Hide permission preset selector in composer input bar ── */
[data-composer-card] button[aria-label*="访问模式"],
[data-composer-card] button[aria-label*="Access mode"],
[data-composer-card] [class*="modes"] > button:has([class*="triggerIcon"]),
[data-composer-card] [class*="modes"] > button[class*="trigger"]:first-child {
  display: none !important;
}
`

export function injectHubStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLES_ID)) return
  const styleNode = document.createElement('style')
  styleNode.id = STYLES_ID
  styleNode.textContent = HUB_CSS
  document.head.appendChild(styleNode)
}
