/**
 * 资产库 / 产品库选择器的弹窗几何契约（单一真源）。
 *
 * 底座（dsh-ui-kit ModalDialog）只暴露 `size: 'sm' | 'md' | 'lg'` 三档，最大档 lg 仅 640px，
 * 而本选择器需要「分类栏 + 两列卡片」的桌面级宽度，因此按自有几何契约推导宽度，
 * 不再写死魔法数字：任一项几何调整只需改下面的 CSS 变量。
 */

/** 挂到 ModalDialog 的 className（宽度覆盖只用自有类名，不依赖底座类名） */
export const PICKER_DIALOG_CLASS = 'omx-pick-dialog';

/** 两个选择器各自的根类名，用于 :has() 定位正文滚动容器 */
export const PICKER_ROOT_CLASSES = Object.freeze(['.omx-product-pick', '.omx-asset-pick']);

/**
 * 宽度契约：分类栏 + 正文左内边距 + 两列卡片 + 列间距 + 底座正文左右内边距(24×2)
 * 148 + 16 + 2×264 + 16 + 48 = 756px
 */
export const PICKER_DIALOG_CSS = `
.${PICKER_DIALOG_CLASS} {
  --omx-pick-nav-w: 148px;      /* 左侧分类栏宽度，与 .omx-*-pick__nav 保持一致 */
  --omx-pick-main-pad: 16px;    /* 正文区左内边距 .omx-*-pick__main padding-left */
  --omx-pick-card-w: 264px;     /* 单张卡片目标宽度 */
  --omx-pick-gap: 16px;         /* 网格列间距 .omx-*-pick__grid gap */
  --omx-pick-body-pad: 48px;    /* 底座正文容器左右内边距 24×2 */
  width: min(92vw, calc(
    var(--omx-pick-nav-w) + var(--omx-pick-main-pad)
    + (2 * var(--omx-pick-card-w)) + var(--omx-pick-gap) + var(--omx-pick-body-pad)
  )) !important;
  max-width: 92vw !important;
}
/* 正文滚动容器由 primitive（@deepseek-ai/dsh-client-ui-primitives）提供，自带 max-height: min(56vh, 480px)；
   kit 的 contentClassName 落在其内层 _body_ 上、无法触达该容器，且组件未暴露对应 prop，
   故此处保留唯一一条对 primitive 公共类名的依赖：放开上限，改由弹窗自身 80vh 统一约束。
   运行时漂移由 pnpm verify:picker 兜底告警。 */
.dshUk-Dialog-body:has(.omx-product-pick),
.dshUk-Dialog-body:has(.omx-asset-pick) {
  max-height: none !important;
}
`;

const STYLE_ID = 'omx-picker-dialog-contract';

/**
 * 注入契约样式（幂等）。两个选择器共用同一份，避免重复声明导致漂移。
 * @param {Document | null} [doc]
 */
export function ensurePickerDialogStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PICKER_DIALOG_CSS;
  doc.head?.appendChild(style);
}
