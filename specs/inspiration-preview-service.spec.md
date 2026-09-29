# 灵感社区全局预览服务与顶层弹窗契约规格 (Issue #2799)

## 一、问题背景与目标
在新会话首页爆款趋势卡片交互升级中，`TrendingDetailModal` 采用轻量懒加载服务桥接模式，依赖宿主或 `omnimux-inspiration` 插件注入全局 `window.__omnimuxInspirationPreview`。
但在当前主干中，`omnimux-inspiration` 尚未暴露并注册此服务，导致详情点击后无法打开弹窗。

本规格目标：
1. 在 `omnimux-inspiration` 中实现单一真源的 `preview-service.jsx` 与 `PreviewModalLayer.jsx`。
2. 在 `omnimux-inspiration` 客户端入口 `apply(ctx)` 中通过 `ctx.effect(() => registerPreviewService(t))` 注册全局服务。
3. 弹窗采用 `<dialog>` 顶层层级（Top Layer），支持点击蒙层/ESC 关闭，支持 Tab 键 Focus Trap 焦点循环，彻底杜绝输入框悬空与层级遮挡。
4. 全量回归测试通过，并通过 PR 合入 main 后物化生效。

## 二、验收用例 (Seams)
1. `window.__omnimuxInspirationPreview` 存在且包含 `open` 与 `dispose` 方法。
2. 触发 `open({ row, onClose, onReplicate })` 能在 `document.body` 上创建 `<dialog>` 顶层弹窗，且 ESC 键或关闭按钮能正常销毁并回调 `onClose`。
3. 单元测试与 E2E 测试全部绿灯。
