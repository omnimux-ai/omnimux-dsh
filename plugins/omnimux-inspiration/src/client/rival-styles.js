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

/* 「正在浏览：…」+「显示 N 个作品」 */
.omnimux-rival-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-summary-count {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}

/* ── 账号筛选（多选） ───────────────────────────────────────────────── */
.omnimux-rival-filter {
  position: relative;
  flex: none;
}
.omnimux-rival-filter-trigger {
  height: 32px;
  min-height: 32px;
  padding: 0 10px 0 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 500;
  gap: 8px;
}
.omnimux-rival-filter-trigger:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-rival-filter-trigger.is-open {
  border-color: var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-rival-filter-trigger-label {
  white-space: nowrap;
}
.omnimux-rival-filter-panel {
  position: absolute;
  top: 38px;
  right: 0;
  width: 290px;
  /* 面板必须压在一切同屏元素之上：任何后置的卡片、摘要行都不允许盖住这份账号
     列表，否则被盖住的行既看不见也点不到。 */
  z-index: 1000;
  padding: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 12px 32px var(--dsw-alias-bg-mask-1), 0 2px 8px var(--dsw-alias-bg-mask-1);
  animation: omni-rival-pop 120ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes omni-rival-pop {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.omnimux-rival-filter-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 8px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-rival-filter-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.omnimux-rival-filter-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
}
.omnimux-rival-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 120ms ease;
}
/* 终态行（带原因行）昵称列至少保留两行文字宽，否则长原因把昵称挤没。 */
.omnimux-rival-filter-row.is-reimport .omnimux-rival-filter-info,
.omnimux-rival-filter-row.is-stopped .omnimux-rival-filter-info {
  min-width: 96px;
}
.omnimux-rival-filter-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-rival-filter-row:focus-visible {
  outline: 2px solid var(--dsw-alias-border-l3);
  outline-offset: -2px;
}
.omnimux-rival-filter-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex: none;
  border: 1.5px solid var(--dsw-alias-border-l3);
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-primary-foreground);
  transition: background 120ms ease, border-color 120ms ease;
}
.omnimux-rival-filter-row[data-checked="true"] .omnimux-rival-filter-check {
  border-color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-label-primary);
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
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.omnimux-rival-filter-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
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
.omnimux-rival-filter-row:hover .omnimux-rival-filter-jump,
.omnimux-rival-filter-row:focus-within .omnimux-rival-filter-jump {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}
.omnimux-rival-filter-jump:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-filter-id {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  min-width: 0;
}
.omnimux-rival-platform-mark {
  flex: none;
}
.omnimux-rival-filter-handle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-rival-filter-count {
  flex: none;
  margin-left: auto;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
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
  background: var(--dsw-alias-bg-tertiary);
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

/* ── R3 监控池状态条（#3111） ──────────────────────────────────────── */
.omnimux-rival-pool {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-rival-pool-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 20px;
}
.omnimux-rival-pool-summary {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.omnimux-rival-pool-quota {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.omnimux-rival-pool-freshness {
  margin-left: auto;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
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

/* ── D1 账号行健康态（#3111） ─────────────────────────────────────── */
.omnimux-rival-health {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}
.omnimux-rival-health.is-cooling {
  color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-warning));
}
.omnimux-rival-health.is-reimport,
.omnimux-rival-health.is-stopped {
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-danger));
}
.omnimux-rival-filter-reason {
  display: block;
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
  margin-top: 2px;
  white-space: normal;
}
.omnimux-rival-filter-row.is-reimport .omnimux-rival-filter-reason,
.omnimux-rival-filter-row.is-stopped .omnimux-rival-filter-reason {
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-danger));
}
.omnimux-rival-retry-wrap {
  position: relative;
  display: inline-flex;
  flex: none;
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
  background: var(--dsw-alias-bg-tertiary);
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
   深色琥珀底保底 ≥4.5:1，色相仍琥珀、层级不变（hot > rising > 中性）。 */
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
