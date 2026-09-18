# Spec: 网关 YouTube 全量接口接入中枢工具集与跨插件服务通道

- Issue: #2390
- 风险级别: R2（中枢能力扩展与跨插件接缝增强，向后兼容）
- 依据: 网关已开放 `youtube-video`、`youtube-user`、`youtube-posts`、`youtube-search` 四款社交数据模型

## 1. 目标与用户故事

### 1.1 业务背景
底层网关已支持 YouTube 社交数据服务，但此前中枢仅通过泛化的 `omnimux_social_data` 聚合接口承载，存在以下痛点：
1. **Agent 认知与调用门槛高**：Agent 在面对用户涉及 YouTube 视频分析、频道调研、爆款复刻等指令时，难以准确推断复合入参结构（`platform="youtube"` + `capability`），极易误判为“中枢未提供 YouTube 接口”；
2. **跨插件服务缺失**：中枢未在宿主生命周期中暴露 `socialData` 或 `youtube` 的官方服务接缝（`ctx.provide`），导致下游领域插件（如 `omnimux-video-preview` 视频拆解、`omnimux-inspiration` 灵感分析）无法通过依赖注入稳定调用网关能力。

### 1.2 用户旅程
1. **智能体直接调用**：用户发送 YouTube 链接或要求分析 YouTube 视频/频道时，Agent 可直接调用直观清晰的 `omnimux_youtube_video`、`omnimux_youtube_channel`、`omnimux_youtube_posts`、`omnimux_youtube_search` 工具，秒级获得视频元数据与播放流信息；
2. **多插件跨模块调用**：`omnimux-video-preview` 等业务插件在处理 YouTube 链接时，可直接通过 `ctx.get('youtube')` 或 `ctx.get('socialData')` 获取权威云端解析数据，并自动完成媒体文件缓存与分析。

---

## 2. 详细接口设计

### 2.1 专属 Agent 工具集设计（`plugins/omnimux`）
在中枢 `plugins/omnimux/src/official/mount.js` 中注册 4 款首选专属工具（同时保留原 `omnimux_social_data` 保持完全向后兼容）：

1. **`omnimux_youtube_video`**
   - 描述：`Fetch YouTube video details (title, description, duration, author/channel, thumbnails, metrics, and media stream variants if available) by URL or video ID.`
   - 入参 Schema：
     - `url` (string, 可选): YouTube 视频网页链接（支持常规 watch 链接、youtu.be 短链、Shorts 短视频链接、嵌入链接）
     - `video_id` (string, 可选): YouTube 11 位视频 ID
   - 校验：`url` 与 `video_id` 至少提供其一。
   - 映射：底层映射至 `platform: 'youtube', capability: 'video'`（网关模型 `youtube-video`）。

2. **`omnimux_youtube_channel`**
   - 描述：`Fetch YouTube channel profile and statistics by channel ID, custom URL, or handle URL.`
   - 入参 Schema：
     - `url` (string, 可选): YouTube 频道链接（如 `https://www.youtube.com/channel/UC...` 或 `https://www.youtube.com/@handle`）
     - `channel_id` (string, 可选): 频道 ID 或 handle
   - 校验：`url` 与 `channel_id` 至少提供其一。
   - 映射：底层映射至 `platform: 'youtube', capability: 'user'`（网关模型 `youtube-user`）。

3. **`omnimux_youtube_posts`**
   - 描述：`Fetch public videos/posts list from a YouTube channel by channel ID or channel URL with optional pagination.`
   - 入参 Schema：
     - `url` (string, 可选): 频道主页 URL
     - `channel_id` (string, 可选): 频道 ID 或 handle
   - 映射：底层映射至 `platform: 'youtube', capability: 'posts'`（网关模型 `youtube-posts`）。

4. **`omnimux_youtube_search`**
   - 描述：`Search public YouTube videos by keyword query.`
   - 入参 Schema：
     - `query` (string, 必填): 搜索关键词
   - 映射：底层映射至 `platform: 'youtube', capability: 'search'`（网关模型 `youtube-search`）。

### 2.2 跨插件服务通道（Seam Context Provider）
在 `plugins/omnimux/src/official/mount.js` 中，当中枢完成官方客户端初始化后，向宿主容器注入标准服务：
```javascript
if (typeof ctx.provide === 'function') {
  ctx.provide('socialData', {
    fetch: (args) => fetchSocialData(client, args),
  })
  ctx.provide('youtube', {
    getVideo: (args) => fetchSocialData(client, { platform: 'youtube', capability: 'video', ...(typeof args === 'string' ? { url: args } : args) }),
    getChannel: (args) => fetchSocialData(client, { platform: 'youtube', capability: 'user', ...(typeof args === 'string' ? { url: args } : args) }),
    getPosts: (args) => fetchSocialData(client, { platform: 'youtube', capability: 'posts', ...(typeof args === 'string' ? { url: args } : args) }),
    search: (query) => fetchSocialData(client, { platform: 'youtube', capability: 'search', ...(typeof query === 'string' ? { query } : query) }),
  })
}
```

### 2.3 下游插件联动（`plugins/omnimux-video-preview`）
在 `plugins/omnimux-video-preview/src/breakdown/socialMetadata.js` 中升级 `resolveSocialToolFromContext`：
优先从 `ctx.get('youtube')` 或 `ctx.get('socialData')` 调取服务，若未提供则降级查找 `ctx.tools.get('omnimux_youtube_video')` 或 `ctx.tools.get('omnimux_social_data')`，确保在任何插件运行环境下均可稳定获取 YouTube 视频详情与元数据。

---

## 3. 验收标准 (Acceptance Criteria)

1. **工具注册与 Schema 正确性**：
   - 中枢注册列表中包含 `omnimux_youtube_video`、`omnimux_youtube_channel`、`omnimux_youtube_posts`、`omnimux_youtube_search`；
   - 工具 Schema 符合 OpenAPI规范，参数必填项与描述清晰；
   - 门控系统（Gate）与能力白名单联动正常，当官方中枢挂载且社交数据未被全局关闭时，上述工具处于激活状态。
2. **跨插件服务注入**：
   - 宿主上下文中通过 `ctx.get('socialData')` 可成功获取社交数据查询服务；
   - 宿主上下文中通过 `ctx.get('youtube')` 可成功获取包含 4 个方法的 YouTube 专属服务；
   - 业务插件（`omnimux-video-preview`）调用 YouTube 视频解析时能命中中枢服务。
3. **输入兼容性与鲁棒性**：
   - 传入完整的 YouTube 视频链接（例如 `https://www.youtube.com/watch?v=dQw4w9WgXcQ` 或短链）时，能自动提取视频 ID 并成功发包；
   - 缺少必要参数时，工具优雅抛出结构化请求错误而非未捕获异常。
4. **质量与测试门禁**：
   - 新增针对 4 款 YouTube 工具的单元测试与跨插件 Seam 注入测试，测试 100% 通过；
   - 代码通过格式化与本地代码审查。
