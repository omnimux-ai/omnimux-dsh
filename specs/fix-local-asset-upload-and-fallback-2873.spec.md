# 规格说明：修复本地 URL 素材上传与失败任务状态兜底

**Issue**: #2873  
**状态**: 实施中  
**范围**: `plugins/omnimux/src/media/gateway-upload.js` & `plugins/omnimux/src/client/media-viewer/MediaViewerTab.jsx`  

---

## 1. 缺陷表现与根因分析

### 表现
用户在卡槽中选入资产库素材后连续提交生成任务：
1. 只能看到一个任务处于运行中，第二个任务似乎未执行或凭空消失；
2. 中间大图视口偶尔直接坍缩为“当前会话暂无生成的图片或视频”空态；
3. 后端抛出 `Error: 不支持的本地素材地址`。

### 根因
1. **本地 URL 素材缺少 fetch 读取支持 (`gateway-upload.js`)**：
   从资产库选入的素材带有 `http://127.0.0.1:45120/omnimux/assets/library/preview?...`，被识别为 `local-url`。
   `resolveMediaDescriptor` 仅支持 `/omnimux-viewer/asset` 与 `/api/local-file` 两种路径，遇到 `/omnimux/assets/library/preview` 或任意其他同源 HTTP 端点时直接抛错，阻断了向远端网关的上传；
2. **任务失败时的 activeId 挂起与缩略图过滤脱节 (`MediaViewerTab.jsx`)**：
   - 任务失败后，由于其 `url` 为空，左侧缩略图栏将其过滤隐藏；
   - 但 `activeId` 仍保留为该失败任务的 ID，导致主视口 `activeItem` 匹配到无 URL 的失败项，直接跌入空态；
   - 失败时未优雅回退 `activeId` 至当前会话上一张有效素材或正在生成的任务。

---

## 2. 修复方案

1. **增强 `gateway-upload.js` 本地 URL 流式自愈能力**：
   在 `resolveMediaDescriptor` 中，当 `local-url` 无法通过已有专用磁盘映射解析时，通过内部 `fetch(trimmed)` 将其数据以 Buffer 形式读取，并打包为标准 `kind: 'data'` 描述符供网关直传/中转上传；
2. **状态容错与 activeId 自愈 (`MediaViewerTab.jsx`)**：
   在任务失败（`catch` 代码块）中：
   - 若当前 `activeId` 恰好是失败的任务，自动将 `activeId` 回退到当前会话最新的一张有效完成素材（或正在生成的任务）；
   - 避免主视口被失败任务清空而显示成无素材空态。

---

## 3. 验收标准
1. `gateway-upload.test.js` 新增对本地预览 URL 的流式读取断言并全部通过；
2. 在卡槽持有资产库预览图片时提交生成，正常上传网关并成功出图；
3. 单元测试与 auto-qa-gate 全部通过。
