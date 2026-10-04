# 规格：声音克隆（indextts-2）本地参考音频自动托管

## 1. 目标（Objective）
修复创作画布在使用本地音频（如通过资产库或本地文件添加的「TK 口播女.mp3」）作为声音克隆（`indextts-2`）输入时，由于上游 AutoDL 任务通道（`POST /v1/tasks/autodl`）要求 `prompt_simple` 必须为可下载的公共 HTTPS URL，而本地路径或本地虚拟路由（`/omnimux-workflow/api/local-file`）未被自动上传托管至对象存储，导致上游返回通道错误或解析失败的问题。

## 2. 变更范围与关键字段（Scope & Fields）
- 在 `plugins/omnimux/src/media/gateway-upload.js` 中的 `hostLocalAssetsIfNeeded` 函数中补充针对声音克隆字段 `prompt_simple` 的自动托管拦截。
- 若 `payload.prompt_simple` 为本地媒体地址（通过 `isLocalMediaSource` 判断，包含本地绝对路径、`file://`、`asset://` 及本地虚拟 API 路径），则自动将其上传到网关的音频存储目录（`audios`），并将返回的公共 HTTPS 直链赋回 `prompt_simple`。
- 严禁影响已为合法公网 HTTPS 链接的参考音频。

## 3. 验收标准（Acceptance Criteria）
1. 单元测试覆盖：当 `payload.prompt_simple` 为本地文件路径时，`hostLocalAssetsIfNeeded` 调用 `uploadMediaToGateway` 上传并替换为公网 URL。
2. 当 `payload.prompt_simple` 已经是公网 `https://` 链接时，保持原值不变。
3. 全面回归：确保现有图片、视频、音频的上传拦截逻辑不受任何破坏。
