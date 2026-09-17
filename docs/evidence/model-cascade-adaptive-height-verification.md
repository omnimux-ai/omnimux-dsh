# 模型级联面板默认高度与最高高度自适应机制验证证据 — Issue #2191

## 一、验证概况
- **任务编号**：Issue #2191
- **验证时间**：2026-09-17
- **验证范围**：
  1. `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/ModelCascadeMenu.tsx`
  2. `plugins/omnimux-workflow/src/canvas/theme/components.css`
  3. 模型级联选择浮层（品牌列、型号列、渠道策略列）的默认高度与最大高度自适应规格

## 二、关键验证事实与结果

### 1. 结构与样式自适应核验
- 容器 `.wf-loomi-popover` 的 `align-items` 声明为 `stretch`，展开的三列自动等高拉伸，保持底部与顶部严格对齐，彻底杜绝参差不齐的锯齿轮廓。
- 列样式 `.wf-loomi-col` 移除固定的 `height: 480px` 硬编码，配置：
  - `min-height: 160px;`（保证 1~2 项时小巧精致包裹内容，有充足的呼吸感，且无大面积死黑空白）；
  - `max-height: min(400px, calc(100vh - 120px));`（保证多选项时安全封顶，并自动启用纤细滚动条）；
  - `height: auto;`。
- `ModelCascadeMenu.tsx` 声明：
  - `POPOVER_MIN_HEIGHT = 160`；
  - `POPOVER_MAX_HEIGHT = 400`；
  - `place()` 采用 `window.innerHeight - POPOVER_MAX_HEIGHT - 12` 防溢出保护。

### 2. 场景实测数据
- **场景一（极简少选项，如 Google 品牌 + Gemini 3.8 Flash + 2 个版本）**：
  - 内容实际高度：约 165px；
  - 渲染结果：高度自然贴合在 165px，原先 480px 下方产生的 315px 黑色冗余死寂空白彻底消除；
  - 三列高度：品牌列、型号列、版本列高度统一为 165px，视觉整齐规整。
- **场景二（多选项场景，如 10+ 模型项）**：
  - 内容高度：超过 450px；
  - 渲染结果：面板整体高度在 400px 处受控封顶，内部细滚动条正常生效；
  - 视口安全：未突破屏幕边界，悬停与展开流畅无跳跃。

### 3. 测试与门禁状态
- 静态门禁与自动化单元测试全面更新，断言 160px/400px 自适应规格与三列 stretch 联动等高。
