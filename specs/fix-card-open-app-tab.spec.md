# 规格：探索模板直通 openAppTab 呼出应用极简工作台

## 1. 任务背景与核心诉求
- **用户反馈事实**:
  点击探索模板卡片预期应真正跳转至「应用详情页面」（包含左侧表单与右侧出片区）。
- **根因分析**:
  此前代码误调用了未挂载完整工作区的全屏 stage，或者侧栏调用使用了未识别的类型 `omnimux_app`；系统真正成熟的 AI 应用工作区是由 `openAppTab` 打开的 `omnimux-workflow:app` 标签页，并已注册于全局 `window.__omnimuxOpenAppTab`。

## 2. 详细改造点
- `ExploreTemplatesSection.jsx`:
  1. 优先检查并调用 `window.__omnimuxOpenAppTab(item.manifest, { appId: item.appId, title: item.titleZh || item.title })`；
  2. 兜底尝试通过 `getBetterSidebar().openTab` 传入合规的 `APP_TAB_ID = 'omnimux-workflow:app'`；
  3. 彻底移除 `claimProductStage('omnimux-apps')`，避免污染中央对话主视图；
  4. 继续广播 `omnimux-app-open` 事件作为加急通道。

## 3. 验收标准
- 用户在首页点击 7 大王牌卡片中任意一张，右侧侧边栏工作台立刻展开并打开该应用的独立 Tab；
- 左侧为 448px 极简出片表单，右侧为高清示例与任务结果区；
- 全套测试 100% 绿灯通过。
