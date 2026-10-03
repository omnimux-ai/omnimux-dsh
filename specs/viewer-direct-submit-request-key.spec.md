# 媒体查看器直连生成：提交不得携带本地 taskId（Issue #2986）

## 背景
媒体查看器「立即直连生成」把本地占位 id 当作 `taskId` 发给 `/omnimux/api/media/generate`。
该路由的 `taskId` 语义是「取回已存在的上游任务」，服务端因此跳过提交、直接轮询不存在的上游任务，上游回 400 `task_not_exist`，前端提示 `GET request failed (HTTP 400)`，每次提交都失败。

## 新用户基线
依赖已配置的 OmniMux 官方 API 密钥；缺失时沿用现有凭证错误提示，本修复不改变该路径。

## 用户旅程
1. 打开媒体查看器，选择图像 · GPT Image 2.5 · 标准版。
2. 输入提示词，点击「立即直连生成」。
3. 生成卡片显示生成中，完成后出图；不再出现 `GET request failed (HTTP 400)`。

## 验收
- A1 直连提交请求体不含 `taskId`/`task_id`/`taskRef`。
- A2 每个批次请求携带唯一 `requestKey`（服务端幂等键），值为本地任务 id。
- A3 真实界面提交 GPT Image 2.5 成功出图（CDP 证据）。

## 不在范围
服务端 `taskId` 取回语义、界面文案与布局均不改动。
