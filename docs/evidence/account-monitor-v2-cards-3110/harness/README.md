# 验收装置（#3110 账号监控 v2.1 卡片与瀑布流）

把 `RivalMasonry` + `RivalPostCard` + `rival-styles` + `rival-tokens` 连同规格 §9.4 的 12 张演示卡打进一个静态页，供真实浏览器验收五形态、瀑布流最短列放置、默认态极简与已处理后退（亮/暗双主题）。

## 前置

- 本仓库的一次 `pnpm install`（`react` / `react-dom` / `esbuild` 自本目录向上经 node 解析；任何检出——主检出或工作树——均可）。
- `dsh-ui-kit` 用仓库自带 `plugins/omnimux-inspiration/src/client/test-fixtures/ui-kit-shim.mjs` 替身（与 `rival-cards.e2e.test.js` 同一替换）：生产 kit 的 `@deepseek-ai/dsh-client-ui-primitives` 依赖含 CSS Modules，esbuild 无法跟随打包；替身只影响按钮的库级样式，不影响卡片布局与默认态（本页验证对象）。

## 一条命令重建

```sh
node docs/evidence/account-monitor-v2-cards-3110/harness/build-demo.mjs
```

产物：`harness/demo.html` + `harness/demo-bundle.js`。

## 预览

```sh
npx serve docs/evidence/account-monitor-v2-cards-3110/harness
# 打开 http://localhost:3000/demo.html?theme=dark （或 ?theme=light）
```

URL 参数：`theme=dark|light`、`width=<px>`（固定容器宽时绕过 ResizeObserver 测宽）。

## 备注

- 已提交的 `01-*.png` … `06-*.png` 为本装置在整改前版本上的验收截图，仍有效，不重拍。
- `covers/c1..c12.svg` 是占位封面，模拟真实媒体加载（不触发网络）。
- `?edge=1` 追加边界卡（hashtag / 超宽 URL / 空 velocity / 连字符长词 e4 /
  CJK+ASCII 混排 e5 / NBSP e6 / 同列尾随 e7）；点任意卡打开详情弹窗。
- `measure-placement.mjs`（headless Chrome + CDP）：逐卡实测 vs
  `rivalCardHeightPx` 估算、实测高度重放最短列 mismatch、**同列相邻卡
  重叠量**（`adjacentOverlaps` / `maxAdjacentOverlap`，R5 新增——
  估算自洽但卡面物理重叠就是靠它发现的）。页面暴露
  `window.__RIVAL_QA__`（估算函数 + 渲染中的卡片描述符）供脚本调用。
  用法：`python3 -m http.server <port> --directory <harness>` 后
  `node measure-placement.mjs <url> <out.json> [逗号分隔的id白名单]`。
  报告字段 `only` 原样记录白名单（null = 全量测量）；证据文件一律
  用全量生成（白名单只用于诊断，不写进报告）。
- `?qa41=1`（与 `?edge=1` 叠加）再追加 QA 第四轮独立夹具的 22 张断行
  压力卡（w1–w12 / u1–u4 / v1–v6），41 卡夹具一条命令可复现：
  `node measure-placement.mjs "http://127.0.0.1:<port>/demo.html?edge=1&qa41=1&theme=dark&width=1164" <out.json>`。
- `build-demo.mjs --pre`：只重建 `demo-pre.html` 外壳（引用已提交的
  `demo-bundle-pre.js` 整改前快照），使 `r5-placement-measure-pre.json`
  一条命令从 HEAD 可复现。
- `codepoint-probe.mjs`（R6+R7）：逐码位对比 Chrome 实测行数 vs
  `rivalWrapLines`（直接 import 实现，无复刻），覆盖 CSS 空白、UAX#14
  BA/ZW/BK、不换行集合、\v/\f、U+3000、U+2011，以及 R7 补的 EX/HH/B2
  断后类共 41 个码位；退出码 0 = 全等（当前 41/41 对齐）。
  用法：`node codepoint-probe.mjs [out.json]`。
- **字体前提（R7-④）**：`RIVAL_GLYPH_WIDTH_FACTOR` 按 SF Pro /
  -apple-system 14px 标定（`codepoint-probe.mjs` 的 canvas 实测），
  与 `.omnimux-rival-card-text/.omnimux-rival-card-title` 显式声明的
  font-family 和本 README `build-demo.mjs --font-family` 同一栈。
  宿主换字体族时必须重跑 probe 重标定——generic sans 偏差 0.87px/字、
  Courier 5.1px/字足以翻转行数。
