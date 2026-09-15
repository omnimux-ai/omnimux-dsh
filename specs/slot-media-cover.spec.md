# 卡槽媒体预览等比例铺满无黑边规格

## Objective
修复卡槽（SlotWells）中图片与视频缩略图预览时出现左右/上下黑边的问题。根据现代设计审美，卡槽内部的媒体缩略画面必须保持原始宽高比等比例缩放并居中裁剪铺满整个卡槽尺寸（44×44px），杜绝任何黑边或留白缝隙。

## Acceptance
- **等比缩放铺满无黑边**：`.wf-slot-well__media` 的 `object-fit` 属性由 `contain` 修改为 `cover`。无论输入的视频或图片是 9:16 竖屏、16:9 横屏还是其他比例，均在 44×44px 正方形圆角卡槽中等比例缩放铺满，零黑边。
- **圆角与溢出控制**：视频容器 `.wf-slot-well__video-box` 保持 `overflow: hidden` 与 `border-radius: 9px`，播放小图标在铺满后依然清晰居中可见。
- **自动化测试 100% 通过**：添加静态样式与渲染回归测试，验证 `object-fit: cover` 规范不被回退。

## Commands
- `node --test plugins/omnimux-workflow/tests/e2e/slotMediaCover.e2e.test.mjs`
- `git diff --check`
