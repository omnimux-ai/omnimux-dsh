# 深度视频快速档 — 验收证据（Issue #3594）

## 结论

默认改为「快速档」：CPU 执行 + int8 量化模型 + 长边 384。用户素材（8.75s / 576×1024 / 24fps）**完整 `video_depth` 从 56.6s 降到 8.7s（约 6.5×）**，输出仍为灰度深度视频 + 原音轨。

## 实测

| 档位 / 路径 | 实测耗时 | 说明 |
| --- | --- | --- |
| 旧默认（auto→CoreML + float + 518） | 56.6s | 3.7 fps；CoreML 只接管部分节点 |
| **fast（新默认，plugin 全链路）** | **8.7s** | int8 + 384；首次需下载 27MB 量化模型（冷启动约 24s） |
| quality（engine 直跑同一参数） | 30.4s | float + 518；plugin 增加约 1–2s 封装 |

- 引擎自报：fast `elapsedSeconds=8.69`、`speedFps=24.17`、`maxEdge=384`、`modelFile=depth_anything_v2_small_int8.onnx`、providers=`CPUExecutionProvider`。
- 画质对比（同一帧，fast vs quality）：`corr=0.9918`、`mae_norm=0.0419`（见 `frame-compare.json`、两张 png）。
- `auto` provider 顺序改为 `CUDA → CPU → CoreML`；显式 `provider` 仍可强制。

## 命令

```sh
cd plugins/omnimux-video
# 直接对比档位
python3.14 scripts/depth_engine.py --input <video> --output /tmp/fast.mp4 --preset fast --provider cpu
python3.14 scripts/depth_engine.py --input <video> --output /tmp/quality.mp4 --preset quality --provider cpu
# 单测 / live
OMNIMUX_VIDEO_SKIP_FFMPEG=1 node --test
env -u OMNIMUX_VIDEO_PYTHON_PATH node --test src/ffmpeg.live.test.js   # 12/12
```

## 边界与限制

- 验证期间机器负载 9–13（多 Agent/应用并发），后期 quality 的重复计时未能在合理时间内完成；表中 quality 数据取自负载较低时段的一次完整运行（30.4s），fast 数据为同机全链路实测（8.7s）。
- fast 档长边 384 会让深度边缘略软；需要原始画质时用 `mode: 'quality'`、`Config.video.depthMode=quality` 或 `OMNIMUX_VIDEO_DEPTH_MODE=quality`。
- 画布暂不提供档位选择 UI；默认即 fast。
- 未验证 CUDA 路径（仅调整 provider 顺序，不改行为契约）。
