# Spec: 用户消息卡片上方附件展示与收敛消费

## 1. 背景与目标
在目前的 OmniMux 对话流中，用户挂载了图片、视频、音频或其他文件并发送后，用户消息气泡仅呈现纯文本（如“解释下你看到的信息”），气泡上方未直观呈现本次发送所附带的附件内容，导致用户无法感知该条消息具体关联了哪些素材。
本需求要求：
1. 在用户消息卡片左上角上方，依次水平排列展示发送该消息时附带的全部附件（无论图片/视频/音频/任意文件）；
2. 图片/视频呈现 44×44px 高清圆角缩略图卡片，视频带播放图标；
3. 音频呈现精致紧凑的音频胶囊；
4. 文档/表格/代码/其他文件呈现带扩展名徽章与文件名截断的紧凑胶囊卡片；
5. 统一收敛来自商品库、资产库、画布与灵感库的附件消费，发送时精准绑定，发送后常驻展示。

## 2. 详细设计

### 2.1 存储与关联契约 (SubmittedAttachmentStore)
在客户端维护会话维度的已发送附件历史记录：
- `recordSubmittedAttachments(sessionId, promptText, attachments)`：在发送动作触发（`arm()`）时记录；
- `getAttachmentsForBubble(sessionId, promptText)`：供渲染增强器根据文本与时序匹配该消息关联的附件列表。

### 2.2 增强渲染器 (User Message Attachments Enhancer)
- 监听并扫描会话流中的 `USER_BUBBLE_SELECTOR`；
- 匹配成功且未挂载时，在 `bubbleEl` 节点前方插入 `.omx-user-bubble-attachments` 导轨；
- 导轨对齐在消息卡片左上角上方（`display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;`）；
- 具备幂等性（`data-omx-user-attachments="true"`），防止重渲染重复插入。

## 3. 验收标准
1. 发送带附件（图片/视频/音频/文件）的消息后，在用户消息气泡左上角上方清晰可见对应的附件卡片；
2. 图片支持缩略图与点击全屏预览；
3. 多附件时自适应换行排列，整齐贴合消息卡片；
4. 单元测试与 E2E 完整覆盖。
