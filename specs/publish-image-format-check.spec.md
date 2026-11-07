# 3957 图文发布前校验图片格式（仅 JPEG/WebP）

Issue: #3957 · 分支 `agent/publish-image-format-check-issue-3957` · 风险等级 **R2**（单插件 `omnimux-publish` 客户端校验）

## 背景

TikTok Content Posting 图文帖仅支持 WebP/JPEG（官方 Media Transfer Guide · Image restrictions，2026-08-04）。生产实证：同为 1080×1080，PNG 返回 `fail_reason=file_format_check_failed`，JPEG 返回 `PUBLISH_COMPLETE`。

现在用户选 PNG 也能上传、也能提交，失败要等 TikTok 异步回执（几十秒到几分钟）才知道，而且错误只显示 `file_format_check_failed`。改成发布页当场拦住。

## 方案

1. 新增纯函数模块 `plugins/omnimux-publish/src/client/image-format.js`：
   - `TIKTOK_IMAGE_FORMATS = ['image/jpeg', 'image/jpg', 'image/webp']`
   - `isSupportedImage(contentType, filename)`：按 MIME 判定，MIME 缺失时回退扩展名（.jpg/.jpeg/.webp）；PNG 及未知格式返回 false。
   - `unsupportedImageNames(mediaRows)`：扫描草稿素材，返回不支持格式的文件名。
2. `Composer/index.jsx`：
   - 选图时逐张校验：不支持的图片直接跳过、不调用上传，并提示「TikTok 图文仅支持 JPEG/WebP，{filename} 请先转换后上传」。
   - 编辑草稿恢复素材时保留 `content_type`；若存在不支持格式，素材项显示「格式不支持」标记，提交按钮禁用并展示同一条提示。
   - `handleSubmit` 再做一次拦截，避免绕过。
3. `locales.js` 增加两条文案（zh/en）。

## 假设

- TikTok 图文格式限制按 MIME/扩展名就能判定，不需要读文件字节；PNG 的 MIME 是 `image/png`。
- 视频类型不受影响：视频仍按原逻辑上传，不做图片格式校验。
- 历史草稿里已上传的 PNG 仍留在 Host 媒体库里（不删除用户素材），只是不让提交。

## 证伪方式

- 单测：PNG/`image/png` 判定为不支持；JPEG/WebP/JPG 扩展名回退判定为支持；草稿扫描能列出 PNG 文件名。
- 浏览器实测（worktree 真实浏览器）：在图文表单里选择 PNG，界面出现提示且素材数量保持 0；选择 JPEG 时素材正常加入。
- 生产/开发版实测：选 PNG 时提交按钮不可用，选 JPEG 可提交。

## 新用户基线

- 新用户第一次发图文就会看到格式要求，不会等到平台失败才发现。
- 不需要任何本机配置或密钥；纯前端判定，离线可用。

## 文档影响

不改契约文档；`hub-tool-contracts.md` 描述的是网关工具契约，本次是客户端输入校验。
