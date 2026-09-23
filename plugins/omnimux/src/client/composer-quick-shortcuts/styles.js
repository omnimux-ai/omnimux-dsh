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
 * 居中怎么不被「模型 / 参数」控件带偏：控件与写失败提示都取 `flex-basis: 100%`，
 * 各自独占一行、**不参与四条按钮那一行的居中计算**。这不是偷懒的折中——
 * 实测四条按钮在中文下约占 570px、在英文下约占 756px，而行宽上限 952px，
 * 控件自身约 300px：同排时「严格居中」与「不压字」二者必损其一（居中则控件压住
 * 最右两字，右对齐则按钮整体左移约 150px）。让控件自成一行是唯一同时成立的做法，
 * 且窄列下按钮换行也不会与控件相撞。
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

/* 控件自成一行：换行 + 允许收缩，窄列下两个胶囊自己折行，绝不横向溢出压住按钮。 */
.omx-quick-shortcut-controls {
  display: inline-flex;
  flex-basis: 100%;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  min-width: 0;
  gap: 8px;
}

/* 共享控件本体（.omx-media-config-controls）在媒体面板里是 nowrap 的单行三件套，
   在这里必须能折：它是这一行**唯一**的子节点，而它的内容是一块压不动的铁板——
   实测最小内容宽 509.3px（模型胶囊 170 ＋ 参数胶囊 197.34 ＋ 模型回执 112.95 ＋ 间距），
   而卡片进紧凑列后只有 318px。父盒的 min-width: 0 只能压盒子，压不动 nowrap 行里的内容，
   于是内容从行右缘顶出卡片 78.34px（参数胶囊被裁切、模型回执被压成 0 宽）。
   放开折行后每一段在自己那一行里居中，卡片宽度再小也不会越界。
   只在快捷方式这一处生效：媒体面板里的三件套仍是单行（见 media-composer-direct 的既有断言）。 */
.omx-quick-shortcut-controls > .omx-media-config-controls {
  flex-wrap: wrap;
  justify-content: center;
  max-width: 100%;
}

/* 兜底：单个控件都放不进所在行时，宁可自己收敛也不把内容顶出卡片。
   min-width: 0 是这条链成立的前提——flex 项的默认最小宽是 min-content，
   不显式归零，下面胶囊上的 max-width: 100% 只是相对自身宽度取 100%，等于没写。 */
.omx-quick-shortcut-controls .omx-popover-anchor {
  max-width: 100%;
  min-width: 0;
}

.omx-quick-shortcut-controls .omx-capsule-trigger {
  max-width: 100%;
  min-width: 0;
}

/* 模型胶囊里唯一由数据驱动的两段文字（模型名 / 版本名）走省略号。
   参数胶囊不在此列：它的文字是「生成方式 · 分辨率 · 时长」等 span 拼成的复合串，
   逐段省略会读成残句；且它不由数据驱动、宽度有界（实测 197.34px，远小于卡片下限 318px）。 */
.omx-quick-shortcut-controls .omx-model-name-display,
.omx-quick-shortcut-controls .omx-channel-name-display {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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
 * @returns {() => void} 卸载函数
 */
export function ensureQuickShortcutStyles(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !doc.head) return () => {};
  if (doc.getElementById(QUICK_SHORTCUTS_STYLE_ID)) return () => {};
  const style = doc.createElement('style');
  style.id = QUICK_SHORTCUTS_STYLE_ID;
  style.textContent = QUICK_SHORTCUTS_CSS;
  doc.head.appendChild(style);
  return () => {
    try {
      doc.getElementById(QUICK_SHORTCUTS_STYLE_ID)?.remove();
    } catch {
      // 宿主已卸载时忽略
    }
  };
}
