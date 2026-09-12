/**
 * 资产库 / 产品库选择器的弹窗几何契约（单一真源）。
 *
 * 底座（dsh-ui-kit ModalDialog）只暴露 `size: 'sm' | 'md' | 'lg'` 三档，最大档 lg 仅 640px，
 * 而本选择器需要「分类栏 + 多列卡片」的桌面级宽度，因此按自有几何契约推导宽度，
 * 不再写死魔法数字：任一项几何调整（含列数）只需改下面的 CSS 变量。
 */

/** 挂到 ModalDialog 的 className（宽度覆盖只用自有类名，不依赖底座类名） */
export const PICKER_DIALOG_CLASS = 'omx-pick-dialog';

/** 两个选择器各自的根类名，用于 :has() 定位正文滚动容器 */
export const PICKER_ROOT_CLASSES = Object.freeze(['.omx-product-pick', '.omx-asset-pick']);

/** 目标列数：至少同时陈列 3 张卡片 */
export const PICKER_COLUMNS = 3;

/**
 * 宽度契约：分类栏 + 正文左内边距 + 列数×卡片宽 + (列数-1)×列间距
 * 148 + 16 + 3×264 + 2×16 = 988px
 * （选择器已贴边，正文容器不再贡献左右内边距，故不计入）
 */
export const PICKER_DIALOG_CSS = `
.${PICKER_DIALOG_CLASS} {
  --omnimux-pick-nav-w: 148px;        /* 左侧分类栏宽度，与 .omx-*-pick__nav 保持一致 */
  --omnimux-pick-main-pad: 16px;      /* 正文区左内边距 .omx-*-pick__main padding-left */
  --omnimux-pick-card-w: 264px;       /* 单张卡片目标宽度 */
  --omnimux-pick-gap: 16px;           /* 网格列间距 .omx-*-pick__grid gap */
  --omnimux-pick-columns: ${PICKER_COLUMNS};
  width: min(92vw, calc(
    var(--omnimux-pick-nav-w) + var(--omnimux-pick-main-pad)
    + (var(--omnimux-pick-columns) * var(--omnimux-pick-card-w))
    + ((var(--omnimux-pick-columns) - 1) * var(--omnimux-pick-gap))
  )) !important;
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
   使左侧分类栏的 border-right 从标题下方一路延伸到页脚上方，成为通高分割线。 */
.dshUk-Dialog-body:has(.omx-product-pick) > *:last-child,
.dshUk-Dialog-body:has(.omx-asset-pick) > *:last-child {
  margin-top: 0 !important;
  padding: 0 !important;
}
/* 关闭按钮统一使用共享组件 ModalCloseButton(placement="external")，隐藏底座标题栏内置的 X。
   底座关闭按钮只有 CSS-module 哈希类名，故按结构定位：正文滚动容器第一个子元素（标题栏）内的按钮。 */
.omx-pick-dialog .dshUk-Dialog-body > *:first-child > button {
  display: none !important;
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
