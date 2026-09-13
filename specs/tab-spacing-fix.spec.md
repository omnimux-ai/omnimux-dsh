# 规格说明：右侧边栏顶栏标签栏高度塌陷修复与上下呼吸留白

## 1. 业务背景与问题现象
- **缺陷**：右侧边栏顶栏标签栏（`_tabStrip_` / `[data-dockkit-strip]`）在全局盒模型（`box-sizing: border-box`）影响下高度塌陷至 28px，而顶部存在 10px 的内边距，导致内部 28px 高度的选项卡胶囊向下溢出 10px。
- **视觉破坏**：当下方内容页面（如产品库、资产库等拥有不透明背景的 Stage 页面）渲染时，直接从 28px 处顶满，把选项卡胶囊底部的两个圆角切平遮挡，且选项卡与下方内容大标题紧紧挤在一起，完全缺失呼吸间距。
- **对照正常态**：在任务管理等透明容器页面下，选项卡呈现标准完整的胶囊圆角，且与下方内容之间有规整舒适的视觉留白。

## 2. 解决方案设计
在 `plugins/omnimux/src/client/sidebar-toggle-topbar.js` 中的 `RIGHTBAR_CHROME_STYLES` 增加规则：
```css
/* 修复右侧栏顶栏 strip 在 border-box 盒模型下高度塌陷为 28px 导致 Tab 选项卡被下方内容页面遮挡的问题：
   明确高度为 40px，居中对齐并为 Tab 胶囊提供上下各 6px 的正常呼吸间距，确保 Tab 底部圆角完整展现且与内容页面保持优雅间距 */
[data-dockkit-strip],
[class*="_tabStrip_"] {
  height: 40px !important;
  box-sizing: border-box !important;
  padding: 6px 6px 6px 10px !important;
  align-items: center !important;
}
```

## 3. 验收标准
1. **自动化单测**：`plugins/omnimux/src/client/sidebar-toggle-topbar.test.js` 增加针对 `[data-dockkit-strip]` 的 `height: 40px !important` 和 `padding: 6px 6px 6px 10px !important` 断言，并全部通过。
2. **实机几何**：在真实桌面环境中，`[data-dockkit-strip]` 的高度为 40px，内部 `[data-dockkit-tab]` 高度 28px、底部在 y=34px，下方面板顶边在 y=40px，选项卡至内容顶边保留 +6px 安全留白，底部圆角完整悬空展示。
