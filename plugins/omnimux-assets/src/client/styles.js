export const STYLES_ID = 'omnimux-assets-styles'

export const ASSETS_CSS = `
/* 全站一级页骨架契约类（Issue 1977 · 契约 §二·补）：整页唯一滚动区 + 导航栈到顶吸附，声明与其它插件逐字一致 */
.omx-stage-sticky {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--dsw-alias-bg-base, var(--dsw-bg, #111215));
}
.omx-stage-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.omnimux-assets-stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  pointer-events: auto;
}
.omnimux-assets-stage[data-visible="false"] {
  display: none !important;
  pointer-events: none;
}
.omnimux-assets-action-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px 12px;
}
.omnimux-assets-stage-toolbar {
  flex: none;
  padding: 0 20px;
  height: 48px;
}
.omnimux-assets-tools-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-assets-search-wrap {
  width: 220px;
}
/* ---- local category nav --------------------------------------------------
   The local tab's filter row, sitting under the toolbar. Layout only: the pill
   shape, the pressed ink and the count all come from the shared chip blocks in
   the cloud section below, which list this nav's selectors next to the cloud
   one's so the two rows cannot drift apart. */
.omnimux-assets-local-nav {
  flex: none;
  padding: 12px 20px 14px;
}
.omnimux-assets-local-nav-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.omnimux-assets-view-toggle {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
  background: var(--dsw-alias-bg-layer-1, transparent);
}
.omnimux-assets-list-wrap {
  width: 100%;
  overflow-x: auto;
}
.omnimux-assets-list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.omnimux-assets-list-table th {
  text-align: left;
  padding: 8px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-weight: 500;
  font-size: 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-assets-th-check, .omnimux-assets-td-check { width: 40px; text-align: center; }
.omnimux-assets-th-name { min-width: 160px; }
.omnimux-assets-th-type, .omnimux-assets-td-type { width: 100px; }
.omnimux-assets-th-desc { min-width: 200px; }
.omnimux-assets-th-files, .omnimux-assets-td-files { width: 120px; }
.omnimux-assets-th-actions, .omnimux-assets-td-actions { width: 160px; text-align: right; }
.omnimux-assets-list-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.omnimux-assets-list-badge { position: static !important; }
.omnimux-assets-list-missing { position: static !important; margin-left: 6px; }
.omnimux-assets-td-desc {
  color: var(--dsw-alias-label-secondary);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-list-row {
  cursor: pointer;
  transition: background-color 0.12s ease;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-assets-list-row:hover {
  background-color: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-assets-list-row[aria-selected="true"] {
  background-color: var(--dsw-alias-bg-module-platform);
}
.omnimux-assets-list-row td {
  padding: 10px 12px;
  vertical-align: middle;
}
.omnimux-assets-list-cell-name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}
.omnimux-assets-selection {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-assets-selection-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
}
.omnimux-assets-error {
  margin: 0;
  padding: 6px 20px;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
}
.omnimux-assets-body {
  width: 100%;
  box-sizing: border-box;
  min-height: 0;
  display: flex;
}
.omnimux-assets-main {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
}
/* 公共的分类行自带 12px 上内边距；main 的上内边距叠加上去会让公共比其余三个页签多 16px（见 specs/assets-public-nav-breathing-parity.spec.md）。 */
.omnimux-assets-main:has(> .omnimux-assets-cloud) {
  padding-top: 0;
}
/* 列数由脚本按容器宽度算好、封顶 5 列后写在 data-columns 上（见 grid-columns.js），
   容器本身改成横向 flex，每一列再纵向堆卡片——封面按原始比例，高度不齐，
   不能再用齐行网格。列数等于子列个数，属性只作断言与无脚本时的文档。 */
.omnimux-assets-grid {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.omnimux-assets-masonry-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-assets-empty {
  border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: 12px;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
}
.omnimux-assets-empty p { margin: 0; }
.omnimux-assets-card {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  display: flex;
  flex-direction: column;
}
/* 容器只落在真正带 CTA 浮层的卡片上：公共素材卡、生成物卡与骨架屏共用
   .omnimux-assets-card，不应该跟着获得 containment 语义。 */
.omnimux-assets-card:has(.omnimux-assets-card-overlay) {
  container-type: inline-size;
  container-name: asset-card;
}
.omnimux-assets-card[aria-selected="true"] {
  border-color: var(--dsw-alias-label-primary);
}
.omnimux-assets-card-thumb {
  min-height: 112px;
  background: var(--dsw-alias-bg-module-platform);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
}
.omnimux-assets-card-thumb:has(.omnimux-assets-card-media),
.omnimux-assets-card-thumb:has(.omnimux-assets-card-video) {
  min-height: 0;
  display: block;
}
/* 本地资产库 3:4 黄金竖版卡片与图片等比居中自适应缩放（Issue 2229） */
.omnimux-assets-card:not(.omnimux-assets-cloud-card) [class*="coverWrapper"],
.omnimux-assets-card:not(.omnimux-assets-cloud-card) .omnimux-assets-card-thumb {
  aspect-ratio: 3 / 4;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.omnimux-assets-card:not(.omnimux-assets-cloud-card) .omnimux-assets-card-media,
.omnimux-assets-card:not(.omnimux-assets-cloud-card) .omnimux-assets-card-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}
.omnimux-assets-card:not(.omnimux-assets-cloud-card) .omnimux-assets-card-thumb:has(.omnimux-assets-card-media),
.omnimux-assets-card:not(.omnimux-assets-cloud-card) .omnimux-assets-card-thumb:has(.omnimux-assets-card-video) {
  min-height: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.omnimux-assets-card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, var(--dsw-alias-bg-mask-1) 0%, var(--dsw-alias-bg-mask-2) 100%);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  opacity: 0;
  display: flex;
  align-items: flex-end;
  padding: 10px;
  box-sizing: border-box;
  transition: opacity 0.2s ease;
  pointer-events: none;
  z-index: 2;
}
.omnimux-assets-card:hover .omnimux-assets-card-overlay,
.omnimux-assets-card:focus-within .omnimux-assets-card-overlay {
  opacity: 1;
  pointer-events: auto;
}
.omnimux-assets-card-overlay-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}
.omnimux-assets-overlay-btn {
  display: inline-flex;
  flex: 1 1 0;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: border-box;
  outline: none;
  transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  -webkit-app-region: no-drag;
}
.omnimux-assets-overlay-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* CTA 文字标签：宽度充足时独占一格并收省略号，紧凑区间整块退出布局 */
.omnimux-assets-overlay-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Button 的文字槽是它自己的 flex 项，能否收缩由外层槽位决定；显式钉住，
   不依赖 UI 库内部默认值。 */
.omnimux-assets-overlay-btn > .dshUk-Button-label {
  min-width: 0;
}
/* 卡片自身宽度进入紧凑区间：CTA 退化为纯图标，文字不再参与布局。
   阈值校准：正常网格列宽（>= 260px）稳定展示「图标+名称」，
   仅在极限紧凑窄卡（<= 220px）时才退化为纯图标，文字退出布局。
   flex-wrap 是极窄卡片的兜底：图标不可收缩，宁可换行也不让图标被裁。 */
@container asset-card (max-width: 220px) {
  .omnimux-assets-card-overlay-actions {
    justify-content: center;
    flex-wrap: wrap;
  }
  .omnimux-assets-overlay-label {
    display: none;
  }
  .omnimux-assets-overlay-btn {
    flex: 0 0 auto;
    width: 32px;
    padding: 0;
  }
}
.omnimux-assets-overlay-btn svg {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
}
.omnimux-assets-overlay-btn--secondary {
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}
.omnimux-assets-overlay-btn--secondary:hover {
  background: var(--dsw-alias-bg-mask-2);
}
.omnimux-assets-overlay-btn--primary {
  background: var(--dsw-alias-button-primary-fill);
  border: 1px solid transparent;
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-assets-overlay-btn--primary:hover {
  background: var(--dsw-alias-button-primary-hover);
}
.omnimux-assets-overlay-btn:disabled,
.omnimux-assets-overlay-btn[aria-disabled="true"] {
  opacity: 0.85;
  cursor: default;
}
.omnimux-assets-card-media {
  width: 100%;
  height: auto;
  display: block;
}
.omnimux-assets-card-video {
  width: 100%;
  height: auto;
  display: block;
  background: var(--dsw-alias-bg-module-platform);
}
.omnimux-assets-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  line-height: 16px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  border: 1px solid var(--dsw-alias-border-l2);
  z-index: 1;
}
/* 缩略图右上角：类型角标与「打开文件位置」并排右对齐，避免互相遮挡。 */
.omnimux-assets-card-corner {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 2;
}
.omnimux-assets-card-corner .omnimux-assets-badge {
  position: static;
  top: auto;
  right: auto;
  z-index: auto;
}
.omnimux-assets-card-corner .omnimux-assets-reveal,
.omnimux-assets-card-corner .omnimux-assets-reveal:hover,
.omnimux-assets-card-corner .omnimux-assets-reveal:active {
  width: 24px;
  min-width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border-radius: 6px;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
}
/* 悬停卡片才浮现；键盘进入卡片或聚焦按钮时同样可见，不牺牲可达性。 */
.omnimux-assets-card:hover .omnimux-assets-card-corner .omnimux-assets-reveal,
.omnimux-assets-card:focus-within .omnimux-assets-card-corner .omnimux-assets-reveal,
.omnimux-assets-card-corner .omnimux-assets-reveal:hover,
.omnimux-assets-card-corner .omnimux-assets-reveal:focus-visible {
  opacity: 1;
  color: var(--dsw-alias-label-primary);
}
.omnimux-assets-missing {
  position: absolute;
  bottom: 8px;
  left: 8px;
  font-size: 11px;
  color: var(--dsw-alias-state-warn-primary);
}
.omnimux-assets-card-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 48px;
}
.omnimux-assets-card-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-card-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check,
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check:hover,
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check:active {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  min-width: 22px;
  height: 22px;
  min-height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  z-index: 3;
  opacity: 0;
  transform: none;
  transition: opacity 0.15s ease;
  border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  color: inherit;
}
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check[data-selected="true"],
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check[data-selected="true"]:hover {
  opacity: 1;
  border: none;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-assets-focusable:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
  border-radius: 8px;
}
.omnimux-assets-focusable:hover { border-color: var(--dsw-alias-border-l4); }
.omnimux-assets-focusable:hover .omnimux-assets-check,
.omnimux-assets-focusable:focus-within .omnimux-assets-check { opacity: 1; }
.omnimux-assets-browse { display: flex; flex-direction: column; gap: 12px; min-height: 100%; }
.omnimux-assets-crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 13px;
}
.omnimux-assets-crumb-edit {
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.omnimux-assets-crumb-edit:hover {
  color: var(--dsw-alias-label-primary);
}
.omnimux-assets-detail-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 13px;
  padding: 4px 0;
}
.omnimux-assets-detail-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.omnimux-assets-crumb {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.omnimux-assets-crumb-sep { color: var(--dsw-alias-label-tertiary); }
.omnimux-assets-muted {
  margin: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-detail {
  flex: none;
  width: 320px;
  overflow: auto;
  border-left: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  display: flex;
  flex-direction: column;
}
.omnimux-assets-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-assets-detail-title {
  margin: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
}
.omnimux-assets-detail-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
}
.omnimux-assets-textarea {
  width: 100%;
  min-height: 96px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px 8px;
  resize: vertical;
  color: inherit;
  background: inherit;
  font: inherit;
  box-sizing: border-box;
}
.omnimux-assets-cite { font-size: 12px; }
.omnimux-assets-drop {
  width: 100%;
  min-height: 128px;
  border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
  padding: 16px;
  box-sizing: border-box;
}
.omnimux-assets-drop-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.omnimux-assets-filelist {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-assets-filelist li {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  align-items: center;
}
.omnimux-assets-filelist-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-folder-badge {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.omnimux-assets-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.omnimux-assets-form { display: flex; flex-direction: column; gap: 12px; }
.omnimux-assets-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-assets-at {
  color: var(--dsw-alias-label-tertiary);
  font-size: 18px;
}
.omnimux-assets-name-field { flex: 1; min-width: 0; }
.omnimux-assets-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-assets-type-sep { color: var(--dsw-alias-border-l2); }
.omnimux-assets-desc-field { flex: 1; min-width: 0; }
/* ── 表单输入「双重边框」防御 ──
   dsh-ui-kit 的 InputField 由外层 .dshUk-InputField-control 绘制圆角边框，并用
   :focus-within 绘制聚焦环；内部原生 <input> 自身不应再出现任何边框或轮廓。
   AddAssetDialog 打开时用 useEffect 立即 focus 名称输入框，命中全局
   :focus-visible（带 !important），其权重高于 Kit 的 .input{outline:none}，
   于是外层圆角框内又多出一个直角 outline，形成「两个框」。
   此处用同等 !important + 更高选择器权重（.omnimux-assets-form input:focus-visible
   = 0,2,1 > :focus-visible = 0,1,0）做防御性重置，确保全局样式与浏览器默认样式都无法再叠加。 */
.omnimux-assets-form input:focus,
.omnimux-assets-form input:focus-visible,
.omnimux-assets-form textarea:focus,
.omnimux-assets-form textarea:focus-visible,
.omnimux-assets-form select:focus,
.omnimux-assets-form select:focus-visible {
  outline: none !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
}
.omnimux-assets-form [class*="InputField-control"] input,
.omnimux-assets-form [class*="SearchField-root"] input {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
.omnimux-assets-icon {
  flex: none;
  display: inline-block;
  vertical-align: middle;
}
.omnimux-assets-modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: omnimux-assets-fade-in 140ms ease;
}
@keyframes omnimux-assets-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes omnimux-assets-zoom-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.omnimux-assets-modal-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 860px;
}
.omnimux-assets-modal-close-external,
.omnimux-modal-close-btn {
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
.omnimux-assets-modal-close-external:hover,
.omnimux-modal-close-btn:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l2);
  transform: scale(1.08);
}
.omnimux-assets-modal-close-external:active,
.omnimux-modal-close-btn:active {
  transform: scale(0.96);
}
.omnimux-assets-modal-close-external svg,
.omnimux-modal-close-btn svg {
  pointer-events: none;
  display: block;
}
.omnimux-assets-modal-close-external.is-external,
.omnimux-modal-close-btn.is-external {
  top: 0px;
  right: -50px;
}
@media (max-width: 1280px) {
  .omnimux-assets-modal-close-external.is-external,
  .omnimux-modal-close-btn.is-external {
    top: 14px;
    right: 14px;
    background: var(--dsw-alias-bg-layer-3);
  }
}
.omnimux-assets-modal-container {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 860px;
  max-height: 85vh;
  border-radius: 16px;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 16px 48px var(--dsw-alias-bg-mask-1);
  animation: omnimux-assets-zoom-in 140ms ease;
}
.omnimux-assets-modal-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-base));
}
.omnimux-assets-modal-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.omnimux-assets-modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-modal-badge {
  font-size: 11px;
  line-height: 16px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  border: 1px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-secondary);
  font-weight: 500;
}
.omnimux-assets-modal-close {
  flex: none;
  width: 32px !important;
  height: 32px !important;
  border-radius: 50% !important;
  background: var(--dsw-alias-bg-layer-2) !important;
  border: 1px solid var(--dsw-alias-border-l1) !important;
  color: var(--dsw-alias-label-secondary) !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 120ms ease, border-color 140ms ease !important;
  box-shadow: 0 2px 8px var(--dsw-alias-bg-base);
}
.omnimux-assets-modal-close:hover {
  background: var(--dsw-alias-bg-layer-3) !important;
  color: var(--dsw-alias-label-primary) !important;
  border-color: var(--dsw-alias-border-l2) !important;
  transform: scale(1.08) !important;
}
.omnimux-assets-modal-close:active {
  transform: scale(0.96) !important;
}
.omnimux-assets-modal-body {
  flex: 1;
  min-height: 240px;
  max-height: calc(85vh - 120px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  overflow: hidden;
  position: relative;
}
.omnimux-assets-modal-media-wrap {
  width: 100%;
  height: 100%;
  max-height: calc(85vh - 120px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}
.omnimux-assets-modal-image {
  max-width: 100%;
  max-height: calc(85vh - 152px);
  object-fit: contain;
  border-radius: 8px;
  display: block;
}
.omnimux-assets-modal-video {
  max-width: 100%;
  max-height: calc(85vh - 152px);
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform);
  display: block;
}
/* A voice has no picture to zoom, so the preview gives it the widest player the
   dialog can hold without stretching the transport controls. */
.omnimux-assets-modal-audio {
  width: min(420px, 100%);
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform);
}
/* A text asset is read, not zoomed: the body scrolls instead of the dialog. */
.omnimux-assets-modal-text-wrap {
  width: 100%;
  height: 100%;
  max-height: calc(85vh - 120px);
  overflow-y: auto;
  padding: 4px 20px 20px;
  box-sizing: border-box;
}
.omnimux-assets-modal-text {
  margin: 0;
  font-size: 13px;
  line-height: 21px;
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
.omnimux-assets-modal-unsupported {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 24px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-modal-unsupported-icon {
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-modal-unsupported-text {
  margin: 0;
  font-size: 14px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-modal-unsupported-filename {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-modal-footer {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 18px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-base));
}
.omnimux-assets-modal-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-modal-path-label {
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-modal-path-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-modal-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* The modal's half of the cloud -> local bridge. The scoped selector is what
   outranks the kit's own outline-button rule; 已收藏 then reads as a filled
   plate, so a reopened preview still shows the row as done. */
.omnimux-assets-modal-actions .omnimux-assets-modal-save[aria-pressed="true"] {
  background: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-assets-file-table, .omnimux-assets-artifact-table {
  width: 100%;
}
.omnimux-assets-th-file-name {
  width: 40%;
}
.omnimux-assets-th-artifact-name {
  width: 34%;
}
.omnimux-assets-clickable-row {
  cursor: pointer;
}
.omnimux-assets-cell-file-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}
.omnimux-assets-cell-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-cell-dir-arrow {
  display: inline-flex;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-mapping-invalid {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-state-warn-primary);
}

/* ---- cloud assets -------------------------------------------------------
   The cloud tab reuses the local card. What it adds is the two-level
   navigation, a fixed tile ratio that stops the grid from reflowing as covers
   load, the scroll container, and the top-right control that mounts a card into
   the conversation. Colour stays neutral end to end: the selected chip is inked
   with the label colour — a white pill with black text on the dark theme, the
   reverse on the light one — never with a brand accent. The two rows also sit
   the same distance from the content under them: this nav carries 20px of bottom
   padding, which together with the 10px gap of the cloud stack equals the local
   path's 14px of bottom padding plus the 16px top padding of
   .omnimux-assets-main. */

.omnimux-assets-cloud {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 10px;
}
.omnimux-assets-cloud-nav {
  display: flex;  flex-direction: column;
  gap: 8px;
  flex: 0 0 auto;
  padding: 12px 0 20px;
}
/* 云端的一级/二级分类行吸附在一级工具栏正下方（骨架契约 §二·补）。 */
.omnimux-assets-cloud-nav.omx-stage-sticky {
  top: var(--stage-rail-h, 0px);
}
.omnimux-assets-cloud-nav-row,
.omnimux-assets-cloud-subnav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.omnimux-assets-cloud-subnav {
  padding-inline-start: 10px;
  border-left: 2px solid var(--dsw-alias-border-l2);
}
/* Category chips, both levels, in both navs. The nav wrappers are part of the
   selectors because the kit's own rules for this control reach (0,2,0)
   unselected and (0,4,0) on hover, so a bare class would lose to them. The
   local library's row lists its selectors here too: it is the same chip, and
   one shared block is what keeps the two rows from drifting apart. */
.omnimux-assets-cloud-nav .omnimux-assets-cloud-nav-row .omnimux-assets-cloud-chip,
.omnimux-assets-cloud-nav .omnimux-assets-cloud-subnav .omnimux-assets-cloud-chip,
.omnimux-assets-local-nav .omnimux-assets-local-nav-row .omnimux-assets-cloud-chip {
  border-radius: 999px;
  padding: 0 12px;
}
/* Selected: a filled pill in the label colour, with the label inverted on top
   of it. No accent hue is involved, in either theme. */
.omnimux-assets-cloud-nav .omnimux-assets-cloud-nav-row .omnimux-assets-cloud-chip[aria-pressed="true"],
.omnimux-assets-cloud-nav .omnimux-assets-cloud-subnav .omnimux-assets-cloud-chip[aria-pressed="true"],
.omnimux-assets-local-nav .omnimux-assets-local-nav-row .omnimux-assets-cloud-chip[aria-pressed="true"],
.omnimux-assets-cloud-nav .omnimux-assets-cloud-nav-row .omnimux-assets-cloud-chip[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]),
.omnimux-assets-cloud-nav .omnimux-assets-cloud-subnav .omnimux-assets-cloud-chip[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]),
.omnimux-assets-local-nav .omnimux-assets-local-nav-row .omnimux-assets-cloud-chip[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]),
.omnimux-assets-cloud-nav .omnimux-assets-cloud-nav-row .omnimux-assets-cloud-chip[aria-pressed="true"]:active:not(:disabled):not([aria-disabled="true"]),
.omnimux-assets-cloud-nav .omnimux-assets-cloud-subnav .omnimux-assets-cloud-chip[aria-pressed="true"]:active:not(:disabled):not([aria-disabled="true"]),
.omnimux-assets-local-nav .omnimux-assets-local-nav-row .omnimux-assets-cloud-chip[aria-pressed="true"]:active:not(:disabled):not([aria-disabled="true"]) {
  background: var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.16));
  border-color: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.28));
  box-shadow: none;
  color: var(--dsw-alias-label-primary);
  font-weight: 700;
}
/* On a filled chip the count has to invert with the label, or it lands as
   tertiary grey on white. */
.omnimux-assets-cloud-chip[aria-pressed="true"] .omnimux-assets-cloud-count {
  color: inherit;
  opacity: 0.55;
}
.omnimux-assets-cloud-count {
  margin-left: 6px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary);
}
/* 角色的八维筛选栏。它取代二级分类那一行，形态与它一致：一排胶囊，未选中是
   中性描边，选中反白。没有任何品牌色参与。 */
.omnimux-assets-cloud-dimensions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-inline-start: 10px;
  border-left: 2px solid var(--dsw-alias-border-l2);
}
.omnimux-assets-cloud-dimension {
  position: relative;
}
.omnimux-assets-cloud-dimensions .omnimux-assets-cloud-dimension-btn {
  gap: 4px;
  border-radius: 999px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-cloud-dimensions .omnimux-assets-cloud-dimension-btn:hover:not(:disabled):not([aria-disabled="true"]) {
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}
/* 选中态与分类胶囊同一套：底色是标签色，标签反白。 */
.omnimux-assets-cloud-dimensions .omnimux-assets-cloud-dimension-btn[aria-pressed="true"],
.omnimux-assets-cloud-dimensions .omnimux-assets-cloud-dimension-btn[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-assets-cloud-dimension-caret {
  color: var(--dsw-alias-label-tertiary);
  transform: rotate(90deg);
  transition: transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omnimux-assets-cloud-dimension-btn[aria-expanded="true"] .omnimux-assets-cloud-dimension-caret {
  transform: rotate(-90deg);
}
.omnimux-assets-cloud-dimension-btn[aria-pressed="true"] .omnimux-assets-cloud-dimension-caret {
  color: inherit;
  opacity: 0.7;
}
.omnimux-assets-cloud-dimension-menu {
  position: absolute;
  top: calc(100% + 6px);
  inset-inline-start: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 168px;
  max-height: 264px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated);
  box-shadow: 0 12px 28px var(--dsw-alias-shadow-strong);
}
/* 面板里的选项是同一套胶囊文字的列表行：左标签右计数，选中反白。 */
.omnimux-assets-cloud-dimension-menu .omnimux-assets-cloud-dimension-option {
  width: 100%;
  justify-content: space-between;
  border-radius: 6px;
  padding: 0 8px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-cloud-dimension-menu .omnimux-assets-cloud-dimension-option:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omnimux-assets-cloud-dimension-menu .omnimux-assets-cloud-dimension-option[aria-pressed="true"],
.omnimux-assets-cloud-dimension-menu .omnimux-assets-cloud-dimension-option[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-assets-cloud-dimension-option-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.omnimux-assets-cloud-dimension-menu .omnimux-assets-cloud-count {
  margin-left: 12px;
}
.omnimux-assets-cloud-dimension-option[aria-pressed="true"] .omnimux-assets-cloud-count {
  color: inherit;
  opacity: 0.55;
}
/* 重置只在有筛选时出现，且是这一行里最轻的一个控件。 */
.omnimux-assets-cloud-dimensions .omnimux-assets-cloud-dimension-reset {
  margin-inline-start: 4px;
  border-radius: 999px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-cloud-dimensions .omnimux-assets-cloud-dimension-reset:hover:not(:disabled):not([aria-disabled="true"]) {
  color: var(--dsw-alias-label-primary);
}
.omnimux-assets-cloud-scroll {
  display: contents;
}
/* 列数由脚本写在 data-columns 上，本地货架与公共货架共用同一套瀑布流列
   （见 grid-columns.js / masonry.js）。图片到达前用 HTML width/height 属性
   按默认立绘比例占位，不再用固定像素高度裁切封面。 */
/* Every part of the card opens the preview, so the pointer says so. A voice card
   overrides this on its own plate, which plays instead. */
.omnimux-assets-cloud-card {
  position: relative;
  cursor: pointer;
}
.omnimux-assets-cloud-card .omnimux-assets-cloud-thumb--action {
  cursor: pointer;
}
/* 图片/视频：封面按原始比例完整展示，下面一行标题。 */
.omnimux-assets-cloud-card--media .omnimux-assets-cloud-thumb {
  height: auto;
  min-height: 0;
  display: block;
  aspect-ratio: auto;
}
/* 首次加载的骨架卡：按默认立绘比例占位，数据到达后换成真图。
   动效只用一次克制的透明度呼吸，跟随主题 token，深浅色下都读得清。 */
.omnimux-assets-cloud-skeleton {
  pointer-events: none;
}
.omnimux-assets-cloud-skeleton-thumb {
  aspect-ratio: 9 / 16;
  height: auto;
  border-radius: 10px;
  background-color: var(--dsw-alias-bg-elevated);
  animation: omnimux-assets-skeleton-breathe 1.6s ease-in-out infinite;
}
.omnimux-assets-cloud-skeleton-line {
  height: 14px;
  margin-top: 10px;
  width: 60%;
  border-radius: 6px;
  background-color: var(--dsw-alias-bg-elevated);
  animation: omnimux-assets-skeleton-breathe 1.6s ease-in-out infinite;
}
@keyframes omnimux-assets-skeleton-breathe {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.85; }
}
@media (prefers-reduced-motion: reduce) {
  .omnimux-assets-cloud-skeleton-thumb,
  .omnimux-assets-cloud-skeleton-line {
    animation: none;
    opacity: 0.6;
  }
}
/* 声音：一块暗调微彩底板，正中间一个居中的播放/暂停键，点一下即播即停。
   底板不画任何波形、刻度或跳动条——一排音色卡片同时出现细密竖线会变成视觉噪点，
   行与行的区别只交给颜色本身，整块面板因此保持干净。
   底色仍由官方 Token 打底，上面叠一层极低饱和的深色微彩：深靛青 / 墨绿 / 曜蓝 /
   暗紫夜 / 深炭黑五种，按行 id 确定性轮换。色相压到最低、明度压到最深，浅色和深色
   主题下都保持同一块暗色板，只用来让连续的音效卡片彼此可分辨，不出现任何亮色。
   这里是媒体展示面（等同缩略图底），不是界面控件色，故按 design.md 的特化场景豁免。 */
.omnimux-assets-cloud-card--audio .omnimux-assets-cloud-thumb {
  height: 112px;
  background-color: var(--dsw-alias-bg-elevated);
  background-image: linear-gradient(135deg, rgba(18, 22, 30, 0.94), rgba(10, 12, 17, 0.98)); /* exempt-ui03 音效卡片暗调底：媒体展示面，非控件色 */
}
.omnimux-assets-cloud-card--audio[data-theme="indigo"] .omnimux-assets-cloud-thumb {
  background-image: linear-gradient(135deg, rgba(24, 32, 60, 0.94), rgba(12, 16, 30, 0.98)); /* exempt-ui03 深靛青微彩 */
}
.omnimux-assets-cloud-card--audio[data-theme="jade"] .omnimux-assets-cloud-thumb {
  background-image: linear-gradient(135deg, rgba(20, 42, 38, 0.94), rgba(10, 20, 19, 0.98)); /* exempt-ui03 墨绿微彩 */
}
.omnimux-assets-cloud-card--audio[data-theme="azure"] .omnimux-assets-cloud-thumb {
  background-image: linear-gradient(135deg, rgba(20, 36, 58, 0.94), rgba(10, 17, 28, 0.98)); /* exempt-ui03 曜蓝微彩 */
}
.omnimux-assets-cloud-card--audio[data-theme="violet"] .omnimux-assets-cloud-thumb {
  background-image: linear-gradient(135deg, rgba(38, 26, 56, 0.94), rgba(17, 12, 26, 0.98)); /* exempt-ui03 暗紫夜微彩 */
}
.omnimux-assets-cloud-card--audio[data-theme="charcoal"] .omnimux-assets-cloud-thumb {
  background-image: linear-gradient(135deg, rgba(32, 34, 38, 0.94), rgba(15, 17, 19, 0.98)); /* exempt-ui03 深炭黑微彩 */
}
.omnimux-assets-cloud-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: none;
}
/* 没有封面的片段：首帧就是卡片正面，不等悬停才显形。否则一张没有海报的视频卡要么
   一片空白，要么退化成类型图标，也就是用户看到的「灰底占位符」。有封面的卡片不适用
   这条规则，预览仍旧只在悬停时浮出。 */
.omnimux-assets-cloud-preview--bare {
  opacity: 1;
}
.omnimux-assets-cloud-card:hover .omnimux-assets-cloud-preview,
.omnimux-assets-cloud-card:focus-within .omnimux-assets-cloud-preview {
  opacity: 1;
}
/* The play control is decoration: the whole thumbnail is the button, so the
   glyph inside it never takes a click of its own. */
.omnimux-assets-cloud-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
  pointer-events: none;
  transition: opacity 0.18s ease;
}
/* 带封面的卡片（拟人角色/视频/立绘）：默认隐藏播放图标，鼠标悬停、键盘聚焦或正在播放时才显示 */
.omnimux-assets-cloud-card--media .omnimux-assets-cloud-play {
  opacity: 0;
}
.omnimux-assets-cloud-card--media:hover .omnimux-assets-cloud-play,
.omnimux-assets-cloud-card--media:focus-within .omnimux-assets-cloud-play,
.omnimux-assets-cloud-card--media [aria-pressed="true"] .omnimux-assets-cloud-play,
.omnimux-assets-cloud-card--media .omnimux-assets-cloud-thumb[aria-pressed="true"] .omnimux-assets-cloud-play {
  opacity: 1;
}
/* Top-right hover control: the one route out of a card, which mounts the asset
   into the conversation. A neutral plate that inverts to ink under the pointer;
   it carries no hue of its own.
   The control is pinned to the corner — absolute, above the card body — so it
   never joins the flow and never lands in the middle of the text. */
.omnimux-assets-cloud-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
}
.omnimux-assets-cloud-card .omnimux-assets-cloud-chat {
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated);
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  opacity: 0;
  transition: opacity 0.16s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.omnimux-assets-cloud-card:hover .omnimux-assets-cloud-chat,
.omnimux-assets-cloud-card:focus-within .omnimux-assets-cloud-chat {
  opacity: 1;
}
.omnimux-assets-cloud-card .omnimux-assets-cloud-chat:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
/* ---- card bodies ---------------------------------------------------------
   Three kinds, one card (see cloudCardKind): 图片/视频 = 缩略图 + 一行标题；
   声音 = 暗调微彩底板 + 居中播放键 + 一句音色描述；文本类（没有封面也没有可播
   媒体的文档行）= 标题 + 描述。文本类画一块占位图只会把标题和描述挤成一行省略，
   所以它直接按阅读版式排版。 */

/* 声音卡片的描述就是那句音色说明，一行。 */
.omnimux-assets-cloud-desc {
  margin: 0;
  font-size: 12px;
  line-height: 17px;
  color: var(--dsw-alias-label-tertiary);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* 文本类：标题最多 2 行、描述最多 4 行。标题给右上角那块悬浮牌子让出位置，
   所以按钮展开时不会盖住任何一行字。 */
.omnimux-assets-cloud-card--text .omnimux-assets-card-body {
  flex: 1;
  gap: 6px;
  padding: 14px;
}
.omnimux-assets-cloud-card--text .omnimux-assets-card-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  white-space: normal;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  /* 14px 卡片内边距 + 32px：一块 28px 的牌子离右边缘 8px，标题文字正好停在它
     左边，按钮展开时一行都不压。 */
  padding-right: 32px;
}
.omnimux-assets-cloud-card--text .omnimux-assets-cloud-desc {
  -webkit-line-clamp: 4;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
/* 图片/视频：只有缩略图和一行标题。 */
.omnimux-assets-cloud-card--media .omnimux-assets-card-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omnimux-assets-cloud-sentinel {
  height: 1px;
}
.omnimux-assets-cloud-more {
  display: flex;
  justify-content: center;
  padding: 14px 0 4px;
}
.omnimux-assets-cloud-end {
  margin: 0;
  padding: 14px 0 6px;
  text-align: center;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-cloud-notice {
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}

/* ---- cloud assets category rows layout (All category stream) ---- */
.omnimux-assets-cloud-rows-scroll {
  display: flex;
  flex-direction: column;
  gap: 36px;
  padding: 12px 0 48px;
}

.omnimux-assets-cloud-row-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: relative;
}

.omnimux-assets-cloud-row-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 0 4px;
}

.omnimux-assets-cloud-row-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.omnimux-assets-cloud-row-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.omnimux-assets-cloud-row-title:hover {
  color: var(--dsw-alias-label-secondary);
}

.omnimux-assets-cloud-row-desc {
  margin: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
  line-height: 1.4;
}

.omnimux-assets-cloud-row-view-all {
  border-radius: 9999px !important;
  font-size: 13px !important;
  height: 30px !important;
  padding: 0 14px !important;
  color: var(--dsw-alias-label-secondary) !important;
  border: 1px solid var(--dsw-alias-border) !important;
  background: var(--dsw-alias-bg-layer-1) !important;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.omnimux-assets-cloud-row-view-all:hover:not(:disabled):not([aria-disabled="true"]) {
  color: var(--dsw-alias-label-primary) !important;
  background: var(--dsw-alias-bg-layer-2) !important;
  border-color: var(--dsw-alias-border-hover) !important;
  transform: translateX(2px);
}

.omnimux-assets-cloud-row-wrapper {
  position: relative;
  width: 100%;
}

.omnimux-assets-cloud-row-cards {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  scrollbar-width: none;
  padding: 6px 4px 14px;
}

.omnimux-assets-cloud-row-cards::-webkit-scrollbar {
  display: none;
}

.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card {
  flex: 0 0 190px;
  width: 190px;
  max-width: 190px;
  height: 338px;
  aspect-ratio: 9 / 16;
  position: relative;
  overflow: hidden;
}

/* 风格、声音：固定 16:9 横版卡片。声音没有画面，竖长色块只剩一个播放键。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card[data-aspect="horizontal"],
.omnimux-assets-cloud-row-section[data-category="style"] .omnimux-assets-cloud-card,
.omnimux-assets-cloud-row-section[data-category="audio"] .omnimux-assets-cloud-card {
  flex: 0 0 300px;
  width: 300px;
  max-width: 300px;
  height: 169px;
  aspect-ratio: 16 / 9;
}

/* 满画幅自适应铺满卡片容器 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.omnimux-assets-cloud-row-cards .omnimux-assets-card-media,
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 悬停暗化遮罩蒙层（对标图 3） */
.omnimux-assets-cloud-card-mask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  opacity: 0;
  transition: opacity 0.22s ease;
  pointer-events: none;
  z-index: 2;
}

.omnimux-assets-cloud-card:hover .omnimux-assets-cloud-card-mask {
  opacity: 1;
}

/* 单行流卡片默认不显示标题，悬停时浮现大字标题（对标图 2 & 图 3） */
.omnimux-assets-cloud-row-cards .omnimux-assets-card-body {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 14px 14px 12px;
  z-index: 3;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.22s ease, transform 0.22s ease;
  pointer-events: none;
  background: linear-gradient(to top, var(--dsw-alias-bg-mask-1) 0%, transparent 100%);
}

.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card:hover .omnimux-assets-card-body {
  opacity: 1;
  transform: translateY(0);
}

.omnimux-assets-cloud-row-cards .omnimux-assets-card-title {
  color: var(--dsw-alias-label-primary) !important;
  font-weight: 700 !important;
  font-size: 14px;
  text-shadow: 0 2px 6px var(--dsw-alias-bg-mask-1);
  white-space: normal;
  line-height: 1.3;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-desc {
  color: var(--dsw-alias-label-secondary) !important;
  font-size: 11px;
  text-shadow: 0 1px 4px var(--dsw-alias-bg-mask-1);
  margin: 2px 0 0;
  line-height: 1.2;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-actions {
  z-index: 4;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card:hover .omnimux-assets-cloud-actions {
  opacity: 1;
}

/* ── 单行流里的文本卡：正文就是卡片唯一的内容，因此它常驻可见，不做悬停浮现。
   底板取中性的次级表面（design.md §3.1「次级卡片容器」），不取声音行的五色微彩：
   五色微彩是「本身没有内容的媒体展示面」的豁免（exempt-ui03），文本卡是常规内容卡，
   按 design.md §3.6 保持黑白中性，不引入有色底、不扩 data-theme。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text {
  background: var(--dsw-alias-bg-layer-1);
}

/* 正文铺满整张卡、顶部对齐、常驻可见；不再有底部渐变蒙层。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text .omnimux-assets-card-body {
  position: absolute;
  inset: 0;
  padding: 14px;
  background: none;
  opacity: 1;
  transform: none;
}

/* 标题：与网格版式逐项一致（styles.js:1360-1372）。既有单行流规则用了
   !important 锁死 700 字重与主色，这里必须同样用 !important 才能覆盖。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text .omnimux-assets-card-title {
  font-size: 14px;
  font-weight: 600 !important;
  line-height: 20px;
  color: var(--dsw-alias-label-primary) !important;
  text-shadow: none;
  padding-right: 32px;
  white-space: normal;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 描述：与网格版式逐项一致（styles.js:1373-1377），行数上限 4 行。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text .omnimux-assets-cloud-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary) !important;
  text-shadow: none;
  white-space: normal;
  overflow-wrap: anywhere;
  text-overflow: clip;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}

/* 文本卡没有画面可暗化：暗化蒙层只会压暗卡片唯一的内容、拉低对比度，
   且不提供任何可供性（卡片本身整块可点）。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text .omnimux-assets-cloud-card-mask {
  display: none;
}

/* 常驻可见 → 悬停不改变正文位置与透明度；悬停只让右上角按钮淡入。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text:hover .omnimux-assets-card-body,
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text:focus-within .omnimux-assets-card-body {
  opacity: 1;
  transform: none;
}

.omnimux-assets-cloud-row-skeleton {
  flex: 0 0 190px;
  width: 190px;
  height: 338px;
  aspect-ratio: 9 / 16;
}

.omnimux-assets-cloud-row-section[data-category="style"] .omnimux-assets-cloud-row-skeleton,
.omnimux-assets-cloud-row-section[data-category="audio"] .omnimux-assets-cloud-row-skeleton {
  flex: 0 0 300px;
  width: 300px;
  height: 169px;
  aspect-ratio: 16 / 9;
}

.omnimux-assets-cloud-row-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px !important;
  height: 36px !important;
  border-radius: 50% !important;
  background: var(--dsw-alias-bg-elevated) !important;
  border: 1px solid var(--dsw-alias-border-l2) !important;
  color: var(--dsw-alias-label-primary) !important;
  z-index: 5;
  box-shadow: 0 4px 12px var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.2s ease;
}

.omnimux-assets-cloud-row-arrow:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--dsw-alias-bg-layer-3) !important;
  border-color: var(--dsw-alias-border-hover) !important;
  transform: translateY(-50%) scale(1.08);
}

.omnimux-assets-cloud-row-arrow--left {
  left: -12px;
}

.omnimux-assets-cloud-row-arrow--right {
  right: -12px;
}

/* ---- integrated products tab view (1:1 aligned with omnimux-products) ---- */
.omnimux-products-create-menu {
  position: relative;
  display: inline-flex;
  flex: none;
}
.omnimux-products-menu-card {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  min-width: 320px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-products-menu-item {
  width: 100%;
  height: auto;
  padding: 8px 10px;
  justify-content: flex-start;
  gap: 10px;
  border-radius: 8px;
  text-align: left;
  white-space: normal;
}
.omnimux-products-menu-item > span {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.omnimux-products-menu-item-icon {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.omnimux-products-menu-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.omnimux-products-menu-item-title {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.omnimux-products-menu-item-desc {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  white-space: normal;
}
.omnimux-products-stage-toolbar {
  flex: none;
  padding: 0 20px 12px;
  height: 44px;
}
.omnimux-products-body {
  min-height: 0;
  padding: 0;
}
.omnimux-products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.omnimux-products-empty {
  border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: 12px;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  padding: 24px;
  margin: 0;
  width: 100%;
}
.omnimux-products-empty p {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
}
.omnimux-products-card {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  display: flex;
  flex-direction: column;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.omnimux-products-card:hover {
  transform: translateY(-2px);
  border-color: var(--dsw-alias-border-l4);
}
.omnimux-products-card-thumb {
  height: 112px;
  background: var(--dsw-alias-bg-module-platform);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.omnimux-products-card-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.omnimux-products-glyph {
  font-size: 32px;
  font-weight: 500;
  color: var(--dsw-alias-label-dimmed);
}
.omnimux-products-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-mask-1);
  color: var(--dsw-alias-label-secondary);
}
.omnimux-products-card-thumb .omnimux-assets-check {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  min-width: 22px;
  height: 22px;
  min-height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  z-index: 3;
  opacity: 0;
  transform: none;
  transition: opacity 0.15s ease;
  border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  color: inherit;
}
.omnimux-products-card-thumb .omnimux-assets-check[data-selected="true"],
.omnimux-products-card-thumb .omnimux-assets-check[data-selected="true"]:hover {
  opacity: 1;
  border: none;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-products-card:hover .omnimux-assets-check,
.omnimux-products-card:focus-within .omnimux-assets-check {
  opacity: 1;
}
.omnimux-products-card-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-products-card-name {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-products-card-sub {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.omnimux-generations-container {
  width: 100%;
  padding: 0 20px 24px;
  box-sizing: border-box;
}
.omnimux-generations-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(260px, 300px));
  gap: 12px;
  justify-content: start;
  width: 100%;
}
.omnimux-generations-nav-divider {
  width: 1px;
  height: 16px;
  background: var(--dsw-alias-border-l3);
  margin: 0 6px;
  align-self: center;
}
.omnimux-generation-card {
  position: relative;
  border-radius: 12px;
  background: var(--dsw-alias-bg-card);
  border: 1px solid var(--dsw-alias-border-l3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  max-width: 320px;
  width: 100%;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.omnimux-generation-card:hover {
  transform: translateY(-2px);
  border-color: var(--dsw-alias-border-l1);
  box-shadow: 0 4px 16px var(--dsw-alias-shadow-popover);
}
.omnimux-generation-card-thumb {
  position: relative;
  width: 100%;
  min-height: 160px;
  max-height: 220px;
  background: var(--dsw-alias-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.omnimux-generation-image-thumb {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}
.omnimux-generation-video-placeholder {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 140px;
  max-height: 220px;
  background: var(--dsw-alias-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.omnimux-generation-video-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.omnimux-generation-play-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-mask-1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary);
  pointer-events: none;
}
.omnimux-generation-audio-placeholder {
  width: 100%;
  height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-generation-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-mask-1);
  color: var(--dsw-alias-label-secondary);
  backdrop-filter: blur(4px);
}
.omnimux-generation-card-meta {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.omnimux-generation-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-generation-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omnimux-generation-time {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-generation-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.omnimux-generation-action-btn {
  padding: 4px;
  border-radius: 4px;
}




`

export function injectAssetsStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLES_ID)) return
  const styleNode = document.createElement('style')
  styleNode.id = STYLES_ID
  styleNode.textContent = ASSETS_CSS
  document.head.appendChild(styleNode)
}
