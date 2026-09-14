# 规范：会话栏收起时右侧面板必须铺满容器（消除中间黑空占位）

Issue: [#1622](https://github.com/omnimux-ai/omnimux-dsh/issues/1622)

## 1. 目标 (Objective)

**用户报告（附截图）**：点击左侧侧边栏的任意插件入口（如「产品库」）后，中间出现一大块空白占位。

**现场取证（运行中的开发版，CDP 实测）**：

| 量 | 值 |
| --- | --- |
| 框架内联样式（外壳所写） | `grid-template-columns: 280px minmax(0px, 1fr) 778px` |
| 框架实际生效网格 | `280px 0px 1448px` |
| 右栏容器 `display` | `aside.dshDesktopRightbarSurface` @ x=280 宽 1448 |
| 面板 | `position:absolute; left:670px; width:778px` → x=950 宽 778 |

**根因**：本仓库自己的样式 `conversation-box.js` 在会话列收起时把网格写成
`var(--omnimux-sidebar-width) 0px minmax(0px, 1fr) !important`（原意正是「让右侧占满、绝不留中间黑空」）。
但外壳把**右栏面板**写成固定宽度并**右对齐**（`left = 容器宽 − 面板宽`）。第三列被撑成全部剩余宽度后，
容器宽 1448、面板仍 778 且右对齐，于是面板左侧凭空多出 `1448 − 778 = 670px` 的黑空——正是用户看到的「中间空白占位」。

**修复方向（已现场验证）**：会话列收起时，让右栏容器内的面板**铺满容器**（`left:0 / right:0 / width:auto`）。
实测注入该规则后：面板由 `x=950 宽 778` 变为 `x=280 宽 1448`，空白消失；对照截图 `tmp/middle-blank-before.png` / `tmp/middle-blank-after.png`。

成功标准（可测）：

- 会话列收起且插件页打开时，右栏面板的 `left` 等于右栏容器的 `left`，且 `width` 等于容器宽（实测断言）。
- 会话列**未**收起时布局不变（规则严格限定在 `[data-omnimux-conversation-collapsed]` 下）。
- 样式常量回归用例覆盖该规则，删掉即失败。

## 2. 命令 (Commands)

```
pnpm --filter omnimux test
node scripts/omnimux.mjs sync
```

## 3. 项目结构 (Project Structure)

- 改动：`plugins/omnimux/src/client/conversation-box.js`（样式常量）、`plugins/omnimux/src/client/conversation-collapse.test.js`（回归用例）
- 规格：`specs/conversation-collapsed-panel-fill.spec.md`
- 取证脚本（临时，不入库）：`tmp/omnimux-dev-middle-blank-demo.mjs`

## 4. 代码风格 (Code Style)

沿用该文件既有 CSS 常量写法与中文注释风格；选择器与既有规则同源（`html[data-omnimux-conversation-collapsed]` 前缀）。

## 5. 测试策略 (Testing Strategy)

- 在既有 `conversation-collapse.test.js` 增加断言：样式常量中存在「会话收起时右栏面板铺满」的规则（含 `left:0` 与面板类名匹配）。
- 端到端：物化后由用户在实际界面确认（界面验收归人类）。

## 6. 边界 (Boundaries)

- **总是**：只影响会话列收起态；沿用既有 CSS 变量与选择器前缀。
- **先问**：改动外壳（Electron 应用）自身样式；调整面板默认宽度。
- **绝不**：用 `!important` 覆盖外壳的全部网格列（正是本次缺陷的来源）；触碰其它面板状态。
