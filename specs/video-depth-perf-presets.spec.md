# 深度视频性能档位（Issue #3594）

## 背景（实测，用户素材 8.75s / 576×1024 / 210 帧）

| 组合 | 引擎耗时 | fps | 说明 |
| --- | --- | --- | --- |
| auto（CoreML 优先）+ float + 518 | 56.6s | 3.71 | 当前默认；CoreML 仅支持 536/823 节点，跨后端拷贝 |
| CPU + float + 518 | 31.1s | 6.76 | 纯换后端 |
| CPU + int8 + 518 | 18.7s | 11.24 | 量化模型 99MB→27MB，相关性 0.99 |
| CPU + int8 + 384 | 10.5s | 19.98 | 快速档目标 |
| CPU + int8 + 308 | 5.9s | 35.38 | 明显偏软，不作默认 |

## 方案

- 引擎新增 `--preset fast|quality`（默认 `fast`）：
  - `fast`：int8 量化模型（`model_quantized.onnx`）+ 长边 384；
  - `quality`：float 模型 + 长边 518。
  - 显式 `--max-edge` / `--model` 继续覆盖 preset。
- `auto` provider 顺序改为 `CUDA → CPU → CoreML`：CoreML 在该模型上因分区回退最慢，不再优先。
- 插件透传 `mode`（`fast`/`quality`），默认取 `Config.video.depthMode` / `OMNIMUX_VIDEO_DEPTH_MODE`，回落 `fast`；结果 meta 标记 preset。
- 画布仍用默认快速档；档位 UI 不在本任务。

## 验收

- [ ] 单测：fast 默认 CLI、quality 显式、非法 mode 拒绝、Config/env 解析、显式 maxEdge 覆盖。
- [ ] 真实执行：用户素材 fast 档 ≤12s，输出灰度+音轨；与 quality 帧相关性 ≥0.98。
- [ ] 既有测试/live 不回归；product-baseline 通过；README 更新。

## 新用户基线

量化模型同样懒下载到 `$DSH_HOME/models/depth/`（约 27MB，比 float 99MB 更小）；provider 顺序不含开发机私有路径；默认路径不变。

## 假设

- int8 量化在 Apple Silicon CPU 上稳定（onnxruntime 1.31，已实测 80 帧 15.4fps 与 210 帧 11.2fps），且与 float 输出相关性 ≥0.98（实测 0.986–0.991）。
- 384 长边对深度图观感影响可接受（输出回原分辨率，边缘略软），作为默认快速档。
- CUDA 机器上 auto 走 CUDA 会更快；未在本机验证 CUDA，仅调整顺序不改行为契约。

## 证伪方式

- 若 fast 档真实执行超过 12s 或输出不是灰度/丢失音轨，用 `depth_engine.py --preset fast` 手工复跑并核对 complete 事件里的 `preset/providers/maxEdge`。
- 若 fast 与 quality 帧相关性 <0.98 或深度图出现结构性错误（远近颠倒、整帧噪声），说明量化/分辨率不可接受，应回退默认 quality 或改用未量化 384。
- 若显式 `--max-edge 518` 仍被 preset 覆盖，说明参数优先级实现错误。

## 非目标

- 画布档位选择 UI（后续 UI 任务）。
- 抽帧/降帧率、CoreML 全模型转换、批推理、输出编码链路改造。
- 修改深度模型族（仍为 Depth Anything V2 Small）。
