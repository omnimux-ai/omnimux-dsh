# suno — text_to_music 契约与上架证据（2026-10-21）

- Issue: #3516
- 渠道真源：`OmniMux@6a7affff7` `scripts/ops/config-baseline/channels.json` 渠道 32（`[优选中转-APIMart] 多模态视频音乐专线`，`status=1`，group `default`，models 含 `suno`）。
- 契约真源：`OmniMux-docs@57b1e0b` `zh/api-reference/video-series/models/suno.mdx`（异步媒体任务；`/v1/video/generations` 提交，`model=suno`）。
- 计费：`options.json` `ModelPrice["suno"]=0.075556` USD/次（`default` 组倍率 1.0）。
- 中枢实现：`audioGenerate` profile/seam 已挂载（`adapter-profiles.json` operations 含 `text_to_music`）；提交路径 `media/execute.js`。
- 说明：本次为离线文档 + 网关能力证据，未发起真实生成请求；`execution.status` 保持 `stub`，不声明真实执行。
