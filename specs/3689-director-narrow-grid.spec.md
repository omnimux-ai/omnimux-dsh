# Spec: 导演台窄屏矮视口栅格收缩修复（Issue #3689）

- Issue: #3689（P2；#3682 独立评审提出的低危，用户拍板顺手修）
- 风险级别: R2（`plugins/omnimux-workflow` 导演台布局 + `scripts/` 测量口径）

## 1. 目标与用户结果

窄屏（<1024px）+ 矮视口下打开导演台并展开时间轴时，**3D 画布不再被压到 0**：中列保底高度、时间轴优先收缩（160–236px）、右栏与时间轴不重叠、容器内无内容被裁掉。宽屏数值（48/248/300/236）与默认 8 条功能断言不变。

## 2. 现状与根因

- 栅格：`grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]`。
- max-lg 下左右栏与时间轴都跨列（`max-lg:col-span-2`），实际行结构变成：第 1 行 `minmax(0,1fr)`（左栏+中列）、第 2 行 auto（右栏 `max-lg:max-h-[40vh]`）、第 3 行隐式 auto（时间轴 `height:236, minHeight:160, maxHeight:60vh`）。
- `1fr` 下界为 0、auto 行不收缩 ⇒ 视口变矮时先把中列压到 0（3D 画布整块消失），时间轴仍占 236px。改动前时间轴是栅格的 flex 兄弟节点，收缩顺序相反。

## 假设

- 窄屏矮视口下的正确取舍是「画布保底、时间轴让位」：时间轴是可折叠的辅助面板，画布是主工作区；用户仍能通过折叠时间轴拿回全部高度。
- 收缩优先级的实现可以只落在 max-lg 断点，不影响宽屏 `maxHeight: 60vh` 的可拖拽范围。
- 真机测量能稳定复现：把视口设成 900×560 后布局立即重排（无需刷新），且该尺寸下 max-lg 断点生效。

## 证伪方式

- 若修复只是把行高改成固定值：把视口高度从 560 继续降到 480，中列应仍在保底值以上、时间轴仍在 160–236 区间，而不是某一项变成负数或被裁掉。
- 若宽屏被改坏：`DIRECTOR_MEASURE=1` 的宽屏 `layout-thresholds`（48/248/300/236）应仍全绿。
- 若窄屏断言是假的：修复前跑同一命令应当**失败**并报出中列 0 / 重叠等实测值。

## 3. 范围与设计

- `plugins/omnimux-workflow/src/director/vendor/components/director-sequencer.tsx`
  - 内联样式去掉 `maxHeight`：内联会压过断点，宽屏 `max-height: 60vh` 移入 CSS。
- `plugins/omnimux-workflow/src/director/vendor/director-layout.css`
  - `.director-sequencer { max-height: 60vh; }`，并加 `@media (max-width: 1023px) { max-height: min(236px, 30vh); }`：窄屏矮视口下时间轴先收缩（`min-height: 160px` 保底）。
- `plugins/omnimux-workflow/src/director/vendor/components/canvas-director-workbench.tsx`
  - 栅格 max-lg 行定义给第 1 行保底（`max-lg:grid-rows-[minmax(180px,1fr)_auto]`）+ `max-lg:overflow-y-auto`：放不下时栅格滚动，内容可达而不是被 `overflow-hidden` 裁掉。
  - 右栏窄屏上限从 `max-lg:max-h-[40vh]` 收紧到 `30vh`，给画布与时间轴让位。
- `scripts/director-acceptance-3289.mjs`
  - `DIRECTOR_MEASURE=1` 时追加 `layout-narrow-thresholds`：用 CDP `Emulation.setDeviceMetricsOverride` 依次切到 900×560 与 900×480（ego 的 Page 没有 `setViewportSize`），每次展开时间轴后量中列高度、时间轴高度、右栏底边与时间轴顶边、栅格 `overflow-y`/`scrollHeight`/`clientHeight`；断言中列 ≥180、时间轴 ∈[160,236]、无重叠、「内容超高时必须可滚动」；留 `layout-narrow-560.png`/`layout-narrow-480.png` 与实测值，最后清除覆盖继续。
  - 宽屏 `layout-thresholds` 口径不变。
- 证据落 `docs/evidence/director-narrow-3689/`。

## 旧标准变更

- `plugins/omnimux-workflow/tests/director-layout-contract.e2e.test.mjs` :: `测量变体默认关闭，且不改动原 8 条断言的顺序`
  - 原断言：`runner.includes("MEASURE ? [baseExpected[0], 'layout-thresholds', ...baseExpected.slice(1)] : baseExpected")`，要求 `expected` 是单行三元表达式且只含宽屏断言。
  - 必须改的理由：本任务给测量变体追加了窄屏断言 `layout-narrow-thresholds`（放在断言列表末尾，避免切视口影响功能步骤），`expected` 变成多行三元表达式，旧的整串匹配不再成立；这不是放宽标准，而是断言点随实现一起前移。
  - 新期望证据：改为正则匹配新的 `expected` 组合（`layout-thresholds` 紧跟入口断言、`layout-narrow-thresholds` 在末尾、`MEASURE` 为假时回落 `baseExpected`），并新增两条窄屏用例（源码断点 + 真机证据）。实跑：该文件 11/11 通过。

## 4. 非目标

不重做窄屏信息架构；不改宽屏栅格数值；不动 3D 渲染与功能旅程断言。

## 5. 验收

1. `DIRECTOR_MEASURE=1 DIRECTOR_REAL_UI=1 DIRECTOR_EGO_BROWSER=<ego-browser> DIRECTOR_FFMPEG=<ffmpeg> node scripts/director-acceptance-3289.mjs` 退出码 0，断言 10 条（原 8 条 + 宽屏 + 窄屏）。**已达成**：`acceptance-3289-2sEd3j`，900×560 行高 `180/115/168`（无滚动），900×480 行高 `180/43/160`（无滚动），两档中列都保底 180、时间轴 168/160、右栏底边 = 时间轴顶边。
2. 修复前同命令在窄屏断言上失败（证据留档，说明断言不是摆设）。**已达成**：`acceptance-3289-1addQF`，900×560 实测行高 `11/224/236`、中列 11px，报 `middle column height: 实测 11 vs 期望 >= 180`。
3. 极端取舍（记录在案）：900×480 时右栏被压到 43px（内部可滚动）；此时时间轴可一键折叠，折叠后右栏回到 30vh。画布保底 180 是刻意的优先级取舍。
4. 默认（不设 `DIRECTOR_MEASURE`）仍是原 8 条、退出码 0。
5. `pnpm --filter omnimux-workflow test`、`typecheck`、`build-director --check`、`verify:anti-slop`、`verify:stages` 全绿；契约测试补窄屏断点与真机证据断言。
6. `git diff` 落在 `scripts/`、`specs/`、`plugins/omnimux-workflow/src/director`、`plugins/omnimux-workflow/tests/`、`docs/evidence/director-narrow-3689/`。

## 6. 新用户基线

只影响导演台在窄屏/矮视口下的面板收缩顺序；宽屏与功能路径不变。

## 7. 文档影响

无。
