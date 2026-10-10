---
title: "Execution hub"
id: "contract-hub"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-16"
updated: "2026-10-09"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# Execution hub

## 角色创作与内部路由要求

普通用户体验见[产品定位](product-positioning.md)。中枢保留多渠道与多模态执行，不把内部目录直接作为角色创作菜单。

模型调用的执行要求是：内部明确模型与分组，拒绝裸模型 ID 请求；模型能力与分组均对齐所选上游；同组允许多渠道容错，按低价优先路由。用户不选组不等于请求无组。组内候选仍须完整满足素材与任务合同；低价不能覆盖能力、授权或数据边界。

下文可省略 `model`、不含分组的接缝示例，以及旧默认模型集合，保留为既有技术描述，不是可直接提交的现行角色创作请求模板。本次仅同步文档要求，没有验证所有工具、接缝与配置已满足显式组或自动匹配；差异须由所属实现任务提供同版本证据，不在文档中补造字段或声称已完成。


Normative I/O for `omnimux` and every vertical/domain plugin. Status of a live surface is [capabilities.md](../capabilities.md). Rationale: [2026-08-16 hub I/O and facilities](../decisions/2026-08-16-hub-io-and-facilities.md).

## Terms

| Term | Means | Must not be called |
|---|---|---|
| Execution hub | `omnimux`. Product chrome, identity, model routes, media seams, official-only tools, Apps shell | Gateway, 网关, OmniMux cloud, a vertical |
| Domain Plugin | One scene plugin (`omnimux-workflow`, `omnimux-products`, `omnimux-clip`, etc.). Owns its store and tools | Hub sibling, second chrome/auth package |
| Neutral seam | `ctx.provide` / `ctx.get` interface a third-party adapter may satisfy | An `omnimux_*` official-only tool |
| Official-only tool | `omnimux_*` tool that exists only because OmniMux cloud implements it | A swap-in provider |
| OmniMux cloud | Hosted HTTP at `omnimux.ai` and `api.omnimux.ai` | The hub plugin |

Do not call the hub a gateway. Do not implement a second OmniMux HTTP client inside a vertical.

## I/O

```text
vertical tool  --input-->  ctx.get('<seam>') | omnimux_* tool
                         hub holds keys + HTTP + poll + download
vertical tool  <--output--  { mode, taskId?, url? } or a thrown error
vertical disk  <--only the vertical writes its own files
```

- A vertical sends a request (prompt, dest, ids, signal). It does not open sockets to OmniMux and does not read `OMNIMUX_*` secrets.
- The hub returns a result object or throws. It does not write `series/`, 货盘, or any other vertical store.
- Missing hub: the vertical stubs from its own explicit fixture, or throws `needs-provider`. It must not pretend a model ran.
- Official-only tool and OmniMux is not configured or the user is not signed in: throw `needs-omnimux`. Do not return 500 or a successful empty value.
- Apps and other plugins consume the same seams. They must not import `omnimux` internals.

Chat stays on the dsh LLM surface (`llm-pi-ai` `omnimux` route). The hub must not register a parallel chat tool. A one-shot expert completion (`textComplete` / `omnimux_text_complete`) is not chat: text/image runs one `ctx.llm.stream` call with no tools and no parent messages; **video** bypasses stream/attachments and POSTs `/v1/chat/completions` with `image_url` + `data:video/…` (harness `ImageMediaType` cannot store video MIME).

## Media layers

One generation seam, many vendors and HTTP bodies. Do not put vendor fields or protocol paths on the seam. Do not copy OmniMux cloud channel types (Kling `50`, Gxgen `61`, …) into the hub.

```text
vertical / omnimux_* tool
        │  { prompt, dest, duration?, image?, provider?, model?, signal? }
        ▼
1. Capability   videoGenerate / imageGenerate     stable I/O
        ▼
2. Route        Config.media + request            providerId + modelId + protocol
        ▼
3. Protocol     openai-media / later              HTTP path, submit, poll
        ▼
4. Vendor map   omnimux / later                   field names, envelope, extra headers
        ▼
5. Job          submit handle / poll / download
        ▼
     { mode: "live" | "submitted", taskId, url? }
```

| Layer | Owns | Must not own |
|---|---|---|
| Capability | dest, prompt, optional `image` / `duration` / `taskId` / `wait`, result | base URL, API key, `/v1/…` path |
| Route | `Config.media.providers`, default provider, model id per capability | channel integers, billing |
| Protocol | how to speak HTTP (`openai-media` today) | OmniMux-only envelope quirks |
| Vendor map | catalog defaults, pick `task_id` / URL, talking-head extras | a second seam |
| Job | submit handle, poll by `taskId`, write dest | a task table, task UI, `ctx.jobs` |

`execute` job handle:

| Call | Result |
|---|---|
| `{ prompt, dest }` or `wait: true` | submit, poll, download → `{ mode: "live", taskId, url }` |
| `{ prompt, dest, wait: false }` | submit only → `{ mode: "submitted", taskId }` unless the provider already returned a URL (then `live` + download) |
| `{ dest, taskId }` | skip submit; poll + download → `{ mode: "live", taskId, url }` |

Session-visible background work stays on dsh `ctx.jobs`. The hub owns the media execution ledger at `$DSH_HOME/omnimux/media-tasks`: it persists the accepted upstream task and actual provider/protocol/origin/model/group/credential reference before waiting or downloading. It never stores credential values. Domain plugins persist the returned `taskRef`/`taskId` only as references and UI projections, not as a second source of provider terminal state.

Collection uses the recorded execution route and resolves its current credential through the official credentials seam before any new-submission configuration, source-asset or catalog checks. Console login access tokens are not renamed into media API keys. Official media uses `OMNIMUX_API_KEY` / `OMNIMUX_TOKEN` API credentials in the current environment; no cross-profile disk search supplies media auth. A missing media API credential fails explicitly without submitting a paid request.

Only an explicit upstream terminal failure ends an accepted task as `failed`; authentication, transport, cancellation, timeout and artifact-download interruptions retain its handle and collection diagnostics. Direct HTTP errors include the original `taskRef` and `recoverable` fact. Consumers may collect an uncertain task again but may not infer a new paid intent from HTTP status or translated message text. Completed artifacts cannot be overwritten by a late collector error. Reusing a request key recovers existing work rather than submitting again; synchronous and asynchronous paths persist accepted handles alike.

`t2v`, `i2v`, talking-head are **variants** of `videoGenerate` (optional `image` and speech fields). They are not new seams and not new providers.

A vertical omits `provider` and `model` unless it must pin one. The hub fills them from `Config.media`. Unknown provider or protocol fails at resolve, not mid-HTTP.

```text
media:
  defaultProvider: omnimux
  providers:
    omnimux:
      protocol: openai-media
      baseUrl: https://api.omnimux.ai/v1
      apiKeyEnv: OMNIMUX_API_KEY
      models:
        video: seedance-2-0-fast
        image: gpt-image-2
```

`OMNIMUX_BASE_URL` / `OMNIMUX_VIDEO_MODEL` / `OMNIMUX_IMAGE_MODEL` / `OMNIMUX_API_KEY` overlay the `omnimux` row at resolve time. Adding a vendor is a new `providers` row plus `src/media/vendors/<id>.js`. Adding a wire format is a new `src/media/protocols/<id>.js`. Do not grow `apply()` or the seam.

## Generation products and stateless preview

`generationProducts = { list(), preparePreview(request) }` is the hub-owned interface for a public generation-product catalog and complete-request preflight. These requirements define the interface, not deployment or live-generation acceptance. The public product policy exposes only `generation.image` (生图) and `generation.video` (生视频), not a model selector. Its explicit intent whitelist uses canonical registry IDs and labels: image `text_to_image`, `image_to_image`, `multi_reference`; video `video_multi_ref`, `first_last_frame`. Brand names, model prefixes and asset counts must not infer an intent.

This interface is additive. Existing `modelCatalog`, text/audio/media seams, edit/extend/digital-human operations and accepted-task collection keep their contracts. Preview neither migrates operations nor activates models/products; there is no submission endpoint, execution wrapper, admission token, JWT, TTL map or persistent preview cache. Actual execution still requires an explicit real group and eligible same-group routing; preview does not choose a procurement route or expose prices.

### Version 1 request

`RequestV1` is the complete body `{ schemaVersion: 1, currentFingerprint, productId, intent, parameters, assets, prompt? }`. All six non-optional keys are required. Fingerprints are full 64-character lowercase hexadecimal digests. `parameters` is an own field-name record of primitive values: string, boolean, finite number or null. Optional top-level `prompt` is a string. Unknown versions, top-level keys, product/intent combinations and unknown parameter names are rejected, not silently sanitized. Model/group/route, credentials, task/destination, qualification hints, parameter sources, defaults and constraints are not caller fields.

Records must be plain/null-prototype, own enumerable data records; arrays must be dense with no extra properties. Accessors, hidden/symbol properties and extra nested keys are invalid; validation must not invoke getters or mutate the caller. Declared parameter names, including `__proto__`, `constructor` and `toString`, retain safe own-property identity. Explicit parameter `false`, `0`, `null` and `''` remain supplied values, subject to the canonical domain checks.

The sole in-process transport exception is own enumerable data `undefined` on optional top-level `prompt` or on a parameter declared in the applicable definitions' field-name union. After descriptor validation it is absent, with the same source and request fingerprint as omission, and may enter default consensus. Unknown parameters, required top-level fields, asset fields and other nested `undefined` remain invalid. HTTP JSON has no such exception and accepts only the primitive domain.

Assets retain every item, order, duplicate, role and declared origin/version/metadata. The asset whitelist is `pathOrUrl` (required), `type?`, `role?`, `targetSlot?`, `mime?`, `sizeBytes?`, `durationSec?`, `sourceNodeId?`, `edgeId?`, `outputId?`, `outputVersion?`, `originalName?`, `dimensions?`. There is no arbitrary `meta`. String fields must be nonblank without rewriting their values; `outputVersion` is an opaque string. `sizeBytes` is null or a nonnegative safe integer; `durationSec` is null or a nonnegative finite number; dimensions contain exactly positive safe-integer `width` and `height`. Omission and null differ. Unknown/missing asset classification must reach the canonical check, not default to image or disappear. Declared identity is not server verification; preview does not read files, download URLs or synthesize versions. Subsequent provider execution requires anonymous public HTTPS assets.

Top-level `prompt` and explicit `parameters.prompt`, when both supplied, must be exactly equal. One supplied value freezes once. Top-only prompt enters a candidate's parameter transport view only if that candidate declares the prompt parameter; otherwise it remains snapshot text. Explicit `parameters.prompt` is never removed from an undeclared candidate and must fail its normal unknown-field check.

### Current authority and full-candidate judgment

Each call must read one current canonical-contract/registry/registered-options/real-group snapshot and derive every candidate from it. Public DTOs, caller hints, `listed`, document URLs and a live profile are not qualification evidence. Private candidate identity binds canonical model, channel, real group, wire group/model, operation, purpose, protocol and current mapping. A group must exist and be explicitly enabled; no cross-group fallback may supply missing capabilities.

Qualification requires current active evidence matching that complete identity, a fixed official-source/version identity, live-task/output facts and the applicable full input/parameter domain. A historical sample does not prove a larger domain. Missing production qualification is `pending`, not unsupported or ready; known disabled/identity-purpose mismatches are rejected. Explicitly injected eligible fixtures may establish preflight behavior only and must never activate production state.

Current transport identity comes from the same validated media configuration and existing route resolver that the hub's media execution consumes. The private mapping adapter projects only necessary non-secret data, passes no credential fields and uses an empty environment for deterministic resolution. A supplier `routing` declaration in model documentation is not the currently configured transport. `providerId` identifies the registered transport provider; `channelId` requires its own verified supplier/channel binding and must not be synthesized from `providerId`, a YAML supplier name or a cloud channel integer. Each mapping must retain one explicitly enabled real group and its literal wire model/group; no missing or disabled head, alias normalization or cross-group tail can supply qualification.

A mapping carries a full implementation `sourceVersion`, frozen when its module first loads from a fixed set of packaged mapping/identity/route/serving/mapper/protocol sources and the actual packaged `lib/generation-core.js` decision artifact. It identifies that package-source version, not arbitrary JavaScript already cached before a filesystem replacement. Later factories using the same loaded module retain the same version; an unreadable fixed source makes authority unavailable, never an empty or permissive fallback. Current candidate identity and proof matching include the registered provider and this version. The same canonical snapshot supplies the uniquely selected implementation profile and its supported field/operation/output/seam semantics. Missing, malformed, duplicate, incompatible or unconsumed profile semantics cannot become eligible through an otherwise complete fixture; metadata does not establish mapping coverage.

The adapter and qualification reader also compare a private `transportTarget` containing the non-secret origin and required base path. Addresses with user information, a query or a fragment are unavailable rather than mined for credentials. A proof missing that binding, or bound to another target, remains pending even when its other identity/domain fields match. Neither target text nor its digest enters public results or current/request fingerprints. Eligibility changes may invalidate the current fingerprint; changing a target while qualification is already absent does not promise a fingerprint change, and every preflight must still rebuild and rejudge current authority. This mapping interface neither supplies production qualification nor adds a submission endpoint or persistent inactive-proof platform.

Merge operation parameters over model parameters by whole field. Freeze explicit logical values first; only unsupplied fields enter default consensus. All applicable candidates must declare the field with the same primitive default and the same proven non-default definition source (product/intent/policy version plus canonical definition semantics) before one default freezes. All without defaults means absent; any missing/conflicting/unproven/invalid default means unresolved, not a candidate fallback. Explicit values do not become unresolved because defaults differ. Request-check definition copies remove only `defaultValue`; original domains and full definitions/default sources remain authoritative and fingerprinted.

Every applicable candidate must check the entire frozen request and original assets through the shared canonical full-candidate evaluator, even without qualification. Its registry IDs are the complete same-snapshot set. Preserve registered option value/label semantics and all raw group constraints; unknown constraints stay indeterminate. Do not duplicate domain/matching algorithms, trim assets/explicit parameters per candidate, clamp values, union ranges/options or combine one candidate's parameter success with another's asset success.

Preview aggregation is: any qualified checked-ready candidate → `ready`; otherwise any indeterminate → `indeterminate`; otherwise any pending → `pending`; only all applicable candidates proven hard-rejected → `rejected`. An empty applicable set is pending/unavailable, not vacuous readiness/rejection. Within a candidate, canonical hard → unknown → pending precedence remains; independently malformed input is rejected.

### Public results and change detection

`ListV1` from `list()` is `{ schemaVersion: 1, currentFingerprint, products }`, with the two complete product records `{ productId, label, status, intents }`; each intent is `{ intent, label, status, alternatives }`. Product/intent statuses are `available | pending | rejected | indeterminate`. Labels are fixed product copy or safe canonical registry labels, never private free text.

Each alternative has exactly six required keys: `{ status, inputs, inputGroups, parameters, output, constraints }`, with status `pending | available`. It is one complete canonical declaration branch, not an execution permit. Deduplicate only equivalent whole branches, including constraints. If unknown/invalid constraints or unmaterialized domains prevent lossless public expression, omit that complete branch and keep the intent indeterminate; never silently discard it and claim availability.

Public inputs preserve canonical slot/type/role/source, counts, MIME/size/duration bounds and exclusivity. A single text `prompt` slot mapped from `node_field` may also retain the complete `valueSources` declaration containing exactly one `local_field` and one `upstream_output`, together with `composition: { kind: 'content_with_instruction', localRole: 'instruction' }`. This declaration allows either source to form an already composed final `prompt`; preview checks final text presence, not its actual provenance, source order or composition completeness. Single-origin restrictions, other composition roles, incomplete declarations and unknown nested semantics remain indeterminate. Metadata on media slots cannot authorize this text branch. Input groups preserve slot references and minimum counts. Parameters preserve only canonical type/options/range/supported/auto/case/length/unit semantics, with primitive options or `{ value, label? }`; no `defaultValue`, help, description, options source, notes or URLs. Output permits only `type`, `allowedMimes?`, `min?`, `max?`, and must match the image/video product. Omitted/null fields retain canonical meaning, and unsupported semantic fields cannot be dropped to fabricate a complete branch.

`constraints` attaches the same candidate's supported raw `operations?`, `parameters?` and `inputs?`: canonical operation IDs; parameter `{ fixed?, only?, supported? }`; media-type `{ max? }`. It must not rewrite definitions into a derived range/options union. For example, a declared range 4–15 with group fixed 15 retains both and promises no default 5; two slots each allowing two images with a group total cap of two do not promise four images.

`PreviewV1` from `preparePreview()` is `{ schemaVersion: 1, currentFingerprint, requestFingerprint?, status, executable: false, issues }`. Status is `ready | pending | rejected | indeterminate`; `ready` means only complete preflight passed, never paid execution authority. Request fingerprint appears only when the full snapshot can form. Issues are `{ code, field?, assetIndex? }`, where field is a declared public parameter name and asset index is the original nonnegative safe index. No result exposes assignments, effective parameters, vendor payloads or private identity.

Public issue codes are closed: `invalid_request`, `unsupported_version`, `unknown_product`, `unknown_intent`, `unknown_parameter`, `catalog_unavailable`, `stale_fingerprint`, `request_too_large`, `qualification_pending`, `qualification_rejected`, `default_ambiguous`, `parameter_invalid`, `parameter_unresolved`, `input_invalid`, `input_pending`, `input_unresolved`, `unavailable`. Canonical parameter hard failures map to `parameter_invalid`, unknown/source failures to `parameter_unresolved`; asset hard/pending/unknown map to the corresponding input code. Unknown internal codes map to `input_unresolved`, never raw diagnostics. Public schemas never expose model/group/wire/channel/profile/endpoint, credentials, procurement amounts, evidence identities/URLs, private slots or arbitrary messages/details.

Current fingerprint must be rederived every call from version/policy, full covered contract semantics, registry/registered options, current private mappings including wire model/protocol, group enablement/all constraints, default sources and active qualification identity. Reusing only a YAML memo or public catalog hash is insufficient. Object key ordering is irrelevant; semantic array ordering remains. Only necessary non-secret semantics enter the digest, never credentials, arbitrary settings, endpoints or purchase amounts.

Request fingerprint covers that current fingerprint, product/intent, the complete frozen logical values and sources, and all original ordered asset identity/role/metadata/selection facts. Both hashes detect changes, not permission. A stale current fingerprint returns HTTP 409 with the current fingerprint, status pending and executable false; callers must resend the complete request, not accept newly resolved defaults implicitly. Even a supplied current hash requires reconstructing server authority and judging the full request.

### Host authorization and failure boundary

GET `/omnimux/generation-products` and POST `/omnimux/generation-products/preview` must use existing `requestRejection(req, getConnection)` Host authentication and exact-origin checks before any body read. Missing connection is 503; cross-origin/unauthenticated rejection keeps only the existing fixed status/error, with no product catalog or identity. Mounting must pass the real connection resolver, not an undefined permissive default. Other methods return 404.

POST reuses the existing JSON-body helper with a fixed UTF-8 limit of 1,048,576 bytes; an optional bound must leave old helper callers unchanged. Over-limit accumulation stops immediately, returns 413/rejected/`request_too_large`, and never invokes preview. Malformed/version/unknown-field input is 400 with its fixed code; valid judgment is 200; unavailable authority is 503/`catalog_unavailable`; no error includes raw details or internal paths. Source-read failures must not become empty success.

Preview is stateless and performs zero provider/auth network calls or task/state writes. It must not call `identity.require`/status or resolve user credentials/settings/profiles. Host request authorization is not media authorization. Existing accounts, credential ownership and execution ledgers remain unchanged; static/fixture evidence does not establish real generation.

## Text complete

`textComplete` is a one-shot expert call, not a second chat. It does not inherit parent messages, does not pass tools, and does not write the image/video into the parent session. Authorization is the enabled whitelist plus the tool's required `reason`. The hub does not prompt the user.

The callable set is `Config.text.models`. Every `id` must already be a `cordis.patch.yml` `omnimux` chat model. `enabled: false` hides that row from the tool. Omitted `models` uses the eleven chat-directory defaults, all enabled. `defaultModel` is what an omitted `model` resolves to on text-only, image, and video requests; `OMNIMUX_TEXT_DEFAULT_MODEL` overlays it. Image / video are not separate seams: the selected row must declare the corresponding `input`, and the mapper must support that payload; `image` and `video` are mutually exclusive in the current seam. Model/channel capabilities and wire constraints are determined by the selected channel's official API documentation under [model API authority](model-api-authority.md), then checked against this implementation offline. Historical modality, video-spike and per-key 403 observations are dated execution records, not current channel support rules. Do not repeat real calls to determine the input matrix or treat a missing mapper as a channel limitation.

```text
text:
  defaultProvider: omnimux
  defaultModel: gemini-3.7-flash
  maxTokens: 4096
  models:
    - { id: claude-opus-5,            brand: anthropic, role: flagship, enabled: true }
    - { id: claude-opus-4-6,          brand: anthropic, role: flagship, enabled: true }
    - { id: gpt-5.6-sol,              brand: openai,    role: flagship, enabled: true }
    - { id: gpt-5.5,                  brand: openai,    role: flagship, enabled: true }
    - { id: grok-4.6,                 brand: xai,       role: flagship, enabled: true }
    - { id: kimi-k3,                  brand: moonshot,  role: flagship, enabled: true }
    - { id: deepseek-v4-pro,          brand: deepseek,  role: flagship, enabled: true }
    - { id: deepseek-v4-flash-vision-exp, brand: deepseek, role: classic, enabled: true }
    - { id: gemini-3.7-flash,         brand: google,    role: flagship, enabled: true }
    - { id: gemini-3.1-pro-preview,   brand: google,    role: flagship, enabled: true }
    - { id: glm-5.3,                  brand: zhipu,     role: flagship, enabled: true }
```

A request may name `model` or omit it for `defaultModel`. The image is an absolute path, `http(s)` URL, or data URI (still via `ctx.llm.stream` + `ctx.attachments`). The video is an absolute path (`.mp4` / `.webm` / `.mov`) or `data:video/…` URI; video **bypasses** `ctx.llm` / attachments and uses hub chat completions with `OMNIMUX_API_KEY` / `OMNIMUX_TOKEN` (+ optional `OMNIMUX_BASE_URL`). Missing `ctx.llm` on text/image, or (when `image` is set) `ctx.attachments`, throws `needs-provider`. Missing key on video throws `omnimux-unconfigured`.

## Seams and tools

| Name | Kind | Request | Success | Failure |
|---|---|---|---|---|
| `identity` | official provide | `{ verify?: boolean }` | public profile fields only; never a token | unsigned / `token_invalid` |
| `videoGenerate` | neutral provide | `{ dest, prompt?, duration?, image?, speech?, audio?, provider?, model?, taskId?, wait?, signal? }` | `{ mode: "live" \| "submitted", taskId, url? }` | `capability-disabled`, `needs-provider`, `omnimux-unconfigured`, `unknown-provider`, `unknown-protocol`, `omnimux-invalid-request`, task/download errors |
| `imageGenerate` | neutral provide | same job handle as video | same | same |
| `audioGenerate` | neutral provide | `{ dest, prompt?, duration?, voice?, style?, instrumental?, speed?, provider?, model?, taskId?, wait?, signal? }` | `{ mode: "live" \| "submitted", taskId, url? }` | `capability-disabled`, `needs-provider`, `omnimux-unconfigured`, `unknown-provider`, `unknown-protocol`, `omnimux-invalid-request`, task/download errors |
| `speechToText` | neutral provide | `{ audio, model?, provider?, language?, response_format?, signal? }` (`audio` = absolute path / http(s) URL / `data:audio` URI; `response_format` = json [default] / text / verbose_json / srt / vtt) | `{ mode: "live", model, text }` | `capability-disabled`, `needs-omnimux`, `omnimux-unconfigured`, `unknown-provider`, `unknown-protocol`, `omnimux-invalid-request`, `omnimux-request-failed`, `omnimux-invalid-response`, `quota-exceeded` |
| `omnimux_video_submit` | hub tool over `videoGenerate` | same as the seam | same | same |
| `omnimux_image_submit` | hub tool over `imageGenerate` | same as the seam | same | same |
| `omnimux_audio_submit` | hub tool over `audioGenerate` | same as the seam | same | same |
| `omnimux_speech_to_text` | hub tool over `speechToText` | same as the seam | same | same |
| `textComplete` | neutral provide | `{ prompt, model?, image?, video?, system?, maxTokens?, signal? }` | `{ mode: "live", model, text }` | `capability-disabled`, `needs-provider`, `omnimux-unconfigured` (video), `unknown-model`, `omnimux-invalid-request`, stream / HTTP errors |
| `omnimux_text_complete` | hub tool over `textComplete` | same plus required `reason` | same | same |
| `modelCatalog` | neutral provide | `list()` (no args) | `{ source, fingerprint, defaults, text, image, video, audio }` — lists sorted by display name; defaults = env → settings → config → first sorted | never throws for empty lists; gate may empty a media kind |
| `GET /omnimux/model-catalog` | public Host HTTP | GET | same body as `modelCatalog.list()` | 503 when catalog unavailable |
| `generationProducts` | hub provide | `list()` / `preparePreview(RequestV1)` | `ListV1` / `PreviewV1`; see generation-products contract above | fixed public codes; never execution authority |
| `GET /omnimux/generation-products` | authenticated exact-origin Host HTTP | GET | `ListV1` | existing Host rejection; 503 `catalog_unavailable` |
| `POST /omnimux/generation-products/preview` | authenticated exact-origin Host HTTP | complete `RequestV1`; body ≤ 1 MiB | `PreviewV1`, always `executable: false` | existing Host rejection; 400 / 409 / 413 / 503 with fixed public codes |
| `omnimux_social_data` | official-only tool | `platform` + `capability` + `url`/`id`/`query`; hub maps to top-level business fields (`tweet_id`/`aweme_id`/…); `sk-` | `{ platform, capability, model, field, value, data }` — for `x/tweet`, `data` includes `text`/`display_text`, `author`, engagement, and media URLs under `data.media` / `data.entities.media` | `capability-disabled`, `omnimux-unconfigured`, `omnimux-invalid-request`, `omnimux-request-failed` |
| `omnimux_page_fetch` | official-only tool | `{ url }` http(s); `sk-`; locked model `jina-reader-v1` | `{ mode: "live", model, url, title, pageContent, truncated? }` | `capability-disabled`, `omnimux-unconfigured`, `needs-omnimux`, `omnimux-invalid-request`, `omnimux-request-failed`, `omnimux-invalid-response` |
| `omnimux_accounts_*` / `omnimux_publish_*` | official-only tools | connect / list / presign / create / get post; access token | upstream JSON, secrets stripped | `capability-disabled`, `needs-omnimux` |
| `omnimux_analytics_*` | official-only tools | daily metrics / best time / frequency / decay / followers / posts / sync / inbox; access token | upstream JSON | `capability-disabled`, `needs-omnimux` |
| `omnimux_inspiration_*` | official-only tools | list / get / create / update / delete / tags / status; access token | upstream `{success,data}` envelope, media URLs unchanged | `capability-disabled`, `needs-omnimux` |
| `videoProcess` | neutral provide（provider: omnimux-video） | `{ capability, input, dest, signal? }` | `{ mode: "live", files?: [{ path, kind, meta? }], result? }` | `ffmpeg-missing`, `unknown-capability`, `video-invalid-input`, `video-ffmpeg-failed`, `video-incompatible-streams`, `video-canceled`, `video-timeout`, `video-<capability>-failed` |
| `video_process` | omnimux-video tool over `videoProcess` | same | same | same |
| `hubEvents` | hub provide (in-process bus) | `emit(type, payload)` / `subscribe` / `replaySince` | `{ id, type, at, payload }` | missing provide → vertical emit is a no-op |
| `workbenchMailbox` | hub provide (read-only viewport) | `getActiveView(sessionId?)` | `{ ok, stale, sessionId, uiContext }` last-known Envelope | missing provide → vertical tools skip ui_context default |
| `GET /omnimux/events/stream` | hub Host WebSocket upgrade | official connection auth + loopback origin; `?after=` replay | read-only JSON events (`omnimux:heartbeat` 2s + domain events) | 401 / 403 |
| `workbench_get_active_view` | hub tool | `{}` | `{ ok, stale, uiContext }` Envelope snapshot | `no-workbench`, `no-session` |
| `workbench_open_tab` | hub tool | `tabId` + `reason` (+ optional view / highlightIds / undoToken) | `{ ok, applied, code, undoToken? }` | soft-reject codes (`panel-collapsed`, `quota-exceeded`, …); MUST NOT `setFocus` |
| `POST /omnimux/workbench/viewport` | hub Host HTTP | Envelope JSON; `assertLocalWrite` | `{ ok: true }` | 403 `not-local` |
| `POST /omnimux/workbench/rpc/ack` | hub Host HTTP | `{ requestId, ok, applied, code, tabId }` | `{ ok: true }` | 403 `not-local` |

`audioGenerate` exposes audio generation / TTS / music capabilities (Suno, GPT 4o Mini TTS). Speech-to-text is the separate `speechToText` seam (Whisper-1 class): one synchronous multipart POST to `/v1/audio/transcriptions` (file bytes + model) → `{ text }`; no task poll, no dest download. Its gate key is `gate.tools.omnimux_speech_to_text` (there is no `gate.media.stt` kind). Digital-human / talking-head is a `videoGenerate` request on a digital-human model (kling-avatar): reference image + duration + `audioTrack`; the mapper passes `audioTrack` through only for `DIGITAL_HUMAN_MODEL_IDS` and still strips it from generic video requests (#429/#538). Not a third HTTP client.

## Official-only (C-class)

These cannot be swapped for a third-party endpoint. Unconfigured calls throw `needs-omnimux` and name the missing install or sign-in.

- Identity: device login, `GET /api/user/self`, public profile cache
- Social data: OmniMux social-data capabilities (`sk-`)
- Page fetch: OmniMux `POST /v1/reader` (`sk-`, model `jina-reader-v1`). Success is `text/plain` markdown, not chat JSON. Do **not** reuse `createOfficialClient.withSk` (that path always `response.json()`).
- Social publish: connect account, list accounts, media presign, create post (`OMNIMUX_ACCESS_TOKEN`)
- Inspiration library: list / get / create / update / soft-delete / tags / status (`OMNIMUX_ACCESS_TOKEN`)

The hub may wrap those HTTP calls. It must not store an account matrix, posting calendar, warmup roster, or Drama Center upload.

### Social account provider isolation

| Consumer | Fixed source | Scope |
|---|---|---|
| `omnimux-publish` | `tiktok_direct` | Official TikTok accounts, binding, publishing, status and disconnect |
| `omnimux-accounts` | `zernio` | Zernio accounts, binding, local metadata and disconnect |
| Existing analytics consumers | `zernio` | Existing Zernio analytics account scope |

The hub owns credentials and cloud transport. Domain plugins do not expose a source switch, store keys, create a second HTTP client, or split the user identity system. `official-only` means the OmniMux cloud, not necessarily the TikTok direct provider.

- `provider` is required on account list (query/tool args), connect (body/tool args), disconnect (query/tool args), post creation (body/tool args), and post lookup (query/tool args). Only `tiktok_direct` and `zernio` are valid. Missing/unknown source returns 400 `invalid-provider`; no platform/feature-flag inference or implicit fallback.
- The cloud account/post record is authoritative. Requests constrain the expected source; they never rewrite it. Ownership and source validation happen before provider I/O. Cross-source accounts/posts return 409 `account-provider-mismatch` / `post-provider-mismatch`. Idempotency replay also requires the same source and account set, including insert-race replay.
- Official account lists read direct records without creating a Zernio tenant or syncing Zernio. Zernio lists never append direct accounts. Official connect supports TikTok only, fails explicitly when unavailable, and never falls back. Explicit Zernio connect is independent of the direct feature flag.
- Browser and Agent views preserve `id`, `platform`, and `provider`. Same names do not establish identity. Publishing filters to `platform=tiktok` and `provider=tiktok_direct`; the Accounts plugin filters to `provider=zernio`. Missing or unknown sources cannot be selected.
- Draft creation with account IDs, selection saves, assignment, submission and retry validate current source and availability. Retry checks occur before attempts/status mutations, media upload or post creation. Background dispatch revalidates after preparation. New subtasks record the validated source; execution still checks cloud truth.
- Old drafts are not migrated or assigned replacement accounts. Invalid selections show “原账号不属于官方发布链路或已不可用，请重新选择”; content and media remain. Historical non-official or unknown-source tasks are viewable but cannot retry or refresh upstream state.
- Scoped lists are not complete inventories. Refresh, emptiness and failures must not prune another source's metadata, avatars or selection state. Metadata PATCH cannot change ID, platform or provider and requires a verified source-scoped account. Successful disconnect cleans only its ID; failure preserves local data. Local disconnection does not prove official token revocation.
- Existing seat/billing, official revoke-result semantics and Zernio 402 handling are unchanged. Media presign/upload remains Zernio-backed and is explicitly outside account isolation ([follow-up #624](https://github.com/omnimux-ai/omnimux-dsh/issues/624)). Do not claim end-to-end official publishing acceptance from account isolation.

Delivery is coordinated across gateway, CLI and plugins, without an implicit compatibility path. Pre-merge automated fixture tests must cover single-source and same-name accounts, invalid source, error vs empty states, old drafts/tasks, idempotency and rejected disconnects. Use [plugin QA](plugin-qa.md); push/merge/deployment and real OAuth, publishing or disconnect require their own authorization. Fixture evidence is not live upstream success. After authorized Dev materialization, verify existing Zernio records remain in Accounts and are absent from Publish.

### Accounts HTTP (Host `/omnimux/accounts`)

Browser-local write routes (same-origin guard); the browser app is `plugins/omnimux-accounts`.

| Method & Path | Body | Success |
|---|---|---|
| GET `/omnimux/accounts?provider=…` | — | `{accounts: [ViewRow]}`; optional `platform` / `group` filters. Cache hit rewrites `avatar_url` to the same-origin byte route; a miss keeps the https URL and fills the cache in the background. |
| GET `/omnimux/accounts/{id}/avatar` | — | local raster bytes (`image/jpeg\|png\|webp\|gif`); `Cache-Control: private, max-age=86400`; `X-Content-Type-Options: nosniff`. Unsigned → 401; miss / `accountAvatars.enabled=false` → 404; non-GET → 405. Never `sendJson`, never 302 to the CDN. |
| POST `/omnimux/accounts` | `{provider, platform, redirect_url?}` | `{auth_url}` (site OAuth page) |
| PATCH `/omnimux/accounts/{id}?provider=…` | `{group?: string \| null, agent_usable?: boolean}` | `{account: ViewRow}`; empty-string `group` clears; missing/cross-source account returns 409 |
| DELETE `/omnimux/accounts/{id}?provider=…` | — | `{ok: true}` only after explicit cloud success; deletes only this ID's metadata and avatar |

ViewRow = the `pickAccount` whitelist (id/platform/provider/display_name/username/name/group/status/expires_at?/connected_at?/avatar_url) plus overlay fields `agent_usable?` / `last_used_at?` and a computed `status` (site status normalized; else expires_at-driven: past → `expired`, <24h → `expiring`; else `active`). Missing `provider` must not be filled with a default; the TikTok publishing account rule above applies. `avatar_url` is either `https://…` (cache miss, or `official.accountAvatars.enabled=false`) or the relative path `/omnimux/accounts/{encodeURIComponent(id)}/avatar` after Host rewrite. Absolute same-origin URLs, `http://`, `data:`, `blob:`, and `file:` are dropped. The tool `omnimux_accounts_list` returns source-filtered, sanitized `{accounts}` rows and does **not** rewrite avatar URLs.

Local metadata overlay (`group` / `agent_usable` / `last_used_at`) persists to `$DSH_HOME/omnimux/accounts.json` (dir 0700, file 0600, whole-document rewrite). Local avatar rasters persist to `$DSH_HOME/omnimux/accounts/avatars/` (`index.json` + `{sha256(id)}.{png\|jpg\|webp\|gif}`, dir 0700, files 0600). GET merges overlay over scoped site rows and rewrites cached avatar URLs without pruning. Successful DELETE removes only the selected overlay and avatar. Provider tokens remain cloud-side; connect is site-side OAuth.

### Inspiration HTTP (Host `/omnimux/inspiration`)

Browser-local JSON + media stream. The browser app is `plugins/omnimux-inspiration`. Cloud calls stay in the hub (`withPat` / `withPatRaw` to `https://omnimux.ai/api/inspiration/v1/...`). Cover URLs in JSON are rewritten from `/api/inspiration/v1/media/` to `/omnimux/inspiration/media/` so `<img>` never talks to the cloud.

| Method & Path | Body / query | Success |
|---|---|---|
| GET `/omnimux/inspiration` | `type` `tag` `tags` `q` `is_favorite` `sort` `page` `page_size` | upstream list envelope, media URLs rewritten |
| GET `/omnimux/inspiration/status` | — | `{enabled,configured,gateway_ready}` |
| GET `/omnimux/inspiration/tags` | — | upstream tags envelope |
| GET `/omnimux/inspiration/{id}` | — | upstream item envelope |
| POST `/omnimux/inspiration` | create body | upstream create envelope |
| PATCH `/omnimux/inspiration/{id}` | patch body | upstream update envelope |
| DELETE `/omnimux/inspiration/{id}` | — | upstream delete envelope |
| GET `/omnimux/inspiration/media/{key}` | Range / If-Range optional | streamed bytes; PAT injected by Host |

Writes are same-origin only. Unsigned → 401 `needs-omnimux`. Tools keep the original gateway JSON (no Host rewrite).

## Credentials

| Secret | Who uses it | Browser |
|---|---|---|
| `OMNIMUX_ACCESS_TOKEN` | identity + social publish | never |
| `OMNIMUX_API_KEY` / `OMNIMUX_TOKEN` | chat route, media, text complete, social data, page fetch | never. Chat (`llm-pi-ai`) and `omnimux_page_fetch` resolve the ref from `$DSH_HOME/.credentials.yaml` when the process env is empty. |
| `DEEPSEEK_API_KEY` | agent `web_search` (`web-search-deepseek` provider), written via the official credentials domain | never |

Do not export a `sk-` as `OMNIMUX_ACCESS_TOKEN`.

## Capability gate (`Config.gate`)

The hub provides fine-grained enable/disable controls for tools, media generation, and text complete whitelist models via `Config.gate`.

- **Default All Enabled**: By default, all tools, media categories, and whitelist models are enabled. Only an explicit `false` disables a capability.
- **Dual-Stage Enforcement**:
  1. *Registration-time prevention*: Disabled tools are omitted from `ctx.tools.register`, and disabled media/text seams are not provided on `ctx.provide`.
  2. *Execution-time rejection*: Any invocation of a disabled capability throws `OmnimuxError('capability-disabled')`.
- **Merging & Arbitration Rules**:
  - `official.mount`: Acts as an absolute master switch. When `official.mount: false`, official and reader tools are not mounted regardless of `gate.tools`. When `official.mount: true`, fine-grained `gate.tools.<name>` applies.
  - `media.<kind>`: `gate.media.<kind>: false` is equivalent to `gate.tools.omnimux_<kind>_submit: false`. Either being `false` disables both the seam and the tool.
  - `models.textComplete.<id>`: Merged with `text.models[].enabled` via logical AND. A model is enabled if and only if `row.enabled !== false && gate.models.textComplete[id] !== false`.
- **HTTP & Tool Decoupling**: Closing Agent tools (e.g. `omnimux_accounts_list: false`) does NOT disable corresponding Host HTTP endpoints (`/omnimux/accounts`). Host HTTP routes remain accessible to web clients.

```yaml
gate:
  enabled: true # Master gate switch (default true)
  tools:
    omnimux_social_data: false
    omnimux_video_submit: false
  media:
    video: false # disables omnimux_video_submit & videoGenerate
    image: true
    audio: true
  models:
    textComplete:
      grok-4.6: false
  plugins:
    workflow: {}
```

## Package layout

Hub implementation stays in `plugins/omnimux`. New capability = new directory under that package, not a sibling plugin.

```text
plugins/omnimux/src/
config.js              plugin Config (brand + media + apps + text)
  brand/                 chrome overlay
  auth/                  device login, token store, provide('identity'), /omnimux/auth/*
  apps/                  official catalog parse, cache, resolve, /omnimux/apps
  text/                  textComplete whitelist + one-shot execute
  reader/                omnimux_page_fetch → POST /v1/reader (text/plain)
  llm/                   omnimux chat route / future adapter only
  media/
    route.js             resolve provider + protocol + model
    job.js               download dest
    video.js             videoGenerate over the route
    stt.js               speechToText over the route (audio bytes → text)
    stt-mount.js         speechToText seam + omnimux_speech_to_text tool
    protocols/           openai-media.js  (HTTP)
    vendors/             omnimux.js       (envelope + defaults)
  official/              social-data, publish tools, Host /omnimux/accounts
  avatar/                blobatar profile face, Host /omnimux/avatar
  client/                Profile page; DSH plugins tab under Settings → 插件
```

The plugin entry exports `Config` (Standard Schema). Brand strings, `media.providers`, and `text.models` live there, not in `apply()`.

## Vertical duties

| Vertical may | Vertical must not |
|---|---|
| `ctx.get` a listed seam | import hub modules or ship an OmniMux client |
| `ctx.get('hubEvents')?.emit(...)` after own-store writes | open a private WebSocket / extra EventSource / cloud socket |
| call `omnimux_*` tools via the model | store hub secrets |
| write its own disk contract | implement chrome, login, or provider routes |
| stub or throw `needs-provider` when a seam is absent | claim `mode: "stub"` is a model render |

Workbench viewport, hub event WebSocket, and `workbench_*` tools: [agent-workbench-sync.md](agent-workbench-sync.md). Hub MUST NOT parse a vertical's `library.json`. Vertical clients read `window.__omnimuxWorkbench` / `window.__omnimuxHubEvents` only.

`omnimux` itself is not a shelf app. Official catalog rows: [apps-catalog.md](apps-catalog.md).

## Channels and consumption scenarios (no exclusive modes)

OmniMux is open source and BYOK-capable. Official account, local CLI, and user-supplied API are channels, not global modes.

- MUST NOT model `official` / `key` / `agent` (or similar) as a mutually exclusive global runtime mode. Onboarding only checks that at least one usable channel exists.
- Models bind per consumption scenario — chat, tool/multimodal analysis (vision, video understanding), and media generation (image/video/audio/TTS). Registered channel capabilities remain available to the hub and retained technical configuration; users may mix, e.g. a local CLI for chat with official or third-party API for video analysis and generation.
- All channels register with the hub; domain plugins consume capabilities only through the hub.
- When a scenario call needs a capability (e.g. video understanding), the hub resolves it across all registered channels and routes or offers a capable one. It MUST NOT disable the capability because the chat model is text-only, and MUST NOT tell the user to "switch runtime mode".
- Upstream auth/capability errors propagate with their real cause. An empty `catch {}` MUST NOT swallow them or re-diagnose them as a business condition (e.g. "video too long").

## 客户端热更新

Hub 复用官方 watcher，通过既有事件 WebSocket 分发客户端 rebuild，避免同源页面长期占用 HTTP 请求连接。默认插件装配、配置保留、重连与升级验证见 [HMR 合同](hmr.md)。
