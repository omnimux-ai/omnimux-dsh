# 规格：账号监控筛选弹层可读性 + 未定义颜色变量（Issue #3171 / #3172）

## 1. 目标（Objective）

修掉业务方在开发版上反馈的两类问题：

1. **筛选弹层可读性（#3171）**
   - 列表最后一行要滚动才看全：`.omnimux-rival-filter-list` 写死 `max-height:240px`，四个账号
     （其中一个终态行带原因行）实测超过该高度。
   - 冷却行昵称被压成省略号（如「宠物品…」）：昵称列最小宽度保护只覆盖
     `.is-reimport` 与 `.is-stopped`，漏了 `.is-cooling`，而冷却行的状态文字最长
     （`冷却中 · N 分钟后恢复`）。
2. **未定义颜色变量（#3172）**：`.omnimux-rival-notice` 与 `.omnimux-rival-import-echo`
   的 `background: var(--dsw-alias-bg-tertiary)` 引用了组件库未定义的令牌，浏览器丢弃该声明，
   两个提示条没有底色。

成功标准（可测，真实浏览器测量）：

1. 四个账号（含一个带原因行的终态行）时，筛选列表 `scrollHeight === clientHeight`
   （不需要滚动即可看全），且最后一行原因行完整可见。
2. 冷却行昵称不被截断：`.omnimux-rival-filter-name` 的 `scrollWidth <= clientWidth`，
   且其计算宽度不小于 96px。
3. 提示条有底色：`.omnimux-rival-notice` 与 `.omnimux-rival-import-echo` 的
   `background-color` 计算值不为 `rgba(0, 0, 0, 0)`。
4. 本插件 CSS 不再引用组件库未定义的 `--dsw-alias-bg-tertiary`。
5. 四态标记、原因行、行内「重试」、刷新置灰优先级均不变。

## 2. 命令（Commands）

工作树 `.worktrees/account-monitor-filter-polish` 内：

- `pnpm install --prefer-offline`
- `pnpm --filter omnimux-inspiration test`
- `pnpm verify:stages`
- `node --test scripts/verify-anti-slop.test.mjs`
- `git diff --check`
- 真机证据：自建验收页（真实 `InspirationStage` + 桩数据），`python3 -m http.server 0`，
  ego-browser 打开后 `page.evaluate` 测量上列数值并截图。

## 3. 项目结构（Project Structure）

- 样式：`plugins/omnimux-inspiration/src/client/rival-styles.js`（本次唯一改动文件）
- 规格：`specs/account-monitor-filter-polish.spec.md`
- 证据：`docs/evidence/account-monitor-filter-polish/`

## 4. 代码风格（Code Style）

CSS 声明按属性分组、单行一条；选择器列表按状态名排列；注释说明"为什么"而不是"改了什么"。
复用组件库已定义的令牌，不写未定义的令牌，也不引魔法兜底色值。

## 5. 测试策略（Testing Strategy）

- 纯样式改动，不新增只复述改动的断言；既有插件测试全量回归必须绿。
- 布局类结论以**真实浏览器测量**为准（jsdom 不做布局，CSS 文本断言无法证明"不再滚动"）。
- 测量项见成功标准 1–3，原始判据落 `harness-results.json`。

## 6. 边界（Boundaries）

- **总是**：改后跑插件全量测试 + `verify:stages` + 防遮掩门禁 + `git diff --check`；
  用真实浏览器测量取证。
- **先问**：调整弹层宽度、行高、状态文案本身；改账号健康态判定。
- **绝不**：为了"看起来对齐"写死魔法像素而不说明依据；在界面层遮掩数据不一致；
  改与本次无关的样式规则。

## 关键操作旅程

打开账号监控 → 点「账号筛选」→ 四个账号（含带原因行的终态行）一屏看全、不需要滚动；
冷却行昵称完整显示；导入/错误提示条有底色。

## 假设（Assumptions）

1. 列表高度上限应容纳"四行 + 一个原因行"这一常见规模，同时保留账号更多时的滚动能力。
2. 提示条的底色语义与文件内其它浅浮起表面一致，用组件库已定义的 `--dsw-alias-bg-layer-2`。

## 非目标

- 不改弹层宽度、行高、字号与状态文案。
- 不改刷新置灰优先级与健康态判定逻辑。
