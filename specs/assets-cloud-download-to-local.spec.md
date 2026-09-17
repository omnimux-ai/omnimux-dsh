# 规格说明书：公共素材添加到会话后支持下载图片与音频并自动转存本地资产库 (Issue #2230)

## 1. 目标（Objective）
解决用户在资产库「公共」分类下将素材卡片点击「加入会话」后，对 AI 助手输入「帮我下载图片和音频到本地」时，由于会话元数据不全、助手缺少下载转存工具、底层保存遗漏封面且缺少云端直链兜底而导致执行报错超时、未转存到本地资产库的问题。
实现端到端闭环：
- 会话端：点击加入会话时，将云端高清封面、音频/视频直链、云端资产 ID 与来源完整透传给会话通道与模型上下文；
- 助手工具端：注册 `assets_cloud_save` 工具，使助手可直接通过公共资产 ID 将素材下载到本地并自动入库本地资产库；
- 后台转存端：`saveToLocal` 逻辑支持同时下载封面（图片）与主媒体（音频/视频），且在本地相对路径不存在时自动回退至 `meta.source_cover_url` 与 `meta.source_media_url`；
- 界面联动端：转存成功后通过 `assets:changed` 事件实时通知前端，资产库「本地」Tab 秒级刷出带完整封面与音频的新资产。

## 2. 影响文件与项目结构（Project Structure）
- 会话透传层：
  - `plugins/omnimux-assets/src/client/add-to-chat.js`：适配云端资产无 `files` 字段的结构，提取封面与主媒体直链注入 `metadata`；
- 助手工具层：
  - `plugins/omnimux-assets/src/index.js`：注册 `assets_cloud_save` Agent Tool，系统提示词更新公共资产操作指引；
- 底层转存与路由层：
  - `plugins/omnimux-assets/src/cloud-catalog.js`：`saveToLocal` 补齐双资源（图片+音频/视频）下载与云端直链 fallback；
- 测试验证层：
  - `plugins/omnimux-assets/src/client/add-to-chat.test.js`：增加云端资产 payload 结构与直链注入测试；
  - `plugins/omnimux-assets/src/tools.test.js`：增加 `assets_cloud_save` 工具调用与入库验证测试；
  - `plugins/omnimux-assets/src/cloud-catalog.test.js`：增加 `saveToLocal` 双资源与云端直链 fallback 测试。

## 3. 验收标准与成功度量（Success Criteria）
1. **云端资产透传完整度**：公共资产（如 `Angel Influencer`）通过 `addAssetToConversation` 加入会话时，`previewUrl` 不为空（指向封面），`metadata` 包含 `is_cloud: true`、`cover_url`、`media_url`、`source_cover_url`、`source_media_url`；
2. **助手工具可用性**：助手工具箱包含 `assets_cloud_save`，入参为 `{ id: string, name?: string, type?: string }`，返回 `{ ok: true, asset: ... }`，并触发 `omnimux:assets:changed` 事件；
3. **双媒体完整落盘**：转存后生成的本地资产对象 `files` 包含图片封面与音频文件（文件数量 >= 2，且文件真实存在于本地 managed vault 下）；
4. **云端直链兜底有效**：当 `sourceRoot` 为空或本地 `file:` 路径不存在时，自动通过远程直链下载成功，绝不产生 `files: []` 空壳资产；
5. **测试通过率**：全量单元测试与 E2E 校验 100% 通过，无回归。

## 4. 边界与质量底线（Boundaries）
- **总是做**：遵循极简设计与已有工具契约，使用工作区原子写入与缓存清理；严格验证下载产物字节数与格式；
- **绝不做**：修改非任务范围的代码；私自删除用户原始文件；引入未经审查的外部重型依赖。
