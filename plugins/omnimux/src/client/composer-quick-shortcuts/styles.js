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
     否则这一排会比输入框左右各宽出 12px（窄列实测 342 vs 318）。 */
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
