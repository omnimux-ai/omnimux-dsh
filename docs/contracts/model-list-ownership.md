---
title: "OmniMux model-list ownership"
id: "contract-model-list-ownership"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-18"
updated: "2026-11-09"
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

This contract owns the internal directory and retained technical selectors. It does not make every registered model a public product choice. Ordinary character creation follows [product positioning](product-positioning.md); hiding IDs and automatic group matching are product requirements, not proof that existing selectors or request schemas have changed.

The app's OmniMux model list has two authorities with different jobs. **Who is on sale and what each gateway model exposes are owned by the gateway snapshot and its Gateway Contract v2** — membership, operations, input slots, parameters, `context_window_tokens`, `max_output_tokens`, `input_modalities`, `tool_calling`, `streaming`, `prompt_caching`, reasoning metadata, status and unknowns. The hub's four catalog lists expose every gateway-public model (snapshot model with an enabled group) plus user custom model profiles. Local adapter support is reported as `executionStatus` and never hides a row; the canvas no longer applies `canvasHiddenModels` or a local whitelist. See [Composer list membership](#composer-list-membership).

The local `specs/*.yaml` remain the adapter/fallback layer: they own implementation profiles, seams, labels, conservative local safety caps, and the old no-v2 behavior. `plugins/omnimux/cordis.patch.yml` keeps only the provider transport shell and a bootstrap row so `llm-pi-ai` can mount before settings are ready; it is not the field authority for a gateway-public model. The runtime merge is `plugins/omnimux/src/catalog/runtime-index.js`; see [Gateway Contract v2 overlay](#gateway-contract-v2-overlay).

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

## What the gateway contract and plugin patch own

- The gateway contract owns the model's declared capability envelope,
  including operations, input slots, parameters, context window, output cap,
  modalities, tool/streaming/caching flags, reasoning metadata and `unknowns`.
  Undocumented values remain unknown; do not infer them through requests.
- The `omnimux` provider row under `llm-pi-ai` (`apiKeyEnv`, `baseURL`, `api`)
  and one bootstrap model row belong to the plugin patch. The bootstrap row is
  only a startup fallback; `composer-sync` replaces the rendered list with the
  gateway directory after settings are ready, and an id the hub no longer lists
  disappears from the composer.
- Input modalities and reasoning efforts. Historical observations in
  `docs/evidence/2026-08-18-omnimux-modality.md`,
  `docs/evidence/2026-08-20-omnimux-reasoning.md` and
  `docs/evidence/2026-08-23-omnimux-brand-four.md` remain execution records, not
  a requirement to repeat calls or a substitute for channel documentation. A
  narrower current adapter is an implementation gap, not evidence that the
  channel lacks the capability.
- The one-shot expert whitelist (`plugins/omnimux/src/text/catalog.js`
  `CHAT_MODELS`) is a projection of the chat directory. Since 2026-10-21
  (#3527) it projects only text models with a **listed** text output, so a
  contracted-but-unlisted model never re-enters the expert whitelist. The
  gateway snapshot remains the membership authority; a local flag never decides
  what is on sale. `pnpm verify:models` stays an offline self-check of
  projection ↔ shipped snapshot agreement (it reads
  `plugins/omnimux/src/catalog/cloud/bundled/pricing.json`, needs no credential
  and makes no request since #3763); it is not a membership authority.
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
    一致性校验，`--strict` 红灯）；`catalog-defaults.json` 仅作为离线兜底，
    在线默认由 gateway recommendation / ready catalog row 解析。运行时 limits
    以网关 Contract v2 与渠道官方文档为准，不取实测样本或跨渠道更严值。
  - **聊天 composer 模型列表**的字段真源是本文件所述 gateway contract 的
    `executionProfile`；`cordis.patch.yml` 只提供 provider transport 和启动
    bootstrap。其**成员资格**由 hub 已上架目录 + `composerHiddenModels` 在
    运行时收窄（见 [Composer list membership](#composer-list-membership)）。
- **Display labels** (UI aliases) are separate from routing ids. Labels MUST
  follow [model-display-label.md](./model-display-label.md): no `-` in the
  visible model name; brand casing preserved (`Claude Opus 4.6`, `GPT 5.5`).

## Gateway Contract v2 overlay

`plugins/omnimux/src/catalog/cloud/snapshot.js` already preserves each sold model's
`contract` object. `plugins/omnimux/src/catalog/runtime-index.js` merges those
v2 contracts over the local `ContractIndex` for `modelCatalog.list()`:

- **Capability authority** — `operations[].executable` decides admission,
  `inputs[]` decides slots and limits, `parameters[]` decides guard/UI
  parameters, and `status`/`unknowns` travel as metadata. A v2 value is never
  overridden by a local spec.
- **Execution authority** — the local `adapter-profiles.json` must still provide
  a live implementation profile for every executable operation. A model with a
  v2 contract but no matching local profile is reported as
  `gateway.adapterUnsupported` and stays out of every picker; it is not
  misreported as `missingContract`.
- **Cached snapshot supplement** — the live resolver may choose a disk snapshot
  whose `generatedAt` is newer than the bundled floor but whose model contracts
  are still v1. Membership, lines and prices stay from that snapshot; a missing
  v2 contract is supplemented per model from the bundled floor without fetching
  the network or deleting the user's cache.
- **Fallback** — a sold model without a v2 contract in either current or bundled
  snapshot, an invalid v2 object, or a model absent from bundled keeps the old
  local-spec projection. This preserves old installs and makes the overlay fail
  closed.
- **No local YAML for gateway-only models** — `gemini-4-argon` and
  `gemini-3.1-flash-lite-image` are examples: their contract is gateway data,
  their labels/visual metadata are local presentation, and their execution
  profile is local adapter data. Adding a sibling model should normally require
  only gateway contract + adapter profile changes.
- **Local safety caps** — where the gateway does not publish a file-size cap,
  the adapter may retain a conservative local upload cap (for example text image
  attachments). It may tighten a gateway limit, never widen one.
- **Compatibility aliases** — old local operation ids remain read-only aliases
  (`vision_chat` → gateway `chat`, `multi_reference` ↔ gateway
  `image_to_image`). Saved nodes keep working; the gateway operation id remains
  the canonical new id.

## Composer list membership

The chat composer's model list is a settings surface of the `llm-pi-ai` provider
route: `omnimux` is declared there as a configurable provider, and
`providers.omnimux.models` is what the app's selectors render. Membership is
maintained at runtime by `plugins/omnimux/src/catalog/composer-sync.js`, which
writes the composed list once settings are ready and again whenever the
visibility setting changes.

- **Field truth** — the gateway contract's `executionProfile` projection. A
  model's known context window, output cap, modalities, tool/streaming/caching
  flags and reasoning levels travel from the snapshot through
  `/omnimux/model-catalog`; a field the gateway does not declare remains absent.
  No context window, modality, or reasoning level is guessed, because a wrong
  one fails mid-conversation rather than at startup. `cordis.patch.yml` only
  supplies the provider transport shell and a bootstrap row.
- **Membership truth** — the hub's `text` bucket
  (`plugins/omnimux/src/catalog/list.js`, the directory the canvas also
  consumes), which is the **gateway snapshot's on-sale set ∩ the call
  contract**. A model the snapshot does not sell — or one with no callable
  contract — is never written, whatever local configuration says.
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

0. Confirm the model is on sale in the shipped snapshot — read
   `plugins/omnimux/src/catalog/cloud/bundled/pricing.json`, or run
   `pnpm catalog:snapshot:check`. A row the snapshot does not sell never reaches
   any list; if the gateway just started selling it, refresh the snapshot first.
1. For a Gateway Contract v2 model, update the gateway contract and local adapter
   profile only. For a local-only or legacy model, edit `cordis.patch.yml` as the
   fallback. Do not add a duplicate gateway model row to the patch just to make
   it appear.
2. Compare the contract mapper against the selected channel documentation; run
   offline `pnpm verify:model-contracts`, `pnpm verify:models` (projection ↔
   shipped snapshot, no credential, no network) and relevant isolated fixture
   checks. Never probe the service to discover support.
3. Refresh the catalog (`/omnimux/model-catalog` or the manual refresh action) and
   check the composer, Settings → Models and canvas pickers show the new set.

### Cross-plugin closure

Hub models are shared contracts. Adding, re-parameterizing, changing operations of, aliasing, or deprecating a model closes atomically across plugins.

For a model covered by Gateway Contract v2 (the normal path for an on-sale gateway model), steps 1–3 are replaced by the gateway contract itself: the gateway operation must be `executable: true` and the local `adapter-profiles.json` must provide a live profile. Do not add a duplicate local YAML just to satisfy the lifecycle; update the gateway contract / adapter profile instead. The 5-step lifecycle below applies to a local-only model that the gateway does not sell, or to a legacy fallback that has no v2 contract.

When the user requests listing or making a model available to the canvas/consumers, the task MUST execute the 5-step listing lifecycle atomically instead of leaving the model in "draft":

1. **Contract definition**: Register the canonical runtime model ID, brand, operation IDs, inputs, and defaults in the corresponding specs YAML (`plugins/omnimux/src/catalog/specs/*.yaml`).
2. **Authorized live probe**: With user authorization, run a minimal live generation probe against the production gateway to verify existence and minimal response, recording the report in `docs/evidence/`.
3. **Status activation (listed: true)**: Promote the operation's `research.status` from `"draft"` to `"verified"` and set `docUrl` to the evidence doc. The contract loader computes `op.listed = true` only when research is verified with a valid docUrl.
4. **Manifest and consumers**: Register the model in `auto-serving-manifest.json` and give the channel-group display names in `channel-groups.js` (the hub display-override table). Canvas pickers no longer need a separate whitelist edit — every gateway-public model shows, including unsupported rows marked by execution status; custom BYOK rows are merged from `byokProviders[].modelProfiles`. `generationPolicy.ts` only seeds default-model fallbacks and `modeSelection`; it is not an admission gate. Whether the model is actually on sale, which lines it has and what they cost are decided by the gateway snapshot, not by a local flag (`requiredInAuto` was removed in #3734); the catalog lists only models the snapshot sells and the contract can call, and consumers such as the canvas read those lines straight from the catalog projection (#3762) instead of keeping a local mirror (`channelGroups.ts`'s local table was removed). Confirm the shipped snapshot sells it (step 0 above) before claiming it is listed.
5. **Gate verification and materialization**: Run `pnpm verify:model-contracts --strict` and `verify:cross-plugin-models`, land via PR, and run `sync-to-app.sh` so canvas/consumers immediately expose the listed model.

## User layers

A user-layer `cordis.patch.yml` MUST NOT declare `- id: llm-pi-ai`. It sets
`agent-default-model` (provider `omnimux`, a model id from the plugin list).
See the drama profile (`~/.dsh/profiles/drama/cordis.patch.yml`) for the
reference shape.

## Verify

- `pnpm catalog:snapshot:check` — the shipped gateway snapshot is present and readable
  (it prints `generatedAt`; freshness stays a human judgement, and only `--baseline`
  performs a drop comparison). Run it whenever the gateway catalogue may have moved;
  the snapshot is the on-sale floor every install serves.
- `pnpm verify:model-contracts` — offline contract/schema/profile consistency,
  **plus the snapshot gates it already runs**: the baseline drop gate
  (`auto_serving_snapshot_model_dropped` — a model the previous shipped snapshot
  sold may not silently disappear, only a reviewed
  `snapshotDropAcknowledged` entry may), and the listed ↔ on-sale
  reconciliation (`gateway_missing_contract_drift`, comparing
  `catalog.gateway.missingContract` against the bundled snapshot). A v2
  `executable` operation counts as contract-listed here even when a local
  adapter is missing; adapter gaps are surfaced separately as
  `catalog.gateway.adapterUnsupported`. Verify patch-specific field mapping with
  isolated fixtures as needed. Online existence and real-generation scripts are
  not acceptance requirements.
- `dsh --profile <name> --dump-config` — the composed `llm-pi-ai` provider
  block must come from `omnimux` (dump headers name the patching layer),
  and no `omnimux-compat` provider may exist anywhere.
