/**
 * 资产库 / 产品库选择器的弹窗外壳契约（单一真源）。
 *
 * 两个选择器共享弹窗外壳与布局规范（单层「顶部 Tab + 筛选胶囊 + 搜索框」+ 6 列高密度微卡网格 + 统一外部关闭按钮），
 * 宽度由各选择器按自己的几何推导（统一为 6 列 × 156px + 5 间距 = 1016px），通过 `--omnimux-pick-dialog-width` 传入：
 *
 *   宽度 = 列数 × 卡片宽 + (列数-1) × 列间距 [+ 预留前置宽度（若有）]
 */

/** 挂到 ModalDialog 的 className（宽度覆盖只用自有类名，不依赖底座类名） */
export const PICKER_DIALOG_CLASS = 'omx-pick-dialog';

/**
 * 变体类：宽度变量必须挂在**弹窗自身**上。
 * CSS 自定义属性只沿 DOM 向上解析——若把变量写在弹窗的子元素（.omx-*-pick）上，
 * 弹窗上的 width 规则读不到它，会落到兜底默认值（产品库会从 4 列退化为 3 列）。
 */
export const PICKER_DIALOG_VARIANT_CLASS = Object.freeze({
  product: 'omx-pick-dialog--product',
  assets: 'omx-pick-dialog--assets',
});

/**
 * 组装 ModalDialog 的 className（基础类 + 变体类）。
 * @param {'product' | 'assets'} kind
 */
export function pickerDialogClassName(kind) {
  const variant = PICKER_DIALOG_VARIANT_CLASS[kind];
  if (!variant) throw new Error(`unknown picker variant: ${kind}`);
  return `${PICKER_DIALOG_CLASS} ${variant}`;
}

/** 两个选择器各自的根类名，用于 :has() 定位正文滚动容器 */
export const PICKER_ROOT_CLASSES = Object.freeze(['.omx-product-pick', '.omx-asset-pick']);

/** 布局无关的默认几何（各选择器可覆盖） */
export const PICKER_CARD_WIDTH = 264;
export const PICKER_GRID_GAP = 16;

/**
 * 按几何推导弹窗宽度，返回可直接写进 CSS 的 `calc()` 表达式。
 * @param {{ columns: number, cardWidth?: number, gap?: number, leading?: number }} options
 *   leading：网格之前占用的固定宽度（如资产库左侧分类栏 148 + 正文左内边距 16）
 */
export function pickerDialogWidth({ columns, cardWidth = PICKER_CARD_WIDTH, gap = PICKER_GRID_GAP, leading = 0 }) {
  const parts = [];
  if (leading > 0) parts.push(`${leading}px`);
  parts.push(`${columns} * ${cardWidth}px`);
  if (columns > 1) parts.push(`${columns - 1} * ${gap}px`);
  return `calc(${parts.join(' + ')})`;
}

/** 两个选择器各自的布局几何（单一真源；验收脚本与单测都从这里取值） */
export const PICKER_LAYOUTS = Object.freeze({
  /** 产品库：顶部 Tab 单层顶栏，无左侧栏，6 列高密度微卡网格 */
  product: Object.freeze({ columns: 6, cardWidth: 156, gap: 16, leading: 0 }),
  /** 资产库：参考选择产品弹窗，顶部 Tab 单层顶栏，无左侧栏，6 列高密度微卡网格 */
  assets: Object.freeze({ columns: 6, cardWidth: 156, gap: 16, leading: 0 }),
});

/**
 * 某个选择器的期望弹窗宽度（px）
 * @param {'product' | 'assets'} kind
 */
export function pickerExpectedWidth(kind) {
  const layout = PICKER_LAYOUTS[kind];
  if (!layout) throw new Error(`unknown picker layout: ${kind}`);
  const { columns, cardWidth = PICKER_CARD_WIDTH, gap = PICKER_GRID_GAP, leading = 0 } = layout;
  return leading + columns * cardWidth + Math.max(0, columns - 1) * gap;
}

/** 只依赖外壳、与布局无关的共享样式 */
export const PICKER_DIALOG_SHELL_CSS = `/* 宽度由各选择器通过**弹窗自身的变体类**提供（见 PICKER_DIALOG_VARIANT_CLASS）；
   变量必须与消费它的 width 规则处在同一元素上，否则父元素读不到子元素的定义。此处只负责视口上限与装配 */
.${PICKER_DIALOG_CLASS} {
  width: min(92vw, var(--omnimux-pick-dialog-width, ${pickerDialogWidth({ columns: 3 })})) !important;
  max-width: 92vw !important;
}
/* 正文滚动容器由 primitive（@deepseek-ai/dsh-client-ui-primitives）提供，自带 max-height: min(56vh, 480px)；
   kit 的 contentClassName 落在其内层 _body_ 上、无法触达该容器，且组件未暴露对应 prop，
   故此处保留对 primitive 公共类名的依赖：放开上限，改由弹窗自身 80vh 统一约束。
   运行时漂移由 pnpm verify:picker 兜底告警。 */
.dshUk-Dialog-body:has(.omx-product-pick),
.dshUk-Dialog-body:has(.omx-asset-pick) {
  max-height: none !important;
}
/* 选择器在正文内贴边：清掉 kit 内层 _body_ 的左右内边距与上间距（结构定位：正文滚动容器最后一个子元素），
   让内容区完整占满弹窗正文。 */
.dshUk-Dialog-body:has(.omx-product-pick) > *:last-child,
.dshUk-Dialog-body:has(.omx-asset-pick) > *:last-child {
  margin-top: 0 !important;
  padding: 0 !important;
}
/* 隐藏产品库与资产库自带的 ModalDialog 默认 Header（采用单层 Tab-as-Header 架构，避免双重 Header） */
.omx-pick-dialog--product .dshUk-Dialog-body > *:first-child,
.omx-pick-dialog--assets .dshUk-Dialog-body > *:first-child {
  display: none !important;
}
/* 共享的 external 关闭按钮定位在弹窗右外侧（right:-50px），而底座弹窗自带 overflow: hidden 会把它裁出可视区
   （真机实测：几何在弹窗外，但元素命中测试落到遮罩层，按钮既看不见也点不到）。这里放开裁剪让共享按钮真正可见可点。
   该变体原本服务于无裁剪的 SplitModalDialog，本弹窗需显式放开。 */
.${PICKER_DIALOG_CLASS} {
  overflow: visible !important;
}
/* 关闭按钮统一使用共享组件 ModalCloseButton，隐藏底座标题栏内置的 X。
   底座关闭按钮只有 CSS-module 哈希类名，故按结构定位：正文滚动容器第一个子元素（标题栏）内的按钮。 */
.${PICKER_DIALOG_CLASS} .dshUk-Dialog-body > *:first-child > button {
  display: none !important;
}
`;

const STYLE_ID = 'omx-picker-dialog-contract';

/**
 * 注入外壳样式（幂等）。两个选择器共用同一份，避免重复声明导致漂移。
 * @param {Document | null} [doc]
 */
export function ensurePickerDialogStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PICKER_DIALOG_SHELL_CSS;
  doc.head?.appendChild(style);
}
