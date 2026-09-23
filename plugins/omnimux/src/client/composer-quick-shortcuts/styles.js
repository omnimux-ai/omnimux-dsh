/**
 * 输入框下方四条快捷方式的样式。
 *
 * 与仓库既有做法一致：样式集中在本模块的样式表里，JSX 零内联业务样式
 * （design.md 的 UI02 硬门禁）；色彩一律取既有 design token，不新造色值。
 *
 * 形态（Issue #2572）：**无边框**的「图标 + 文字 + 箭头」，四条作为一组**整行居中**。
 * 因此这里没有边框、圆角底与底色，取而代之的是两处可读的状态表达：
 * 文字色（次级 → 一级）与行尾箭头的透明度（半透明 → 实心）；选中态另有文字色。
 *
 * 模型与参数挂在输入框左侧槽位；外部仅保留四条快捷方式与整行错误提示。
 * 输入框内配置由卡片局部密度控制，不参与外部快捷方式的居中与换行计算。
 *
 * 窄列下的横向溢出（Issue #2588）：病灶不在**行宽**，而在**行内内容**。
 * 这一排与输入框卡片本来就同宽——两者读同一个令牌（卡片是 `max-width: var(--dsh-composer-card-max-width)`，
 * 这一排是 `min(同一令牌, 100% − 2×侧边清除量)`），扫过 720–1600px 共 45 个宽度，
 * 实测两者宽度差恒为 0。真正撑破卡片的是控件那一行里那块压不动的 nowrap 内容：
 * 最小内容宽 509.3px，而卡片进紧凑列后只有 318px，内容从行右缘顶出卡片 78.34px。
 * 因此修法是把控件那一行**在作用域内**放开折行（见下方 `.omx-quick-shortcut-controls > …`），
 * 而不是给这一排换一个宽度来源。证据：`.agent-reports/quick-shortcut-link-chip/layout-geometry*.json`。
 *
 * 位置：见文末的 `order` 规则——照官方停靠槽的原样落位会跑到输入框**上方**，
 * 这里显式排到输入框之后，才是产品要求的「输入框正下方」。
 */

export const QUICK_SHORTCUTS_STYLE_ID = 'omnimux-quick-shortcuts-style';

export const QUICK_SHORTCUTS_CSS = `
.omx-quick-shortcuts {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 24px;
  /* 与输入框卡同宽：上限取卡片最大宽，窄列下再各让出宿主给输入框的侧边清除量，
     否则这一排会比输入框左右各宽出 12px（窄列实测 342 vs 318）。
     注意这是**同一个令牌 + 同一条清除量**的第二次求值，与卡片自身 max-width 的那次求值
     逐宽度同解（720–1600px 共 45 个宽度实测宽差恒为 0），所以不要再给这一排换宽度来源。 */
  width: min(
    var(--dsh-composer-card-max-width, 952px),
    calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))
  );
  margin: 0 auto;
  padding: 0;
}

.omx-quick-shortcut-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-s-14, inherit);
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease, transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
}

.omx-quick-shortcut-btn:hover {
  color: var(--dsw-alias-label-primary);
}

.omx-quick-shortcut-btn:active {
  transform: scale(0.97);
}

.omx-quick-shortcut-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 3px;
}

/* 选中态：文字色 + 字重两处差异。不能用 --dsw-alias-brand-primary 做区分——
   本产品的主题把该 token 直接映射成 --dsw-alias-label-primary（浏览器实测两者同值），
   与悬停同色，选中与悬停就分不出来了。 */
.omx-quick-shortcut-btn.is-active {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.omx-quick-shortcut-icon,
.omx-quick-shortcut-label,
.omx-quick-shortcut-arrow {
  flex: none;
}

.omx-quick-shortcut-arrow {
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.omx-quick-shortcut-btn:hover .omx-quick-shortcut-arrow,
.omx-quick-shortcut-btn.is-active .omx-quick-shortcut-arrow {
  opacity: 1;
}

.omx-quick-shortcut-notice {
  flex-basis: 100%;
  margin: 0;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-s-14, inherit);
  font-size: 13px;
  line-height: 18px;
}

/* 视频配置复用媒体面板；仅输入区使用紧凑的单行外观。 */
.omx-quick-shortcut-controls,
.omx-quick-shortcut-controls > .omx-media-config-controls {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  min-width: 0;
  gap: 6px;
}
.omx-quick-shortcut-controls .omx-capsule-trigger {
  height: 28px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  min-width: 28px;
}
.omx-quick-shortcut-controls .omx-capsule-divider { display: none; }
.omx-quick-shortcut-controls .omx-popover-anchor { min-width: 0; }
.omx-quick-shortcut-controls .omx-model-name-display,
.omx-quick-shortcut-controls .omx-channel-name-display {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-composer-card][data-omnimux-inline-density] [class*="tools"] { overflow: visible; }
[data-composer-card][data-omnimux-inline-density] .omx-quick-shortcut-controls .omx-popover-anchor { position: static; }
[data-composer-card][data-omnimux-inline-density] .omx-popover-shell {
  left: 0;
  max-width: 100%;
  max-height: min(340px, 60vh);
}
[data-composer-card][data-omnimux-inline-density][data-menu-placement='bottom'] .omx-popover-shell {
  top: calc(100% + 8px); bottom: auto;
}
[data-composer-card][data-omnimux-inline-density] .omx-cascade-col { min-width: 0; flex: 1 1 0; }
[data-composer-card][data-omnimux-inline-density] .omx-media-config-controls--compact .omx-params-panel {
  width: min(420px, 100%);
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}
.omx-media-config-controls--compact .omx-params-panel > * { flex-shrink: 0; }
.omx-media-config-controls--compact .omx-clarity-sound-row { flex-wrap: wrap; gap: 12px; }
.omx-media-config-controls--compact .omx-mode-track { flex-wrap: wrap; }
.omx-media-config-controls--compact .omx-mode-pill { flex: 1 0 auto; }
.omx-media-config-controls--compact .omx-ratio-grid { grid-template-columns: repeat(auto-fit, minmax(32px, 1fr)); }
.omx-media-config-controls--compact .omx-ratio-card { min-width: 0; padding: 0; }
[data-composer-card][data-omnimux-inline-density='short'] .omx-model-name-display { max-width: 88px; }
[data-composer-card][data-omnimux-inline-density='short'] .omx-channel-name-display { display: none; }
[data-composer-card][data-omnimux-inline-density='icon'] #modelCascadeTriggerBtn > :not(svg:first-child) { display: none; }
[data-composer-card][data-omnimux-inline-density='icon'] #modelCascadeTriggerBtn { width: 28px; padding: 0; justify-content: center; }

/* 方案 B 会话模型选择器与浮层面板 */
.sh-model-picker-wrap {
  display: inline-flex;
  align-items: center;
  flex: none;
  margin-left: 0;
}
.sh-picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: 9999px;
  background: var(--dsw-alias-interactive-bg-hover);
  border: 1px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}
.sh-picker-trigger:hover,
.sh-picker-trigger.on {
  background: var(--dsw-alias-interactive-bg-hover-solid);
  border-color: var(--dsw-alias-border-l2);
}
.sh-picker-trigger-label {
  display: inline;
  white-space: nowrap;
}
.sh-model-capsule-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  box-sizing: border-box;
  padding: 0 8px;
  border-radius: 9999px;
  background: var(--dsw-alias-interactive-bg-hover);
  border: 1px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}
.sh-model-capsule-btn:hover,
.sh-model-capsule-btn.on {
  background: var(--dsw-alias-interactive-bg-hover-solid);
  border-color: var(--dsw-alias-border-l2);
}
.sh-model-capsule-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}
.sh-model-picker {
  position: fixed;
  z-index: 2147482000;
  display: flex;
  flex-direction: column;
  width: 480px;
  max-width: min(520px, calc(100vw - 24px));
  max-height: 540px;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  box-shadow: 0 18px 50px var(--dsw-alias-bg-mask-3);
  padding: 16px;
  overflow: hidden;
}
.sh-model-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  margin-bottom: 12px;
}
.sh-model-picker-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.sh-model-auto-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.sh-model-auto-label {
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
}
.sh-model-switch {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 9999px;
  background: var(--dsw-alias-border-l2);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: background-color 0.2s;
  outline: none;
}
.sh-model-switch.on {
  background: var(--dsw-alias-brand-primary);
}
.sh-model-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.sh-model-switch.on .sh-model-switch-thumb {
  transform: translateX(16px);
}
.sh-model-tabs {
  display: flex;
  background: var(--dsw-alias-bg-base);
  border-radius: 8px;
  padding: 3px;
  gap: 4px;
  flex: none;
  margin-bottom: 8px;
}
.sh-model-tab {
  flex: 1;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.sh-model-tab:hover {
  color: var(--dsw-alias-label-primary);
}
.sh-model-tab.active {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.sh-model-section-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary);
  margin: 4px 0 6px 4px;
  flex: none;
}
.sh-model-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  max-height: 360px;
  padding-right: 2px;
  scrollbar-width: thin;
}
.sh-model-empty {
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.sh-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
  user-select: none;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
}
.sh-model-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.sh-model-row.selected {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: var(--dsw-alias-border-l3);
}
.sh-model-row-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.sh-model-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--dsw-alias-label-primary);
}
.sh-model-brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}
.sh-model-brand-icon svg {
  width: 100%;
  height: 100%;
  display: block;
}
.sh-model-row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.sh-model-row-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
}
.sh-model-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  flex-shrink: 0;
}
.sh-model-diamond {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--dsw-alias-brand-primary);
}
.sh-model-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  line-height: 16px;
  flex-shrink: 0;
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-brand-primary);
  border: 1px solid var(--dsw-alias-border-l3);
}
.sh-model-row-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sh-model-row-price {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  line-height: 16px;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sh-model-row-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 12px;
}
.sh-model-radio {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-border-l3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  box-sizing: border-box;
  background: transparent;
}
.sh-model-radio.checked {
  border-color: var(--dsw-alias-brand-primary);
}
.sh-model-radio-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
}
/* 完整密度必须先测量正常文字，不能继承按卡片宽度提前收起的技能样式。 */
html [data-composer-card][data-omnimux-inline-density='full'] .sh-active-skill-chip {
  width: auto!important; min-width: 0!important; max-width: none!important;
  padding: 0 8px 0 10px!important;
}
html [data-composer-card][data-omnimux-inline-density='full'] .sh-active-skill-chip .sh-chip-label {
  display: inline-block!important; max-width: none!important;
}
html [data-composer-card][data-omnimux-inline-density='full'] .sh-active-skill-chip .sh-chip-close { display: inline-flex!important; }
html [data-composer-card][data-omnimux-inline-density='full'] .sh-picker-trigger {
  width: auto!important; max-width: none!important; padding: 0 8px!important;
}
html [data-composer-card][data-omnimux-inline-density='full'] .sh-picker-trigger-label { display: inline!important; }
html [data-composer-card][data-omnimux-inline-density='short'] .sh-active-skill-chip {
  width: auto!important; min-width: 0!important; max-width: none!important;
  padding: 0 8px 0 10px!important;
}
html [data-composer-card][data-omnimux-inline-density='short'] .sh-active-skill-chip .sh-chip-label { display: inline-block!important; max-width: 64px!important; }
html [data-composer-card][data-omnimux-inline-density='short'] .sh-active-skill-chip .sh-chip-close { display: inline-flex!important; }
html [data-composer-card][data-omnimux-inline-density='short'] .sh-picker-trigger { width: auto!important; max-width: none!important; padding: 0 8px!important; }
html [data-composer-card][data-omnimux-inline-density='short'] .sh-picker-trigger-label { display: inline!important; }
html [data-composer-card][data-omnimux-inline-density='icon'] .sh-active-skill-chip {
  width: 28px!important; min-width: 28px!important; max-width: 28px!important; padding: 0!important; justify-content: center!important;
}
html [data-composer-card][data-omnimux-inline-density='icon'] .sh-chip-label,
html [data-composer-card][data-omnimux-inline-density='icon'] .sh-chip-close { display: none!important; }
html [data-composer-card][data-omnimux-inline-density='icon'] .sh-picker-trigger {
  width: 28px!important; min-width: 28px!important; max-width: 28px!important; padding: 0!important; justify-content: center!important;
}
html [data-composer-card][data-omnimux-inline-density='icon'] .sh-picker-trigger-label { display: none!important; }
html [data-composer-card][data-omnimux-inline-density='short'] .sh-model-capsule-btn .sh-model-capsule-name {
  max-width: 72px!important;
}
html [data-composer-card][data-omnimux-inline-density='icon'] .sh-model-capsule-btn {
  width: 28px!important; min-width: 28px!important; max-width: 28px!important; padding: 0!important; justify-content: center!important;
}
html [data-composer-card][data-omnimux-inline-density='icon'] .sh-model-capsule-btn .sh-model-capsule-name { display: none!important; }


/* 位置：这一排挂在官方「输入框停靠槽」上，而 hero 栈把该槽排在输入框**之前**，
 * 照原样落位就在输入框上方（加这条规则之前的实测：这一排 y 210→240、输入框 258→372）。
 * 这条规则依赖两个宿主事实同时成立：本行与输入框块是 hero 栈里**同级**的 flex 项，
 * 且输入框那块的 order 恰好是 2（本仓 session-guide/styles.js 给 composer.bar 的子元素
 * 定的就是 2）。任一失效都会**静默**退回「输入框上方」，所以位置另有浏览器几何证据，
 * 见 .agent-reports/quick-shortcuts-icon-style/browser-geometry.json。
 * 加规则后的实测（2026-09-22，中文界面 1920×929，基础态 / 选中态）：
 *   基础态 输入框 202→316、这一排 334→364；选中态 输入框 202→390、这一排 408→476。
 * 只在 hero（新对话）生效：会话开始后这一段本就不渲染，不干扰官方停靠布局。 */
[data-phase='hero'] .omx-quick-shortcuts {
  order: 3;
}

/* 非全屏（右侧打开辅助面板分屏）模式下：快捷方式那一排自动隐藏，让输入框自然贴底 */
html[data-omnimux-split-compact] .omx-quick-shortcuts,
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omx-quick-shortcuts,
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omx-quick-shortcuts {
  display: none !important;
}

/* ── 链接胶囊：输入框内的原子内联节点（图标 + 名称 + 分隔线 + 输入框 + ×） ──
 * 节点由 dom.js 用 DOM API 造，业务内联样式一律不写（design.md UI02），
 * 因此全部形态收敛在这张表里；宿主提交读取用的锚点属性见 linkChip.js。
 * 两种胶囊靠图标与描边色区分（视频 = 业务主色，商品 = 警示主色），
 * 底色 / 文字 / 分隔线一律取既有 token，不新造色值。 */
/* 胶囊宿主行（.omx-link-chip-row）：由 dom.js 建在 [data-composer-card] 内、输入行上方。
 * 它必须待在宿主 React 不管理的位置（原因见 dom.js 里 resolveQuickLinkChipRow 的宿主事实），
 * 因此形态一律由这张表定义。空行不占位。 */
.omx-link-chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  padding: 2px 2px 6px 2px;
}

.omx-link-chip-row:empty {
  display: none;
}

.omx-link-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  height: 26px;
  max-width: 100%;
  margin: 0 2px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 9999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-s-14, inherit);
  font-size: 12px;
  line-height: 16px;
  vertical-align: middle;
  white-space: nowrap;
  user-select: none;
}

.omx-link-chip--video {
  border-color: var(--dsw-alias-state-business-primary);
}

.omx-link-chip--product {
  border-color: var(--dsw-alias-state-warn-primary);
}

/* 焦点落进胶囊（输入框 / 删除按钮）时只给一处提示，不做第二圈描边。 */
.omx-link-chip:focus-within {
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-mask-2, transparent);
}

.omx-link-chip__icon {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}

.omx-link-chip--video .omx-link-chip__icon {
  color: var(--dsw-alias-state-business-primary);
}

.omx-link-chip--product .omx-link-chip__icon {
  color: var(--dsw-alias-state-warn-primary);
}

.omx-link-chip__name {
  flex: none;
  font-weight: 500;
}

.omx-link-chip__divider {
  flex: none;
  width: 1px;
  height: 12px;
  background: var(--dsw-alias-border-l3);
}

.omx-link-chip__input {
  flex: 1 1 auto;
  width: 168px;
  min-width: 96px;
  max-width: 42vw;
  margin: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
}

.omx-link-chip__input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

.omx-link-chip__remove {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.omx-link-chip__remove:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
`;

/**
 * 幂等注入样式表。
 * @param {Document | null} [doc]
 * @returns {HTMLStyleElement | null} 样式节点；不取得生命周期租约
 */
export function ensureQuickShortcutStyles(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !doc.head) return null;
  let style = doc.getElementById(QUICK_SHORTCUTS_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = QUICK_SHORTCUTS_STYLE_ID;
    doc.head.appendChild(style);
  }
  if (style.textContent !== QUICK_SHORTCUTS_CSS) style.textContent = QUICK_SHORTCUTS_CSS;
  return style;
}

/** A mounted composer slot owns one lease; DOM chip insertion only ensures presence. */
export function acquireQuickShortcutStyles(doc = typeof document !== 'undefined' ? document : null) {
  const style = ensureQuickShortcutStyles(doc);
  if (!style?.getAttribute) return () => {};
  const count = Number(style.getAttribute('data-users')) || 0;
  style.setAttribute('data-users', String(count + 1));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = Math.max(0, (Number(style.getAttribute('data-users')) || 1) - 1);
    if (remaining) style.setAttribute('data-users', String(remaining));
    else style.remove();
  };
}
