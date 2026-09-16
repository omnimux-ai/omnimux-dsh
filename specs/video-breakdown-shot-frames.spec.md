# 规格：视频拆解分镜截图

## 目标（Objective）

拆解一条参考视频时，为每个分镜保存一张代表帧，让分析结果里带上真实画面，侧栏分镜卡片开头显示一张缩略图，便于人和模型对照画面做复刻。

用户：使用视频拆解侧栏、需要按镜头复刻的创作者与智能体。

## 技术栈（Tech Stack）

- 插件 `omnimux-video-preview`（既有 Node 拆解管线 + React 侧栏）
- 复用 `omnimux-video` 的 `video_thumbnail_extract`（`videoProcess` 缝），失败时回退本插件已有的 `ffmpeg` 单帧抽取
- 预览仍走既有 `/omnimux/video-preview/stream` 授权流

## 命令（Commands）

```bash
cd plugins/omnimux-video-preview
node --test test/*.test.js
npm run build
```

## 项目结构（Project Structure）

- `plugins/omnimux-video-preview/src/breakdown/shotFrames.js` — 代表时刻、抽帧、写回分镜字段
- `plugins/omnimux-video-preview/src/breakdown/analyzerPipeline.js` — 结果附带本地视频路径（存盘时剥掉）
- `plugins/omnimux-video-preview/src/breakdown/artifactStorage.js` — 存盘不写入临时本地视频路径
- `plugins/omnimux-video-preview/src/index.js` — 拆解成功后抽帧并写入返回结果
- `plugins/omnimux-video-preview/src/client/viewer/ShotCard.jsx` — 卡片开头一张缩略图
- `plugins/omnimux-video-preview/src/client/styles.js` — 缩略图几何
- `plugins/omnimux-video-preview/src/refresh-breakdown-media.js` — 刷新分镜图授权流
- `plugins/omnimux-video-preview/test/shot-frames.test.js` — 抽帧契约

## 代码风格（Code Style）

```js
shot.frame_path = '/abs/path/to/shot_1.jpg'
shot.frame_url = '/omnimux/video-preview/stream?grant=...&signature=...'
```

抽帧失败只跳过该镜，不抛错、不阻断拆解。

## 测试策略（Testing Strategy）

- Node 内建测试：代表时刻、注入抽帧器落盘、无视频/失败不阻断、存盘剥离 `local_video_path`、工具返回含 `frame_path`、刷新授权流
- 不改既有 process-arguments 字面参数契约（抽帧发生在存盘之后）
- 客户端：有 `frame_url` 时卡片首张为缩略图；无图旧文件仍可打开

## 边界（Boundaries）

- 总是：抽帧失败降级；旧无图拆解文件可打开；单卡只一张缩略图
- 先问：为历史拆解文件批量补抽帧、改画布分镜表
- 绝不：新增独立工具；把抽帧失败当成整次拆解失败；卡片堆多张图

## 成功标准（Success Criteria）

1. 有本地视频时，每个有效分镜在 `.vbreakdown` 旁的 `.frames/` 目录落下一张 JPEG，字段含 `frame_path` 与 `frame_url`。
2. 工具返回的 `shots` / `shot_frames` 含每个分镜的截图路径，模型可直接看见并用于后续分析。
3. 侧栏每个分镜卡片为左右格式：左侧一张 72px 方图，右侧文字；点击卡片仍跳到该分镜时间。
4. 无本地视频或单帧失败时，拆解仍成功，该卡片无图。
5. 既有无图 `.vbreakdown` 仍可打开。

## 假设

1. 代表帧取分镜时间区间中点。
2. 优先 `videoProcess` 的单帧抽取，否则本机 `ffmpeg`。
3. 不自动对历史文件补抽帧。
