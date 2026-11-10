# 新会话输入框左右留白对齐原生 16px

Issue: #4028

## 背景（用户旅程）

用户在新会话页（含分栏 / 右侧工作台打开时）看到输入框卡片左右两侧的空白，明显大于官方 DSH 原生中间栏的输入框。原生每边约 16px，OmniMux 渲染成约 24px，卡片整体被挤窄约 40px，视觉上「缩一圈」。

用户期望：把 OmniMux 新会话/分栏下的输入框卡片左右留白收回，与原生一致（每边 16px）；宽屏仍保留 680px 紧凑上限，不无限拉宽；顶部内联态与工作区选择行（社媒运营 / 全域社媒操盘手）保持同宽、同左缘，吸底态宽度仍锁 680px。

## 根因

输入框卡片被两层侧边留白叠加：

1. 宿主官方 `InputBar` 根节点 `padding: 0 var(--dsh-composer-side-clearance) ...`（分栏/紧凑模式被设为 12px/边）；
2. `plugins/omnimux/src/client/session-guide/styles.js` 再给卡片 `max-width: min(680px, calc(100% - 24px))`（再让 12px/边）。

两层相加约 24px/边；原生只有第 1 层（16px）。

## 目标行为

- 分栏 / 紧凑（窄列）下输入框卡片每边留白 = 16px（与原生一致），不再叠加。
- 宽屏（列宽足够）下卡片仍封顶 680px 并水平居中。
- 工作区选择行与输入框卡片同宽、同左缘（窄列同 16px，宽屏同 680px）。
- 顶部内联态与吸底态宽度一致（沿用既有 680px 令牌，不改 DOCK_MAX_WIDTH）。
- 不改动宿主官方源码，仅通过产品插件样式层实现。

## 假设

- 宿主 `InputBar` 根节点的侧边内边距由 `--dsh-composer-side-clearance` 单令牌驱动，将其置为 16px（或改为由卡片自身 max-width 承担 16px）即可消除第二层叠加。
- 工作区选择行不在该 padded 根节点内，需单独给出行宽规则（width: calc(100% - 32px)；max-width: 680px），才能与卡片同宽同左缘。
- 宽屏下 680px 上限仍然生效，不会因留白调整而拉宽到 780/952/100%。

## 证伪方式

- 在隔离工作树用真实 Chromium 内核渲染 280px 窄列夹具：若修后卡片每边留白仍明显大于 16px（如仍 24px）或工作区行与卡片左右缘不一致（|Δ|>1px），即证伪。
- 在 1440px 宽屏夹具：若卡片或工作区行宽度未被封顶在 680px（或超出 680±1px），即证伪。
- 运行 `pnpm --filter @deepseek-ai/dsh-omnimux test` 与 `node --test scripts/verify-anti-slop.test.mjs`、`pnpm verify:stages`，任一失败即证伪。

## 验收用例

1. 280px 窄列（split-compact 属性）：卡片左右各 ≈16px；工作区行左右各 ≈16px；两者左缘一致（|Δ|≤1px）。
2. 1440px 宽屏：卡片宽 ≈680px 且居中；工作区行宽 ≈680px 且与卡片同左缘。
3. 既有门禁 `qa:starter-row-align`（scripts/starter-workspace-row-align-qa.mjs）在两种注入顺序下仍通过。
4. `composer-width-680px.e2e.test.js`、`docked-slot-position.e2e.test.js` 同步更新后通过。

## 旧标准变更

- `plugins/omnimux-inspiration/src/explore/composer-width-680px.e2e.test.js` :: `e2e: 新会话欢迎页顶部输入框、工作区行与吸底态严格收敛为 680px 紧凑黄金宽度`
  - 原断言：卡片与工作区行 `max-width: min(680px, calc(100% - 24px))!important`，JSDOM 计算值为 `min(680px, 100% - 24px)`。
  - 必须改的理由：该 `calc(100% - 24px)` 叠加在宿主 `InputBar` 的 `--dsh-composer-side-clearance` 侧边内边距之上，导致分栏/窄列下每边约 24px（原生仅 16px）。按 Issue #4028 用户决定，去掉这层重复收缩，回到原生 16px 侧边留白、宽屏保留 680px 上限。
  - 新期望证据：卡片 `max-width: 680px`；工作区行 `width: calc(100% - 32px)` + `max-width: 680px`；吸底卡片保持 `max-width: min(680px, calc(100% - 24px))`（沿用 DOCK 680 令牌）；JSDOM 计算值为 `680px` / `680px` / `min(680px, 100% - 24px)`。隔离工作树真实 Chromium 夹具：280px 窄列卡片与工作区行左右各 ≈16px 且同左缘。

- `plugins/omnimux/src/client/starter-hero-row-cascade.test.mjs` :: 级联胜出契约（常量 `STARTER_SIZE_MARKER`）
  - 原断言：以 `max-width:min(680px` 作为「引导页工作区行尺寸规则」的识别标记。
  - 必须改的理由：工作区行尺寸体已从 `max-width:min(680px, calc(100% - 24px))` 变为 `width:calc(100% - 32px)!important; max-width:680px!important`，需把识别标记改为 `max-width:680px`，用例的选择器特异性断言逻辑不变。
  - 新期望证据：`guideSizingSelectors.length >= 2` 仍成立，全部带 `[data-phase][data-omnimux-starter-host]` 复合条件且仍严格高于通用 Hero 行规则。

## 非目标

- 不改吸底 Dock 的 DOCK_MAX_WIDTH 与几何计算。
- 不改原生会话组件源码。
- 不动其它页面/阶段的留白。
