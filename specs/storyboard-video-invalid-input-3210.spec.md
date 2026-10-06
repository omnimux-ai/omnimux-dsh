# fix: 分镜表/内容拆解对超大或远程视频误报「视频文件不满足理解要求」（#3210）

## 用户旅程与期望

画布上视频节点 →「分镜表」（或「内容拆解」）。当前：若视频是远程 URL（素材库/下载节点）或本地文件超过理解上限（默认 20MiB），`video_analyze` 前置校验 `assertLocalVideo` 直接抛 `video-invalid-input`，界面显示「生成失败：视频文件不满足理解要求（格式、大小或路径），请更换视频后重试」。

期望：服务端在调用 `video_analyze` 之前，先用 `video_process` 能力 `video_inline_analysis_prepare` 将源视频（含远程 URL，由引擎先下载）转码压缩到模型可接受的 mp4 样片，再把样片路径交给理解模型；用户无需更换视频。

## 验收用例

1. 本地 ≤上限 mp4：行为不变，直接分析。
2. 本地 >上限 mp4：先 prepare 压缩，analyze 接收压缩产物路径；若产物仍超限（overshoot）回退原有 invalid-input 错误。
3. `videoPath` 解析为 http(s) URL：prepare 先行（下载+压缩），analyze 收到本地产物。
4. `videoProcess` seam 不可用（新用户无 ffmpeg）：prepare 抛错 → 维持现有中文错误，不新增崩溃路径。
5. 分镜表与内容拆解共用同一前置处理，行为一致。

## 新用户基线

无 ffmpeg 的全新用户：prepare 失败 → 保持现有「视频文件不满足理解要求」错误；不引入新的强制依赖或默认渠道。

## 范围

- `plugins/omnimux-workflow/src/workflow/videoStoryboard/service.ts`
- `plugins/omnimux-workflow/src/workflow/videoDeconstruct/service.ts`（共用 helper）
- 不改错误文案表与 UI。
