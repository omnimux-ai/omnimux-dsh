---
title: "OmniMux model-list ownership"
id: "contract-model-list-ownership"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-18"
updated: "2026-09-05"
authors: ["x", "agent-architect", "gao-jianyuan"]
subsystem: "omnimux"
tags:
  - "model-list"
  - "catalog"
  - "cordis-patch"
supersedes: []
superseded_by: null
related:
  - "docs/contracts/model-api-authority.md"
  - "docs/contracts/hub.md"
  - "docs/contracts/model-capabilities-matrix.md"
  - "docs/specs/2026-09-04-model-io-contract-compatibility-design.md"
---

# OmniMux model-list ownership

The app's OmniMux model list has one **field authority**: `plugins/omnimux/cordis.patch.yml` says what every model looks like — wire parameters, modalities, context windows, reasoning efforts. Membership of the chat composer list is a separate, dynamic concern: at runtime the hub narrows the list to the models it currently lists, and the `composerHiddenModels` setting can subtract further. See [Composer list membership](#composer-list-membership).

Model modes, input modalities, limits and wire parameters MUST follow the selected channel's official API documentation under [model API authority](model-api-authority.md). EvoLink and APIMart are the primary channels. Do not issue real model requests for research or contract acceptance. Historical measurements below do not define current channel support.

## Why one owner

`llm-pi-ai` is a row in the composed config. Every layer that patches it by id
(`- id: llm-pi-ai`) **replaces the whole row** — the loader matches by id and
swaps the entire `config`, it does not merge. So a machine-local
`cordis.patch.yml` that re-declares the row with a different model subset
silently shadows the plugin's list: the app then shows whatever the local
layer wrote, and the plugin's (correct, live-verified) list disappears. That
is exactly the bug this file documents: the web profile's local layer once
declared `omnimux-compat` with stale context windows (131072/200000/262144
that the gateway does not document) and hid the plugin's list.

Layer order (later wins on id match):

1. bundle patches (each `dsh.profile.bundles` entry, `omnimux` ships its
   patch here)
2. profile-local `cordis.patch.yml` (`~/.dsh/profiles/<name>/cordis.patch.yml`)
3. `$DSH_HOME/cordis.patch.yml`
4. launcher `--patch` overlays

The plugin patch lives at layer 1, so any layer-2+ re-declaration wins. Keep
it that way: user layers set `agent-default-model` only.

## What the plugin patch owns

- The `omnimux` provider row under `llm-pi-ai` (`apiKeyEnv`,
  `baseURL`, `api`).
- The model list and context windows. Resolve the actual channel, model ID and
  endpoint, then record the corresponding official API documentation and date.
  Undocumented values remain unknown; do not infer them through requests.
- Input modalities and reasoning efforts. Declare the selected channel's documented
  fields, enums and conditions, then verify adapter mapping offline. Historical
  observations in `docs/evidence/2026-08-18-omnimux-modality.md`,
  `2026-08-20-omnimux-reasoning.md` and `2026-08-23-omnimux-brand-four.md`
  remain execution records, not a requirement to repeat calls or a substitute
  for channel documentation. A narrower current adapter is an implementation
  gap, not evidence that the channel lacks the capability.
- The one-shot expert whitelist (`plugins/omnimux/src/text/catalog.js`
  `CHAT_MODELS`) is a subset of this patch list, and its `input` matrix must
  agree with the patch. `verify:models` fails on any mismatch or if a
  whitelist id is missing from the patch.
- Deployment / instance gating for the expert whitelist only:
  `Config.gate.models.textComplete.<id>` can hide a whitelist row from
  `omnimux_text_complete` without editing `cordis.patch.yml`. A model is
  callable iff `text.models[].enabled !== false` **and**
  `gate.models.textComplete[id] !== false`. The `Config.gate` layer does **not**
  filter the chat composer model list — that list follows the hub's listed
  directory instead, as [Composer list membership](#composer-list-membership)
  describes.
- Canvas / workflow generation catalogs are **not** this chat list. They are
  owned by the execution-hub directory seam `modelCatalog.list()`
  (`plugins/omnimux/src/catalog/list.js`). `GET /omnimux/model-catalog` is
  **HTTP bridge only** to the same `list()` body. Workflow MUST consume that
  seam (via workflow `/api/capabilities`) and MUST NOT hardcode production
  fallbacks or live-fetch `api.omnimux.ai/v1/models` for the canvas. Sort is
  by display name A–Z. Defaults for new nodes: env overlay → Settings
  top-level fields (`defaultTextModel` / `defaultImageModel` /
  `defaultVideoModel` / `defaultAudioModel`) → hub Config defaults → first
  sorted id. Existing node `params.model` is kept (deprecated badge if
  absent from catalog).
- **Canvas catalog evolution (H1 shadow / H2 switch)** — see
  [model I/O design](../specs/2026-09-04-model-io-contract-compatibility-design.md)
  and [MCC](./model-capabilities-matrix.md):
  - **H1（#464）**：契约机器真源（`operation-registry.json`、
    `model-capability.schema.json`、`adapter-profiles.json`、YAML specs）+
    shadow loader / admission / `pnpm verify:model-contracts`（admission 严格、
    coverage 审计）。**research / execution / listed 以 operation 为原子**；
    coverage 报告 `listedOperations`（`modelId#operationId`）；`model.listed`
    仅为摘要。Model capability 文档根 canonical 字段为 **`schemaVersion: "1.1"`**
    （Contract v1.1；**不是**根 `version`；legacy `version` 仅 loader 输入迁移；
    index/report 只暴露 `schemaVersion`）。**现有实文件 specs 在 H1 必须
    `listedOperations = []`**（不审计、不宣称厂商 live 事实；verified/live 正例
    仅 fixtures）。**不改变** `buildModelCatalog` 的 runtime 投影；列表仍来自
    `CHAT_MODELS` + `src/media/catalog.js` SPECS。H1 **不做** runtime
    constraints / mapper 对账（属 H2；零 listed 防止污染选择叙事）。
  - **H2（#465，2026-09-04 历史快照）**：`buildModelCatalog` 已切契约投影（Catalog v1.1）——
    权威为扁平 `models[]`（透传 operations/research/execution/aliases/
    parameters + `disposition` 治理字段），四列表（text/image/video/audio）
    **仅**按可见（listed）op 的 `output.type` 派生（`speech_to_text` 产出
    text → 入 text 桶）。旧 `CHAT_MODELS` / `src/media/catalog.js` SPECS
    硬编码行已物理删除，两文件为**投影 facade**（目录语义：含未上架契约行；
    契约解析/准入/处置表失败顶层 throw，无回退）。43 个 runtime ID 的治理
    处置由 `src/catalog/contract/dispositions.json` 机器真源承载（D1–D7
    一致性校验，`--strict` 红灯）；`catalog-defaults.json` 持有
    `defaultsByOperation` 权威默认。当时 runtime limits 按保守策略写入 YAML；该历史策略不定义渠道上限。
    后续对账以渠道官方文档为准，不取实测样本或跨渠道更严值。**cordis 交叉验证**：verifier 断言本
    patch 的 composer id 均可 resolve 到契约 canonical/alias
    （`cordis_unresolvable_model`），patch 内容本身不动。seam 载荷携带
    `operations[]`（string id + per-op status/listed metadata）。此后
    JS SPECS / workflow `BUILTIN_*` 不得再作为能力真源（绞杀时间盒见设计）。
  - **聊天 composer 模型列表**的字段真源仍是本文件所述 `cordis.patch.yml`；
    其**成员资格**由 hub 已上架目录 + `composerHiddenModels` 在运行时收窄
    （见 [Composer list membership](#composer-list-membership)）。H1/H2 **不**把
    canvas contract 投影写进 patch，也 **不**用 canvas 目录直接替换 composer 列表。
- **Display labels** (UI aliases) are separate from routing ids. Labels MUST
  follow [model-display-label.md](./model-display-label.md): no `-` in the
  visible model name; brand casing preserved (`Claude Opus 4.6`, `GPT 5.5`).

## Composer list membership

The chat composer's model list is a settings surface of the `llm-pi-ai` provider
route: `omnimux` is declared there as a configurable provider, and
`providers.omnimux.models` is what the app's selectors render. Membership is
maintained at runtime by `plugins/omnimux/src/catalog/composer-sync.js`, which
writes the composed list once settings are ready and again whenever the
visibility setting changes.

- **Field truth** — the shipped `cordis.patch.yml` profile. A model's row is
  copied verbatim from the composition `base` layer, so this sync never invents
  wire parameters. A hub-listed model the profile does not describe is added with
  its id and label only: no context window, modality, or reasoning level is
  guessed, because a wrong one fails mid-conversation rather than at startup.
- **Membership truth** — the hub's listed `text` bucket
  (`plugins/omnimux/src/catalog/list.js`, the directory the canvas also
  consumes). A model the hub does not list is never written, whatever local
  configuration says.
- **User subtraction** — the `composerHiddenModels` settings field. It removes
  ids from the hub's set and can never add one, which is what makes an unlisted
  model unrecoverable by configuration.
- **Fail-closed** — an empty hub bucket, an absent namespace, or a refused write
  leaves the last accepted list serving. No path empties the list.
- **Idempotent** — a target equal to the stored list is not rewritten, so a sync
  does not churn the settings document.
- **Reversible** — the write is an ordinary settings user layer: removing it
  restores the shipped list, and an id-matched `cordis.patch.yml` row still wins
  on every field.

## Changing the list

1. Edit `plugins/omnimux/cordis.patch.yml` (provider row + models).
2. Compare the patch and mapper against the selected channel documentation; run
   offline `pnpm verify:model-contracts` and relevant isolated fixture checks.
   Do not run `verify:models`: it can load a key and query the real service.
3. Restart the app (patches resolve at every launch) and check the Settings →
   Models list shows the new set.

## User layers

A user-layer `cordis.patch.yml` MUST NOT declare `- id: llm-pi-ai`. It sets
`agent-default-model` (provider `omnimux`, a model id from the plugin list).
See the drama profile (`~/.dsh/profiles/drama/cordis.patch.yml`) for the
reference shape.

## Verify

- `pnpm verify:model-contracts` — offline contract/schema/profile consistency.
  Verify patch-specific field mapping with isolated fixtures as needed.
  Online existence and real-generation scripts are not acceptance requirements.
- `dsh --profile <name> --dump-config` — the composed `llm-pi-ai` provider
  block must come from `omnimux` (dump headers name the patching layer),
  and no `omnimux-compat` provider may exist anywhere.
