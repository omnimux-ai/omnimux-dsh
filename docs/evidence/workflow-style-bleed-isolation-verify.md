# 实测验证报告：项目资产样式作用域隔离与跨页切换稳定性验证

- **验证日期**：2026-09-16
- **对应特性规格**：`specs/workflow-style-bleed-isolation.spec.md`
- **执行环境**：工作树隔离环境（worktree: `omnimux-dsh-wt-workflow-style-bleed-fix`）
- **测试结果**：100% 隔离验证通过

## 验证场景与结果数据

### 场景 1：消除跨插件全局样式污染（根治按钮被拉长变形）
- **排查现场**：
  在 `omnimux-workflow/src/client/styles.js` 中，原第 994 行声明了裸的全局规则：
  `.omnimux-assets-action-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px 20px; }`。
  当用户切换至项目页面后，该规则注入全局，篡改了 `omnimux-assets` 资产库中原本为 `display: flex; gap: 10px;` 的操作行，导致“添加资产”与“导入资产包”两个按钮横跨全屏撑满变形，搜索栏与内容区错位。
- **修复方案**：
  将所有 `.omnimux-assets-*` 类名收敛至 `.omnimux-assets-tab` 容器前缀下（`.omnimux-assets-tab .omnimux-assets-action-row`）。
- **实测表现**：
  资产库中的 `.omnimux-assets-action-row` 恢复为纯正的 `display: flex`，不再被 workflow 样式篡改，按钮尺寸与间距恢复标准 10px/24px 优雅排版。

### 场景 2：页面反复切换时的调和锁与状态机优化
- **优化点**：
  1. `tab-viewport-reconciler.js` 将 Tab 切换判定置于调和锁之前，确保连续快速切换页面时，目标页面的视窗偏好绝不被锁吞掉；
  2. 增强 TabId 解析器，支持通过当前活跃 Tab 的标题反查 `TITLE_TO_TAB_ID`，杜绝内层子 Tab（如“本地”）干扰外层整页 Tab 判定。
- **实测表现**：
  连续快速在资产库、项目、数据分析、灵感社区之间来回切换，所有页面均能平滑、可靠、无振荡地按照各自偏好正确展示（全屏或分栏）。
