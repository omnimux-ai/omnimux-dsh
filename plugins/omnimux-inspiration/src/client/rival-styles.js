/**
 * Styles of the 账号监控 tab.
 *
 * Its own style node rather than an append to `styles.js`: the two modules'
 * selectors never overlap, and a separate id keeps the injected sheet ordering
 * independent of which panel mounted first. Every colour is a `--dsw-*` token
 * and every size is on the UI10 whitelist.
 *
 * The two-column workbench styles are gone with the workbench: the account
 * dimension is a 32px trigger plus a frosted panel now, and the works render in
 * the library's own 9:16 grid, whose rules stay in `styles.js` and are shared
 * rather than copied here.
 */

export const RIVAL_STYLES_ID = 'omnimux-rival-accounts-styles'

export const RIVAL_CSS = `
.omnimux-rival-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-height: 0;
}
.omnimux-rival-root[data-active="false"] {
  display: none;
}

/* ── 账号筛选（多选） ───────────────────────────────────────────────── */
.omnimux-rival-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  transition: background 120ms ease;
}
.omnimux-rival-filter-select {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
}
.omnimux-rival-filter-select:focus-visible {
  outline: 2px solid var(--dsw-alias-border-l3);
  outline-offset: 2px;
  border-radius: 5px;
}
.omnimux-rival-filter-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}
.omnimux-rival-filter-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-rival-filter-row.is-selected {
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover));
  box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary));
}
.omnimux-rival-filter-more {
  width: 20px;
  min-width: 20px;
  height: 20px;
  min-height: 20px;
  flex: none;
  opacity: 0;
  pointer-events: none;
  color: var(--dsw-alias-label-tertiary);
  transition: opacity 120ms ease, background 120ms ease;
}
.omnimux-rival-filter-row:hover .omnimux-rival-filter-more,
.omnimux-rival-filter-row:focus-within .omnimux-rival-filter-more {
  opacity: 1;
  pointer-events: auto;
}
.omnimux-rival-filter-more:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-filter-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 13px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
}
.omnimux-rival-filter-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omnimux-rival-filter-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.omnimux-rival-filter-name-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px 6px;
  min-width: 0;
}
.omnimux-rival-filter-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  /* 单行截断：昵称过长时省略，绝不把平台/警告图标挤到第二行。 */
  flex: 0 1 auto;
  min-width: 36px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-rival-filter-jump {
  width: 18px;
  min-width: 18px;
  height: 18px;
  min-height: 18px;
  flex: none;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.9);
  color: var(--dsw-alias-label-tertiary);
  transition: opacity 150ms ease, transform 150ms ease, background 120ms ease, color 120ms ease;
}
.omnimux-rival-filter-row:hover .omnimux-rival-filter-jump:not(:disabled),
.omnimux-rival-filter-row:focus-within .omnimux-rival-filter-jump:not(:disabled) {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}
.omnimux-rival-filter-jump:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-platform-mark {
  flex: none;
}
.omnimux-rival-filter-platform {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-specific-media-chip-bg));
  color: var(--dsw-alias-label-secondary, var(--dsw-specific-media-fg-secondary));
}
.omnimux-rival-filter-platform svg {
  width: 13px;
  height: 13px;
}
.omnimux-rival-filter-handle {
  display: block;
  max-width: 100%;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-rival-filter-warning {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 5px;
  cursor: help;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-filter-warning.is-cooling {
  color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-warning));
}
.omnimux-rival-filter-warning.is-reimport,
.omnimux-rival-filter-warning.is-stopped {
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-danger));
}
.omnimux-rival-filter-warning:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

/* ── 空态与提示 ─────────────────────────────────────────────────────── */
.omnimux-rival-empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px;
  align-items: center;
  text-align: center;
}
.omnimux-rival-empty-title {
  margin: 0;
  font-size: 14px;
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-empty-text {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-empty-cta {
  margin-top: 4px;
}

/* ── #3112 首采进度承诺与分流出口 ──────────────────────────────────── */
/* 空态动作区：主按钮与分流链接同列，垂直居中。 */
.omnimux-rival-empty-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
/* E2 细线进度条：无百分比、无计数，规格 §2.2 E2 只允许一条细线。 */
.omnimux-rival-fetch-progress {
  width: 160px;
  height: 2px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--dsw-alias-border-l2);
}
.omnimux-rival-fetch-progress i {
  display: block;
  width: 40%;
  height: 100%;
  border-radius: inherit;
  background: var(--dsw-alias-brand-primary);
  animation: omnimux-rival-fetch-slide 1.2s ease-in-out infinite;
}
@keyframes omnimux-rival-fetch-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
@media (prefers-reduced-motion: reduce) {
  .omnimux-rival-fetch-progress i {
    animation: none;
    width: 100%;
    opacity: .6;
  }
}
.omnimux-rival-notice {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}
.omnimux-rival-notice p {
  margin: 0;
}
.omnimux-rival-notice.is-error {
  color: var(--dsw-alias-state-error-text);
}

/* ── 详情弹窗 ───────────────────────────────────────────────────────── */
.omnimux-rival-detail {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px;
}
.omnimux-rival-detail-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 16;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform);
  overflow: hidden;
}
.omnimux-rival-detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omnimux-rival-detail-duration {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-mask-1);
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
}
.omnimux-rival-detail-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.omnimux-rival-detail-title {
  margin: 0;
  font-size: 14px;
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-detail-author {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-detail-handle {
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-detail-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-detail-stat {
  display: inline-flex;
  gap: 4px;
}
.omnimux-rival-detail-stat-value {
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-detail-time {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
/* 增速口径说明行（§3.6 三句之一）。此前只有 JSX 没有规则，以浏览器默认
   p 标签呈现（margin-block:1em 与 .omnimux-rival-detail 的 flex gap 叠加），
   与原型 .detail-note 的「上分隔线 + 小字号三级色」不一致（四轴复审 O-1）。
   分隔线照原型；字号与颜色跟随相邻的 .omnimux-rival-detail-time 取房内
   12px / label-secondary，而不是原型的 11px / label-tertiary——
   两行相邻，保持同一档字号与可读对比度比逐像素贴原型更重要。 */
.omnimux-rival-detail-velocity {
  margin: 14px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}

/* ── R4 刷新按钮 + 额度角标 + D4 原因弹层（#3111） ─────────────────── */
.omnimux-rival-refresh-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}
.omnimux-rival-refresh.is-blocked {
  opacity: 0.55;
}
.omnimux-rival-reason {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 248px;
  z-index: 110;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-specific-shadow-pop, 0 10px 28px rgba(0, 0, 0, 0.5));
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-refresh.is-fresh {
  opacity: 0.75;
}
.omnimux-rival-refresh-badge {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 5px;
  margin-left: 7px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.omnimux-rival-retry-icon {
  display: none;
}
.omnimux-rival-retry-label {
  display: inline;
}
.omnimux-rival-retry.is-blocked {
  opacity: 0.55;
}

/* ── 导入弹窗 ───────────────────────────────────────────────────────── */
.omnimux-rival-import-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-rival-import-echo {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}

@media (max-width: 720px) {
  .omnimux-rival-detail {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ── v2.1 瀑布流与五形态卡片（spec §9.1–§9.3） ────────────────────────── */

/* 容器：position:relative + 容器高来自 placements 累加；卡片绝对定位、
   几何全部走 CSS 变量（DOM 顺序因此可以等于排序顺序，V4）。 */
.omnimux-rival-masonry {
  position: relative;
  width: 100%;
  min-height: var(--rival-feed-height, 0px);
  height: var(--rival-feed-height, auto);
}
/* 追加分页时的骨架矩阵：贴瀑布流底下，间距与列间距同一档。 */
.omnimux-rival-loadmore {
  margin-top: 16px;
}
.omnimux-rival-card {
  position: absolute;
  left: var(--rival-card-left, 0px);
  top: var(--rival-card-top, 0px);
  width: var(--rival-card-w, 220px);
  min-height: 144px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.omnimux-rival-card:hover {
  border-color: var(--dsw-alias-border-l3);
}
.omnimux-rival-card:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
/* §9.2/B5：爆款档卡片橙红细描边 + 极轻外发光（全页唯一允许的发光，
   已处理默认态撤掉） */
.omnimux-rival-card.tier-hot {
  box-shadow:
    inset 0 0 0 1px var(--dsw-specific-velocity-hot-ring, rgba(240,69,58,.45)),
    0 0 14px var(--dsw-specific-media-glow-hot, rgba(240,69,58,.12));
}
.omnimux-rival-card.tier-hot.is-done:not(:hover) {
  box-shadow: none;
}

/* 媒体区：贴边、暗底常驻（暗房原则）；比例由数据占位（aspect-ratio 变量），
   图片加载前媒体区就已定高，加载后不跳。 */
.omnimux-rival-card-media {
  display: block;
  width: 100%;
  aspect-ratio: var(--rival-media-ratio, 1);
  object-fit: cover;
  background: var(--dsw-specific-media-ink);
  border: none;
  transition: transform 300ms ease, filter 180ms ease, opacity 180ms ease;
}
/* 无封面兜底（#3428）：占位沿用媒体块的几何与暗底，只把「没有封面」讲清楚；
   绝不渲染空 src 的 <img>，否则 9:16 区域就是一块黑板。 */
.omnimux-rival-card-media.omnimux-rival-media-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 0 12px;
  box-sizing: border-box;
  color: var(--dsw-specific-media-fg-secondary);
  font-size: 12px;
  line-height: 16px;
}
.omnimux-rival-media-empty .omnimux-rival-platform-mark {
  flex: 0 0 auto;
  opacity: 0.8;
}
.t-short-video:hover .omnimux-rival-card-media,
.t-long-video:hover .omnimux-rival-card-media,
.t-image:hover .omnimux-rival-card-media {
  transform: scale(1.02);
}
/* 文本卡：整卡内边距 12；text-media 内嵌媒体左右各缩进 12、圆角 8（§9.1/V6） */
.t-text,
.t-text-media {
  padding: 12px;
}
.t-text-media .omnimux-rival-card-media {
  border-radius: 8px;
  margin-top: 10px;
}

/* 标题/正文字阶：媒体类标题 13/18/500；文本类正文 14/20/400（§9.1）。
   font-family 显式声明（R7-④）：估算层的逐字形字宽表按 SF Pro /
   -apple-system 14px 标定，不显式声明会继承宿主字体、行数判据失准；
   栈与 build-demo.mjs --font-family、dsh-ui-kit GenWaveCard 同一约定。 */
.omnimux-rival-card-title-zone {
  padding: 10px 12px 12px;
}
/* 合集详情成员卡的正文区（Issue 3459）：几何必须与 rival-masonry.js 的
   MEDIA_FIRST_BODY_H 逐像素一致（上 10 + 标题 36 + 间距 6 + 元信息 18 + 下 12），
   估算与渲染一旦分叉，同排卡片就会压叠。 */
.omnimux-rival-card-body {
  padding: 10px 12px 12px;
}
.omnimux-rival-card-body .omnimux-rival-card-title {
  min-height: 36px;
}
.omnimux-rival-card-title {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC",
    sans-serif;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
}
.omnimux-rival-card-text {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC",
    sans-serif;
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
}
.clamp-1 { -webkit-line-clamp: 1; }
.clamp-2 { -webkit-line-clamp: 2; }
.clamp-3 { -webkit-line-clamp: 3; }
.clamp-8 { -webkit-line-clamp: 8; }

/* 文本卡顶部胶囊行（28px，胶囊在右端；仅在有胶囊时渲染该行） */
.omnimux-rival-pill-row {
  position: relative;
  z-index: 7;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 8px;
}

/* 增速胶囊（§3.3 + §9.1：媒体上的胶囊用 media token；文本卡中性档用
   alias token，亮色主题下仍 ≥4.5:1） */
.omnimux-rival-vpill {
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.omnimux-rival-vpill svg {
  flex-shrink: 0;
}
.omnimux-rival-vpill.on-media {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 7;
}
.omnimux-rival-vpill.hot {
  background: var(--dsw-specific-velocity-hot-bg);
  color: var(--dsw-specific-velocity-hot-fg);
}
.omnimux-rival-vpill.rising {
  background: var(--dsw-specific-velocity-rising-bg);
  color: var(--dsw-specific-velocity-rising-fg);
  border: 1px solid var(--dsw-specific-velocity-rising-ring);
  backdrop-filter: blur(4px);
}
/* #3166 决策二：叠在媒体上的 rising 走暗房 token（两主题同值）——半透明
   琥珀底在亮封面上对亮琥珀字实测最劣 ~1.6:1，连大字号 3:1 底线都未过；
   不透明深琥珀底在亮封面夹具最劣实测 5.43:1（ratio_far 口径），色相仍琥珀、层级不变
   （hot > rising > 中性）。 */
.omnimux-rival-vpill.on-media.rising {
  background: var(--dsw-specific-velocity-rising-bg-media);
  color: var(--dsw-specific-velocity-rising-fg-media);
  border: 1px solid var(--dsw-specific-velocity-rising-ring-media);
}
.omnimux-rival-vpill.on-media.watch {
  background: var(--dsw-specific-media-pill-bg);
  color: var(--dsw-specific-media-fg-secondary);
  border: 1px solid var(--dsw-specific-media-border-dim);
  backdrop-filter: blur(4px);
}
.omnimux-rival-vpill.on-media.average,
.omnimux-rival-vpill.on-media.relative {
  background: var(--dsw-specific-media-pill-bg-dim);
  color: var(--dsw-specific-media-fg-dimmed);
  border: 1px solid var(--dsw-specific-media-border-faint);
  backdrop-filter: blur(4px);
}
.omnimux-rival-vpill.on-surface.watch,
.omnimux-rival-vpill.on-surface.average,
.omnimux-rival-vpill.on-surface.relative {
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l2);
  backdrop-filter: none;
}

/* 已处理样式（§9.2 状态裁决：胶囊中性化 + 媒体去色淡出 + 文字降一级，
   三处同时生效；只改颜色与滤镜不改尺寸；悬停时全部恢复；整卡 opacity 恒 1） */
.omnimux-rival-card.is-done:not(:hover) .omnimux-rival-card-media {
  filter: grayscale(1);
  opacity: 0.45;
}
.omnimux-rival-card.is-done:not(:hover) .omnimux-rival-card-title,
.omnimux-rival-card.is-done:not(:hover) .omnimux-rival-card-text {
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-card.is-done:not(:hover) .omnimux-rival-vpill.on-media {
  background: var(--dsw-specific-media-pill-bg);
  color: var(--dsw-specific-media-fg-secondary);
  border: 1px solid var(--dsw-specific-media-border-dim);
  backdrop-filter: blur(4px);
}
.omnimux-rival-card.is-done:not(:hover) .omnimux-rival-vpill.on-surface {
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l2);
  backdrop-filter: none;
}

/* 悬停层（§9.2：从卡片底部向上贴底排布——作者行 → 指标行 → 三个次级 →
   满宽主钮；媒体类沿 media-overlay 渐变，文本类不透明 bg-elevated + 上沿
   20px 渐隐带，不画顶边描边、不占布局、不拦截鼠标、不改卡高） */
.omnimux-rival-card-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 6;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}
.omnimux-rival-card:hover .omnimux-rival-card-overlay,
.omnimux-rival-card:focus-within .omnimux-rival-card-overlay {
  opacity: 1;
  pointer-events: auto;
}
.omnimux-rival-card-overlay.on-media {
  background: var(--dsw-specific-media-overlay);
}
.omnimux-rival-card-overlay.on-surface {
  background: var(--dsw-alias-bg-elevated);
  border-top: 0;
}
.omnimux-rival-card-overlay.on-surface::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 20px;
  background: linear-gradient(180deg, transparent 0%, var(--dsw-alias-bg-elevated) 100%);
  pointer-events: none;
}

.omnimux-rival-ov-author {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.omnimux-rival-ov-name {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.omnimux-rival-ov-time {
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
}
.omnimux-rival-ov-match {
  margin-left: auto;
  height: 18px;
  padding: 0 6px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
}
.on-media .omnimux-rival-platform-mark {
  color: var(--dsw-specific-media-fg);
}
.on-media .omnimux-rival-ov-name {
  color: var(--dsw-specific-media-fg-strong);
}
.on-media .omnimux-rival-ov-time {
  color: var(--dsw-specific-media-fg-dimmed);
}
.on-media .omnimux-rival-ov-match {
  border: 1px solid var(--dsw-specific-media-border-strong);
  background: var(--dsw-specific-media-chip-bg);
  color: var(--dsw-specific-media-fg);
}
.on-surface .omnimux-rival-platform-mark {
  color: var(--dsw-alias-label-secondary);
}
.on-surface .omnimux-rival-ov-name {
  color: var(--dsw-alias-label-primary);
}
.on-surface .omnimux-rival-ov-time {
  color: var(--dsw-alias-label-tertiary);
}
.on-surface .omnimux-rival-ov-match {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
}

.omnimux-rival-overlay-metrics {
  /* R7-⑦（PM M3）：display:inline-flex 时 text-overflow:ellipsis 不作用于
     单文本节点（flex 项不是行内内容）——实测省略号死声明、文本被裸切
     （scroll 293 vs client 202）。改回行内块级收缩包裹 + min-width:0 等效
     约束，省略号才真正落地。 */
  display: inline-block;
  align-self: flex-start;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.on-media .omnimux-rival-overlay-metrics {
  background: var(--dsw-specific-media-badge-bg);
  backdrop-filter: blur(4px);
  color: var(--dsw-specific-media-fg);
}
.on-surface .omnimux-rival-overlay-metrics {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

/* 操作行（§9.2：三个位置按内容宽度分配，不等分；第四位为状态静态文字或
   标为已处理；主按钮满宽 32px） */
.omnimux-rival-act-row {
  display: flex;
  align-items: center;
  gap: 5px;
}
.omnimux-rival-act-btn {
  flex: 0 1 auto;
  min-width: 0;
  height: 28px;
  padding: 0 7px;
  border-radius: 8px;
  font-size: 11px;
  white-space: nowrap;
  /* R6-③：220px 最小列宽下英文文案（"AI breakdown" clientWidth 62 /
     scrollWidth 74）会溢出按钮框并与第四位状态槽重叠 5.2px —— nowrap
     必须配溢出隐藏。overflow:hidden 留按钮级兜底；
     text-overflow 在本级是死声明（kit Button 是 display:flex、文案在
     子元素 <span class="…label"> 内，text-overflow 只作用于块容器
     自己的行内内容，触达不到 label）——省略号契约挂在下方 span 上。 */
  overflow: hidden;
}
/* R7-⑥：省略号挂到真正拥有文本的元素（kit Button 的 label span；
   :not(.omnimux-rival-vh) 排除 aria-describedby 的可视隐藏说明节点）。 */
.omnimux-rival-act-btn > span:not(.omnimux-rival-vh) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.on-media .omnimux-rival-act-btn {
  border-color: var(--dsw-specific-media-border);
  background: var(--dsw-specific-media-btn-bg);
  color: var(--dsw-specific-media-fg);
}
.on-media .omnimux-rival-act-btn:hover:not(:disabled) {
  background: var(--dsw-specific-media-btn-hover);
}
.on-surface .omnimux-rival-act-btn {
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.on-surface .omnimux-rival-act-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l3);
}
/* R6-⑨：禁用按钮的 aria-describedby 目标——文字对读屏可达、不可见。 */
.omnimux-rival-vh {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.omnimux-rival-act-slot {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}
.omnimux-rival-act-state {
  height: 28px;
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  white-space: nowrap;
}
.on-media .omnimux-rival-act-state {
  color: var(--dsw-specific-media-fg-dimmed);
}
.on-surface .omnimux-rival-act-state {
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-act-primary {
  width: 100%;
  height: 32px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}
.on-media .omnimux-rival-act-primary {
  background: var(--dsw-specific-media-fg);
  color: var(--dsw-specific-media-ink);
}
.on-media .omnimux-rival-act-primary:hover:not(:disabled) {
  background: var(--dsw-specific-media-fg-strong);
}
.on-surface .omnimux-rival-act-primary {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
}
.on-surface .omnimux-rival-act-primary:hover:not(:disabled) {
  opacity: .88;
}
/* ── 账号监控两栏布局（#3432） ─────────────────────────────────────── */
.omnimux-rival-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 16px;
  width: 100%;
  align-items: start;
}
.omnimux-rival-layout.is-single {
  grid-template-columns: minmax(0, 1fr);
}
.omnimux-rival-content {
  min-width: 0;
}
@media (max-width: 960px) {
  .omnimux-rival-layout {
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 12px;
  }
}
@media (max-width: 720px) {
  .omnimux-rival-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.omnimux-rival-accounts {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  position: sticky;
  /* 吸附在一级 Tab/工具栏下方：#3448 用实测的 header 高度与 scrollport 高度，
     回退到 Stage 骨架偏移变量/100vh，避免滑入 Tab 栏或超出滚动区。 */
  top: calc(var(--omnimux-rival-sticky-h, var(--stage-sticky-offset, 44px)) + 12px);
  max-height: calc(var(--omnimux-rival-scroll-h, 100vh) - var(--omnimux-rival-sticky-h, var(--stage-sticky-offset, 44px)) - 24px);
}
.omnimux-rival-accounts-head {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  padding: 0 2px 2px;
  min-width: 0;
}
.omnimux-rival-accounts-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}
.omnimux-rival-accounts-all {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-accounts-all:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-rival-accounts-all:focus-visible {
  outline: 2px solid var(--dsw-alias-border-l3);
  outline-offset: -2px;
}
.omnimux-rival-accounts-all.is-selected {
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover));
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-accounts-all-label {
  font-size: 12px;
  font-weight: 500;
}
.omnimux-rival-accounts-all-count {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-account-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}
.omnimux-rival-account-group-title {
  margin: 0 0 2px;
  padding: 0 8px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: .04em;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-menu {
  position: fixed;
  z-index: 1000;
  width: 176px;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, var(--dsw-specific-media-pill-bg));
  box-shadow: var(--dsw-specific-shadow-pop, 0 8px 24px rgba(0, 0, 0, .35));
}
.omnimux-rival-menu-item {
  width: 100%;
  justify-content: flex-start;
}
.omnimux-rival-menu-item.is-danger {
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-danger));
}
.omnimux-rival-menu-error {
  margin: 4px 8px 2px;
  font-size: 11px;
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-danger));
}
.omnimux-rival-accounts-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
@media (max-width: 960px) {
  .omnimux-rival-filter-jump {
    display: none;
  }
  .omnimux-rival-retry-label {
    display: none;
  }
  .omnimux-rival-retry-icon {
    display: inline-flex;
  }
  }
@media (max-width: 720px) {
  .omnimux-rival-accounts {
    position: static;
    max-height: 240px;
  }
}

/* ── 原生风格帖子时间线（#3432） ─────────────────────────────────── */
.omnimux-rival-timeline {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-rival-timeline-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  cursor: pointer;
  transition: background-color 160ms ease;
}
.omnimux-rival-timeline-item:last-child {
  border-bottom: none;
}
.omnimux-rival-timeline-item:hover,
.omnimux-rival-timeline-item:focus-visible {
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-rival-timeline-item.is-done {
  opacity: .58;
}
.omnimux-rival-timeline-avatar {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-secondary);
  font-size: 15px;
  font-weight: 600;
}
.omnimux-rival-timeline-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omnimux-rival-timeline-main {
  flex: 1;
  min-width: 0;
}
.omnimux-rival-timeline-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.omnimux-rival-timeline-author {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
.omnimux-rival-timeline-platform {
  display: inline-flex;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-timeline-handle,
.omnimux-rival-timeline-time {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-timeline-state {
  margin-left: auto;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-timeline-body {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 21px;
  color: var(--dsw-alias-label-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.omnimux-rival-timeline-media {
  position: relative;
  margin-top: 10px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-specific-media-ink);
}
.omnimux-rival-timeline-media img {
  display: block;
  width: 100%;
  max-height: 360px;
  object-fit: cover;
}
.omnimux-rival-timeline-play {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  border-radius: 50%;
  background: var(--dsw-specific-media-pill-bg);
  border: 1px solid var(--dsw-specific-media-border-dim);
}
.omnimux-rival-timeline-play::after {
  content: '';
  position: absolute;
  left: 17px;
  top: 13px;
  border-style: solid;
  border-width: 9px 0 9px 14px;
  border-color: transparent transparent transparent currentColor;
  color: var(--dsw-specific-media-fg-strong);
}
.omnimux-rival-timeline-duration {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dsw-specific-media-pill-bg);
  color: var(--dsw-specific-media-fg-strong);
  font-size: 11px;
}
.omnimux-rival-timeline-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  min-height: 24px;
}
.omnimux-rival-timeline-metrics {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-timeline-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 140ms ease;
}
.omnimux-rival-timeline-item:hover .omnimux-rival-timeline-actions,
.omnimux-rival-timeline-item:focus-within .omnimux-rival-timeline-actions {
  opacity: 1;
}
@media (hover: none) {
  .omnimux-rival-timeline-actions {
    opacity: 1;
  }
}
@media (max-width: 720px) {
  .omnimux-rival-timeline-foot {
    flex-wrap: wrap;
  }
  .omnimux-rival-timeline-actions {
    flex: 1 1 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
.omnimux-rival-timeline-act {
  font-size: 12px;
}
.omnimux-rival-timeline-loadmore {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
}
.omnimux-rival-timeline-skel {
  height: 88px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  animation: omnimux-rival-skel-pulse 1.4s ease-in-out infinite;
}
.omnimux-rival-timeline-sentinel {
  height: 1px;
}

`

/** Inject the rival stylesheet once. */
export function injectRivalStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(RIVAL_STYLES_ID)) return
  const node = document.createElement('style')
  node.id = RIVAL_STYLES_ID
  node.textContent = RIVAL_CSS
  document.head.appendChild(node)
}
