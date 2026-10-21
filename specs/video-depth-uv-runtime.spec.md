# 深度视频 uv 运行时回退（Issue #3580）

## 背景

`video_depth` 当前需要用户机器具备 Python 3 + `numpy/cv2/onnxruntime`。桌面 App 已自带 uv Python 运行时（浏览器 Connector 使用），可以复用：uv 按需下载托管 Python 与 wheels 到用户缓存，用户无需安装 Python。

本任务落地**插件侧**：系统 Python 候选链不可用时，回退到 uv 托管运行时。壳侧把 uv 路径注入 Host（`UV_PATH`）并打包 ffmpeg 是后续跨仓步骤，不在本任务范围。

## 运行时选择顺序

1. 显式配置 `Config.video.pythonPath` / `OMNIMUX_VIDEO_PYTHON_PATH`：只认该解释器，失败高声、不回退。
2. 系统 Python 候选链（`python3.16 … python3`，逐个探测 import 依赖）——保持现有行为。
3. **uv 托管运行时**（新增）：`OMNIMUX_UV_PATH` / `UV_PATH` 或 PATH 中的 `uv`，`uv --version` 成功才使用。
   - 执行：`uv run --no-project --python 3.12 --with numpy --with opencv-python-headless --with onnxruntime python <depth_engine.py> <engine args>`；
   - uv 首次运行会下载托管 Python 与 wheels 到 uv 缓存（联网），之后复用；
   - 结果 `result.python` 标记实际运行方式（`uv (managed python 3.12)`）。
4. 都不可用：`video-depth-deps-missing`，消息同时给出「装依赖 / 配置 pythonPath / 配置 UV_PATH」三条路径。

## 用户旅程

- 装了系统依赖的用户：行为与现在一致（系统 Python 优先，不触发 uv 下载）。
- 无 Python 的新用户（壳已注入 uv + ffmpeg）：点「深度视频」→ 插件发现无系统 Python → 走 uv → 首次下载运行环境（需联网）→ 成功产出深度视频；失败时节点显示可行动错误。
- 显式配置了坏解释器：仍按显式配置失败，不会偷偷走 uv。

## 验收

- [ ] 单测：显式失败不回退 uv；系统 Python 可用时优先系统；系统全失败 + uv 可用 → uv；uv 参数正确；uv 不可用 → deps-missing 含 uv 指引；uv 探测结果缓存。
- [ ] 真实执行（PATH 仅 ffmpeg+uv，无 python）：`video_depth` 通过 uv 产出灰度深度视频 + 音轨，证据入库。
- [ ] 回归：`env -u OMNIMUX_VIDEO_PYTHON_PATH node --test src/ffmpeg.live.test.js` 12/12；单测 140+ pass / 12 显式 skip。
- [ ] `verify-product-baseline` 通过；README/index 工具说明同步。

## 新用户基线

- 壳侧未完成前：无 Python 的新用户仍会失败，但错误会提示「配置 UV_PATH / 安装依赖 / 配置 pythonPath」；本任务不改壳、不内置 wheels、不打包 ffmpeg。
- uv 路径只来自显式环境变量或通用 PATH，不写死开发机绝对路径；首次下载落在用户自己的 uv 缓存（`UV_CACHE_DIR` 可配）。

## 假设

- `uv run --no-project --python 3.12 --with ... python script.py` 能在无系统 Python 的机器上完成「下载托管 Python + wheels + 执行」，且 `opencv-python-headless` 与脚本里的 `import cv2` 兼容。
- uv 的退出码/标准错误足以区分「依赖下载/执行失败」；首次下载耗时落在该能力 30 分钟超时内。

## 证伪方式

- 若在 PATH 无 python 的真实执行中 uv 回退仍报 `video-depth-deps-missing` 或 `video-depth-failed`，说明 uv 参数/解析有误，用同样的 uv 命令手工复跑并修正。
- 若配置了 `pythonPath=/no/such/python` 但实际由 uv 成功执行，说明显式配置被静默回退，必须改为失败。
- 若系统 Python 可用却仍触发 uv 下载（网络请求/缓存目录变化），说明优先级错误，需调整选择顺序。

## 非目标

- 桌面壳打包、环境变量注入、ffmpeg 打包、签名与公证（后续跨仓任务）。
- 内置 Python/wheels、完全离线模式（A2）。
- 修改深度模型、参数面、云端 `depth-video` 方案。
