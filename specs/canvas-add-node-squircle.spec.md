# 画布底部「+」添加节点按钮改为圆角方形

- Issue: #3617
- 插件: `omnimux-workflow`（画布底部悬浮工具栏 dock）
- 风险: R1（纯视觉 CSS，无交互/数据变更）

## 用户操作旅程

1. 用户进入任一画布项目（工作流画布），视线落在底部居中的悬浮工具栏。
2. 工具栏最左侧是「+（添加节点，N）」主按钮：深色主题为白底 + 深色「+」，浅色主题为黑底 + 白色「+」。
3. 期望界面反馈：该按钮为**圆角方形**（squircle，`border-radius: 12px`，尺寸仍为 36×36），不再是纯圆形；hover 时背景与 1.05 缩放反馈保持原状，圆角不变。
4. 点击后仍打开 AddNodeMenu，快捷键 N 行为不变。

## 变更点

- `plugins/omnimux-workflow/src/canvas/theme/workbench-theme.css`
  - `.wf-canvas-toolbar__item--primary-add`：`border-radius: 50%` → `12px`。
  - 深/浅主题配色规则保持不变（深色 `#ffffff` / 浅色 `#18191c`）。

## 假设

1. 圆角方形来自既有设计体系：`--wb-pill-radius: 12px` 与本按钮的 36px 尺寸组合即视觉上接近截图中的 squircle，无需新增 token。
2. 该按钮只被 `.wf-canvas-toolbar__item--primary-add` 一处定义，深/浅主题靠 `body[data-ds-dark-theme]` 覆写，因此只改 base 的圆角即可同时覆盖两个主题，不会影响工具栏其它图标按钮（它们仍是 `border-radius: 18px` 的胶囊/圆形）。

## 证伪方式

1. 在 worktree 内用真实浏览器打开画布页，深色与浅色主题各截一张图：若「+」按钮仍是正圆（宽高 36 且圆角 = 18px 视觉），则假设 1/实现失败。
2. 若工具栏其它按钮（模板、指针模式、资产、帮助）也变成圆角方形，说明选择器写错、影响了共享类，则假设 2 被证伪。
3. 若深色主题下按钮不再是白底（或浅色主题不是黑底），说明主题覆写被破坏。
4. 可执行校验：`node --test scripts/verify-anti-slop.test.mjs`、`pnpm verify:stages`（均须通过），并以 `git diff origin/main -- plugins/omnimux-workflow/src/canvas/theme/workbench-theme.css` 复核改动范围仅一行圆角。

## 新产品基线

纯 CSS 视觉改动，不依赖任何本机状态、账号或本地服务；新装用户开箱即得同样外观。无缺失依赖时的报错场景。

## 文档影响

不涉及产品文案、契约与索引变更；`docs/contracts/ui-design-guidelines.md` 已允许既有 token 体系内的形状微调，无需新增文档。
