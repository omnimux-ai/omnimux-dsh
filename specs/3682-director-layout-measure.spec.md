# Spec: 导演台验收 UI 测量变体（Issue #3682）

- Issue: #3682（P2；补齐 #3646 §五 的真实浏览器数值验收，并修掉测量抓出的四处偏差）
- 风险级别: R2（`scripts/` + `plugins/omnimux-workflow` 的导演台 UI 源码）
- 背景: `scripts/director-acceptance-3289.mjs` 是唯一真机入口，但只有 8 条功能旅程断言，没有任何布局/几何数值；#3646 的 48/248/300/236/字号/圆角/边框色阈值目前只有静态检查兜底。

## 1. 目标与用户结果

给现有 runner 加一个环境变量开关的测量变体：同一次真机运行里，除了原来的 8 条功能断言，再量一遍 #3646 §五 的布局阈值，并把实测值写进证据。阈值不符时明确失败并列出「实测 vs 期望」。开关默认关闭，行为与断言集合完全不变。

测量首跑即在当前 main 上抓出四处与规格不符（见 §2.2），按用户拍板一并修掉，使测量变体在真机上全绿。

## 2. 范围与设计

### 2.1 测量变体

- `scripts/director-acceptance-3289.mjs`
  - 新增 `DIRECTOR_MEASURE=1` 开关（模块常量 `MEASURE`，经 payload 传入被 `toString()` 执行的 `browserJourney`，与 #3674 的 `paletteLabels` 同一机制）。
  - 断言集合：开关打开时在原 8 条之后（紧跟入口断言）插入 `layout-thresholds`，`expected` 常量随之条件化；关闭时与现状逐字一致。
  - 时间轴默认收起（store `sequencerVisible=false`），测量前按用户路径点 `[aria-label="动画时间轴"]` 展开，再量高度与宽度。
  - 测量（全部在真实浏览器内 `page.evaluate`，DOM 锚点已存在）：
    - 顶栏 `[data-director-topbar]` 高度 = 48；
    - 左栏 `[data-director-left-dock]` = 248、右栏 `[data-director-right-dock]` = 300；
    - 栅格 = workbench 内 `display: grid` 的子元素；中列 = 既非左右栏也非时间轴槽的栅格项，宽度 = 栅格宽 − 548；
    - `.director-sequencer` 高度 = 236，且 `rect.width` = 中列宽度；
    - `[data-director-property-inspector]` `scrollHeight >= clientHeight` 且 `overflow-y: auto`；
    - 字号：**直接含可见文字**的元素 `font-size` 去重 ⊆ {11,12,13,15}px（容器继承到的 16px 不代表可见文本）；
    - 圆角：四角非 0 的 `border-radius` 去重 ⊆ {4,6,8,10,12,999}px；保留原始计算值（`50%` 不会被伪装成 `50px`）；
    - 边框色：**逐边**判定可见性——该边宽度 > 0、颜色非透明、且颜色 ≠ 自身背景色；颜色去重 ⊆ `--dsw-alias-border` 解析值（与背景同色的描边画不出来，不算边框色）；
    - 测量范围限导演台 chrome：**包含**视口浮动工具条（#3646 P1-6 点名的按钮/边框/圆角/字号），只排除 3D 画布本身与瞬时提示浮层（后者只在引导期间出现，会让集合抖动）；
    - 固定常量（48/248/300/236）精确命中，只有「中列 = 栅格宽 − 548」这类派生比较允许 1px 取整误差。
  - 证据：`layout-thresholds.json`（阈值、实测、逐项失败原因、越界元素出处）+ `layout-thresholds.png`（展开时间轴后的整屏截图）+ `assertions.json`。
- 不改原 8 条断言语义、不改装配与清理逻辑。

### 2.2 首跑抓出的偏差与修复（用户拍板一并修）

| 偏差（实测） | 根因 | 修复 |
| --- | --- | --- |
| 时间轴宽 1027 ≠ 中列宽 479，左边界 x=701 vs 中列 x=949 | 时间轴槽位是栅格的兄弟节点，`lg:col-start-2` 是死样式 | 把槽位 JSX 移进栅格（`canvas-director-workbench.tsx`），使其真正成为第 2 列第 2 行 |
| 字号 15.21px（全景背景／全景球／地面 三个 h3） | `director-scene-inspector.tsx` 未声明字号 | 补 `text-[13px]` |
| 圆角 50%（开关滑块 + 两个滑杆 thumb） | `controls.css` 硬编码 | 改 `var(--r-full)`；装饰 spinner 同步改 token |
| 边框色 `rgb(133,133,133)`（天空色值输入框） | 漏 `border-0`，原生 input 灰边露出 | 补 `border-0` |

（引导页「下一步」按钮的 accent 描边与自身背景同色、画不出来，经「可见边框」定义排除，非缺陷。）

## 假设

- 默认视图（左右栏都展开、时间轴可见）下上述锚点存在且唯一；若锚点缺失，测量应显式报「找不到锚点」而不是静默跳过。
- `--dsw-alias-border` 在本工作树的 `.wf-director-root` 上可解析（浏览器把变量解析成具体颜色）。
- 字号/圆角/边框色的「可见元素」定义：`display` 非 `none`、`visibility` 非 `hidden`；圆角只看四角非 0 值；边框只看任一边宽度 > 0 且颜色非透明。

## 证伪方式

- 若测量只是复述 CSS 常量：在真实浏览器里人为改动（例如临时把顶栏高度改成 52）应让 `layout-thresholds` 失败并报出 52 vs 48；也可用同一命令对 `origin/main` 前后对比。
- 若开关关闭时行为变了：`expected-assertions.json` 与 `assertions.json` 应仍是原 8 条。
- 若锚点缺失导致假通过：断言在缺锚点时失败（不是跳过）。

## 5. 验收

1. `DIRECTOR_MEASURE=1 DIRECTOR_REAL_UI=1 DIRECTOR_EGO_BROWSER=<ego-browser> DIRECTOR_FFMPEG=<ffmpeg> node scripts/director-acceptance-3289.mjs` 退出码 0，断言 9 条（原 8 条 + `layout-thresholds`），实测值落 `layout-thresholds.json` 与 `layout-thresholds.png`。**已达成**：`acceptance-3289-z7ej05`（含视口工具条口径），实测 48/248/300/479、时间轴 236×479（x=949 与中列对齐）、inspector 可滚动、字号 {11,12,13,15}、圆角 {4,6,8,10,12,999}、边框色只有 `rgb(249,250,251)`。
2. 不开开关时退出码 0、断言仍为原 8 条。**已达成**：`acceptance-3289-eWrvTh`，`expected-assertions.json` 逐字为原 8 条。
3. 实测值与 #3646 §五 规格逐项一致；偏离在 §2.2 列出并已修复，未调低任何阈值。
4. `pnpm --filter omnimux-workflow test`（2954/2954）、`typecheck`、`node scripts/build-director.mjs --check`、`node --test scripts/verify-anti-slop.test.mjs`（3/3）、`pnpm verify:stages` 全绿。**已达成**。
5. `git diff` 落在 `scripts/`、`specs/`、`plugins/omnimux-workflow/src/director`、`plugins/omnimux-workflow/tests/` 与 `docs/evidence/director-layout-3682/`。

## 6. 非目标

不重构 runner 与导演台布局；不纳入静态 hex 计数与滑杆实现计数（属静态门禁）；不改原 8 条断言。

## 7. 新用户基线

只影响仓库内验收脚本与导演台面板样式（字号/圆角/边框/时间轴落位）；产品功能路径与新产品安装路径不变。

## 8. 文档影响

无。若后续把阈值写进合同文档或让 CI 常驻跑测量变体，另行开任务。
