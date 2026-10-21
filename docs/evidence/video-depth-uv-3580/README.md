# 深度视频 uv 运行时回退 — 验收证据（Issue #3580）

## 结论

在没有系统 Python 依赖的 PATH 上（只有 `ffmpeg/ffprobe/uv`，系统仅剩无依赖的 `/usr/bin/python3`），`video_depth` 自动回退到 uv 托管运行时，成功产出灰度深度视频并保留音轨：`result.python = "uv (managed python 3.11)"`。

这为「用户不必自己安装 Python」提供了插件侧能力；壳侧注入 uv 路径与打包 ffmpeg 仍属后续跨仓步骤。

## 证据清单

| 文件 | 证明什么 |
| --- | --- |
| `uv-run.json` | uv 回退真实成功：`result.python = uv (managed python 3.11)`、`audioPreserved: true` |
| `uv-depth-frame.png` / `-stats.json` / `uv-depth-probe.json` | 输出为灰度深度视频（320×240，R≈G≈B），H.264 + AAC |
| `uv-missing.json` | 系统 Python 与 uv 都不可用时报 `video-depth-deps-missing`，消息列出候选并给出「pip / pythonPath / UV_PATH」三条路径 |
| `explicit-missing.json` | 显式配置坏解释器时高声失败、不回退 uv；提示「修好或清空配置」 |

## 实测口径

- uv 命令：`uv run --no-project --python 3.11 --with numpy --with opencv-python-headless==4.10.0.84 --with onnxruntime python depth_engine.py …`
- **首次（冷缓存）**：uv 下载托管 Python + 3 个 wheel，约 **11 分 15 秒**，uv 缓存约 **523MB**（含托管 Python 与解压后的包）。
- **缓存命中后**：一次完整 `video_depth`（1 秒片段，含 ffmpeg 抽音轨/推理/混流）约 **4.7 秒**。
- 本机网络下 PyPI 可直连；若走系统代理会显著变慢，可用 `UV_CACHE_DIR` / `UV_DEFAULT_INDEX` / `NO_PROXY` 等 uv 既有环境变量控制（壳侧后续可注入镜像）。

## 命令

```sh
# 冷缓存预演（会联网下载）
uv run --no-project --python 3.11 --with numpy --with 'opencv-python-headless==4.10.0.84' --with onnxruntime \
  python -c "import numpy, cv2, onnxruntime; print('deps-ok')"

# 真实插件执行（PATH 仅 ffmpeg/ffprobe/uv，无系统 Python 依赖）
PATH=/tmp/uvdepth/bin:/usr/bin:/bin UV_CACHE_DIR=<uv缓存> NO_PROXY='*' \
  node /tmp/uvdepth/run.mjs

# 单测 / live
cd plugins/omnimux-video && OMNIMUX_VIDEO_SKIP_FFMPEG=1 node --test      # 147 pass / 12 skip
env -u OMNIMUX_VIDEO_PYTHON_PATH node --test src/ffmpeg.live.test.js      # 12/12
```

## 边界与限制

- 本任务只做插件侧回退。**壳侧尚未注入 `UV_PATH`、也未打包 ffmpeg**：新用户（无 Python、无 ffmpeg、PATH 无 uv）仍会失败，错误会提示三条处理路径。壳侧改动需要 Desktop 仓打包/签名/公证，另行验收。
- uv 首次运行需要联网；镜像/缓存目录通过 uv 既有环境变量控制，插件不硬编码。
- 未验证 Windows/Linux 的 uv 托管 wheel 组合；本轮只在 macOS arm64 实测。
- 深度模型仍复用 `~/.dsh/models/depth` 缓存（约 99MB），首次无模型时由 `depth_engine.py` 下载。
