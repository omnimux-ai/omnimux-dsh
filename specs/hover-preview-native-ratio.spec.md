# 悬停放大预览按原素材比例

## 目标
创作画布「资产」侧边栏悬停放大预览按原素材真实宽高比展示，只限制最大宽/高 360px；完整呈现、不裁切。

## 用户旅程
1. 打开创作画布并展开右侧「资产」侧边栏。
2. 鼠标悬停任一带预览图的素材条目。
3. 侧边栏外侧左侧出现放大预览卡。
4. 横图更宽更扁、竖图更高更窄、方图接近正方形；画面完整可见，无裁切。
5. 视频条目同样按首帧真实比例展示；时长角标仍覆盖在画面上。
6. 无预览素材仍显示占位图标。

## 成功标准
1. 预览卡不再固定 260×140。
2. 最大边不超过 360px，另一边按原比例缩放。
3. 媒体完整呈现，不裁切。
4. 卡片仍锚在侧边栏外侧左侧，并做视口边界保护。
5. 无预览时有占位尺寸兜底，不塌缩。
6. 源码契约覆盖「原比例 + 最大 360 + 不裁切」。

## 非目标
- 不改列表/网格缩略图比例与裁切策略。
- 不改资产中心瀑布流。
- 演示确认前不合入主干。

## 命令
- 插件检查：`pnpm --filter omnimux-workflow test`
- 影响面：`node scripts/impact-matrix.mjs --git-diff --base origin/main`
- 浏览器证据：工作树内真实路径截图（横/竖至少各一张）

## 项目结构
- 组件：`plugins/omnimux-workflow/src/canvas/editor/components/assets/views/HoverInspector.tsx`
- 样式：`plugins/omnimux-workflow/src/canvas/theme/components.css`
- 媒体渲染：`plugins/omnimux-workflow/src/canvas/editor/components/assets/MediaThumb.tsx`
- 契约文件：同目录 `hoverPreviewNativeRatio.e2e.test.mjs`，并更新既有固定尺寸断言

## 边界
- 总是做：先规格后代码；同步更新契约；演示截图后人确认再合入。
- 先问：改最大尺寸阈值、改列表/网格缩略图策略。
- 绝不做：提交密钥；在主检出直接改业务代码；演示前擅自合入。

## 假设
1. 最大宽/高阈值取用户选定的 360px。
2. 原尺寸通过图片/视频自然宽高读取；读取前用方形兜底。
3. `resolution` 字段如存在可作辅助，但不能依赖它一定可用。
