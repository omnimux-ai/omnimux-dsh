# X 首页时间线视频识别（Issue #3607）

## 用户旅程与目标

用户在 `https://x.com/home` 的时间线上悬停一条视频卡片，胶囊应当像详情页一样把**真实 mp4**下载下来（`x-<tweetId>-<宽x高>.mp4`），而不是把海报 `<img>` 当图片下载成 jpg。详情页行为不得回归；真正的图片推文仍按图片下载。

## 根因（ego 真机取证）

时间线视频卡同时渲染两个媒体节点，且盒模型几乎重合：

- 海报 `<img src="https://pbs.twimg.com/amplify_video_thumb/<mediaId>/img/<hash>.jpg">`
- `<video src="blob:..." poster="<同一海报 URL>">`（实测 img `573,296,516,290` vs video `571,296,519,291`）

现有实现的三条路径都会先拿到图片：

1. 播放按钮命中链为 `path → circle → svg → button → img → div`，`findMediaElement()` 一旦命中 `img` 就立即返回，不判断它是不是视频海报；
2. 向上走时 `siblingMediaOf()` 按 `querySelectorAll('img, video')` 的 DOM 顺序取第一个包含指针的媒体，海报 `<img>` 常排在 `<video>` 前；
3. `mediaKindOf()` 把所有 `<img>` 都判成 `image`，于是 payload `type='image'`，下载走图片分支。

详情页命中点落在透明播放层（div），sibling 探测先遇到 `<video>`，且没有"img 直接返回"路径，所以一直正确。

## 范围

- `payload.ts`：
  - 新增 `isXVideoPosterSource(url)`（`amplify_video_thumb` / `ext_tw_video_thumb` 路径，只认这两种视频海报，不碰 `pbs.twimg.com/media/*` 真图片）。
  - `mediaKindOf()`：视频海报 `<img>` 返回 `video`。
  - `resolveMediaSource()`：`kind='video'` 且元素是 `<img>` 时按 poster rung 解析（`kind:'poster'`），不让 jpg 变成 progressive mp4 候选。
  - `siblingMediaOf()`：同一容器内优先返回包含指针的 `<video>`，其次才回退其它媒体；无指针时视频优先于海报。
  - `findMediaElement()` / `queryMediaElement()`：命中视频海报 `<img>` 时先在同 `article` 内找同 poster 的 `<video>`，找不到再返回 img（此时 kind 已升级为 video，后续由 syndication 解析真实地址）。
- 回归用例追加到既有测试文件（不新建 `.ts` 测试文件）：payload kind 升级、sibling 优先 video、img 元素走 syndication 下载到 mp4、纯 `pbs.twimg.com/media` 图片不升级。
- 不改下载地址解析的 variant 选择、不改 CSP/权限、不改文案与 UI 结构、不动宿主。

## 验收用例

| ID | 场景 | 期望 |
| --- | --- | --- |
| S1 | 时间线卡片：海报 img 与 video 重叠，指针落在播放按钮或 img 上 | 嗅探结果为 `video`；下载落盘 `video.twimg.com/...mp4`，不是 jpg |
| S2 | 时间线卡片：只有海报 img、没有 video 元素 | 仍按视频处理，用 poster 的 media id + article 的 tweet id 取 syndication mp4 |
| S3 | 详情页 | 行为不回归（既有单测 + e2e 继续通过） |
| S4 | 纯图片推文（`pbs.twimg.com/media/*.jpg`） | 仍按图片下载，不被升级 |
| S5 | 单测 + typecheck + build + 受控 runner e2e | 全绿，e2e 断言 finalUrl 为真实 CDN mp4 且文件 `ftypisom`/ffprobe 可解码 |

## 假设

- `amplify_video_thumb` / `ext_tw_video_thumb` 只用于视频海报，可以安全地升级为 `video`；真图片走 `pbs.twimg.com/media/<id>.jpg`，不会命中这两种路径。
- 时间线卡片的 `<img>` 与 `<video>` 共享同一个 `article[data-testid="tweet"]`，因此 poster → tweet id → syndication variants 的链路在"只有 img"时依然成立。

## 证伪方式

- 若时间线上仍有卡片下载成 jpg，或纯图片推文被误判为视频（下载变成 syndication 解析失败/多一次 X 请求），则假设不成立：用 ego 真机抓到的命中链与节点盒模型、以及受控 runner e2e 的 `finalUrl`/文件魔数对照重查。
- 若详情页 e2e 或既有 detector 单测回归，说明升级规则过于宽泛，需收窄到"同 article 内确有 video 或 poster 路径为视频海报"。

## 新用户基线

新装扩展默认生效；不依赖宿主连接。X 时间线与详情页同一套规则；非 X 站点行为不变。

## 非目标

- 不改素材嗅探栏（panel）对图片/视频的分类与投递能力。
- 不为其它平台的"视频海报图"做通用升级（本任务只认 X 的两种 poster 路径）。
- 不做画质选择、下载历史。

## 回滚

单 PR：revert 恢复 `mediaKindOf` 的 img→image 映射与 sibling 的 DOM 顺序选择，无数据迁移。

## 文档影响

无用户文案变更；PR 与 issue 记录 ego 真机取证与 e2e 证据。
