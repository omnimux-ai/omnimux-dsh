# 规格：AutoDL 声音克隆产物 content_url 提取修复 (Issue #3078)

## 1. 目标（Objective）
修复 `indextts-2` 声音克隆在 AutoDL 通道执行完成后，网关 `/v1/tasks/{id}/artifacts` 接口返回的产物项中音频直链键名为 `content_url`，而现有中枢 `pickMediaUrl` 仅查找 `url / download_url / downloadUrl / file_url / fileUrl`，导致返回 `undefined` 并抛出 `task ... completed without a audio url` 错误的问题。

## 2. 变更范围（Scope）
1. `plugins/omnimux/src/media/vendors/omnimux.js`:
   - 在 `pickMediaUrl` 中：
     - 在 `direct` 候选列表中增加 `row.content_url / row.contentUrl` 以及 `data.content_url / data.contentUrl` / `firstData.content_url / firstData.contentUrl`。
     - 在 `outputs` 数组项中支持 `item.content_url / item.contentUrl`。
     - 在 `artifacts` 数组项中提取链接时，优先匹配 `item.content_url ?? item.contentUrl ?? item.url ?? ...`。
2. `plugins/omnimux/src/media/protocols/openai-media.js`:
   - 在 `pollOpenAiMediaTask` 中拉取 AutoDL `artifacts` 时，支持 3 次渐进重试与延迟等待，防止服务端刚报成功但产物尚未就绪的暂态间隙。
3. 测试用例：
   - 更新 `plugins/omnimux/src/media/voice-clone.test.js`，包含真实的 `artifacts` 产物结构（带 `content_url`），验证能够正确解析并完成音频文件下载。

## 3. 验收标准（Acceptance Criteria）
1. 单元测试验证：针对包含 `{ key: "audio", type: "audio", mime_type: "audio/wav", content_url: "https://..." }` 的 artifacts，`pickMediaUrl` 能准确提取该 URL。
2. 真实回归测试：`pnpm --filter omnimux test` 核心单测全部通过。
3. 真实物化与 Dev App 验证：物化至 `~/.omnimux-dev`，在真实 Dev App 中端到端跑通 indextts-2 声音克隆生成。
