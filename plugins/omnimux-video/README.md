# omnimux-video

自包含的本地 ffmpeg 视频处理插件（OmniMux 插件套件成员）。通过 `video_process` 工具和一个 neutral seam `videoProcess` 暴露 12 项视频后处理能力：剪辑、合并、拆分、音频提取/重编码、缩略图、压缩、分镜、图文成片、字幕烧录导出、**黑白深度图视频**。

无 Docker、无 Gxgen 引擎、无云端、无 HTTP 桥接——纯本地 `ffmpeg` / `ffprobe` / ONNX Runtime 子进程，装好即用。

## 前置

本机需要一个可用的 ffmpeg（含 ffprobe）。macOS 推荐：

```sh
brew install ffmpeg
```

深度图（`video_depth`）额外需要：

```sh
pip install onnxruntime opencv-python
```

首次运行会把 Depth Anything V2 Small ONNX 下载到 `$DSH_HOME/models/depth/`（或 `~/.dsh/models/depth/`）。

ffmpeg 缺失不会阻止插件加载；工具/seam 调用时会抛 `ffmpeg-missing` 并给出安装指引。

## 12 个能力 slug

| slug | destKind | 默认超时 | 输入要点 |
|---|---|---|---|
| `media_metadata` | none | 120s | `mediaUrl` / `videoUrl` / `audioUrl`，`mediaKind?` |
| `video_trim` | single | 600s | `videoUrl` + `startSeconds` / `durationSeconds` / `endSeconds` |
| `video_merge` | single | 900s | `videoUrls[]`（≥2） |
| `video_split` | multi | 900s | `videoUrl` + `segments[]` |
| `audio_extract` | single | 600s | `videoUrl` + `outputFormat mp3\|m4a` |
| `audio_prepare` | single | 300s | `audioUrl` + 重编码参数 |
| `video_thumbnail_extract` | single | 180s | `videoUrl` + 时间/尺寸 |
| `video_inline_analysis_prepare` | single | 600s | `videoUrl` + 体积上限（crf+scale 递减逼近） |
| `video_scene_detect` | multi | 300s | `videoUrl` + `threshold` |
| `slideshow_export` | single | 1200s | `imageUrls[]` + 转场/背景乐 |
| `video_export` | single | 1200s | `clips[]` + `subtitles` / 分辨率 / 画幅 |
| `video_depth` | single | 1800s | `videoUrl` + `maxEdge?` / `invert?` / `sideBySide?` / `keepAudio?` |

## 聊天例子

```
把 ~/Desktop/a.mp4 截 2-7 秒 → video_process(video_trim, videoUrl, dest)
把 a.mp4 和 b.mp4 合并 → video_process(video_merge, videoUrls, dest)
把这 4 张图做成 9:16 轮播配背景乐 → video_process(slideshow_export, ...)
给这条片烧中文字幕，导出 9:16 720p → video_process(video_export, clips[] + subtitles, dest)
把舞蹈视频转成黑白深度图 → video_depth(video, dest) 或 video_process(video_depth, ...)
```

工具的 `input` 字段值为本地绝对路径或 `http(s)` URL 皆可：
- **单输入**能力（trim / metadata / extract / thumb / split / inline / depth）可直接把 URL 交给 ffmpeg；
- **多输入**能力（merge / slideshow / export）需要 seekable 本地文件，URL 会自动物化到临时目录。

## seam 例子

```js
const video = ctx.get('videoProcess')
const out = await video.execute({
  capability: 'video_merge',
  input: { videoUrls: ['/tmp/a.mp4', '/tmp/b.mp4'], keepAudio: true },
  dest: '/tmp/merged.mp4',
  signal, // AbortSignal，可选
})
// out => { mode: 'live', files: [{ path, kind: 'video', meta }], result? }

const depth = await video.execute({
  capability: 'video_depth',
  input: { videoUrl: '/tmp/dance.mp4', maxEdge: 518, keepAudio: true },
  dest: '/tmp/dance_depth.mp4',
})
```

## Config / env

Standard Schema `Config`（从 `src/config.js` re-export）：

```js
Config.video = {
  ffmpegPath: '',       // 空 = 走 PATH
  maxConcurrent: 2,     // 并发子进程上限，超出排队
  pythonPath: '',       // 空 = python3；深度估计引擎解释器
  modelsDir: '',        // 空 = $DSH_HOME/models/depth 或 ~/.dsh/models/depth
}
```

- 环境变量 `OMNIMUX_VIDEO_FFMPEG_PATH` 非空则覆盖 `Config.video.ffmpegPath`。
- 环境变量 `OMNIMUX_VIDEO_PYTHON_PATH` / `OMNIMUX_VIDEO_MODELS_DIR` 覆盖 python / 模型目录。
- `maxConcurrent` 必须是 `整数 >= 1`，否则 Config validate 报 issue。

## 错误码

| 码 | 含义 |
|---|---|
| `ffmpeg-missing` | 未找到 ffmpeg / ffprobe（含 brew 指引） |
| `unknown-capability` | slug 不在 12 项清单内，message 附清单 |
| `video-invalid-input` | 主输入字段缺失 / 非法 |
| `video-ffmpeg-failed` | ffmpeg / ffprobe 非零退出，附截断 stderr 尾部 |
| `video-depth-failed` | 深度估计 Python/ONNX 推理失败 |
| `video-incompatible-streams` | merge 各路视频流编码/尺寸/pix_fmt 不一致（fail-fast，提示先统一转码） |
| `video-canceled` | 调用方 signal abort，进程已杀、半成品清理 |
| `video-timeout` | 超过能力默认超时，已杀进程、半成品清理 |
| `video-<capability>-failed` | 能力级失败（如 merge 兼容性检查内部失败） |

## 非目标（v1）

- 不做 Docker、Gxgen 引擎、云端/HTTP 客户端、token。
- `video_export` 高级项 **不实现**：`chromaKey` 绿幕、`textOverlays` 文字层、`dedupe` 去重（传入的会被静默忽略）。
- 不做聊天 chrome、登录、模型路由、任务 UI、`ctx.jobs` 后台化。
- `video_export` 当前输出不混音轨（`-an`）——合并轨道音频是 v1.1 事项。

## scene_detect 说明

`video_scene_detect` 用 ffmpeg 的 `select='gt(scene,TH)'` + `showinfo` 近似切点（roomate 熵-阈值近似），**不等价** Python scenedetect 的 adaptive/content 检测器。`detectorType` 在 v1 统一映射到同一个 scene 阈值；`returnBase64` 参数被忽略（本地执行无意义）。README 及以上声明为近似实现。

## 开发

```sh
cd plugins/omnimux-video
node scripts/build-client.mjs   # 客户端必须打成 lib/client.js（ModuleLoader 经典 script）
node --test                 # L1 单测（纯 mock 参数构造 + 真 ffmpeg 冒烟）
OMNIMUX_VIDEO_SKIP_FFMPEG=1 node --test   # 跳过需要真二进制/网络的冒烟
```

`package.json` 的 `./client` 指向 `lib/client.js`，不指向 `src/client/index.js`。宿主把插件 client 拼进一个经典 script；源码里的 `import` 会让整段解析失败，后面的官方 UI 包也就注册不上。`lib/client.js` 是构建产物，不入库。

- `node --test` 结果 0 = 全绿。冒烟在没有 ffmpeg 时会自跳过（不红）。
- 单测禁止依赖本机 ffmpeg（spawn 已做成可注入 mock），冒烟除外。