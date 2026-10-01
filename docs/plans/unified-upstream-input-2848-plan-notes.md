---
title: "Issue #2848 — Technical interfaces and bounded file scopes"
id: "notes-unified-upstream-input-2848"
type: "plan"
status: "draft"
authority: "L2"
date: "2026-09-30"
authors: ["Gao"]
subsystem: "omnimux-workflow"
---

# Issue #2848 — Technical interfaces and bounded file scopes

**Implementation interfaces and five-slice topology approved by the user on 2026-09-30. Importer safety policy approved: 1 MiB per file, 64 paths per batch, strict UTF-8 with optional BOM. V1 tests and named legacy cases have precise user authorization; other-slice test permissions remain pending.**

Companion to the full [vertical ticket plan](unified-upstream-input-2848.md). Base: `39c6449778c57d2b11451016e17cbb70b508f343`. File paths and implementation sequencing belong here, outside engineering-spec prose and the tickets' behavior sections. Relative source paths below are rooted at the isolated worktree. The approved spec is immutable in this round.

## 1. Observed engineering topology

[Root package](../../package.json) is Node ESM/pnpm; [Hub package](../../plugins/omnimux/package.json) uses JavaScript and its network-guarded Node runner; [workflow package](../../plugins/omnimux-workflow/package.json) uses TypeScript 5.9, React 19, ReactFlow, Zustand and esbuild with noEmit canvas+host typechecking. [Canvas tsconfig](../../plugins/omnimux-workflow/tsconfig.canvas.json) enables strict/noUncheckedIndexedAccess. Preserve this stack; no extra library is necessary for strict UTF-8 decoding, text composition or matching.

One deep Module spans existing interfaces, not a new folder or engine:

`verified Hub declarations / adapter profiles / serving routes → load/index → projectModelDto/buildModelCatalog → readCanvasCatalog/projectCanvasCatalog → compatKernel + explicit route context → Feed/Slot intent and selected-output resolution → ResourcePicker + SlotWells adapters → planCanvasInputMutation → effectiveSlotFingerprint / assembler → resolveCanvasSubmission → guardSubmit / vendor mapper → external transport`.

The input Module owns admissible-origin/role/format/group/route matching and effective consumption. UI owns layout and literal PM copy, never independent capability inference. I/O stays in existing file/media/execution adapters; pure matcher does not stat, fetch, decode files, or depend on client registration side effects. Hub and workflow share seam DTO semantics/parity evidence, not cross-plugin source imports.

Alternatives rejected: output-by-output slot patches leave multiple authorities; a parallel capability engine duplicates matcher/guard responsibilities; fixed media-format lists falsely grant capability. The chosen incremental approach needs cross-layer changes and parity tests, but concentrates correctness in existing interfaces.

## 2. Minimal true contract extension

### 2.1 Origins and composition

Increment the original slot schema/normalization/DTO, not a side registry. Proposed additional fields:

```ts
type ValueSource = 'local_field' | 'upstream_output';
type TextComposition = {
  kind: 'content_with_instruction' | 'single_body' | 'separate_roles';
  localRole: 'body' | 'instruction' | 'lyrics' | 'style';
};
// Extend existing InputSlotDto, preserving every existing constraint:
// valueSources?: ValueSource[];
// composition?: TextComposition;
```

`valueSources` belongs to a slot; `composition` belongs only to a text slot that aggregates or maps text roles. Existing `slot`, `role`, `source`, mapper/profile and request-field resolution remain; do **not** add a generic vendor request-field string that bypasses profile allowlists. `slot` plus the existing profile mapper determines destination; `composition.kind` determines aggregation. For `separate_roles`, use existing independently mapped slots/roles and concrete mapper-supported logical fields. No new role-to-vendor-field framework is necessary.

Only add these fields when a model+operation+profile+qualified route has demonstrated resolver/mapper support. `source: node_field` remains request-mapping compatibility metadata, not origin authority. Legacy `upstream_edge` may normalize to upstream origin only where it denotes an implemented input; legacy `user`/`node_field` remain local-only unless a reviewed declaration explicitly expands origins. Do not globally infer upstream for URL, voice, seed or arbitrary parameters. Missing upstream metadata is a capability gap, not a UI guess.

Use only `local_field` and `upstream_output`: imported TXT/Markdown becomes a parsed text upstream node before consumption; `file_asset` is not needed as a third text origin. Media/file identity stays in the existing Feed asset representation. Avoid `allowedFormats` as a speculative supplier-wide field: media/document use existing `allowedMimes`; TXT/Markdown import format and encoding are adapter facts, not vendor document MIME promises. If a supplier actually needs non-MIME format metadata, amend the exact declaration/schema/mapper scope with evidence first.

Preserve `inputGroups`, `implementation`, `research`, `execution`, `listed`, `parameters`, model routing, channel-group constraints, `defaultOperations` and content fingerprint through every projection. Existing [projectModelDto](../../plugins/omnimux/src/catalog/project.js#L271-L298) currently loses groups/implementation/routing; [canvasCatalog](../../plugins/omnimux-workflow/src/workflow/seam/canvasCatalog.ts#L35-L41) loses defaultOperations. Extend existing DTO, not `inputCapability` summaries or a new HTTP endpoint. Preserve existing admission predicates and historical execution status. A stub execution value is not itself permission to list or a reason to rewrite it to live.

### 2.2 Field cardinality versus source cardinality

Existing `min/max` remain logical slot/value cardinality. For a composing text field, N bound text sources plus eligible local input yield **one composed logical text value**; a `prompt` slot with `max=1` validates that value, not N graph edges. Store all N source bindings under that slot and compose once. Non-composing roles retain actual slot-count rules. Do not change max to null just to admit text or create N fictitious prompt slots.

A source-count restriction requires its own evidence and scoped contract extension; none is assumed or invented here. Reuse existing `parameters.<mappedField>.minLength/maxLength` and route-narrowed parameter restrictions for aggregate final string length. Count according to the existing documented parameter validator, including boundary strings for ordinary composition and paragraph separators for single body; no silent trimming to fit.

### 2.3 Composition semantics

`content_with_instruction`: active upstream body texts in saved material order, then local instruction; preserve ordinary source/instruction boundaries already specified in the node-input contract. With no upstream, nonempty local text alone retains the existing prompt meaning. No source content is written into the editor.

`single_body`: active upstream bodies in material order, then local body, join nonempty paragraphs with `\n\n`. No filename, source label, card title, role label or reference token is emitted. Local input is body, not unsupported style control. Reject missing body/aggregate limits but **never** the prior upstream-plus-local two-source rule.

`separate_roles`: body/instruction/lyrics/style must be explicitly bound and supported by the existing mapper. Local role is persisted only when necessary to retain user intent through mode switches; switching cannot silently turn a declared local body into instruction. Missing destination mapping means incompatibility, not dropping content. Never infer roles from text words or `output=audio`.

## 3. Saved intent and unified selection

Extend existing [FeedAsset/SlotOccupant](../../plugins/omnimux-workflow/src/shared/graph/feedSlot/types.ts), [MaterialNodeData](../../plugins/omnimux-workflow/src/shared/graph/materialNode.ts#L114-L123), and [NodeInputSource](../../plugins/omnimux-workflow/src/shared/graph/nodeInputSource.ts#L18-L28), rather than add `textBindings` alongside media slots.

Proposed minimal additions:

```ts
// FeedAsset: textContent?: string;
// FeedAsset: format?: 'txt' | 'markdown'; // parsed file provenance only
// SlotOccupant: ordinal?: number; // persisted stable material position
// SlotOccupant: use?: 'active' | 'inactive'; // new-version required; legacy default only during migration
// SlotOccupant: role?: string; // retained intent when former slot is absent
// MaterialNodeData: inputBindingVersion?: 1;
// MaterialNodeData: localTextRole?: 'body' | 'instruction' | 'lyrics' | 'style';
```

Retain sourceNodeId, edgeId, selected outputId and pinned semantics. `role` on a binding is only retained semantic intent when a slot disappears/changes; a current slot cannot silently overwrite conflicting role intent. Source type/content/metadata resolve from the selected current output, not redundant cached UI fields. `localTextRole` is needed only when a switch could reinterpret user-authored content. Do not add independent `activeTextIds`, decoration fields, thumbnail contracts or per-output stores.

Inactive occupants stay in saved bindings with their original ordinal/role. Thus cards and reactivate actions remain discoverable. `slotStandbyEdgeIds` remains legacy/general supply bookkeeping, **not a second active-use authority** for new-version bindings. Mirrors on edges remain derived compatibility data. Inactive sources are not selected, not matched, not opened by execution I/O and not added to fingerprints/requests. Replacement swaps current source/output/edge in place and preserves ordinal; old source and supply edge are not deleted. Current source/output/role identity dedupes; different identities with equal text are retained; different-role reuse only with contract permission.

Extend `selectSlotOccupants` to return active-intent resolution including pending and invalid outcomes instead of filtering failures away. Its result drives effective display, readiness, fingerprint and assembly. Any active invalid selection is a blocking record even if optional or its former slot is removed. Inactive/supply-only sources are excluded without blocking. `isReadyFeedAsset` recognizes nonblank text without requiring a media URL; text doesn't impersonate a URL asset.

Delete incomingText authority only after all consumers switch: [effectiveFingerprint](../../plugins/omnimux-workflow/src/shared/graph/feedSlot/effectiveFingerprint.ts#L24-L28) currently restores all text; [assembler](../../plugins/omnimux-workflow/src/shared/graph/feedSlot/assembleEffectiveInputs.ts#L33-L69) accepts independent incomingText; [materialSlotInputs](../../plugins/omnimux-workflow/src/workflow/execution/materialSlotInputs.ts#L20-L34) traverses all text outputs. These must read text selected by the same binding traversal. A token may annotate content but cannot re-enable/use sources; bound-card click never auto-inserts tokens.

### Migration

Use `inputBindingVersion: 1` as a per-node consumption-version marker; new generate nodes explicitly initialize current-version empty bindings. Reuse existing snapshot migration/hydration infrastructure; no unrelated global schema rewrite is required. Current schemaVersion=3 snapshots still need a **per-node marker check before the existing migration early-return**, so legacy v3 cannot silently escape input migration.

V1 does not invent old intent: an unversioned graph remains preserved and reports migration-required when it cannot safely use the new traversal. V5 hydrates only historically evidenced consumed text/media for unversioned eligible nodes, in original stable edge/material order, retains existing bindings/inactive intent, then stamps the node marker. Current-version empty bindings mean intentionally empty, never auto-fill-all. Ambiguous unsupported/old role identity remains a reported migration gap. Mutation hydration and execution preparation honor the marker, never recreate consumption from every new edge. Preserve graph source content and historical results byte-for-byte; migration is idempotent.

## 4. One complete input plan at original matcher seam

Extend existing `OperationMatchResult` / layout projection rather than export another engine. Proposed semantic result:

```ts
// Existing verdict, extended (not all fields repeated in every caller):
// { accepts, ready, bindings, pending, rejections,
//   operationId, routeId, contractFingerprint, routeFingerprint }
// Discovery projection uses original verdicts per operation+route:
// { operationId, routeId, inputs: InputSlotDto[] }
```

The underlying contract/profile/route remains the authority. Candidate type/format UI derives from these qualified full-plan rows, never an independent acceptedTypes table. UI may cache a fingerprint but final mutation/submit recomputes from current inputs. Preserve plain string operation IDs; do not copy registry unions into workflow.

Matching quantifier: `exists operation o and qualified route r: Match(o,r, activeExisting + localFields + entirePendingSelection).accepts`. `accepts` allows missing minimums and necessary metadata pending, never known conflicts; `ready` additionally requires complete minimums/roles/groups, metadata, role mapping, parameters, permissions and usable content. Show target operation/route before confirm. Multiple complete plans use existing CustomSelect in the same picker; sole changed plan uses the approved summary. Pending is not a generation grant.

Route context is explicit input to shared Module callers. Extend the existing catalog channelGroups DTO and `narrowCatalogByRouting` interface to derive route-specific views from authoritative catalog data on client **and host**, not a canvas-global resolver side effect. Reuse existing strategy/allowedGroups intent; no credentials in catalog or picker. Unknown route capability has explicit rejection/pending semantics and cannot receive an executable stamp. Empty allowed enum intersection or prohibited required slot/group yields an unusable operation on that route; never restore the full model contract or delete constraints to make it ready.

Hub resolves real route/group and reruns full guard with the **same route constraints** before each external candidate; fallback candidates independently accept the entire request. Workflow precheck does not authorize Hub dispatch. Official/BYOK dispatch share proof obligations; configured external transport is not an input contract. Existing logical SubmitRequest fields remain for vendor payloads; if Hub needs binding provenance for revalidation, add only the selected-input records to this existing seam, not a second endpoint. Never trust client-ready stamps or accept a client-supplied route constraint as authoritative.

## 5. Reused UI interfaces and transactions

Proposed evolution of current Props, with no ornamental fields:

```ts
// SlotPickRequest replaces loose acceptedTypes/max authority:
// { targetSlot?: string, replaceEdgeId?: string }
// operation+route candidates are recomputed from node/catalog context.
// ResourcePickerModalProps retains open/nodeId/initialTab/mode/onCancel:
// onCommit({ selections, chosenOperationId, chosenRouteId? }): boolean
// selection = { sourceNodeId, outputId, targetSlot?, role? }
// local parsed drafts remain in the same picker session until confirmation.
// SlotWellsProps retains layout/bindings/conflicts/upstreams/onPickSlot:
// onSetUse(slot, edgeId, use), onReplace(slot, edgeId), onSwapSlots(...)
```

A retained `acceptedTypes` value can be a derived renderer convenience during expand–contract, never sufficient commit validation. No labels/badges/subtitles/icons are added to capability data; actual display names stay in existing view adapters. Import/local drafts hold actual text/status/file identity, not vendor format claims. `SlotHoverPreview` supports text with the same close/focus lifecycle as media. No independent text panel, text modal, insertion-on-card-click, success badge or tutorial banner.

Extend `planCanvasInputMutation` with an explicit strict-consumption intent for picker/replace/reactivate/swap (target node and selected identities plus confirmed op/route). Ordinary edge creation still runs structural supply validation only. It need not consume every Feed asset. Compute draft next graph and whole-plan verdict; reject returns unchanged graph; successful mode/route, source nodes, edges and bindings apply once with one undo transaction. No pre-switch config write, no partial-success toast, no stale index replacement. Async parsing checks existing session/workspace/node ownership guard before confirm.

[design.md](../../design.md) is read-only design authority, not a new deliverable. 裴像素 implements only PM white-list additions in current components and existing CSS: native tokens, 32px/8px ordinary controls, 10–12px cards, 16px modal, existing pill footer controls, SVG and accessible feedback/Esc/focus. Existing 720px picker versus design's 480px modal is a known discrepancy, not approval for a new exception; resolve through design owner within actual change scope. Non-Chinese new strings require PM-issued equivalent copy before claiming multilingual acceptance.

## 6. Real local-text importer decision

Observed: [localMedia](../../plugins/omnimux-workflow/src/shared/localMedia.ts#L9-L37) recognizes `.txt/.md`; [localFileDraft](../../plugins/omnimux-workflow/src/canvas/editor/utils/localFileDraft.ts#L24-L41) still gives missing size zero; [localFileRoutes](../../plugins/omnimux-workflow/src/workflow/routes/localFileRoutes.ts#L100-L184) picks/probes/streams paths but does not decode text; [IngestionPipeline](../../plugins/omnimux-workflow/src/workflow/ingest/IngestionPipeline.ts#L84-L142) copies files; [ProjectAssetsStore ingest](../../plugins/omnimux-workflow/src/workflow/workspace/ProjectAssetsStore.ts#L425-L457) records files but does not parse body text. Extension recognition is **not proven parsing**.

Reuse `POST /omnimux-workflow/api/pick`, existing `POST /omnimux-workflow/api/local-file/probe`, and local-file ownership/path guards. Proposed bounded additive method on that existing adapter: `POST /omnimux-workflow/api/local-file/text`, body `{paths: string[]}`. Success returns actual stat byte count, import format, raw decoded text and resolved file identity per item; failure returns a classified read/encoding/size/path error and no successful target mutation. Use existing local/same-origin guard, realpath/NUL/absolute/regular-file checks and a bounded batch. No unauthenticated general filesystem endpoint or bypass of project ownership.

**Importer safety policy proposed for approval:** max 1 MiB per text file and max 64 paths per batch (reuse current probe batch bound); strictly valid UTF-8, optional UTF-8 BOM removed; reject NUL, known media signatures and decode errors; no automatic UTF-16/GBK/binary fallback. Raw Markdown remains raw; no markdown rendering/extraction or filename prefix in body. Both `.md` and `.markdown` supported. This is application resource-safety policy, not a claimed supplier size/encoding limit; use the smaller applicable contract limit and final composed-character limit. All limits get boundary tests.

Read the same opened file descriptor with bounded bytes, fstat and failure detection rather than only filename MIME. Return real size, never unknown→0. Native/drag text enters same parsed draft representation, with cancellation/session checks. If existing media/project ingestion is reused, decode before committing batch graph state; never publish half a batch as successful. Originals are never moved/unlinked; project copies retain their canonical asset/path identity. For imported native files, preserve canonical realPath and reread/probe active selections at future submit; disappearance becomes unavailable. For project-owned imports, resolve only the copied asset in its owning workspace and reread that asset. Do not read arbitrary inactive files.

A parsed source has materialType=text, current text content and file identity/provenance; it then follows the same Feed/Slot traversal. Local edit remains a separate local field. File format facts do not require MIME on an in-memory canvas text; binary/document file constraints still require MIME where the mapper needs it. No PDF/Office extractor or unsupported document UI promise is authorized.

## 7. Execution and frozen snapshot

Use existing prepare/readiness/resolver/gateway/Hub guard chain. Resolve only active selected outputs and their file metadata. Capture selected outputId/content/version, bindings+ordinal+roles, local text+role, model/op/parameters, contract fingerprint and qualified route context before the first asynchronous metadata/submit operation. Do not reread mutable graph or catalog halfway through composition and route dispatch. Revalidate resolved bytes/metadata against frozen intent, then guard at Hub with current authoritative admission/route policy; stale policy can reject, never mix versions or silently change operation.

Dependency execution may wait on sources but must re-resolve current selected outputs after completion; placeholders are not vendor input. Direct/quick/Agent/scheduled paths pass the same context. Existing edge mirrors and old preparation must not clear TTS bindings or recreate inactive text. The new integrated capture suite uses production assembler/executor/OmniMux gateway/Hub guard/mapper and intercepts only transport. Fake gateway-only request assertions remain useful lower-level tests but do not satisfy full vendor-mapping evidence.

## 8. Bounded necessary future file scopes

No row is write permission. Test/fixture paths are exclusively the plan's exact per-ticket permission lists. Prefixes below are aliases for readability, not glob authorization:

- `H` = `plugins/omnimux/src`
- `W` = `plugins/omnimux-workflow/src`

No arbitrary new production modules are proposed. Edit existing paths, in the ordered sub-checkpoints below. If these scopes are insufficient, amend the ticket/plan before touching additional paths. Only evidence-backed model rows in the named YAMLs change; not all rows, statuses or defaults.

### V1 scope — origin → empty entry → selected canvas text → captured request

Contract/DTO: `H/catalog/contract/model-capability.schema.json`, `H/catalog/contract/schemas/commonSchema.js`, `H/catalog/contract/schemas/operationSchema.js`, `H/catalog/contract/load.js`, `H/catalog/project.js`; qualified text-origin/composition declarations only in `H/catalog/specs/text-models.yaml`, `image-models.yaml`, `video-models.yaml`, `audio-models.yaml`.

Shared/host: `W/shared/api.ts`, `W/workflow/seam/canvasCatalog.ts`, `W/shared/validation/compatKernel.ts`, `W/shared/validation/operationUi.ts`, `W/shared/validation/executionReadiness.ts`, `W/shared/graph/nodeInputSource.ts`, `W/shared/graph/materialNode.ts`, `W/shared/graph/nodeFactory.ts`, `W/shared/graph/generationPrompt.ts`, `W/shared/graph/canvasInputSources.ts`, `W/shared/graph/canvasSlotRecompute.ts`, `W/shared/graph/canvasInputMutationGateway.ts`; `W/shared/graph/feedSlot/types.ts`, `deriveSlotLayout.ts`, `modelMaterialCapability.ts`, `autoFillSlots.ts`, `effectiveFingerprint.ts`, `assembleEffectiveInputs.ts`, `effectiveInputDisplay.ts`, `prepareExecutionSlotGraph.ts`; `W/workflow/execution/materialSlotInputs.ts`, `materialGatewayExecutor.ts`; `W/workflow/seam/gateway.ts`, `omnimuxGateway.ts`, `submitGuard.ts`; `H/catalog/contract/submit-guard/normalize.js`, `slots.js`, `map.js` only where necessary for text-origin aggregation parity.

UI adapter: `W/canvas/editor/utils/resourcePickerPolicy.ts`, `W/canvas/editor/hooks/useResourcePicker.ts`, `W/canvas/editor/hooks/useUpstreamMedia.ts`, `W/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.tsx`, `CanvasResourcePane.tsx`; `W/canvas/editor/components/MaterialNode/index.tsx`, `ConfigPanel/index.tsx`, `ConfigPanel/SlotWells/types.ts`, `SlotWells.tsx`, `SlotHoverPreview.tsx`; `W/canvas/i18n/dict.zh.ts` (and `W/canvas/i18n/dict.en.ts` only with PM-issued equivalent copy), `W/canvas/theme/components.css` only if approved literal copy/styles require them.

Checkpoints: (1) expand schema/DTO and preserve admission, (2) expand current-version saved intent/text selection and resolver parity, (3) wire existing UI and transaction, (4) contract replaced incoming-text/TTS-clear paths for this journey. Each checkpoint has targeted red/green tests; V1 closure needs the whole end-to-end demonstration, not just foundation tests.

### V2 scope — ordered composition and in-place intent changes

`W/shared/graph/generationPrompt.ts`, `W/shared/graph/feedSlot/types.ts`, `assembleEffectiveInputs.ts`, `effectiveFingerprint.ts`, `autoFillSlots.ts`; `W/shared/validation/compatKernel.ts`, `declaredParameterValidation.ts`; `W/shared/graph/materialNode.ts`, `W/shared/graph/canvasInputMutationGateway.ts`; `W/workflow/execution/materialSlotInputs.ts`, `materialGatewayExecutor.ts`; `H/catalog/contract/schemas/textSchema.js`, `H/catalog/contract/submit-guard/slots.js`, `map.js`, `guard.js`; only evidence-backed composition rows in the four YAML files already named in V1.

UI: `W/canvas/editor/utils/resourcePickerPolicy.ts` (existing occupant replacement implementation); `W/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx`, `SlotWells/SlotWells.tsx`, `SlotWells/SlotHoverPreview.tsx`; approved role placeholders in `W/canvas/i18n/dict.zh.ts` (and `W/canvas/i18n/dict.en.ts` only with PM-issued equivalent copy) only. Reuse existing body/local field mapper; request any extra profile/logical-field path explicitly if separate-role proof requires it.

### V3 scope — complete plan/route/format transaction and final guards

`W/shared/api.ts`, `W/shared/validation/compatKernel.ts`, `lineConstraints.ts`, `operationUi.ts`, `executionReadiness.ts`; `W/shared/graph/feedSlot/modelMaterialCapability.ts`, `deriveSlotLayout.ts`, `resolveSlotOperation.ts`, `effectiveInputDisplay.ts`, `slotBindingConflicts.ts`; `W/shared/graph/canvasSlotRecompute.ts`, `canvasInputMutationGateway.ts`; `W/workflow/seam/canvasCatalog.ts`, `submitGuard.ts`, `omnimuxGateway.ts`; `W/workflow/execution/materialSlotInputs.ts`, `materialGatewayExecutor.ts`.

Hub: `H/catalog/project.js`, `H/catalog/contract/submit-guard/guard.js`, `slots.js`; `H/media/execute.js`, `route.js`, `H/text/execute.js`, `route.js` for per-candidate guard context only, not pricing/auth/retry redesign. Existing serving constraints are consumed; new provider constraints/profile capability additions require exact evidence and scope approval.

UI: `W/canvas/editor/hooks/useResourcePicker.ts`, `W/canvas/editor/utils/resourcePickerPolicy.ts`; `W/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.tsx`, `CanvasResourcePane.tsx`; `W/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx`, `channelGroups.ts`, `channelContractReconciler.ts`, `SlotWells/types.ts`, `SlotWells.tsx`; `W/canvas/i18n/dict.zh.ts` (and `W/canvas/i18n/dict.en.ts` only with PM-issued equivalent copy) and `W/canvas/theme/components.css` only white-list copy/control styling. Retire input-authority use of client mirror/default quantities, not unrelated channel-selection UI.

### V4 scope — real file-read adapter → common text node → captured body

`W/shared/localMedia.ts`, `W/shared/api.ts`, `W/shared/graph/nodeInputSource.ts`, `W/shared/graph/nodeFactory.ts`; `W/workflow/routes/localFileRoutes.ts`; `W/canvas/bridge/apiClient.ts`; `W/canvas/editor/utils/localFileDraft.ts`, `resourcePickerPolicy.ts`, `assetImportAdapter.ts`; `W/canvas/editor/hooks/useResourcePicker.ts`; `W/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.tsx`, `LocalUploadPane.tsx`; `W/workflow/execution/materialSlotInputs.ts` for active native/project text reread through existing adapter. Reuse existing project/ingestion utilities as dependencies without changing them by default; if atomic managed-copy cleanup actually requires editing `W/workflow/ingest/IngestionPipeline.ts` or `W/workflow/workspace/ProjectAssetsStore.ts`, seek a scoped amendment first. No file-asset copy is necessary just to parse native text.

### V5 scope — versioned reopen, execution entries and contraction

`W/shared/graph/materialNode.ts`; `W/workflow/workspace/snapshotMigration.ts`, `WorkspaceStore.ts`; `W/shared/graph/feedSlot/hydrateSlotBindings.ts`, `prepareExecutionSlotGraph.ts`, `effectiveInputDisplay.ts`; `W/shared/graph/catalogReconcile.ts`, `canvasSlotRecompute.ts`; `W/shared/validation/executionReadiness.ts`; `W/workflow/execution/nodeExecutors.ts`, `executionInputs.ts`, `materialSlotInputs.ts`, `materialGatewayExecutor.ts`; `W/workflow/execution/ExecutionScheduler.ts`; `W/canvas/store/canvasStore.ts`; `W/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx` for migration/conflict rendering and existing focus/history only. Existing Agent tools call the same mutation/dispatch seams; modifying their schema is not presumed necessary. Exact extra tool path approval is needed if a real gap requires it.

### Documentation/design conformance follow-ups, owner-gated

Read-only design source: `design.md` (裴像素 owns conformance, not replacement). After approved implementation changes, scoped owning-contract updates may be required in `docs/contracts/node-input-submission.md`, `docs/contracts/model-capabilities-matrix.md`, `plugins/omnimux-workflow/docs/contracts/canvas-http-api.md`. The latter records new bounded method and UTF-8/resource policy; do not claim current routes already parse text. `CONTEXT.md` prior-phase edits remain untouched here. No new CONTEXT/ADR/spec file is authorized; these proposed decisions live in this plan for review. No change to AGENTS/CLAUDE, hooks, package scripts, generated lib/dist or runtime configuration is planned.

## 9. Testing decisions and residual unknowns

Each ticket lists exact future files for test-authoring approval, not directory globs. Inline catalog cases parameterize output type and origin/composition; real declarations and actual production mapper capture separately prevent fixture-only claims. Add targeted cases to existing matcher/feed/picker/readiness/submit suites instead of a parallel suite that tests only new helpers. One integrated capture suite and one true browser suite carry the cross-layer journey; neither fabricates result success.

Existing workflow `test` glob includes `src/**/*.test.mjs`, `src/**/*.test.js`, `tests/*.test.mjs`, not nested `tests/e2e` files. The proposed browser suite intentionally lives at the tests root so package acceptance cannot silently omit it. Many existing nested `.e2e.test.mjs` files read source and assert regex; their names do not make them browser evidence. Hub targeted loops use its network-guard preload; package test preserves network blockade. No fixture or test write is approved yet; no test was run during planning.

Remaining engineering facts: exact qualified route/profile source and separate-role mapping, complete document chain, legacy intent evidence, real task-private runtime assembly and PM-signed non-Chinese strings. Resolve these with read-only official contract/mapper evidence and offline capture in the approved implementation, not paid exploratory requests. Confirm the proposed importer policy/interface during plan review. Product choices (same-picker mode confirmation, ordered speech, canvas+TXT/Markdown scope) are closed and are not re-asked.

No `to-spec` / `to-tickets` skill invocation is claimed. This note plus the approved existing spec and draft tickets implements documented equivalent gates, not a substituted skill body or automatic implementation approval.
