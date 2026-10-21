# 修复 X 视频直链取数被扩展 CSP 拦截（Issue #3592）

## 用户旅程与目标

用户在 X 帖子页悬停视频，胶囊第二动作「下载素材」应当把真实 mp4 下载到浏览器下载目录。当前在 `x.com/0xAI42exe/status/2112882593678991837` 上只显示「该视频仅在页面内可播，无法直接下载」，下载不可用。目标是让后台的 syndication 取数恢复，下载动作对真实 X 帖子重新可用。

## 范围

- `plugins/omnimux-browser/extension/manifest.json` 与 `manifest.firefox.json` 的 `content_security_policy.extension_pages.connect-src` 增加 `https://cdn.syndication.twimg.com`。
- 只放行取 JSON 的这一个 host。`video.twimg.com` 由 `chrome.downloads` 在浏览器层下载，不经扩展 `fetch`，不放行、也不应依赖 CSP。
- `scripts/auto-qa-scan.mjs` 的扩展联网出口白名单（`EXTENSION_CONNECT_SRC_ALLOWED_HOSTS`，唯一真源）加入同一 host 并注明用途；同步补 `scripts/auto-qa-scan.test.mjs` 的放行用例（既有外部模型主机仍阻断）。
- 增加回归测试：CSP 必须包含 syndication host；受控 runner 用真实 X 形态页面（真实 poster + 真实 tweet id）点击下载，必须真实落盘 `video.twimg.com/...mp4`。
- 不改 `media-download`/`video-source`/`download-plan` 的解析逻辑（离线用真实数据验证已正确）。

## 验收用例

| ID | 场景 | 期望 |
| --- | --- | --- |
| S1 | 扩展页面/后台 fetch `cdn.syndication.twimg.com/tweet-result?id=2112882593678991837&token=...` | HTTP 200，返回 JSON |
| S2 | 受控 runner 打开真实 X 形态页面（真实 poster `amplify_video_thumb/2112701022372089856/...` + `/0xAI42exe/status/2112882593678991837` 链接），悬停视频点「下载」 | `chrome.downloads` 落盘 `video.twimg.com/amplify_video/.../vid/avc1/720x1280/*.mp4`，`ftypisom`、ffprobe 可解码 |
| S3 | 白名单外的 host 仍被 CSP 拦截 | 扩展页面 fetch `https://example.com` 仍失败（不扩大放行面） |
| S4 | 单测与构建 | `npx vitest run`、`node scripts/build.mjs` 通过；CSP 断言存在 |

## 假设

- MV3 的 `extension_pages` CSP 同时约束扩展页面与 service worker 的 `fetch`，这就是后台请求 syndication 失败的原因；扩展页面实测白名单内 200、白名单外 `Failed to fetch` 支持这一点。
- syndication 端点不要求页面 cookie，放行后后台 `credentials: 'omit'` 即可读取；`chrome.downloads` 下载 `video.twimg.com` 不受 CSP 影响。

## 证伪方式

- 若放行后扩展页面/后台 fetch syndication 仍失败，或真实 X 形态页面下载得到的仍是 poster/播放列表，则假设不成立：用受控 runner 的 CSP 探测结果、下载条目的 `finalUrl` 与文件魔数对照重查。
- 若 `example.com` 在放行后也变为可 fetch，说明改动扩大了 CSP 允许面，需回滚并改用其它通道。

## 新用户基线

新装扩展自带该 CSP 放行项，无需宿主连接、无需用户改配置；端点不可达时仍回退到「无法直接下载」的明确提示，不虚构成功。

## 非目标

- 不放行除 `cdn.syndication.twimg.com` 外的任意 host（包括 `video.twimg.com`）。
- 不改解析/下载逻辑，不新增站点适配，不改宿主。

## 回滚

单 PR：revert 恢复 CSP 原值并移除回归用例即可，无数据迁移。

## 文档影响

- 不改产品文案与契约；本修复是 #3581 的实现缺陷。PR 描述记录根因与实测证据。
