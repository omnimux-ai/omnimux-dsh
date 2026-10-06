# 专属云端生成引擎（ComfyUI 算力实例）接口调用与开发接入规范

本指南面向各业务代理（智能体 Agent）、中台网关及下游开发人员，详细说明如何接入、封装并自动化调度该专属 GPU 算力实例的图像与视频生成服务。

> **业务定位与工作流契约规范**：
> - **核心工作流**：**U06**（`API-U06-无加速多参.json`，海螺 H3 换人与参考生视频工业级工作流）。
> - **默认模式**：接入执行中枢与创作画布时，工作流接口**默认采用全能参考模式（`video_multi_ref`）**。
> - **多模态契约格式**：完备支持 **9 图 3 视频 3 音频**（最多 9 张参考图片 `reference_images`、最多 3 条参考视频 `reference_videos`、最多 3 条参考音频 `reference_audios`），与创作画布卡槽和执行中枢协议无缝对齐。

---

## 一、 实例拓扑架构与域名映射规则

该实例部署于专用高算力服务器（配备旗舰英伟达 RTX 5090 / RTX 4090 显卡，拥有 32G/48G 超大图形显存），采用**双平面协同架构**。接入方必须首先理解域名前缀与端口的对应关系：

| 平面名称 | 外部访问 URL 示例 | 内部端口 | 核心职能 |
| :--- | :--- | :--- | :--- |
| **业务控制中台平面** | `https://uu14326-79121a894bb2.westd.seetacloud.com:8443` | 8443 | 负责 44 款预置工业级工作流检索、蓝本下载、任务状态追踪、面板升级与系统自检。 |
| **计算推理引擎平面** | `https://u14326-79121a894bb2.westd.seetacloud.com:8443` | 6006 | 核心绘图引擎底层接口。负责素材上传、任务提交、排队调度、历史成果输出与媒体文件下载。 |

> **关键规则（自动转换）**：
> 控制面板域名以 `uu` 开头；将开头的 `uu` 替换为单个 `u`（其余路径和端口保持不变），即可直接访问底层的计算推理接口。各调用方代理应在客户端初始化时实现该域名前缀的自动双向转换。支持通过环境变量 `OMNIMUX_COMFYUI_PANEL_URL` 与 `OMNIMUX_COMFYUI_ENGINE_URL` 显式覆盖。

---

## 二、 业务调用全生命周期时序

接入方代理发起一次完整的生成业务，标准时序包含以下步骤：

```
[调用方 Agent]                 [业务控制中台 (8443)]          [计算引擎 (6006)]
       |                                |                             |
       |--- 1. 检查健康与显存负载 -------->| (GET /api/health)           |
       |                                |                             |
       |--- 2. 拉取预置工作流蓝本 ------->| (GET /api/workflows/...)    |
       |                                |                             |
       |--- 3. 上传本地图片/视频素材 -------------------------------->| (POST /upload/image)
       |                                                              |
       |--- 4. 组装参数并提交任务 ----------------------------------->| (POST /prompt)
       |                                                              | <返回 prompt_id>
       |--- 5. 轮询队列与历史结果 ----------------------------------->| (GET /history/{id})
       |                                                              |
       |<-- 6. 下载生成的成片视频/图像 -------------------------------| (GET /view?...)
```

---

## 三、 核心接口详细定义

### 1. 实例健康与算力状态巡检

#### 1.1 中台服务健康检查
- **接口路径**：`GET {中台Base}/api/health`
- **请求头**：`Content-Type: application/json`
- **响应示例**：
```json
{
  "status": "ok",
  "timestamp": "2026-10-06T13:21:15.567Z",
  "uptime": 620.32
}
```

#### 1.2 显卡显存与系统负载检查
- **接口路径**：`GET {引擎Base}/system_stats`
- **响应字段说明**：
  - `devices[0].name`: 显卡型号（如 `NVIDIA GeForce RTX 5090`）
  - `devices[0].vram_total`: 显存总量（字节）
  - `devices[0].vram_free`: 显存可用空间（字节）

---

### 2. 工作流模板库检索与蓝本下载

#### 2.1 获取云端全部 44 款工业级预置工作流
- **接口路径**：`GET {中台Base}/api/workflows/files`
- **响应示例**：
```json
{
  "success": true,
  "files": [
    { "name": "API-U06-无加速多参.json", "size": 29081 },
    { "name": "API-B18-Qwenimage2.1.json", "size": 18020 },
    { "name": "API-U03-minimax_h3_文生视频基础版API-V2.json", "size": 13361 },
    { "name": "API-P02-动作迁移-Wan2.2Animate角色迁移.json", "size": 25788 },
    { "name": "API-J11-LTX2.3高清超自然电商数字人.json", "size": 31342 }
  ]
}
```

#### 2.2 下载指定工作流的完整节点图 JSON
- **接口路径**：`GET {中台Base}/api/workflows/download/{filename}`
- **注意**：`{filename}` 必须经过 URL 编码（`encodeURIComponent`）。
- **用途**：获得完整的节点结构字典，作为后续任务参数动态注入的基础母版。

---

### 3. 本地素材上传（垫图 / 参考视频 / 参考音频）

当生成任务需要输入本地图片、参考视频或参考音频时，必须先上传至实例的输入暂存目录。

- **接口路径**：`POST {引擎Base}/upload/image`
- **请求类型**：`multipart/form-data`
- **表单字段**：
  - `image`: 二进制文件数据（同时支持 `.png`、`.jpg`、`.webp` 图片、`.mp4` 视频与音频）
  - `overwrite`: 可选，布尔值或字符串 `"true"`
- **成功响应**：
```json
{
  "name": "070d0b107d8794fe.webp",
  "subfolder": "",
  "type": "input"
}
```
*注：返回值中的 `name` 字段即为后续在工作流节点中引用的文件名。*

---

### 4. 任务提交与参数动态注入

- **接口路径**：`POST {引擎Base}/prompt`
- **请求头**：`Content-Type: application/json`
- **请求体格式**：
```json
{
  "client_id": "自定义客户端标识字符串",
  "prompt": {
    "节点ID_1": {
      "class_type": "节点类型名",
      "inputs": { ...参数字段... }
    },
    "节点ID_2": { ... }
  }
}
```
- **成功响应**：
```json
{
  "prompt_id": "6cdaa429-bc73-4c66-b0d3-02f5b2109fd2",
  "number": 1,
  "node_errors": {}
}
```

#### 核心参数在节点中的智能替换对照表：

| 业务参数 | 对应节点类型 (`class_type`) | 节点字段名 (`inputs`) | 说明 |
| :--- | :--- | :--- | :--- |
| **参考图片 (最多9图)** | `LoadImage` (节点 137 等) | `image` | 填入上传接口返回的图片名，如 `"070d0b107d8794fe.webp"` |
| **参考视频 (最多3视频)**| `VHS_LoadVideo` (节点 638 等)| `video` | 填入上传接口返回的视频名，如 `"dance_sample.mp4"` |
| **参考音频 (最多3音频)**| `LoadAudio` / 驱动音频节点 | `audio` | 填入上传接口返回的音频文件名 |
| **正向提示词** | `CR Prompt Text` 或 `TextEncodeQwenImage21` (节点 664) | `prompt` | 剧情描述、分镜指令与角色外观特征 |
| **负向提示词** | `TextEncodeQwenImage21` 或 `CLIPTextEncode` | `negative_prompt` 或 `text` | 过滤低质、模糊、畸变等负向描述 |
| **生成时长** | `PrimitiveFloat` (节点 132，Duration) | `value` | 浮点数，如 `12.0`（代表 12 秒） |
| **画面比例** | `ResolutionSelector` | `aspect_ratio` | 枚举字符串，如 `"9:16 (Portrait Widescreen)"` |
| **推理步数** | `BasicScheduler` 或 `KSampler` (节点 728) | `steps` | 整数，如 `8` 或 `20` |
| **随机种子** | `easy seed` 或 `RandomNoise` (节点 142) | `seed` 或 `noise_seed` | 整数，传入随机大数避免画面重复 |
| **推理模型** | `UNETLoader` (节点 620) | `unet_name` | 示例：`"minimax/minimax_h3_ref2va_pruned_fp8_scaled.safetensors"` |

---

### 5. 任务进度监控与结果获取

#### 5.1 查看当前队列排队情况
- **接口路径**：`GET {引擎Base}/queue`
- **响应说明**：
  - `queue_running`: 当前正在渲染的任务列表（元素 1 为 `prompt_id`）
  - `queue_pending`: 当前排队等待的任务列表

#### 5.2 异步轮询获取最终生成结果
- **接口路径**：`GET {引擎Base}/history/{prompt_id}`
- **轮询策略**：建议每隔 2.5 ~ 3 秒轮询一次，视频类任务超时时间建议设为 600 秒。
- **完成响应示例**：
```json
{
  "6cdaa429-bc73-4c66-b0d3-02f5b2109fd2": {
    "status": {
      "status_str": "success",
      "completed": true,
      "messages": []
    },
    "outputs": {
      "732": {
        "videos": [
          {
            "filename": "comfyui_00001_.mp4",
            "subfolder": "",
            "type": "output",
            "format": "video/h264-mp4"
          }
        ]
      }
    }
  }
}
```

---

### 6. 生成成片与图像下载

- **接口路径**：`GET {引擎Base}/view`
- **URL 查询参数**：
  - `filename`: 结果输出中的文件名（如 `comfyui_00001_.mp4`）
  - `subfolder`: 子目录名称（通常为空字符串）
  - `type`: 固定为 `"output"`
- **返回数据**：标准二进制媒体流（`video/mp4` 或 `image/png`），直接写入本地磁盘或对象存储即可。

---

## 四、 典型生产用例：海螺 H3 / U06 视频换人全流程

以下为调用代理封装此业务时，所组装的标准化最小可执行代码蓝本（以标准 JavaScript / Node.js 现代异步写法为例）：

```javascript
import fs from 'node:fs';
import path from 'node:path';

const PANEL_BASE = 'https://uu14326-79121a894bb2.westd.seetacloud.com:8443';
const COMFY_BASE = 'https://u14326-79121a894bb2.westd.seetacloud.com:8443';

async function runVideoRemakePipeline({ videoPath, imagePath, prompt, duration = 12, steps = 8 }) {
  // 1. 上传参考视频
  const vidFormData = new FormData();
  vidFormData.append('image', new Blob([fs.readFileSync(videoPath)]), path.basename(videoPath));
  const vidRes = await fetch(`${COMFY_BASE}/upload/image`, { method: 'POST', body: vidFormData }).then(r => r.json());

  // 2. 上传参考人物图片
  const imgFormData = new FormData();
  imgFormData.append('image', new Blob([fs.readFileSync(imagePath)]), path.basename(imagePath));
  const imgRes = await fetch(`${COMFY_BASE}/upload/image`, { method: 'POST', body: imgFormData }).then(r => r.json());

  // 3. 拉取基准工作流母版 (API-U06-无加速多参.json)
  const wf = await fetch(`${PANEL_BASE}/api/workflows/download/${encodeURIComponent('API-U06-无加速多参.json')}`).then(r => r.json());

  // 4. 动态重写参数
  wf['620'].inputs.unet_name = 'minimax/minimax_h3_ref2va_pruned_fp8_scaled.safetensors'; // 推荐大显存模型
  wf['137'].inputs.image = imgRes.name;     // 绑定上传的人物图
  wf['638'].inputs.video = vidRes.name;     // 绑定上传的参考视频
  wf['664'].inputs.prompt = prompt;         // 注入分镜指令与剧情台词
  wf['132'].inputs.value = Number(duration);// 视频时长 (秒)
  wf['728'].inputs.steps = Number(steps);   // 渲染步数
  wf['142'].inputs.seed = Math.floor(Math.random() * 1e15); // 随机种子

  // 5. 提交任务至渲染队列
  const submit = await fetch(`${COMFY_BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'agent_caller', prompt: wf })
  }).then(r => r.json());

  const promptId = submit.prompt_id;
  console.log(`[任务已提交] 任务编号: ${promptId}，开始等待出片...`);

  // 6. 轮询直到渲染完成
  while (true) {
    await new Promise(res => setTimeout(res, 3000));
    const history = await fetch(`${COMFY_BASE}/history/${promptId}`).then(r => r.json());
    if (history[promptId]?.status?.completed) {
      const outputVideo = history[promptId].outputs['732'].videos[0];
      const downloadUrl = `${COMFY_BASE}/view?filename=${encodeURIComponent(outputVideo.filename)}&type=output`;
      
      // 7. 下载落盘
      const finalBuffer = Buffer.from(await fetch(downloadUrl).then(r => r.arrayBuffer()));
      const savePath = `./output_${outputVideo.filename}`;
      fs.writeFileSync(savePath, finalBuffer);
      console.log(`[生成成功] 视频已保存至: ${savePath}`);
      return savePath;
    }
  }
}
```

---

## 五、 代理封装异常防御与工程守则

1. **防超时机制**：
   - 图像生成通常在 10 ~ 25 秒内完成；
   - 视频生成（如海螺 H3 12秒 8步）在 RTX 5090 显卡上通常需要 2 ~ 4 分钟。客户端 HTTP 库的请求超时时间不得设置过短，必须采用异步轮询而非阻塞等待。
2. **多代理并发冲突防范**：
   - 在高负载或批量跑批场景下，提交前建议先调用 `/queue` 检查 `queue_running` 与 `queue_pending`；
   - 若当前队列任务过多，建议在客户端进行排队限流，避免瞬时并发导致显卡 OOM（显存溢出）。
3. **断点恢复与幂等性**：
   - 提交任务后，建议各代理将 `prompt_id` 持久化记录到本地任务账本中；若网络偶发中断，只需凭该 `prompt_id` 继续轮询 `/history/{prompt_id}`，无需重新提交扣减算力。
