# 规格：添加评论提交后输入框自动附加素材卡槽并支持直接图片编辑生成 (Issue #2827)

## 1. 业务背景与问题定义
当前在媒体查看器中，文生图已全链路调通。用户在单图大画布上进行局部评论批注时，期望达成如下业务链路：
1. **添加评论与原地打点**：用户点击顶部「+ 添加评论」，在画面任意位置点击弹出 Popover，输入修改要求并提交；
2. **输入框自适应附加素材卡槽**：评论提交后，输入框（MediaViewerComposer）立即自适应附加当前被标注图片的素材卡槽，角标显示「标记 N」，并保留打点序号与评论内容至输入框；
3. **直接点击直连生成**：用户点击发送按钮（或按 Enter），自动组装当前模特参考图、结构化区域重绘坐标与提示词，调用 `/omnimux/api/media/generate` 发起图片编辑生成请求；
4. **生成结果安全就绪渲染**：后端生成的图片通过安全的同源本地媒体服务路由提供给前端，避免在 Electron 渲染层触发 `file://` 协议沙箱拦截，成片在查看器中丝滑渲染上屏。

## 2. 核心根因分析
1. **模型操作契约未透传**：`DEFAULT_FALLBACK_CATALOG` 及模型目录 API 投产行未携带模型 operations 结构，导致 `operationsOf(model, 'image')` 返回空数组，触发 `slotPlan` 与 `MediaViewerComposer` 的 early-return，卡槽和提示词同步逻辑被拦截未执行；
2. **素材地址协议拦截**：本地生成的文件路径如果直接以 `file://` 返回，既无法被 Electron 渲染器安全加载（Chromium 沙箱拦截），又被 `isAllowedReferenceUrl` 排除在合法参考图白名单外；
3. **本地媒体路由与中枢上传缺位**：`/omnimux-viewer/asset` 与 `/omnimux/api/media/file` 未在 `gateway-upload.js` 的 `parseMediaSource` 与 `resolveMediaDescriptor` 中注册，导致本地图片编辑请求时无法正确解析并上传参考图。

## 3. 验收标准 (Acceptance Criteria)
- **AC-1：操作契约与卡槽推导自适应**
  - `media-slot.js` 中 `operationsOf(model, 'image')` 在模型缺少显式 operations 时提供标准图片操作兜底（`text_to_image` 与带参考图的 `image_edit` / `multi_reference`）；
  - `slotPlan(model, 'image')` 稳定返回参考图槽位契约。
- **AC-2：评论提交后卡槽与提示词即时就绪**
  - 画布完成评论提交（`commitAnnotation`）后，`MediaViewerComposer` 响应并在输入框上方呈现当前图片的素材卡槽；
  - 素材卡槽右上角醒目标注「标记 1」（随打点数量递增）；
  - 输入框自动带入「标记 1：<评论内容>」结构化提示词。
- **AC-3：本地媒体静态服务与安全解析**
  - `direct-http.js` 新增安全受控的本地生成媒体文件服务路由 `/omnimux/api/media/file`；
  - `gateway-upload.js` 兼容解析 `/omnimux/api/media/file` 与 `/omnimux-viewer/asset`，准确将本地参考素材提取为文件描述符并进行网关中继。
- **AC-4：图片编辑端到端直连生成**
  - 点击输入框发送按钮，以 `image_edit` 操作直连 `/omnimux/api/media/generate`；
  - 任务正确带上参考图与区域重绘坐标，生成完成后前端大橱窗自动就地 Morph 展示编辑后的成片；
  - CDP 端到端测试 100% 验收通过。
