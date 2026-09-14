# 规格说明：浏览器插件悬浮图标对齐推特官方浮标规格与纵向对齐停靠

## 1. 业务目标与背景
用户反馈当前浏览器插件的悬浮操作图标（FAB）在推特（X.com）页面上与推特原生浮标（Grok 标、私信聊天标）风格与规格不一致，内部嵌套浅紫色方形底垫图片导致视觉厚重、色块突兀。
本次改动目标：
1. 外壳样式与材质 100% 像素级对标推特官方浮标规格（55px × 55px，16px 平滑圆角，半透明深色毛玻璃，双层白色柔和发光光晕，1px 微光边框）。
2. 图标内部移除旧版浅紫色方形底板图片，替换为 32px 纯净单色矢量 SVG 图标（推特浅白灰 `#e7e9ea`），两只胶囊眼睛通过 `evenodd` 镂空透出底色。
3. 默认位置在推特等页面右下角位于 Grok 标上方，保持严格的 12px 垂直间距，水平与推特浮标严格对齐（right: 20px）。

## 2. 关键验收标准与指标

### 2.1 容器几何与材质
- **尺寸**：宽度 55px，高度 55px。
- **圆角**：16px（平滑倒角）。
- **背景**：`rgba(0, 0, 0, 0.65)` 搭配 `backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);`。
- **边框**：`1px solid rgb(75, 78, 82)`。
- **发光光晕**：`rgba(255, 255, 255, 0.2) 0px 0px 15px 0px, rgba(255, 255, 255, 0.15) 0px 0px 3px 1px`。
- **悬停态**：缩放至 1.04，微光平滑提升至 `0 0 20px rgba(255, 255, 255, 0.35), 0 0 4px 1px rgba(255, 255, 255, 0.25)`，边框增强为 `rgba(255, 255, 255, 0.45)`。

### 2.2 核心图标矢量化
- 移除 `<img src="icon48.png">`。
- 引入官方 OmniMux 幽灵纯矢量 SVG：
  - 视口：`viewBox="0 0 24 24"`
  - 尺寸：32px × 32px
  - 颜色：`fill: currentColor`，父级默认 `color: #e7e9ea`
  - 填充规则：`fill-rule="evenodd"`，胶囊眼自然镂空。

### 2.3 默认停靠位置与间距对齐
- 水平对齐：距离右边缘 `20px`（`right: 20px`，等效于 `left = window.innerWidth - 75`）。
- 垂直对齐与间距：
  - 若检测到推特页面存在 `[data-testid="GrokDrawerHeader"]`，以其顶部为基准向上偏移 12px（`grokRect.top - 12 - 55`）；
  - 若未检测到 Grok 但处于未拖拽状态，默认距离底部 `146px`（推特三标等距成列规格：底部聊天标 bottom 12px，中间 Grok 标 bottom 79px，OmniMux 标 bottom 146px，等间距 12px）。
- 仍支持自由拖拽与持久化存储。

## 3. 影响范围
- `plugins/omnimux-browser/extension/src/content/fab-companion.ts`
- 相关的单元测试与端到端验证。
