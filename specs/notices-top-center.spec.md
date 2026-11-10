# 4066 非内测插件操作提示统一为顶部居中浮层

Issue: #4066 · 分支 `agent/notices-top-center-issue-4066` · 风险等级 **R2**（多插件样式）

## 背景

发布插件已经把操作提示改为顶部居中浮层。排查其余**非 Alpha** 插件，仍有操作反馈样式不一致：

| 插件 | 现状 |
| --- | --- |
| omnimux-market | `.sh-toast` 固定在底部居中 |
| omnimux-social-harvest | `.sh-toast` 固定在底部居中 |
| omnimux-device | `.omx-toast-float` 固定在右下角 |
| omnimux-assets | 保存/试听提示是页面内联 `<p>`（`.omnimux-assets-cloud-notice`） |
| omnimux-workflow | 应用编辑提示是顶栏内联 span（`.omx-apptab-notice`） |

（Alpha 插件 accounts / publish / analytics / forms / avatar / studio 不在本次范围；publish 已完成。）

## 方案

统一这 5 个插件的操作提示为**顶部居中浮层**：

- `position: fixed; top: 16px; left: 50%; transform: translateX(-50%);`
- 背景 `--dsw-alias-bg-elevated`，边框 `--dsw-alias-border-l2`，圆角 8–10px，阴影用 `--dsw-shadow-lv2` 或既有 token；
- `z-index` 高于页面内容、低于系统弹窗；
- 只改样式，不改提示文案、触发时机和自动消失逻辑。

## 假设

- 这些提示都是短暂的操作反馈，不承载需要用户长时间阅读的表单校验信息；表单内错误提示保持原位。
- 浮层固定在视口顶部，不会遮挡页面顶栏的关键操作（top 16px，最大宽度受限、单行省略）。

## 证伪方式

- 浏览器渲染各插件提示样式截图，确认都出现在顶部居中且视觉一致（圆角、阴影、深色卡片）。
- `pnpm --filter <plugin> test` 或至少构建/语法检查通过。
- `git grep "bottom: 24px"` 在相关 toast 样式中不再出现。

## 新用户基线

所有非内测插件的操作反馈位置一致；无新增配置或依赖。

## 文档影响

无。
