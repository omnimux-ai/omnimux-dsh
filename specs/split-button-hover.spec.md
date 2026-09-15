# 定时任务分裂创建按钮悬停背景色优化 · 规格

变更面：插件客户端样式（`plugins/omnimux-automation/src/client/styles.js`）
风险等级：R2（单插件非破坏性界面与视觉样式修复）

---

## 1. 目标（Objective）

### 背景与问题陈述

在定时任务工作台中，右上角的分裂创建按钮（Split Create Button，包含左半边「创建」文字主按钮与右半边「下拉小箭头」开关）存在以下体验与视觉问题：
1. **视觉割裂**：组件原本设计规范为「左半与右半同底同色、只被一条细分隔线切开，视觉上仍是一颗完整胶囊」。但在深色主题下，左侧主按钮填充色为白色（`--dsw-alias-button-primary-fill`），右侧开关却硬编码为深黑灰色底色（`--dsw-alias-bg-layer-4`），导致左右生硬割裂。
2. **悬停底色过深**：鼠标悬停在右侧下拉按钮时，其 hover 背景使用了通用交互悬停色（`--dsw-alias-interactive-bg-hover`），在深色模式下表现为一块深黑色的色块，用户反馈「鼠标悬停的时候按钮背景颜色太深了」，反差极大，严重影响视觉质感。

### 目标状态

1. 左右同底同色：右侧下拉开关与左侧主按钮均使用主行动按钮底色 `--dsw-alias-button-primary-fill`（深色模式下为纯白），文本与图标统一为 `--dsw-alias-label-primary-foreground`（近黑/深色）。中间保持一条半透明的细分隔线。
2. 悬停优雅柔和：当鼠标悬停在主按钮或下拉开关上时，背景色平滑过渡为规范的主行动按钮 Hover 底色 `--dsw-alias-button-primary-hover`（在深色模式下为浅灰 `#ebebeb`，在浅色模式下为 `#242424`），不再出现深黑硬块。
3. 展开状态延续：当下拉菜单处于展开状态（`is-open`）时，下拉开关保持 hover 高亮浅灰底，箭头旋转 180°。

### 不做什么（Non-goals）

- 不改动定时任务业务逻辑与定时规则计算。
- 不改动主对话预填与引导创建功能。
- 不改动下拉菜单项及其点击回调行为。

---

## 2. 成功标准（Success Criteria，可测）

| 编号 | 验收标准 | 判定手段 |
| --- | --- | --- |
| AC-1 | 分裂创建按钮右侧下拉开关默认背景与主行动按钮底色一致（`var(--dsw-alias-button-primary-fill, #fff)`），文本/图标颜色为 `var(--dsw-alias-label-primary-foreground, #111)`。 | 静态样式规则审查与计算样式核验 |
| AC-2 | 鼠标悬停在右侧下拉开关（`.dsh-st-split-toggle:hover`）或菜单展开时，背景底色为 `var(--dsw-alias-button-primary-hover, #ebebeb)`，不再变深发黑。 | 静态样式规则审查与 DOM 交互测试 |
| AC-3 | 鼠标悬停在左侧主按钮（`.dsh-st-split-main:hover`）时，背景底色同样过渡为 `var(--dsw-alias-button-primary-hover, #ebebeb)`。 | 静态样式规则审查与 DOM 交互测试 |
| AC-4 | 既有所有单元测试（131 项）全部保持绿色通过，构建正常产出。 | `npm test` 与 `npm run build` |
