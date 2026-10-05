// 虚拟形象工作台的样式注入。
//
// 颜色与排版只消费官方 Token（--dsw-alias-* / --dsw-font-*），不引入源工作台的
// --inf-* 变量体系；源里的每个 --inf-* 概念都映射到一个官方 Token。
// 唯一的例外是 .omx-stage-sticky 的 canonical 声明——一级页滚动契约要求各插件
// 逐字一致（docs/contracts/first-level-page-layout.md §二·补，Issue 1977）。

export const STYLES_ID = 'omnimux-avatar-styles'

/** 一级页骨架契约类：吸附栈与整页唯一滚动容器（与其它插件逐字一致）。 */
export const CANONICAL_STICKY_DECL =
  '.omx-stage-sticky { position:sticky;top:0;z-index:20;background:var(--dsw-alias-bg-base, var(--dsw-bg, #111215)); }'
export const CANONICAL_SCROLL_DECL =
  '.omx-stage-scroll { flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden; }'

export const AVATAR_CSS = `
/* ── 一级页骨架契约（Issue 1977）：整页唯一滚动区 + 导航栈到顶吸附 ── */
${CANONICAL_STICKY_DECL}
${CANONICAL_SCROLL_DECL}

/* ── 页面骨架 ───────────────────────────────────────────── */
.omx-avatar-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.omx-avatar-page[data-visible="false"] {
  display: none;
}
.omx-avatar-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omx-avatar-head-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omnimux-avatar-body {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 12px;
  padding: 12px;
  align-items: start;
}
@media (max-width: 900px) {
  .omnimux-avatar-body {
    grid-template-columns: 1fr;
  }
}
.omx-avatar-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.omx-avatar-pane-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omx-avatar-pane-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.omx-avatar-pane-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
}
.omx-avatar-builder {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.omx-avatar-builder:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}

/* ── 形象行（本插件新增，源工作台没有） ─────────────────── */
.omx-avatar-avatars {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2);
}
.omx-avatar-avatars-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omx-avatar-avatars-spacer {
  flex: 1 1 auto;
}
.omx-avatar-input {
  min-width: 0;
  flex: 1 1 140px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-primary);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-family: inherit;
}
.omx-avatar-input:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-tertiary);
}
.omx-avatar-error {
  font-size: 12px;
  color: var(--dsw-alias-label-danger);
}

/* ── 档位与分类块 ───────────────────────────────────────── */
.omx-avatar-block {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2);
}
.omx-avatar-block-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
}
.omx-avatar-block-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omx-avatar-block-meta {
  margin-left: auto;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-avatar-group-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.omx-avatar-chev {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 0.15s ease;
}
.omx-avatar-group-head[aria-expanded="false"] .omx-avatar-chev {
  transform: rotate(-90deg);
}
.omx-avatar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 84px);
  gap: 8px;
}
.omx-avatar-block-body {
  padding: 0 12px 12px;
}

/* ── 选项卡片：84×84 固定瓦片 ───────────────────────────── */
.omx-avatar-opt {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  min-width: 84px;
  min-height: 84px;
  max-width: 84px;
  max-height: 84px;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  border: 1.5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.15s ease, box-shadow 0.15s ease;
}
.omx-avatar-opt:hover {
  transform: translateY(-1.5px);
  border-color: var(--dsw-alias-border-hover);
}
.omx-avatar-opt.is-sel {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow:
    0 0 0 1px var(--dsw-alias-brand-primary),
    0 0 0 4px var(--dsw-alias-state-business-tertiary);
}
.omx-avatar-opt.is-sel:hover {
  border-color: var(--dsw-alias-brand-primary);
}
.omx-avatar-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--dsw-alias-bg-base) 10%, transparent) 0%,
    color-mix(in srgb, var(--dsw-alias-bg-base) 85%, transparent) 100%
  );
}
.omx-avatar-opt:hover .omx-avatar-overlay {
  opacity: 1;
}
.omx-avatar-thumb {
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: var(--dsw-alias-bg-layer-3);
  transition: transform 0.2s ease;
}
.omx-avatar-opt:hover .omx-avatar-thumb {
  transform: scale(1.04);
}
.omx-avatar-lbl {
  position: absolute;
  left: 4px;
  right: 4px;
  bottom: 6px;
  z-index: 3;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--dsw-alias-label-primary-foreground);
  text-align: center;
  word-break: break-word;
  pointer-events: none;
  opacity: 0;
  transform: translateY(2px);
  transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out;
}
.omx-avatar-opt:hover .omx-avatar-lbl {
  opacity: 1;
  transform: translateY(0);
}
.omx-avatar-opt--text .omx-avatar-lbl {
  position: relative;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 6px;
  opacity: 1;
  transform: none;
  color: var(--dsw-alias-label-primary);
}
.omx-avatar-swatch {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--avatar-swatch, var(--dsw-alias-bg-layer-3));
}

/* ── 性别卡片：右上角图标 + 左下角标题 ─────────────────── */
.omx-avatar-opt--gender {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  padding: 8px;
}
.omx-avatar-gender-icon {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  width: 26px;
  height: 26px;
  object-fit: contain;
  transition: transform 0.15s ease;
}
.omx-avatar-opt--gender:hover .omx-avatar-gender-icon {
  transform: scale(1.08);
}
.omx-avatar-gender-title {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  z-index: 3;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--dsw-alias-label-secondary);
  text-align: left;
  word-break: break-word;
  transition: color 0.15s ease;
}
.omx-avatar-opt--gender:hover .omx-avatar-gender-title,
.omx-avatar-opt--gender.is-sel .omx-avatar-gender-title {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

/* ── 状态角标 / 微光 / 进度条 ───────────────────────────── */
.omx-avatar-status {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 4;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent);
  color: var(--dsw-alias-label-secondary);
}
.omx-avatar-status--queued {
  color: var(--dsw-alias-state-warn-primary);
}
.omx-avatar-status--generating {
  color: var(--dsw-alias-label-secondary);
}
.omx-avatar-status--failed {
  color: var(--dsw-alias-state-error-primary);
}
.omx-avatar-status--done {
  color: var(--dsw-alias-label-primary);
}
.omx-avatar-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 30%,
    color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent) 50%,
    transparent 70%
  );
  background-size: 200% 100%;
  animation: omx-avatar-shimmer 1.4s infinite;
}
@keyframes omx-avatar-shimmer {
  to {
    background-position: -200% 0;
  }
}
.omx-avatar-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 4;
  height: 3px;
  background: var(--dsw-alias-border-l1);
}
.omx-avatar-progress > i {
  display: block;
  height: 100%;
  background: var(--dsw-alias-label-primary);
  transition: width 0.3s;
}

/* ── 生成栏 ─────────────────────────────────────────────── */
.omx-avatar-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.omx-avatar-iconbtn {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.omx-avatar-iconbtn:hover {
  border-color: var(--dsw-alias-border-hover);
  background: var(--dsw-alias-interactive-bg-hover);
}
.omx-avatar-cta {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 52px;
  border: 0;
  border-radius: 14px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s ease;
}
.omx-avatar-cta:hover {
  background: var(--dsw-alias-button-primary-hover);
}
.omx-avatar-cta:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.omx-avatar-cta-credits {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 700;
}
.omx-avatar-spin {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary-foreground) 30%, transparent);
  border-top-color: var(--dsw-alias-label-primary-foreground);
  animation: omx-avatar-spin 0.7s linear infinite;
}
@keyframes omx-avatar-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 次级按钮 / 分段切换 / 下拉浮层 ─────────────────────── */
.omx-avatar-abtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.omx-avatar-abtn:hover {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-hover);
}
.omx-avatar-abtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.omx-avatar-abtn--danger {
  color: var(--dsw-alias-label-danger);
}
.omx-avatar-seg {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
}
.omx-avatar-seg-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.omx-avatar-seg-item:hover {
  color: var(--dsw-alias-label-secondary);
}
.omx-avatar-seg-item[aria-checked="true"] {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
}
.omx-avatar-field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omx-avatar-field-lbl {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-avatar-dropdown {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-primary);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.omx-avatar-dropdown:hover {
  border-color: var(--dsw-alias-border-hover);
}
.omx-avatar-dropdown-val {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.omx-avatar-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated);
  box-shadow: 0 12px 32px color-mix(in srgb, var(--dsw-alias-bg-base) 45%, transparent);
}
.omx-avatar-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.omx-avatar-menu-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omx-avatar-menu-item[aria-selected="true"] {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
}
.omx-avatar-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 256px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-elevated);
  box-shadow: 0 16px 40px color-mix(in srgb, var(--dsw-alias-bg-base) 45%, transparent);
}
.omx-avatar-popover-wrap {
  position: relative;
  display: inline-flex;
}

/* ── 画廊卡片 ───────────────────────────────────────────── */
.omx-avatar-card {
  content-visibility: auto;
  contain-intrinsic-size: 320px 570px;
}
.omx-avatar-card-img {
  opacity: 0;
  transition: opacity 0.15s ease-out;
}
.omx-avatar-card-img.is-loaded {
  opacity: 1;
}

/* ── 多视角缩略格 ───────────────────────────────────────── */
.omx-avatar-mv-tile {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.omx-avatar-mv-tile:hover {
  border-color: var(--dsw-alias-border-hover);
  transform: translateY(-1px);
}
.omx-avatar-mv-tile:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.omx-avatar-mv-tile--generating {
  border-style: dashed;
}
.omx-avatar-mv-tile--failed {
  border-color: var(--dsw-alias-state-error-primary);
}
.omx-avatar-mv-tile--ready {
  border-color: var(--dsw-alias-brand-primary);
}
/* 「生成多视角」入口：与徽标同格同尺寸，虚线边框表示这一格还是空的。 */
.omx-avatar-mv-tile--add {
  border-style: dashed;
}
.omx-avatar-mv-add {
  padding: 0 8px;
  font-size: 12px;
  line-height: 1.3;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
}
.omx-avatar-mv-ring {
  position: absolute;
  inset: 0;
  opacity: 0.35;
  background: conic-gradient(
    var(--dsw-alias-brand-primary) var(--avatar-mv-progress, 0%),
    transparent 0
  );
}
.omx-avatar-mv-pct {
  position: relative;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary-foreground);
}
.omx-avatar-mv-fail {
  position: relative;
  font-size: 16px;
  font-weight: 700;
  color: var(--dsw-alias-state-error-primary);
}

/* ── 轻提示 ─────────────────────────────────────────────── */
.omx-avatar-toasts {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.omx-avatar-toast {
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--dsw-alias-bg-base) 40%, transparent);
}
.omx-avatar-toast--error {
  color: var(--dsw-alias-label-danger);
  border-color: var(--dsw-alias-state-error-primary);
}
.omx-avatar-toast--success {
  color: var(--dsw-alias-label-success);
}
.omx-avatar-toast--warning {
  color: var(--dsw-alias-label-warning);
}
.omx-avatar-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── 空态 ───────────────────────────────────────────────── */
.omx-avatar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--dsw-alias-label-tertiary);
  text-align: center;
}
.omx-avatar-empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.omx-avatar-empty-desc {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}

/* ── 历史画廊卡片 ───────────────────────────────────────── */
.omx-avatar-card {
  display: block;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.omx-avatar-card.is-clickable {
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.omx-avatar-card.is-clickable:hover {
  border-color: var(--dsw-alias-border-hover);
  transform: translateY(-1px);
}
.omx-avatar-card-frame {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-3);
}
.omx-avatar-card-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.omx-avatar-card-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 120px;
  padding: 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-avatar-card-fail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 140px;
  padding: 16px;
}
.omx-avatar-fail {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  color: var(--dsw-alias-label-danger);
}
.omx-avatar-status.is-queued {
  color: var(--dsw-alias-state-warn-primary);
}
.omx-avatar-status.is-generating {
  color: var(--dsw-alias-label-secondary);
}
/* 归档未完成：贴在成品卡片顶部的一条提示，含补偿入口 */
.omx-avatar-sync {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-state-warn-primary);
  background: var(--dsw-alias-bg-elevated);
}
.omx-avatar-sync-icon {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--dsw-alias-state-warn-primary);
}
.omx-avatar-sync-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--dsw-alias-label-warning);
}
.omx-avatar-sync .omx-avatar-abtn {
  flex: 0 0 auto;
}
.omx-avatar-mv-slot {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 5;
}
.omx-avatar-mv-tile .omx-avatar-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.omx-avatar-mv-fail {
  display: flex;
  align-items: center;
  justify-content: center;
}
.omx-avatar-feed-grid {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 16px 0;
}
@media (min-width: 640px) {
  .omx-avatar-feed-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1280px) {
  .omx-avatar-feed-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (min-width: 1536px) {
  .omx-avatar-feed-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
.omx-avatar-feed-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 340px;
  margin-right: auto;
  padding: 16px 0;
}
.omx-avatar-feed-foot {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 0 8px;
}
.omx-avatar-feed-sentinel {
  width: 100%;
  height: 1px;
}
.omx-avatar-feed-more {
  position: relative;
  width: 100%;
  height: 64px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2);
}
.omx-avatar-feed-end {
  font-size: 12px;
  color: var(--dsw-alias-label-dimmed);
}

/* ── 模态对话框 ─────────────────────────────────────────── */
.omx-avatar-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent);
}
.omx-avatar-dialog {
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  max-height: calc(100vh - 40px);
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  background: var(--dsw-alias-bg-elevated);
  color: var(--dsw-alias-label-primary);
}
.omx-avatar-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omx-avatar-dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.omx-avatar-dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.omx-avatar-dialog-close:hover {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-hover);
}
.omx-avatar-dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
.omx-avatar-dialog-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}

/* ── 灵感预设网格 ───────────────────────────────────────── */
.omx-avatar-preset-grid {
  display: grid;
  grid-template-columns: repeat(var(--avatar-preset-columns, 4), minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}
.omx-avatar-preset-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.omx-avatar-preset-open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.omx-avatar-preset-img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}
.omx-avatar-preset-recreate {
  position: absolute;
  right: 8px;
  bottom: 8px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.omx-avatar-preset-card:hover .omx-avatar-preset-recreate,
.omx-avatar-preset-recreate:focus-visible,
.omx-avatar-preset-recreate.is-touch {
  opacity: 1;
}
.omx-avatar-preset-cols {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
}
@media (max-width: 900px) {
  .omx-avatar-preset-cols {
    grid-template-columns: 1fr;
  }
}
.omx-avatar-preset-media {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.omx-avatar-preset-view {
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 60vh;
  overflow: hidden;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3);
}
.omx-avatar-preset-view.is-actual {
  display: block;
  overflow: auto;
}
.omx-avatar-preset-sheet {
  display: block;
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
}
.omx-avatar-preset-view.is-actual .omx-avatar-preset-sheet {
  max-width: none;
  max-height: none;
}
.omx-avatar-preset-fit {
  align-self: flex-start;
}
.omx-avatar-preset-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  overflow: auto;
}
.omx-avatar-preset-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.omx-avatar-preset-label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-tertiary);
}
.omx-avatar-preset-brief {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.omx-avatar-preset-chips {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
}
.omx-avatar-preset-chip-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.omx-avatar-preset-chip-key {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-avatar-preset-chip-values {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}
.omx-avatar-preset-chip {
  padding: 3px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.omx-avatar-preset-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.omx-avatar-preset-note {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-warning);
}

/* ── 多视角浏览 ─────────────────────────────────────────── */
.omx-avatar-mv-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3);
}
.omx-avatar-mv-image {
  display: block;
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
}
.omx-avatar-mv-empty {
  padding: 24px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-avatar-mv-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}
.omx-avatar-mv-actions-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
`

/**
 * 注入样式表（幂等：同一个文档只插一个 <style>）。
 * @param {Document} [doc]
 * @returns {() => void} 卸载函数
 */
export function injectAvatarStyles(doc) {
  const target = doc ?? (typeof document === 'undefined' ? null : document)
  if (!target || typeof target.createElement !== 'function') return () => {}
  const head = target.head ?? target.documentElement
  if (!head) return () => {}
  if (target.getElementById?.(STYLES_ID)) return () => {}
  const el = target.createElement('style')
  el.id = STYLES_ID
  el.textContent = AVATAR_CSS
  head.appendChild(el)
  return () => {
    if (el.parentNode) el.parentNode.removeChild(el)
  }
}
