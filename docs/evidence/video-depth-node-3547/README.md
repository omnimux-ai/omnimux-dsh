# 视频节点「深度视频」胶囊 — 验收证据（Issue #3547）

## 结论

- 画布视频节点新增「深度视频」胶囊，点击后在本机走 `omnimux-video` 的 `video_depth`（Depth Anything V2 Small ONNX），派生下游深度图视频节点。
- 源视频节点保持原状态；失败只落在下游节点。
- 本机缺 Python 深度依赖时返回可行动的 `video-depth-deps-missing`，不再把 traceback 直接抛给用户。

## 证据清单

| 文件 | 证明什么 | 采集方式 |
| --- | --- | --- |
| `01-before-pill.png` | 视频节点动作栏出现「深度视频」胶囊（与内容拆解/分镜表/提取音频并列） | 真实 Chromium（ego-browser）+ 画布 harness，127.0.0.1:4931 |
| `02-after-depth-node.png` | 点击后右侧派生深度视频节点，节点可播放 | 同上 |
| `browser-evidence.json` | 结构化断言：胶囊可见/可点，预建节点 `running`（两段式），请求体 `{nodeId, videoPath, title}` 正确，派生节点 `completed` 且 `realPath/mediaUrl` 回填，源节点 `completed` 未变 | 同上 |
| `04-real-depth-frame.png` | 真实 `video_depth` 输出帧：灰度深度图（R≈G≈B） | 本机真实执行（python@3.14 带 onnxruntime/cv2/numpy），从输出 mp4 抽帧 |
| `real-depth-run.json` | 输入/输出/解释器/ffprobe 流信息（视频流 320×240 + AAC 音轨，2.0s） | 真实执行记录；成片 mp4 未入库（仓库证据惯例只收 png/json/md） |
| `deps-missing.json` | 缺依赖时的机器码、可行动 hint、未落盘半成品 | 默认 `python3`（3.15，缺 numpy）真实执行 |

## 命令

```sh
# 画布 harness（真实 CanvasEditor + mock catalog，固定 mock workspaceId）
cd plugins/omnimux-workflow && node scripts/canvas-harness.mjs --port 4931

# 浏览器验收（ego-browser nodejs，见本轮脚本）
# 真实能力（带依赖的解释器）
OMNIMUX_VIDEO_PYTHON_PATH=/opt/homebrew/opt/python@3.14/bin/python3.14 \
  node --test src/ffmpeg.live.test.js   # 12/12 pass

# 插件单测（无 ffmpeg 依赖时显式跳过 12 条 live smoke）
OMNIMUX_VIDEO_SKIP_FFMPEG=1 node --test  # 135 pass / 12 skipped
```

## 独立评审后的修复（同轮复验）

- 远程 `http(s)` 视频节点不再被 `existsSync` 误判 404，直接交给 `video_depth` 的 `materialize` 下载。
- 派生节点放置改为对**所有**已有节点做 y 带碰撞避让（不再只避让下游节点），复验截图中不再压住上游节点。
- 重跑/失败时清空旧 `realPath/mediaUrl/previewUrl`，避免失败卡片继续播放上一次的深度视频；移除未接线的 `depthVideoActive` 状态。
- 补齐 route-level 测试（200 / 403 not-local / 503 deps-missing / 404 / 400）与远程 URL 服务测试。

## 边界与限制

- 浏览器证据里的 `video-depth` HTTP 响应为页面内 stub：本次验证目标是画布客户端接线（胶囊 → 预建节点 → 请求 → 结算 → 播放器），真实服务端路径由 `src/workflow/videoDepth/videoDepth.test.mjs`（8/8）与真实 `video_depth` 执行证据覆盖。没有把 stub 结果说成真实模型或真实服务端时延。
- 本机默认 `python3`（3.15）没有 numpy/cv2/onnxruntime，因此默认环境跑 `video_depth` 会得到 `video-depth-deps-missing`；带依赖的解释器（python@3.14）实跑成功。新用户机器同样需要 ffmpeg + Python 依赖，失败时由下游节点给出可行动提示。
- 首次运行需要下载约 99 MB 的 Depth Anything V2 Small ONNX 到 `~/.dsh/models/depth`（本机已缓存）；本任务不内置模型。
- 未验证：长视频（>1 分钟）端到端时延、并发多次点击的真实排队、生成参数面板。
