# 规格：媒体执行引擎透传 requireListed 参数并支持图片编辑别名与查看器直投 (Issue #2839)

## 1. 业务背景与问题定义
用户在媒体查看器（MediaViewer）中添加评论并提交图片编辑时，前端推导出的操作可能为 `image_edit` 或带参考图的生成。在后端处理中：
1. `LEGACY_OPERATION_MAP` 缺少 `image_edit` 到标准契约操作 `multi_reference` 的映射，导致报 `operation "image_edit" not declared on model`；
2. `execute.js` 调用 `assertGuardSubmit` 时未透传 `input.requireListed` 选项；
3. `direct-http.js` 直投端点未传递 `requireListed: false`，阻断了未上线但在售可用的多模态生成。

## 2. 核心解决方案
1. 在 `legacy-operation-map.js` 中补充 `image_edit: 'multi_reference'` 别名映射；
2. 在 `execute.js` 的 `assertGuardSubmit` 选项中透传 `requireListed: input.requireListed`；
3. 在 `direct-http.js` 的 `executePayload` 中显式设置 `requireListed: false`；
4. 完善 `legacy-operation-map.test.js` 与直接直投单测；
5. 实机验证媒体查看器端到端图片编辑出片。

## 3. 验收标准 (Acceptance Criteria)
- **AC-1：图片编辑别名映射**：`mapLegacyOperation('image_edit')` 正确返回 `'multi_reference'`；
- **AC-2：媒体执行引擎透传 requireListed**：`executeOmnimuxMedia` 调用 `assertGuardSubmit` 时透传 `requireListed: input.requireListed`；
- **AC-3：直投端点支持参考图**：`/omnimux/api/media/generate` 能够成功执行带参考图的图片编辑请求；
- **AC-4：端到端出片**：在媒体查看器中完成添加评论并提交，生成状态流转正常并成功渲染新图。
