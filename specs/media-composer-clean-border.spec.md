# 规格：图像生成面板输入框编辑聚焦状态下消除内部边框

- 变更范围：`plugins/omnimux/src/client/media-viewer/styles.js`（多模态提示词输入框样式）

## 1. 目标（Objective）

图像生成面板底部的生成输入框（`MediaViewerComposer`）在编辑输入状态（聚焦 `focus` / `focus-visible`）时，提示词区域内部显示了一个额外的原生/高亮矩形边框线，打破了一体式卡片的纯净沉浸感。
用户要求：在输入框处于编辑状态时，内部不得显示输入框边框线，保持外层卡片整体聚焦而内部无多余边框。

成功标准（可测）：
- `.omx-mv-prompt-textarea` 及其 `:focus`、`:focus-visible` 伪类状态下，`border` 为 `none !important`、`outline` 为 `none !important`、`box-shadow` 为 `none !important`；
- `.omx-mv-composer__textarea` 及其 `:focus`、`:focus-visible` 伪类状态下，同步清除内部边框与轮廓；
- 用户点击输入框进行文本编辑时，只有最外层大容器（`.omx-mv-composer-root`）呈现高亮微光（`:focus-within`），内部提示词区域无任何内层边框线；
- 既有回车直连生成、快捷工具栏弹出选择及键盘交互保持 100% 正常。

## 2. 用户操作旅程与期望界面反馈

1. 用户在图像生成界面中点击提示词区域（“随心输入画面提示词，支持回车立即直连生成...”）；
2. 输入框进入编辑状态，光标在文字前闪烁；
3. 期望：最外层圆角卡片通过 `:focus-within` 保持优雅聚焦，内部输入区域完全透明一体，不再出现内部矩形边框线；
4. 用户随心键入提示词并按回车，正常触发直连生成。

## 3. 代码变更文件

- 样式真源：`plugins/omnimux/src/client/media-viewer/styles.js`
- 契约验证测试：`plugins/omnimux/src/client/media-viewer/media-composer-clean-border.test.js`
