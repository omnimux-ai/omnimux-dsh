# 深度视频解释器自动发现与失败重试修复（Issue #3574）

## 背景

#3547 把 `video_depth` 接进画布后，用户点「深度视频」得到失败卡片：

> 本机缺少深度图 Python 依赖（numpy / opencv-python / onnxruntime）。安装后重试，或把 `OMNIMUX_VIDEO_PYTHON_PATH` 指向已装依赖的解释器

但本机实际已装好依赖（`python3.14` 可导入 numpy/cv2/onnxruntime，模型也已缓存），只是默认 `python3` 指向 3.15。失败卡片的「重新生成」按钮也不重跑深度转换。

## 根因

1. `depth.js` 只尝试「配置值 / 环境变量 / 裸 `python3`」，没有解释器发现；可用环境被判缺失。
2. `handleMediaRetry` 对 `origin === 'video_depth'` 的节点没有专门分支，落到 `handleGenerate()`（普通视频生成重试），语义错误。

## 修复范围

### omnimux-video

- 新增候选链常量 `DEPTH_PYTHON_CANDIDATES = ['python3.14','python3.13','python3.12','python3.11','python3.10','python3']`。
- 新增 `selectDepthPython({ configured, runProbe, ... })`：逐个探测 `numpy/cv2/onnxruntime`，返回首个可用的解释器；成功结果按「配置键」缓存（进程内），避免每次执行重复探测。
- 显式配置（`Config.video.pythonPath` 或 `OMNIMUX_VIDEO_PYTHON_PATH`）时只尝试该解释器；失败不回退、不静默，仍抛 `video-depth-deps-missing`。
- 全部候选失败时错误消息列出已尝试解释器，并保留安装指引。
- `execute` 使用选中的解释器跑实际引擎；`index.js` 工具说明同步。

### omnimux-workflow

- `MaterialNode` 新增 `handleRetryDepthVideo`：从节点 `sourceVideoPath` 或 `sourceVideoNodeId` 解析源视频，就地重跑 `convertVideoToDepth`，成功回填、失败置 error；运行中清空旧媒体。
- `handleMediaRetry` 增加 `materialType === 'video' && origin === 'video_depth'` 分支，先于通用生成重试。
- 失败卡片保留「重新生成」按钮，但语义变为重跑深度转换。

## 新用户基线

- 全新机器仍需要「ffmpeg + 某个带 numpy/cv2/onnxruntime 的 python3」；本修复不自动安装依赖、不打包 Python。
- 默认探测的是通用解释器名（版本优先级，不含开发机绝对路径），与产品基线一致；显式配置优先且失败高声。

## 验收

- [ ] 默认环境（不设 `OMNIMUX_VIDEO_PYTHON_PATH`）真实执行 `video_depth` 成功，输出灰度深度视频 + 原音轨（自动选中 `python3.14`）。
- [ ] 显式设置无依赖解释器 → `video-depth-deps-missing`，不静默回退。
- [ ] 单测：候选顺序、显式优先级、缓存命中、全失败错误体、`execute` 走选中解释器。
- [ ] 浏览器：失败卡片显示预期错误信息；点「重新生成」发起第二次深度请求（不是视频生成）并成功收敛；截图 + JSON 证据。
- [ ] workflow 全量单测、video 包测、typecheck、verify:stages、anti-slop、product-baseline 通过。

## 假设

- 本机/CI 上带依赖的解释器以标准版本名（`python3.14` 等）暴露在 PATH 中；真实产品场景下用户通过 Homebrew/pyenv 安装的解释器符合该命名。
- 选中结果在进程生命周期内稳定。若用户在 App 运行期间新装依赖，重启后重新探测即可；不为此引入热更新。

## 证伪方式

- 若默认环境真实执行 `video_depth` 仍然命中 `video-depth-deps-missing`（而 `python3.14 -c "import numpy,cv2,onnxruntime"` 成功），说明候选链/探测实现有误，用 `node --test src/ffmpeg.live.test.js` 与手动一次 `execute` 复核并修。
- 若显式设置 `OMNIMUX_VIDEO_PYTHON_PATH=/no/such/python` 时仍然成功产出，说明存在静默回退，属于产品基线违规，必须改为失败。
- 若浏览器中「重新生成」触发的是视频生成提交（网络里出现生成相关请求）而不是 `/video-depth` 第二次请求，则重试分支未生效。

## 非目标

- 自动执行 `pip install`、内置 Python 运行时或模型。
- 新增 Settings 配置页/座位；`Config.video.pythonPath` 仍是唯一显式入口。
- 修改深度模型、参数面（maxEdge/invert/sideBySide）或云端 `depth-video` 方案。
