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
