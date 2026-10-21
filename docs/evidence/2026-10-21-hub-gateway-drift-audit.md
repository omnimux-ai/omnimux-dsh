# 中枢 ↔ OmniMux 网关现役配置对账（2026-10-21）

- Issue: #3516
- 方式：只读离线比对；未调用真实模型 API，未修改网关仓库。
- 网关真源：`OmniMux@6a7affff7`，`scripts/ops/config-baseline/{channels,models,options}.json`（2026-10-19/20 `--pull` 自生产 MySQL）
- 契约真源：`OmniMux-docs@57b1e0b`（2026-10-20，`zh/api-reference/**`、`zh/updates.mdx`）
- 中枢基线：`omnimux-dsh@471206b64`

## 1. 可路由判据

渠道 `status=1` 才生成 abilities（`model/ability.go`），`/v1/models` 与 gate 选择均以 abilities 为准；`models` 表行只是公开元数据。中枢请求体携带公开模型 ID，分组经 `X-Omnimux-Group` 头下发，因此「模型可达」= 存在 `status=1` 渠道同时绑定该模型与分组。

## 2. 关键事实

| 事实 | 证据 |
|---|---|
| 网关 64 条渠道仅 17 条 `status=1`；`62f7d5dcd`（2026-10-07）一次性将 39 条渠道 1→0（生产"业务收敛"） | `channels.json`；`git show 62f7d5dcd` |
| 可路由产品模型 17 个；中枢此前上架 16 个，其中 9 个已无启用渠道 | `channels.json` abilities 并集；中枢 `listedOperations` |
| `claude-sonnet-4-6` 仅绑定渠道 7/9/55/76，全部 `status=0` | `channels.json` |
| `minimax-h3` 系列仅绑定 44/47/70/71/72，全部 `status=0` | 同上 |
| 音色/ASR/克隆仅绑定 43/70，全部 `status=0` | 同上 |
| `gpt-image-2.5-flare/-sunburst` 仅绑定 63-66，全部 `status=0`；上游已删除其专属分组 | 同上；`options.json` |
| `seedance-2-5` 现役分组为 `seedance-2-5-480p`/`-720p`（渠道 77-80）；中枢旧分组 `default`/`seedance-2-5-task-pro` 后者已被上游删除 | `channels.json`; `options.json` |
| `gpt-image-2.5` 现役分组 `default`（渠道 37）+ `gpt-image-2.5-economy`（渠道 15/67）；`gpt-image-2.5-pro` 已删除 | `channels.json`; `options.json` |
| `gemini-3.8-flash` 现役仅 `default`（渠道 39）；`cheap`/`pool` 无启用渠道 | 同上 |
| `suno`/`suno-sounds` 渠道 32 default 可达；`whisper-1` 渠道 31 default 可达 | 同上 |
| `seedream-5-0-pro`、`nano-banana-2/-pro`、`kling-v2-6/-v3` 等渠道可达但 `models.json` 无公开行（abilities 仍暴露） | `channels.json`; `models.json` |
| `gemini-4-argon` 仅原生 Gemini 端点（`generateContent`/`streamGenerateContent`），OpenAI chat-completions 不适用 | `OmniMux-docs` `text-series/gemini/native-generate.mdx`（2026-10-18） |

## 3. 积分口径（按用户裁决：实际扣费）

`fixed(x)` 计费表达式实际按 $x 计费；任务视频按 `ModelPrice(USD/s) × GroupRatio × seconds`：

| 模型 | 实际扣费 | 中枢积分（1 USD = 10 积分，5s 基准） |
|---|---|---|
| `seedance-2-5` 480p | $0.8/s × 0.524 = $0.4192/s | 21 |
| `seedance-2-5` 720p | $0.8/s × 0.7206 = $0.57648/s | 29 |
| `seedance-2-0` | $0.0971/s | 4.9 |
| `seedance-2-0-fast` | $0.059022/s | 3 |
| `seedance-2-0-mini` | $0.0157/s | 0.8 |
| `gpt-image-2.5` default | `fixed(0.013072)`/张 | 0.13 |
| `gpt-image-2.5` economy | 0.013072 × 0.112455 = $0.0014701/张 | 0.01 |
| `seedream-5-0-pro` | $0.064286/张 | 0.64 |
| `suno` | $0.075556/次 | 0.76 |
| `whisper-1` | $0.015/次 | 0.15 |

上游疑点（只记录、不在本仓修复）：
1. `seedance-2-5` `ModelPrice` 于 `62f7d5dcd` 由 0.3143 改为 0.8，但 `UserUsableGroups` 展示文案仍为 ¥1.12/¥1.54 每秒；按代码实际扣费约 ¥2.85/¥3.92 每秒，疑似把 CNY 值写入 USD 字段。
2. `gpt-image-2.5` `ModelPrice=0.3` 不会被扣费（`billing_expr` 优先）。
3. `models.json` 中 `suno-sounds` 重复两行。
4. `UserUsableGroups` 仍有 27 个无启用渠道的分组；文档站仍宣布 9+ 个已不可达模型。

## 4. 本次同步动作

1. 9 个不可达模型的全部 listed op 转「仅登记」：`claude-sonnet-4-6`、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`、`minimax-h3`、`doubao-asr-bigmodel`、`seedasr-auc`、`seed-audio-1.0`、`gemini-3.8-flash-tts`、`indextts-2`。契约、research 与历史 execution 证据保留。
2. 现役模型分组重写为网关现役 names，并移除死分组：seedance 2.5 480p/720p、seedance 2.0 系 default、gpt-image-2.5 default/economy、gemini default、seedream default、suno default。
3. `suno`（text_to_music）与 `whisper-1`（speech_to_text）按渠道文档证据转 verified+ready 上架，填补音频能力；`gemini-4-argon` 因原生端点不兼容保持登记不开放。
4. 画布镜像、白名单、默认模型、auto-serving manifest、DEFAULT_MEDIA 同步。
5. 积分按实际扣费口径更新。

## 5. 未做与边界

- 未修改 `OmniMux` / `OmniMux-docs`；未发起真实模型请求；未替上游裁决 `seedance-2-5` 定价单位。
- 上游恢复渠道后，回填对应 op 的 implementation 状态与分组即可恢复上架。
