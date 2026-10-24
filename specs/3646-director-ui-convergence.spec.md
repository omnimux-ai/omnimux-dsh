# 规格：3D 导演台 UI 布局与规范收敛 (Issue #3646)

父规格：`specs/beeftv-3d-director-migration.spec.md`（L2，功能等效迁移）。本规格只收敛 UI，不改导演台能力集。

## 一、背景与问题定义

3D 导演台由 BeefTV 适配而来（`src/director/vendor/`，改写脚本 `src/director/adapt-vendor.mjs`），样式分两层：`vendor/director-layout.css`（1117 行，随包布局）与 `src/director/controls.css`（62 行，我们的适配层，构建时拼在 layout 之后，同名覆盖生效）。token 表集中在 `scripts/build-director.mjs:35`。

当前实测问题：

1. 顶栏 `controls.css:41` 是 `position:absolute; height:52px`，浮在 grid 之上；左栏用 `controls.css:48` 的 `padding-top:52px` 让位，右栏 `controls.css:55` 是 `padding-top:0` → 左右两栏内容起始线差 52px。
2. 三栏是 `canvas-director-workbench.tsx:1780` 的 `grid-cols-[280px_minmax(0,1fr)_280px]`。右栏内容宽 248，「滑杆 + 数值框」被挤成滑杆 164 + 值框 72。
3. 时间轴是 grid 的**兄弟节点**（`canvas-director-workbench.tsx:2012` 关闭 grid、`:2018` 渲染时间轴），横跨整宽含右栏下方；右栏因此少 236px 高，且只有 `leftDockCollapsed`（`:140`），右栏不可折叠。
4. 页面同时出现 10/11/12/13/14/15/16 七档字号；圆角 4/8/8/12，胶囊处硬编码 `999px`（`director-layout.css:230/249/265`）；`--r-full:12px` 名不副实。
5. 滑杆两套实现：`controls.tsx:45` 的 `Slider` 与手写 `<input type=range className="… accent-cyan-400/500">`（`canvas-director-workbench.tsx:2055/2057/2065/2144`、`director-camera-properties.tsx:81`）；值框 `w-[72px]`，单位混乱（`%`/`°`/`m`/`s`/`秒` 混用）。
6. TSX 内联 hex 不跟随主题（`#18343a`、`#252525`、`#090a0c`、`#171717`、`#263e43`、`#5ddcff`、`#4dd1e9`、`#78a9ff` 等）。构建的 postcss 插件只改写 CSS 里的 `color/background-color/border-color/ring`，**不覆盖 TSX 内联样式**。
7. 缺陷：`canvas-director-workbench.tsx:1945` 引用 `--z-popover` 但该 token 不存在；`.director-mode-switch-button` 在 `controls.css:52` 与 `:56` 重复定义；`--space-10` 定义后零引用；`director-sequencer.tsx:93` 的 `isCompact = !isPreview` 让编辑态永远走紧凑分支，`showDetails`（:265）、缩放 −/＋（:263-264）、机位子轨（:233-237）不可达。

参考对象 MiniMax Design 4.0.4 实测规格（插件 iframe 1431×985 CSS px @dpr2，2026-10-23）：

| 项 | 实测值 |
|---|---|
| 顶栏 | 48px 正常流，左右内边距 16，下边框 1px 白 20% |
| 三栏 | 左 248（折叠 0）｜中 flex-1｜右 300；右栏内容宽 267 |
| 时间轴 | 236px 高，只跨中列（1131 宽），工具条 40px |
| 滑杆行 | 轨道 2px + 滑块 12px 圆；值框 58×32 圆角 10；间距 12 |
| 面板节奏 | 内边距 12/16/16；分组标题 15px·500 下 12；字段标签 11px 下 6；字段块下 12；分区分隔上下 16 |
| 字号（实际在用） | 11px×23 ｜ 13px×14 ｜ 12px×5 ｜ 15px×5 |
| 颜色（实际在用） | 文字 3 种；边框 1 种（白 20%×30） |
| 圆角（实际在用） | 6×27 ｜ 10×18 ｜ 9999×6 ｜ 8×5 |

## 二、设计原则

1. **借布局与规范，不复制品牌**：颜色、字号、圆角全部落到 DSW token；不引入参考对象的十六进制色。
2. **单一真源**：token 只改 `build-director.mjs:35`；同名覆盖只写 `controls.css`；不改 `vendor/director-layout.css` 的既有尺寸，除非必须。
3. **不接回被父规格排除的能力**：`isCompact` 死分支按父规格「保留实际可达时间轴……差异明确记录」处理——**隐藏死控件并记录差异**，不实现高级时间轴。
4. **参考自身的缺陷不抄**：参考把滚动条全局隐藏（`width:0 + display:none`）导致右栏 14px 溢出不可发现；我们保留 `.thin-scrollbar`（`controls.css:40`）。
5. **窄屏回退**：`max-lg` 断点下时间轴保留全宽，右栏跨列行为不变。

## 三、阶段与改动清单

### P0 缺陷与离群值（低风险）

| # | 位置 | 改法 |
|---|---|---|
| P0-1 | `build-director.mjs:35` | 补 `--z-popover:30` |
| P0-2 | `controls.css:52/56` | 删除重复定义，高度单点定义 |
| P0-3 | `build-director.mjs:35` + `director-layout.css:230/249/265` | `--r-full:999px`；三处硬编码 `999px` 换 token |
| P0-4 | `build-director.mjs:35` | 删除 `--space-10` |
| P0-5 | `director-sequencer.tsx:263-265/233-237` | 隐藏编辑态不可达的缩放 −/＋、详情切换、机位子轨，记录差异 |

### P1 布局重构

| # | 位置 | 改法 |
|---|---|---|
| P1-1 | `controls.css:41-48/44/55`、`canvas-director-workbench.tsx:1758` | 顶栏改 root 正常流子项：48px、px 16、`bg var(--dsw-alias-bg-layer-1)`、下边框 1px；删左右栏补偿；左组宽 248、右组 `margin-right:300px` |
| P1-2 | `canvas-director-workbench.tsx:1780` | `grid-cols-[248px_minmax(0,1fr)_300px]` |
| P1-3 | `canvas-director-workbench.tsx:2012/2018` | 宽屏把时间轴移入中列（新增 flex-col 包裹 `<main>` + 时间轴）；`max-lg` 保持全宽 |
| P1-4 | `director-sequencer.tsx:191` + store | 默认高 236，`minHeight:160`，`maxHeight:60vh` |
| P1-5 | `canvas-director-workbench.tsx:140/1757` + store | 新增 `rightDockCollapsed` + `data-right-dock-collapsed` + 顶栏折叠按钮 |
| P1-6 | `director-layout.css:75-93/189-199/217-232` | 视口浮动条收敛一套：按钮 40×40、容器 padding 6/10、圆角 16、gap 6、距视口底 28、居中于视口 |
| P1-7 | `controls.css:41-55` 与内联 margin | 面板节奏统一：12/16/16；标题 15·500 下 12；标签 11 下 6；块下 12；分隔上下 16 |

### P2 规范收敛

- P2a 命名与离群值：`--fs-2xs:11 / --fs-xs:12 / --fs-sm:13 / --fs-title:15`（删 tiny/label/caption）；`--r-xs:4 / --r-sm:6 / --r-md:8 / --r-lg:10 / --r-xl:12 / --r-full:999`；`.director-switch` 32×20 → 36×20（滑块 16）。
- P2b 值重映射（独立 commit）：`--r-sm` 8→6、`--r-lg` 12→10，附前后截图。
- P2c 字号类名归一：`text-[10px]`→`text-[11px]`（5 处）、`text-sm`→`text-[13px]`（10 处）、`text-base`→`text-[15px]`（1 处）；`text-[11px]/text-xs/text-[13px]` 保留。
- P2d 颜色与激活态：TSX 内联 hex 全部换 DSW token；激活态统一反色（`label-primary` 底 + `bg-base` 字）；小字改 `--dsw-alias-label-secondary`，禁用态用容器 `opacity:.45`。
- P2e 滑杆统一：全部走 `.director-slider`，`controls.css` 补自定义轨道（轨道 2px / 滑块 12px 圆 / hover scale 1.1）；值框 72 → 58，单位做框内单位槽。
- P2f z 分层：`dock 10 / toolbar 20 / popover 30 / toast 40 / menu 50 / tooltip 60 / modal 100`，把 10002-10005 等映射回来。

## 假设

1. 布局尺寸问题来自我们自己的适配层（`controls.css` 与 `canvas-director-workbench.tsx` 的 grid 模板），不是 Three.js 场景渲染；因此改容器结构与 CSS 即可，无需触碰渲染内核。
2. 参考对象的数值只作改法依据，不逐像素复制；最终以 DSW token 与三栏几何为准。
3. 编辑态时间轴的「缩小/放大时间轴」与「显示子轨道」在 `isCompact` 分支下确实无效——`timelineScale` 只在 preview 与非 compact 分支被消费（`director-sequencer.tsx:244/273/289`），`showDetails` 只在非 compact 分支被消费（`:311`）；因此按父规格隐藏，而不是接功能。
4. 机位子轨（位置/焦点/视角，`:234-236`）位于 compact 分支，编辑态可达，不属于父规格排除项，保持不动。
5. 右栏 300px 的前提是画布浮层宽度 ≥ 1024px；窄屏沿用现有 `max-lg` 回退，时间轴保留全宽。

## 证伪方式

以下任一可观测结果出现，即证明上述假设有误，必须回退该项并重新定界：

1. 真实浏览器量不到顶栏 48px / 三栏 248·1fr·300 / 时间轴 236px 且宽度等于中列宽 → 假设 1 有误（尺寸不由适配层决定）。
2. 收敛后页面仍出现 10/14/16px 字号，或右栏内容高度仍小于面板高度（仍溢出且无滚动条）→ 假设 2 有误。
3. 隐藏后编辑态仍能看到无效的缩放/详情控件，或点击后仍无反应 → 假设 3 有误。
4. 机位子轨（位置/焦点/视角）在编辑态消失 → 假设 4 有误（说明它本就在被排除的分支里）。
5. `max-lg` 断点下出现列错位或时间轴被裁切 → 假设 5 有误。

执行命令：`node scripts/build-director.mjs --check`、`corepack pnpm --filter omnimux-workflow typecheck`、`corepack pnpm --filter omnimux-workflow test`、`node --test scripts/verify-anti-slop.test.mjs`、`corepack pnpm verify:stages`，以及真实浏览器测量（`node scripts/director-acceptance-3289.mjs` 或 UI 测量变体）。

## 五、验收

机器可判阈值：

- 顶栏 48px；三栏 248 / 1fr / 300；时间轴 236px 且 `rect.width` = 中列宽（不含右栏）；右栏内容高度 ≥ 面板高度、滚动条可见。
- 页面字号集合 = {11,12,13,15}；圆角集合 ⊆ {4,6,8,10,12,999}；边框色只有 `--dsw-alias-border`；滑杆实现只有一处；TSX/CSS 硬编码 hex 计数 = 0（token 定义处除外）。

命令：

- `node scripts/build-director.mjs --check`（`plugins/omnimux-workflow`）
- `corepack pnpm --filter omnimux-workflow typecheck`
- `corepack pnpm --filter omnimux-workflow test`
- `node --test scripts/verify-anti-slop.test.mjs`、`corepack pnpm verify:stages`（仓库根）
- 真实浏览器：`node scripts/director-acceptance-3289.mjs`（或 UI 测量变体），证据落 `.agent-reports/`

## 五、非目标

不新增导演台能力；不改 Three.js/R3F 场景数学、保存、导出、识图链路；不逐像素复制参考品牌；不实现被父规格排除的高级时间轴；不碰生产与官方 DSH 源。
