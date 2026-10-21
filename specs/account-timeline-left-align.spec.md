# 账号监控时间线左对齐 + 取消悬停背景（Issue #3565）

## 1. 用户反馈

截图（账号监控 tab）：
1. 帖子时间线列表被 `width: min(100%, 620px); margin: 0 auto` 居中，左右留白很大；希望列表**靠左**，与左侧账号列形成自然的阅读起点。
2. 鼠标悬停帖子条目时，容器背景从 `bg-layer-1` 变到 `bg-layer-2`；用户认为「内容悬停不要有交互」，要求**去掉这个背景变化**。

## 2. 改动

- `plugins/omnimux-inspiration/src/client/rival-styles.js`：
  - `.omnimux-rival-timeline`：`margin: 0 auto` → `margin: 0`（左对齐；宽度 `min(100%,620px)` 不变）。
  - `.omnimux-rival-timeline-item:hover`：删除 background 变更；`:focus-visible` 保留背景（键盘可见性）。
  - 保留条目的 `cursor: pointer`、点击打开、hover 时 actions 显隐等既有可用性交互（本单只取消背景色变化）。

## 3. 验收

- CSS 文本断言：timeline 规则包含 `margin: 0`；条目 hover 不再有 background 声明；`:focus-visible` 仍有背景/可见焦点。
- `node scripts/worktree-web-qa.mjs inspiration` 证据刷新（UI 变更证据）。
- `node scripts/build-client.mjs`（inspiration 客户端构建）通过；相关 client 测试绿。

## 4. 非目标

- 不重做两栏布局、不改卡片宽度/间距、不动其它页面的 hover 交互。

## 假设

- 用户看到的背景变化来自 `.omnimux-rival-timeline-item:hover`（`background: var(--dsw-alias-bg-layer-2)`）；账号监控 tab 的时间线就是这条规则。
- 左对齐只需去掉 `margin: 0 auto` 的自动外边距；宽度上限 620px 是产品既有约束，用户没有要求加宽。
- 去掉 hover 背景不影响点击打开与操作按钮显隐；键盘 focus-visible 仍需要可见反馈。

## 证伪方式

- 若真实页面悬停时背景仍变化，说明反馈来自其它规则（卡片/列表容器/父级 hover），需继续定位。
- 若左对齐后列表压到账号列或布局错位，说明 `.omnimux-rival-content` 的 padding/grid 也需要调整。
- 可执行验证：
  - `grep`/测试断言 `RIVAL_CSS` 中 `.omnimux-rival-timeline` 与 hover 规则；
  - `node scripts/worktree-web-qa.mjs inspiration`；
  - 构建客户端后检查注入样式。
