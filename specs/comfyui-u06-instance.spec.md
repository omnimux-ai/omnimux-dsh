# 规格说明：ComfyUI 专属算力实例工作流 U06 接入中枢与创作画布

## 1. 业务目标与价值
将专属云端 GPU 算力实例（ComfyUI 实例 API 规范，`docs/comfyui-instance-api-spec.md`）中的工业级工作流 **U06**（`API-U06-无加速多参.json`，海螺 H3 换人与参考生视频）正式接入 OmniMux 执行中枢，并打通创作画布调用闭环。
该工作流默认采用**全能参考模式（`video_multi_ref`）**，完备支持**最多 9 张参考图、最多 3 条参考视频、最多 3 条参考音频**的多模态契约格式。

## 2. 核心架构与契约映射

### 2.1 拓扑架构与双平面调度
- **业务控制中台（8443）**：拉取预置工作流蓝本（`GET /api/workflows/download/API-U06-无加速多参.json`）、健康巡检（`GET /api/health`）。
- **计算推理引擎（6006/8443）**：素材二进制上传（`POST /upload/image`）、任务提交（`POST /prompt`）、渲染历史轮询（`GET /history/{prompt_id}`）与成片下载（`GET /view`）。
- 自动转换规则：控制域名 `uu*.seetacloud.com:8443` 与计算域名 `u*.seetacloud.com:8443` 双向互转，支持环境变量 `OMNIMUX_COMFYUI_PANEL_URL` 与 `OMNIMUX_COMFYUI_ENGINE_URL`。

### 2.2 多模态契约格式（9 图 3 视频 3 音频）
- 依据标准契约 `video_multi_ref`：
  - `reference_images`: 图片素材，上限 9，允许主流图片格式（JPEG, PNG, WebP 等）；
  - `reference_videos`: 视频素材，上限 3，允许 MP4/QuickTime，单条 2–15s，总计 ≤15s；
  - `reference_audios`: 音频素材，上限 3，允许 WAV/MP3，单条 2–15s，总计 ≤15s。
- 节点动态重写：
  - `620` (UNETLoader): `minimax/minimax_h3_ref2va_pruned_fp8_scaled.safetensors`
  - `137` (LoadImage): 注入上传的人物/参考图
  - `638` (VHS_LoadVideo): 注入上传的参考视频
  - `664` (CR Prompt Text): 注入剧情/分镜提示词
  - `132` (PrimitiveFloat): 视频生成时长（4–15 秒，默认 12 秒）
  - `728` (BasicScheduler): 渲染推理步数（默认 8 步）
  - `142` (easy seed): 随机大整数种子
  - `732` (SaveVideo/VHS_VideoCombine): 输出视频结果

### 2.3 创作画布与中枢联动
- 画布节点选择该模型与工作流时，默认模式解析为全能参考模式（`video_multi_ref`）。
- 槽位布局：卡槽直观展示 `reference_images`（参考图）、`reference_videos`（参考视频）、`reference_audios`（参考音频）三个槽位，用户拖入素材自动装填，无缝下发至中枢执行。

## 3. 验收用例与测试标准
1. **TC-U06-01 (双平面解析)**：验证 `uu` 与 `u` 域名自动解析转换逻辑及环境变量配置优先级。
2. **TC-U06-02 (节点重写与蓝本组装)**：验证输入 9 图 3 视频 3 音频时，正确筛选装配至工作流母版各关键节点。
3. **TC-U06-03 (生命周期状态机)**：模拟上传、提交、排队等待、完成出片下载的标准时序闭环。
4. **TC-U06-04 (画布卡槽布局对齐)**：验证画布派生的 `video_multi_ref` 槽位布局完全满足 9 图 3 视频 3 音频契约。
