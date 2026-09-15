# 实机预演证据：宿主右侧栏全屏 → 会话栏恢复机制

- 环境：隔离工作树内私有 HOME 起的**完整 OmniMux 应用**（`pnpm verify:app` 同款 bootstrap），证据级别 `full`、插件已装载（`taskPluginsInstalled: true`）。
- 浏览器：真实无头 Chrome + CDP（端口 53825），非仿真 DOM。
- 时间：2026-09-15 13:22（+08:00），晚于本任务规格 `specs/attach-reveal-host-fullscreen.spec.md`。

## 步骤与真实读数

| # | 操作 | 真实 DOM 读数 |
| --- | --- | --- |
| 1 | 登录隔离应用 → 建工作区 → 新建标签页 → 打开「创作画布」 | 画布 tab 挂载 |
| 2 | 点标签栏的「全屏」（宿主右侧栏铺满） | `[data-sidebar-right-panel]="fullscreen"`；`html[data-omnimux-conversation-collapsed]` **不存在**（即折叠键为 false）；官方退出控件 `button[data-sidebar-right-mode="push"]` 存在 |
| 3 | 截图 `01-host-fullscreen.png` | 面板铺满、会话列不可见 |
| 4 | 点击官方退出控件 `button[data-sidebar-right-mode="push"]`（这正是本次修复调用的动作） | `[data-sidebar-right-panel]="push"` —— 面板离开铺满呈现 |
| 5 | 截图 `02-after-push.png` | 面板恢复非全屏呈现 |

## 结论（诚实范围）

- **已证实**：宿主全屏态下插件折叠键为 `false`（第 2 步读数），而官方退出控件存在且点击后确实让面板离开 `fullscreen`（第 4 步读数）——
  这正是本缺陷的根因链条：旧实现「读到折叠键为 false 就跳过」，于是从不尝试退出宿主全屏。
- **已证实**：本次修复依赖的退出动作在真实应用里可执行、生效。
- **未涵盖**：本次预演的插件产物是隔离环境链自已物化的开发版（**尚未包含本任务的新代码**），因此它证明的是「机制可用」，不是「新代码在真机跑通」。新代码的真机验证需合入并物化开发版后由人工复验。
- 说明：会话列宽度的探针选择器本次未命中（返回 -1），故宽度读数未采信；判定以 `[data-sidebar-right-panel]` 属性为准。
