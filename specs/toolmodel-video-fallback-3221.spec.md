# 任务规格 · #3221 分镜表/拆解对配置工具模型的用户始终 502

## 现象
`omnimux.toolModel` 配置为 `cpa:*`（会话模型）后，画布「视频内容拆解」「分镜表」接口对任意合法本地视频都返回 502「视频文件不满足理解要求」。

## 根因
`executeOmnimuxText` 里 `toolModel` 短路分支在拿到任意引用时就接管请求，随后因「tool model only accepts text and image input」抛出 `omnimux-invalid-request`；错误经 `mapHubError` → `describeVideoAnalyzeFailure` 后归一为「视频文件问题」，掩盖了真实原因。工具模型通道的 ctx.llm.stream 附件类型物理上无法携带视频 MIME，本就不该拦截视频/音频/文档引用。

## 修改点（唯一）
`plugins/omnimux/src/text/execute.js`：toolModel 短路仅当 `references` 全为空或全为 `image` 时生效；含 video/audio/document 引用的请求跳开该分支，继续走既有多模态路由（官方通道或 BYOK）。

## 验收
1. 含视频引用 + toolModel 已配置 → 不再抛 `omnimux-invalid-request`，改走多模态通道（本测试里到网关或报 needs-omnimux，绝不报「视频不满足理解要求」）。
2. 纯文字 / 图片请求仍走 toolModel 通道（行为不变）。
3. toolModel 损坏/空值时文字请求仍大声报错。

## 新用户基线
未配置 toolModel 的用户不受影响；配置后仅「纯文字+图片」请求走工具模型，多模态理解仍按渠道选择走，行为与未配置一致。
