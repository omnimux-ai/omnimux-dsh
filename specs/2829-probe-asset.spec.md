# 规格：媒体素材探针与网关上传兼容解析查看器本地签名路由 (Issue #2829)

## 1. 业务背景与问题定义
当用户在媒体查看器中对已有图片进行局部打点评论并提交图片编辑时，参考图 URL 为查看器本地签名路由 `/omnimux-viewer/asset?p=...`。
在进入后端 `probeMediaAssets` 探针阶段时，`text/image.js` 直接将其作为物理绝对路径读取，导致抛出 `image file not found: /omnimux-viewer/asset...`，中断图片编辑生成。

## 2. 核心解决方案
1. 在 `text/image.js` 与 `text/video.js` 中增加查看器路由与本地接口路径解析，将 `p` (base64url) 反解为本机物理绝对路径；
2. 保持与 `gateway-upload.js` 的本地文件解析口径对齐；
3. 实机验证图片编辑端到端生成成功。

## 3. 验收标准 (Acceptance Criteria)
- **AC-1：图像素材探针解析**：`probeTextImage` 能够正确识别 `/omnimux-viewer/asset?p=...` 相对路由及带回环地址前缀的查看器签名 URL，成功解析为本地文件并读取图片 MIME 类型与尺寸；
- **AC-2：视频素材探针解析**：`probeTextVideo` 同样支持解构 `/omnimux-viewer/asset?p=...`，确保视频参考素材一致性；
- **AC-3：端到端图片编辑出片**：在媒体查看器中提交带局部打点评论的图片编辑请求，成功通过探针与网关上传，端到端生成新图并上屏。
