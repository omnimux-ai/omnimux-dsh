# Spec: 修复「开始 (Apps)」一级页插件列表无法滚动、首尾卡片不可达

- 类型: Bug 修复（UI · Stage 滚动）
- 范围: `plugins/omnimux/src/client/AppsStage.jsx`、`plugins/omnimux/src/client/styles.js`、`plugins/omnimux/src/client/hub-ui-kit.test.js`、`tests/e2e/apps-stage-scroll.*`
- 风险: 低（仅滚动几何，不动数据/接口/其它 UI）

## 1. 现象

OmniMux 桌面端右侧「开始 (Apps)」页插件卡片纵向排列（视频剪辑/文件/项目/资产库/视觉工坊/手机管理/账号/灵感社区/任务表单/社媒采集/发布/AI网红工作室/数据分析…）。列表超出可视高度后**无法上下滚动**，顶部/底部卡片选不到。

## 2. 根因

- `.omnimux-apps-stage` 用 `position: fixed` + `height: var(--stage-height)`，而 `--stage-height` 来自 `readConversationBox()` 的 `box.height`。
- `readConversationBox()` 计算 `height = Math.max(found.height, winHeight - found.top)`：当测得会话容器高度 `found.height` 大于剩余视口（`winHeight - top`）时，stage 高度会**超过可视区**，fixed 定位下底部溢出到屏幕外。
- 同时 `.omnimux-apps-stage` 与 `.omnimux-apps-stage-body` 双层 `overflow: auto`。stage 被撑得比视口更高时，内层 body 的 `clientHeight` 反而装得下全部卡片（`scrollHeight == clientHeight`），于是**没有滚动条、也不可滚**；底部卡片落在屏幕外不可达。

## 3. 修复

1. `styles.js`：`.omnimux-apps-stage` 增加 `max-height: calc(100vh - var(--stage-top) - var(--omnimux-apps-stage-bottom-gap, 0px))` 并把 `overflow: auto` 改为 `overflow: hidden`；`.omnimux-apps-stage-body` 改为 `overflow-y: auto; overflow-x: hidden`。让整列卡片在可视高度内滚动、body 成为唯一滚动容器。
2. `AppsStage.jsx`：把 `--stage-height` 钳到 `min(实测, innerHeight - box.top)`（等价于可见剩余高度），从几何源头保证 stage 不越过视口底。

## 4. 验证

- 真实渲染进程（OmniMux Dev CDP）修前/修后几何：
  - 修前：stage.bottom=1354 > innerHeight=994，body scrollH==clientH 不可滚，最后一张卡 bottom=1078 不可达。
  - 修后：stage.bottom=994，body scrollH=988>clientH=898 可滚，首/末卡片可达。
- `node --test plugins/omnimux/src/client/hub-ui-kit.test.js`：新增滚动契约用例通过。
- `node tests/e2e/apps-stage-scroll.browser.mjs`：真实无头 Chrome 8/8 断言通过（stage 内钳、body 可滚、首尾可达）。
- `corepack pnpm --filter omnimux test`：全绿。
- `corepack pnpm verify:stages`、`verify-anti-slop`、`check:boundaries`：通过。
- `pnpm test:ui`（scan-ui-gates）：仅命中 main 上既有 UI01/02/10 债，本次改动未新增。

## 5. 证据

- `.agent-reports`/本地截图：`apps-scroll-before.png`、`apps-scroll-after.png`；`tests/e2e` 驱动输出 `tmp/apps-stage-scroll-qa/`。
