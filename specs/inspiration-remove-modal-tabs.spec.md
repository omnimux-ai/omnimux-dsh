# 灵感社区素材预览弹窗移除桌面端多余切换标签栏规格说明

## 1. 业务背景与用户诉求
在灵感社区素材预览弹窗中，桌面端大屏下三栏（左侧视频播放器、中间脚本文案、右侧内容解构）已全部横向展开并排展示。
原有窄屏折叠切换标签（`<Tabs className="omnimux-inspiration-modal-mobile-tabs" ...>`）因选择器优先级问题在桌面端被意外渲染，造成重复操作与视觉噪音。
用户明确要求移除该红色圈选的多余标签栏。

## 2. 核心改动范围
1. **桌面端样式收敛与强制隐藏**：
   - 在 `plugins/omnimux-inspiration/src/client/styles.js` 中，增强 `.omnimux-inspiration-modal-mobile-tabs` 的隐藏规则，通过容器级复合选择器 `.omnimux-inspiration-modal-container .omnimux-inspiration-modal-mobile-tabs` 声明 `display: none !important;`，杜绝任何外部组件库样式覆盖导致的意外展示；
   - 响应式媒体查询 `@media (max-width: 860px)` 保持移动端/窄屏下的正常显示 `display: flex !important;`，保障极端窄屏下的可用性与现有端到端回归测试断言。
2. **结构与组件规范检查**：
   - 检查 `plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx` 结构，确保属性传递与类名绑定符合既有规范；
   - 确保桌面端（宽屏 ≥861px）完全不渲染/不可见该切换栏，恢复极简沉浸式全览体验。

## 3. 验收标准与测试
- 桌面端视口（宽度 1440px / 2426px）下，弹窗容器中不存在可见的 `.omnimux-inspiration-modal-mobile-tabs`；
- 移动端视口（宽度 ≤860px，如 390px）下，切换标签正常生效；
- `pnpm --filter omnimux-inspiration test` 单元测试与快照测试 100% 通过；
- UI 规范门禁 0 违规，代码符合极简无裸色规范。
