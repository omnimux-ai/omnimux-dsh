# 视频节点「深度视频」胶囊（Issue #3547）

## 背景与目标

画布视频节点目前只有「内容拆解 / 分镜表 / 提取音频」三个胶囊。把视频转成黑白深度图视频的能力早在 `omnimux-video` 的 `video_depth` 能力（Depth Anything V2 Small ONNX + 本地 ffmpeg）实现，并同时以 Agent 工具与 `videoProcess` seam 暴露；但画布没有入口，用户只能在对话里手动调工具。

本任务把该能力接入画布：视频节点一键转成深度图视频，派生一个可预览、可继续连线的下游视频节点。不在本任务内扩展云端模型、hub seam 或参数面板。

## 用户旅程

1. 用户在画布上选中一个已导入的视频节点，顶部胶囊出现「深度视频」。
2. 点击后，源视频右侧立即出现一个运行中的深度视频节点（源视频节点不进入 running/error）。
3. 本地执行完成后，下游节点变为可播放的深度图视频素材；再次点击胶囊复用同一个下游节点，不重复堆叠。
4. 本机缺少 ffmpeg 或 Python 深度依赖时，下游节点显示可行动的失败文案（说明缺什么、怎么装），源视频不受影响。

## 范围

### omnimux-video（能力层）

- `video_depth` 执行前探测 Python 依赖（`numpy`、`cv2`、`onnxruntime`）。
- 缺失时抛 `video-depth-deps-missing`（`VideoError`），消息包含缺失包与两条可行动路径：`pip install onnxruntime opencv-python`，或把 `OMNIMUX_VIDEO_PYTHON_PATH` 指向已安装依赖的解释器。
- 不自动安装依赖、不下载模型、不改变深度参数面与输出格式。

### omnimux-workflow（画布）

- 新路由 `POST /omnimux-workflow/api/workspaces/:id/video-depth`：
  - 复用 `video_deconstruct` 的源视频绝对路径解析（`realPath`、`?path=`、`?rel=`、`/media/` 前缀）。
  - 调 `videoProcess.execute({ capability: 'video_depth', input: { videoUrl, keepAudio: true }, dest })`。
  - 产物落 `<mediaDir>/video-depth/<workspaceId>/depth_<ts>_<rand>.mp4`，返回 `depthPath` / `mediaUrl` / `previewUrl` / `title`。
  - 错误映射：缺 ffmpeg → `ffmpeg-missing`；缺 Python 依赖 → `deps-missing`（503，可行动文案）；其余执行失败 → 502。
- 新纯函数 `planVideoDepthDownstream`：
  - `origin: 'video_depth'`、`sourceVideoNodeId`、`materialType: 'video'`。
  - 预建（running）与结算（ready/error）两阶段，复用已有节点；`running` 时重复点击 noop 防抖。
- 客户端：视频节点动作栏新增「深度视频」胶囊（可见性与现有胶囊对称），中英双字典，成功/失败 toast。
- dev-only 画布 harness（`src/canvas/harness/harness.tsx`）传入固定 mock workspaceId，使视频/音频派生操作能在本地真实浏览器里走完整交互；不改变生产入口。

## 新用户基线

- 基线用户机器只保证装好 OmniMux，不保证有 ffmpeg 或带 onnxruntime 的 Python；因此：
  - 缺 ffmpeg → 沿用既有 `ffmpeg-missing` 提示；
  - 缺 Python 依赖 → 下游节点失败卡片展示「缺少 Python 深度依赖（onnxruntime / opencv-python），安装后重试或设置 `OMNIMUX_VIDEO_PYTHON_PATH`」，绝不把 Python traceback 直接抛给用户。
- 首次运行需要下载约 99MB 的 ONNX 模型到 `~/.dsh/models/depth`；本任务不内置模型、不承诺离线首跑成功。

## 验收

- [ ] `pnpm --filter omnimux-video test`：依赖探测参数、`video-depth-deps-missing` 映射单测通过。
- [ ] `pnpm --filter omnimux-workflow test`：路由成功/缺 seam/缺依赖/失败映射，planner create/update/noop 单测通过。
- [ ] 真实运行：带 onnxruntime 的解释器下 `video_depth` 产出灰度深度视频并保留音轨；缺依赖的解释器返回 `video-depth-deps-missing`。
- [ ] 隔离工作树真实浏览器：视频节点出现「深度视频」胶囊 → 点击派生下游深度视频节点，running → ready 可播放；失败路径显示错误卡片。
- [ ] `pnpm verify:stages` + `node --test scripts/verify-anti-slop.test.mjs`；文案符合 copy standards。

## 假设

- `video_depth` 在本机以可配置的 Python 解释器执行，`Config.video.pythonPath` / `OMNIMUX_VIDEO_PYTHON_PATH` 足以让用户指向装好 onnxruntime 的解释器；新增的前置探测不会改变已有成功路径的输出。
- 画布下游视频节点沿用现有 import 视频节点的数据结构（`materialType: 'video'`、`realPath`、`mediaUrl`、`previewUrl`），现有播放器与连线无需改动即可播放本地深度视频。

## 证伪方式

- 若在有 onnxruntime 的解释器下 `video_depth` 不再产出「灰度（R≈G≈B）且保留音轨」的 mp4，或依赖探测把可用环境误判为缺失，则假设被证伪：用 `node --test plugins/omnimux-video/src/ffmpeg.live.test.js` 与一次真实 `video_depth` 调用复核，并回到错误分类实现修正。
- 若真实浏览器中下游节点无法播放深度视频（黑屏/无预览）或胶囊点击后源视频节点被写入 running/error，则假设被证伪：检查派生节点字段与媒体 URL 服务路径（`/omnimux-workflow/media/video-depth/...`）后修正。

## 非目标

- 云端 `depth-video` 模型与 hub 契约、seam 扩展。
- 自动安装 Python 依赖或打包模型。
- 深度图序列/单帧导出、批量转换、参数面板（maxEdge / invert / sideBySide）。
- 修改现有三个视频胶囊的行为。
