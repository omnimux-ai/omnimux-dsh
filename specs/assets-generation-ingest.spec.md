# 规格说明：中枢生成引擎与智能体工具链静默自动收敛（切片 2：收敛层）

## 1. 业务背景与目标
在切片 1 中，资产库中心已上线「生成的（Generations）」标签页与分类瀑布流。
本切片（切片 2：收敛层）旨在实现“生成即入库”的全链路静默自动收敛：
无需用户或助手手动调用上传工具，每当用户通过智能体对话（`image_generate` / `video_generate`）或中枢图像/视频生成引擎（`omnimux_image_submit` / `omnimux_video_submit`）完成素材生成并在本地落盘后，系统自动静默将生成物（含物理路径、生成提示词、模型名称、所属会话/来源通道）登记至资产库中心的生成物账本中。

## 2. 详细设计与收敛契约

### 2.1 拦截与监听架构
在 `plugins/omnimux-assets/src/index.js`（或专用收敛中间件 `src/generation-ingest.js`）中：
利用 Cordis 的生命周期监听机制：
```javascript
ctx.on('tools/result', async (exec, result) => { ... })
```

### 2.2 目标工具集合与识别
定义常量 `GENERATION_INGEST_TOOLS`：
- `image_generate`：智能体对话图片生成
- `video_generate`：智能体对话视频生成
- `omnimux_image_submit`：中枢图像生成提交
- `omnimux_video_submit`：中枢视频生成提交

### 2.3 生成结果路径与元数据解析
当 `exec.name` 命中生成工具且 `!result.isError` 时，安全解析生成物：
1. **文件路径提取**：
   - 视频工具：从文本 `Saved video to <path>` 或 JSON `{ path, dest }` 中解析物理文件路径；
   - 图像工具：从文本 `Saved image to <path>`、参数 `dest`、或 JSON `{ path, dest }` 中解析；
2. **元数据提取**：
   - 标题与提示词：提取 `exec.arguments?.prompt` 或预设标题；
   - 模型名：提取 `exec.arguments?.model` 或默认提供商；
   - 来源归属：根据工具名映射为 `agent` 或 `image` 或 `canvas`；
3. **入库登记**：
   - 校验物理文件在磁盘上确实存在且为文件（`statSync`）；
   - 调用 `artifacts.report(filePath, source, title)` 完成受管登记。

### 2.4 健壮性与只读安全红线
- 整个收敛过程完全为异步/静默兜底，任何解析或入库失败均使用 `try/catch` 吞没，**绝不**打断正常业务流，**绝不**修改或删除用户的原始文件；
- 遵循产品基线与零隐私泄露红线。

## 3. 验收标准
1. **单测覆盖**：
   - 覆盖所有 4 个核心工具生成结果的模拟测试；
   - 验证生成后自动入库，并在 `artifacts.list()` 中准确返回。
2. **门禁与测试**：
   - 全量测试 100% 通过；
   - 质量硬门禁 0 违规。
