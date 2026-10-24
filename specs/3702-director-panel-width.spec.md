# Spec: 导演台窄面板下画布列保底（Issue #3702）

- Issue: #3702（P2；#3689 独立评审遗留的宽度问题，用户拍板按推荐方向修）
- 风险级别: R2（`plugins/omnimux-workflow` 导演台布局 + `scripts/` 测量口径）

## 1. 目标与用户结果

窄视口下导演台面板本身很窄（900px 视口实测 279px），而 max-lg 左栏固定 220px，把 3D 画布列挤到 51–59px。修完后：**画布列按面板自身宽度自适应，面板 ≤320px 时画布列仍 ≥140px**；宽屏数值（48/248/300/236）与 #3689 的高度保底不变。

## 2. 现状与根因

- 面板宽度由外壳布局决定（900px 视口 → 279px），与视口宽度并不同步。
- 但导演台的窄屏分支挂在**视口**媒体查询上（Tailwind `max-lg:` / `lg:`）：窗口窄 ≠ 面板窄，真正该看的是面板自己多宽。
- `max-lg:grid-cols-[220px_minmax(0,1fr)]` 里左栏是写死的 220px，在 279px 面板里占 79%，画布列只剩 59px。

实测（#3689 证据）：1728 视口 → 面板 1027 / 左栏 248 / 画布列 479；900 视口 → 面板 279 / 左栏 220 / 画布列 59（400px 高时 51）。

## 假设

- 画布是主工作区、左栏是辅助面板：窄面板下应当「画布保底、左栏让位」，与 #3689 的高度取舍同一原则。
- 用容器查询（`@container`）按面板自身宽度决策，能同时覆盖「窗口窄」与「窗口宽但面板窄」两种情形；面板宽度不会大于窗口宽度，所以容器查询是视口查询的超集。
- Chromium（Electron / ego 浏览器）原生支持 CSS 容器查询，`director-layout.css` 是纯 CSS、不依赖 Tailwind 插件，可直接写 `@container`。
- 画布列保底 140px 在面板 ≥230px 时都能满足（左栏按 `min(220px, 38cqw)` 让位）。

## 证伪方式

- 若只是把左栏改窄而没解决「按面板宽度决策」：在 900px 视口（面板 279px）下画布列应 ≥140px；若实现仍以视口为准且左栏 220px 不变，实测会停在 59px，断言失败。
- 若改坏了宽屏：`DIRECTOR_MEASURE=1` 的宽屏 `layout-thresholds`（48/248/300/236、中列 = 栅格宽 − 548）应仍全绿。
- 若改坏了预览视图或左右栏折叠变体：preview（`grid-cols-1`）与折叠变体（48px/0px 列）不应被容器规则改掉——容器规则只作用于 `[data-workspace-view="scene"]` 的栅格。

## 3. 范围与设计

- `plugins/omnimux-workflow/src/director/vendor/components/canvas-director-workbench.tsx`
  - 栅格元素补一个稳定类名 `director-workbench-grid`（便于用 CSS 容器规则覆盖 Tailwind 的视口分支）。
- `plugins/omnimux-workflow/src/director/vendor/director-layout.css`
  - 在 `[data-director-workbench="true"]` 上声明容器：`container-type: inline-size; container-name: director-workbench;`
  - 新增 `@container director-workbench (max-width: 520px)`（仅 scene 视图）：
    - 栅格：`grid-template-columns: minmax(0, min(220px, 38cqw)) minmax(140px, 1fr)`（左栏让位、画布列保底 140px）、三行 `minmax(180px,1fr) auto auto`、`overflow-y: auto; overflow-x: hidden`；
    - 左栏 `grid-column: 1; grid-row: 1`、中列（`main`）`grid-column: 2; grid-row: 1`、右栏 `grid-column: 1 / -1; grid-row: 2; max-height: 30vh`、时间轴槽位 `grid-column: 1 / -1; grid-row: 3`；
    - 折叠态必须被尊重：`[data-left-dock-collapsed="true"]` 时左列固定 48px 轨道，`[data-right-dock-collapsed="true"]` 时右栏 `display: none`（窄面板下它本是整行，不折叠会白占一行）。
  - 保留现有 `max-lg:` 视口分支不动（#3689 已验证），容器规则选择器特异性更高，冲突时以容器规则为准。
- `scripts/director-acceptance-3289.mjs`
  - 窄屏测量补记「面板宽度（栅格宽）/ 左栏宽度 / 画布列宽度」，并断言：面板 ≤320px 时画布列 ≥140px；宽屏断言不变。
- 证据落 `docs/evidence/director-panel-width-3702/`。

## 4. 非目标

不改宽屏栅格数值；不动 3D 渲染与功能旅程断言；不改 #3689 的高度保底；不改外壳侧栏/对话区布局（方向 3 已明确不在本次范围）。

## 旧标准变更

（无：本任务不改动既有测试用例的断言，只新增。）

## 5. 验收

1. `DIRECTOR_MEASURE=1 DIRECTOR_REAL_UI=1 DIRECTOR_EGO_BROWSER=<ego-browser> DIRECTOR_FFMPEG=<ffmpeg> node scripts/director-acceptance-3289.mjs` 退出码 0。**已达成**：`acceptance-3289-yaxCyB`。

   | 档位 | 面板 | 左栏 | 画布列 | 说明 |
   | --- | --- | --- | --- | --- |
   | 900×560 | 279 | 106 | **173** | 修复前左栏 220 / 画布列 59 |
   | 900×480 | 279 | 106 | 173 | 高度断言同时满足 |
   | 900×400 | 279 | 106 | 165 | 溢出且可滚动 |
   | 900×1400 | 279 | 106 | 173 | 窄而高，时间轴上限不收窄 |
   | 900×560 + 左栏折叠 | 279 | **48** | **231** | 折叠轨道保留，折叠状态未被容器规则吃掉 |
   | 1728×883（宽屏） | 1027 | 248 | 479 | 与 #3646 规格一致 |
2. 宽屏 `layout-thresholds`（48/248/300/236）仍全绿；#3689 的窄屏高度断言（中列 ≥180、时间轴 ∈[160,236]、无重叠、溢出必可滚动、窄而高上限不收窄）仍全绿。
3. 默认（不设 `DIRECTOR_MEASURE`）仍是原 8 条、退出码 0。
4. `pnpm --filter omnimux-workflow test`、`typecheck`、`build-director --check`、`verify:anti-slop`、`verify:stages` 全绿；契约测试补「容器查询 + 画布列保底」断言。
5. `git diff` 落在 `scripts/`、`specs/`、`plugins/omnimux-workflow/src/director`、`plugins/omnimux-workflow/tests/`、`docs/evidence/director-panel-width-3702/`。

## 6. 新用户基线

只影响导演台在窄面板下的列宽分配；宽屏、功能路径与外壳布局不变。

## 7. 文档影响

无。
