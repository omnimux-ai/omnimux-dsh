# whisper-1 — speech_to_text 契约与上架证据（2026-10-21）

- Issue: #3516
- 渠道真源：`OmniMux@6a7affff7` `scripts/ops/config-baseline/channels.json` 渠道 31（`[优选中转-APIMart] 语音识别专线`，`status=1`，group `default`，models 含 `whisper-1`）。
- 契约真源：`OmniMux-docs@57b1e0b` 语音识别系列（OpenAI Whisper 兼容 `POST /v1/audio/transcriptions`；中枢 `speechToText` seam）。
- 计费：`options.json` `ModelPrice["whisper-1"]=0.015` USD/次。
- 中枢实现：`speechToText` profile/seam 已挂载；`media/stt.js` 走上传/直传路径；`promptPolicy=none`。
- 说明：本次为离线文档 + 网关能力证据，未发起真实转写请求；`execution.status` 保持 `none`，不声明真实执行。
