# 灵感库视频直链识别放行与短链导入解析修复规格 (Issue #2237)

## 1. 概述与背景
用户在灵感库导入社媒短链接（如 `https://www.tiktok.com/t/ZP83cP5Re`）时，虽然解析层成功获取到了有效的高清视频直链（位于 TikTok 官方 CDN，例如 `https://v19.tiktokcdn-us.com/.../?...&mime_type=video_mp4`），但入库结果仍被错误标记为 `degraded`（降级为 `link` 类型），导致：
- 预览弹窗中视频无法播放；
- 内容解构侧栏显示“尚未生成内容解构 / 该链接未取得视频直链，暂不支持拆解”。

### 根因说明
1. `plugins/omnimux-inspiration/src/http-handlers.js` 中的 `VIDEO_CDN_HOST_RE` 仅白名单了 `googlevideo.com`，遗漏了 TikTok 官方 CDN 集群（如 `*.tiktokcdn.com`、`*.tiktokcdn-*.com`、`*.byteoversea.com`、`*.ibytedtos.com`、`*.musical.ly` 等）；
2. TikTok 直链 URL 路径以哈希结尾无 `.mp4` 扩展名，实际媒体类型由查询参数 `mime_type=video_mp4` 标明；
3. `mediaLikeUrl` 函数在没有命中后缀且没有匹配白名单的情况下，将该直链判定为非媒体 URL 并清空，导致流程退化为纯文本链接导入。

## 2. 核心验收准则 (Acceptance Criteria)

| 编号 | 场景 | 输入/操作 | 预期结果 |
| --- | --- | --- | --- |
| 1 | TikTok 官方 CDN 视频流识别 | 传入无 `.mp4` 后缀但属于 TikTok 官方 CDN 的公网直链 | `mediaLikeUrl` 正确返回该 URL，不被清空过滤 |
| 2 | MIME 参数视频流识别 | 传入任意合法公网直链但带 `mime_type=video_mp4` 或 `video/webm` 查询参数 | `mediaLikeUrl` 正确返回该 URL |
| 3 | 非媒体链接与恶意地址拦截不受损 | 传入包含 `.m3u8`、`.html`、非媒体主机或内网 IP 的 URL | 保持被严格拦截拒收，返回空字符串或抛出异常 |
| 4 | 短链接导入完整链路恢复 | 导入包含有效视频直链的 TikTok 数据包 | 成功识别为 `type: 'video'`，`media_urls` 包含本地下载视频路径，`import_status` 为 `ready` |
| 5 | 内容解构按钮正常可用 | 进入视频素材预览弹窗 | `canAnalyzeInspiration` 返回 `true`，内容解构按钮与操作恢复可用 |

## 3. 技术设计与修改范围
- 目标文件：`plugins/omnimux-inspiration/src/http-handlers.js`
- 扩充 `VIDEO_CDN_HOST_RE`，覆盖 `googlevideo.com`、`tiktokcdn.com`、`tiktokcdn-*.com`、`byteoversea.com`、`ibytedtos.com`、`musical.ly` 等；
- 在 `mediaLikeUrl` 补充对 `parsed.searchParams.get('mime_type')`（支持 `video/mp4`、`video_mp4` 等）的合法性识别；
- 编写与补充单测：`plugins/omnimux-inspiration/src/social-import.test.js`。
