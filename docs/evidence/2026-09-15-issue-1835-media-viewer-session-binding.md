# 证据：图像生成页面按会话绑定与隔离（Issue #1835）

## 变更范围
- `plugins/omnimux/src/client/media-viewer/media-viewer-store.js`：
  - `addMedia` 录入素材时注入并维护 `sessionId`，支持基于 `url + sessionId` 维度精准去重；
  - 增加 `getMediaList(targetSessionId)` 与 `getTimelineGroups(targetSessionId)`，提供严格按会话过滤的能力；
  - store 单例采用 `globalThis[Symbol.for('omnimux.mediaViewer.store')]` 保证多模块加载下的全局唯一权威状态。
- `plugins/omnimux/src/client/media-viewer/MediaViewerTab.jsx`：
  - 基于当前活动 `sessionId` 计算当前会话的专属媒体列表 `sessionMediaList`；
  - 大图展示 `activeItem` 仅从当前会话素材查找，并在切换会话时自动联动选中当前会话素材；
  - 右侧多图纵向候选栏仅展示当前会话生成的素材（`sessionMediaList.length > 1` 触发）；
  - 时间线模式仅展示当前会话生成素材的时间线分组；
  - 空状态下优雅呈现「当前会话暂无生成的图片或视频」，绝不跨会话串显。
- `plugins/omnimux/src/client/media-viewer/styles.js`：
  - 增加 `.omx-mv-empty-state` 官方语义 Token 样式支持。
- `plugins/omnimux/src/client/attachments/assistantMessageMediaEnhancer.ts`：
  - 在扫描提取助手消息气泡与点击进入图像生成时，自动注入当前活动会话标识 `currentSessionId()`。
- 测试与规格：
  - 规格文档：`specs/omnimux-media-viewer-session-binding.spec.md`；
  - 单测扩充：`plugins/omnimux/src/client/media-viewer/media-viewer-store.test.js`（新增会话绑定与按会话过滤用例）；
  - 会话隔离集成测试：`plugins/omnimux/src/client/media-viewer/media-viewer-session-binding.e2e.test.js`。

## 验证结果（本隔离工作树）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 媒体 Store 会话绑定单测 | `node --test plugins/omnimux/src/client/media-viewer/media-viewer-store.test.js` | 7/7 通过 |
| 图像生成页面会话隔离端到端集成测试 | `node --test plugins/omnimux/src/client/media-viewer/media-viewer-session-binding.e2e.test.js` | 1/1 通过（多会话并发断言全过） |
| 助手消息媒体提取单测 | `node --test plugins/omnimux/src/client/attachments/assistantMessageMediaEnhancer.test.ts` | 8/8 通过 |
| L0 Diff-aware 静态门禁扫描 | `node scripts/auto-qa-gate.mjs . --diff --base origin/main` | PASS（扫描 6 个文件，SYNTAX/LIFECYCLE/SECURITY/TOKENS/GUARDS 全绿） |
| 客户端编译构建 | `pnpm --filter omnimux run build` | 通过（生成 1995374 字节产物） |
| 独立工作树应用级 Web 验收 | `pnpm verify:app` | 通过（7 项断言，动态端口 49250，CDP 49258，截图保留） |
