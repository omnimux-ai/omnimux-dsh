# 执行中枢模型目录对齐 OmniMux 网关 2026-10-21 现役配置

- Issue: #3516
- 日期: 2026-10-21
- 上游只读真源: `OmniMux@6a7affff7`（channels.json/models.json/options.json，2026-10-19/20）、`OmniMux-docs@57b1e0b`（2026-10-20）
- 中枢基线: `origin/main`（本工作树基线）
- 用户裁决: 全量对齐（A）+ seedance 积分按网关实际扣费口径

## 1. 背景与证据

2026-10-21 只读对账结论（详见 `docs/evidence/2026-10-21-hub-gateway-drift-audit.md`）：

1. 网关 64 条渠道中仅 17 条 `status=1`；`62f7d5dcd`（2026-10-07）一次性将 39 条渠道 1→0，实际可路由产品模型 17 个。
2. 中枢上架 16 个模型，其中 9 个已无任何启用渠道（Claude、H3 全系、TTS/ASR/声音克隆、Flare/Sunburst），调用必然 503。
3. 分组漂移：`seedance-2-5` 现役分组为 `seedance-2-5-480p/720p`，中枢仍用 `default` 与已删除的 `seedance-2-5-task-pro`；`gpt-image-2.5-pro`、`gpt-image-2.5-flare-std`、`gpt-image-2.5-sunburst-std`、`minimax-h3-video-fast/-pro`、`seedance-2-0-task-pro` 等分组已在上游删除。
4. 现役但产品未提供的能力：`suno`/`suno-sounds`（音乐/音效）、`whisper-1`（ASR）、`nano-banana-2/-pro`、`kling-v2-6/-v3` 等。

## 2. 方案

1. 不可达模型转为「仅登记」：保留完整契约、research 与历史 execution 证据，把 op 的 `implementation.status` 置 `none`，使 `listed` 为 false；不删除契约，不伪造下架。
2. 在售模型分组对齐现役：
   - `seedance-2-5`: `480p`/`720p` 两档，wireGroup 直连现役分组；积分按 `ModelPrice 0.8 USD/s × GroupRatio` 的实际扣费口径（5s 基准）。
   - `seedance-2-0`: 仅 `standard`（wireGroup `default`）；`-fast`/`-mini` 仅 `standard`。
   - `gpt-image-2.5`: 保留 `standard`（default）+ `economy`，移除无渠道的 `pro`。
   - `gemini-3.8-flash`: 仅 `standard`（default），移除无渠道 `cheap`/`pool`。
   - `seedream-5-0-pro`: 补 `standard`（default，per_task）。
   - 移除不可达模型（H3/Claude/Flare/Sunburst/Seed Audio）的分组，避免暴露死分组。
3. 能力补位：`suno`（text_to_music）与 `whisper-1`（speech_to_text）按渠道文档证据转 verified+ready 上架，避免音频能力真空；`gemini-4-argon` 仅原生 Gemini 端点、OpenAI 协议不可直连，保持登记不开放。
4. 原子闭环：`channelGroups.ts` 镜像、canvas `generationPolicy`、`auto-serving-manifest.json`、`catalog-defaults.json`、`DEFAULT_MEDIA`、viewer/apps 静态回退表同步更新。
5. 不修改网关仓库、不发起真实模型请求；上游 `seedance-2-5` 定价单位疑似缺陷只记录不修。

## 3. 验收

- `node scripts/verify-model-contracts.mjs --strict`：0 error。
- `pnpm verify:cross-plugin-models`、`pnpm verify:group-pricing`、`pnpm verify:modality-matrix`、`pnpm verify:multimodal-contracts` 通过。
- `pnpm --filter omnimux test`、`pnpm --filter omnimux-workflow test` 通过。
- 目录投影中不出现无现役渠道的 listed 模型；画布/会话默认模型均可达。

## 假设

- 网关 `channels.json`（2026-10-19 从生产 MySQL 拉取）与 `options.json`（2026-10-18）代表当前生产可路由面；`status=0` 渠道不参与 abilities 生成，因此对应模型不可调用。
- 中枢发送的模型 ID 为产品/公开 ID，分组仅经 `X-Omnimux-Group` 头下发；因此「模型可达」判据是存在 `status=1` 渠道同时绑定该模型与该分组。
- 被停用渠道是业务收敛而非永久下线，故只降级为「仅登记」，保留契约与证据，上游恢复后仅需回填 op 状态。

## 证伪方式

- 若 `sync-baseline.js --diff` 或生产 `/api/pricing`/`/v1/models` 显示上述模型或分组仍可达，则「不可达」结论被证伪，应恢复对应 listed 状态并回滚分组改动。
- 若 `verify-model-contracts --strict` 或画布镜像门禁报出契约/镜像不一致，说明同步不完整，需按门禁指出的路径补齐。
- 若画布实测在无 H3/TTS 情况下出现空模型列表或默认模型不可用，说明 curation/defaults 未同步到位，按实际目录输出修正。
