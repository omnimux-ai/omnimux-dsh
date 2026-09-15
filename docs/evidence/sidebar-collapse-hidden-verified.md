# 实机验证证据：左侧侧边栏收起时完全隐藏（消除 56px 图标栏残留）

- 日期：2026-09-15
- 任务：修复收起左侧侧边栏时快捷图标栏残留的问题，实现完全隐藏。
- 验收标准：
  1. 点击收起侧边栏后，左侧 `sidebarCol` 与 `.dshDesktopSidebarSurface` 完全置零（`width: 0 !important; display: none !important`），彻底消除 56px 快捷图标栏残留；
  2. 中间会话栏靠左无缝贴边排布，网格首列轨道宽度为 0px；
  3. 右侧工作台（资产中心等）充盈铺满视口剩余宽度（`calc(100vw - 440px)`）；
  4. 再次点击左上角按钮平滑恢复展开，无布局破坏或文字穿透。

## 验证结果记录
1. **单元测试**：
   - `plugins/omnimux/src/client/sidebar-collapse-hidden.test.js`：3/3 全部通过。
   - `plugins/omnimux/src/client/apps-stage-box.test.js`：21/21 全部通过。
   - `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js`：58/58 全部通过。
2. **端到端回归测试**：
   - `plugins/omnimux/tests/e2e/sidebar-collapse-hidden.spec.js`：1/1 验证通过。
