# 规格：音视频官方及本地内置模型放行判定与凭据路径修复

## 变更背景
用户在工作流画布中执行音频生成（选择 Gemini 3.8 即 gemini-3.8-flash-tts）和视频生成时，界面抛出报错：
[omnimux:omnimux-request-failed] 尚未配置图片、视频和音频，当前运行方式不能使用这一项。

## 根本原因
1. 模型判定过于狭隘：在 mount.js 和 execute.js 中仅依赖 getModelChannelGroups 判断官方模型，导致在册官方模型（gemini-3.8-flash-tts, index-tts, kling-v3 等）被误判。
2. 本地 CLI 语音模型放行缺失：gemini-3.8-flash-tts 是本地 opencli 命令行驱动模型，免远程鉴权，在 Agent 模式下应直接放行。
3. 凭据搜索目录盲区：mount.js 缺少 ~/.omnimux-dev 目录。

## 修复方案
1. mount.js 与 execute.js 对齐 findMediaModel / mediaModelIds，支持所有在册官方模型判定。
2. 本地 CLI 语音模型（gemini-3.8-flash-tts）在 Agent 模式下安全放行。
3. resolveSyncOfficialToken 凭据搜索路径补齐 ~/.omnimux-dev。
