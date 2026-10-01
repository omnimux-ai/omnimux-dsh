---
title: "Issue #2848 — Unified upstream input implementation plan"
id: "plan-unified-upstream-input-2848"
type: "plan"
status: "draft"
authority: "L2"
date: "2026-09-30"
authors: ["Gao"]
subsystem: "omnimux-workflow"
---

# Issue #2848 — Unified upstream input implementation plan

**APPROVED IMPLEMENTATION TOPOLOGY — User approved the five vertical slices on 2026-09-30. V1 exact test paths and named legacy cases are approved; later-slice test paths still require their stated scoped authorization. Individual slice acceptance remains pending.**

Worktree: `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-unified-input-issue-2848`.
Observed HEAD/base: `39c6449778c57d2b11451016e17cbb70b508f343`.

## Authority and authorization

The approved [engineering spec](../../specs/unified-upstream-input-2848.spec.md), [PM four-piece plan](../product/unified-upstream-input-2848.md), and [design system](../../design.md) are inputs, not files to rewrite. The main-checkout [architecture audit](/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-reports/unified-upstream-input/architecture-audit.md) is static/historical evidence, not current runtime acceptance.

Requirements and test seams are approved. **Ticket approval and test-file write authorization are separate gates.** The single-file SPEC exemption does not authorize any test, fixture, source, YAML, generated artifact, hook, or runtime write. This round writes only this plan, its [technical notes](unified-upstream-input-2848-plan-notes.md), and the requested [plan report](../../.agent-reports/unified-upstream-input/plan-report.md). Existing context/product/spec changes are preserved. No remote Issue/PR operation, application restart, shared Dev installation, paid generation, test execution, or build belongs to this planning round.

`to-spec` and `to-tickets` are not installed in the session catalog and were **not invoked**. Equivalent documented gates are used: approved behavior specification → reuse-first interfaces and approved seams → draft vertical tickets with dependencies → explicit user approval → exact test-path authorization → red/green implementation → independent review and demonstration. These gates do not claim Matt skill execution or remote ticket publication.

## Architecture and invariants

Use the existing Hub contract → lossless catalog DTO → shared compatibility matcher → Feed/Slot consumption traversal → existing picker → mutation gateway → frozen submission → workflow/Hub guards → vendor mapper chain. Output type chooses an execution adapter, not an input policy. Keep Node ESM Hub, TypeScript shared/host modules, React canvas, existing store and build/test tooling; add no framework, database, capability endpoint, parallel text controller, or generic input engine.

`valueSources` expresses verified origins; `composition` expresses text roles and mapping. Legacy `source: node_field` neither forbids all upstream input nor grants generic upstream permission to every request field. Composing several text sources into one `prompt` field does not make `prompt.max = 1` a source-count limit. Detailed proposed shapes and bounded source scopes live in [technical notes](unified-upstream-input-2848-plan-notes.md), outside ticket behavior sections.

The following hold in every ticket:

- A supplied edge is not consumption. Text, media, and any proven document input use the same saved bindings and selection traversal. Unselected/inactive sources never get restored through incoming-text, token, fingerprint, or executor fallbacks.
- A selection must fit **one admitted operation on one qualified route** with all active bindings, local semantic fields and parameters. Discovery may show multiple plans, but never flatten their capacities or formats into a fictitious union. Picker and submit validate the same constraints; minimum incompleteness permits loading more inputs, not generation.
- Preserve research/implementation/listed/profile qualification. Do not list drafts, relabel stub execution as live, fabricate reference slots, or treat BYOK configuration as capability evidence.
- Known incompatibility rejects confirmation; pending necessary metadata can remain bound as pending, never ready. Mode/model/channel changes preserve active intent and make conflicts visible; no slicing, silent role change, or optional-input omission to obtain a green state.
- UI stays within the PM white-list and existing design: one picker, same-line text/media cards, literal approved copy, SVG, native tokens, accessible reasons and focus restoration. No badge/tagline/marketing fields are added to picker or input interfaces.

## Approved seams and evidence layers

The spec's six seams and PM A1–A8 are mapped below without reopening approval:

| Seam | Test surface | Required observable evidence |
|---|---|---|
| A1 contract projection | Loader/schema → Hub DTO → canvas catalog | Origin/composition/groups/limits/status/implementation/route/defaults/fingerprint survive; qualification unchanged |
| A2 discovery | Empty-node panel and candidate projection | Four output types share one upstream-entry predicate; local-only/source-only/no-catalog negatives |
| A3 selection transaction | Picker decision → mutation → store/history | Whole-group feasibility, confirmed mode/route, atomic graph update, cancel/undo |
| A4 consumption | Saved bindings → selected current outputs → assembler | Stable identities/order; replace/inactivate/reactivate; no standby-text leak |
| A5 text mapping | Real resolver/assembler/executor/Hub mapper | Ordinary content+requirements; single-body speech; supported separate roles; no filename/token narration |
| A6 final constraints | Metadata/route matcher → readiness → both guards | MIME, count, groups, size/duration/aggregate/text-length, unknowns and empty route intersections agree |
| A7 execution snapshot | Node/quick/Agent/dependency execution | Frozen config/content/order/catalog/route, dependency-completion revalidation, saved-graph continuity |
| A8 browser | Real canvas UI in task-private worktree runtime | Functional navigation and screenshots, never homepage or source-regex evidence |

Offline provider-boundary request capture proves assembly and blocking only. Real browser evidence proves interaction and loaded-code identity only. Supplier generation remains **NOT RUN / NOT AUTHORIZED**; neither layer may be reported as real supplier success.

## Ticket topology and dispatch gate

`V1 → V2 → V3 → V4 → V5`.

All five are independently demonstrable incremental behaviors, each spanning contract/shared logic, existing UI and actual submission as needed. Four outputs are parameter rows **inside every applicable slice**, never four implementation tickets. Dependencies are serial because matcher/bindings/picker/executor scopes overlap. No simultaneous writes to shared scopes.

After user approval, start a **new fresh expert context for each implementation ticket**. Do not reuse the architect/planning context or the previous ticket's implementer. Each fresh expert receives the approved spec, its full ticket, the relevant scope row, predecessor evidence and exact allowed test paths.寇豆码 (`expert_software_engineer`) owns contract/shared/host/CLI logic; 裴像素 (`expert_software_frontend_developer`) owns UI/interaction/design conformance inside the slice. A fresh slice coordinator integrates these roles; this is not a top-level front/back split or authorization to create Agent Teams. Independent review/QA are distinct from implementation.

The breadth of V1 is real: provenance and text consumption already span both plugins. Execute its expand–switch–contract checkpoints in order, not as a sweeping rename. The five slice count is a product-delivery constraint, not a claim that each slice modifies fewer than five physical files. File ownership and checkpoint details are bounded in technical notes; any additional scope requires plan amendment before writes.

---

## V1 — Select canvas text through the common upstream entry

**Status:** Published for scoped V1 implementation on 2026-09-30. User approved the topology, exact V1 test paths and named legacy-case replacements. **Blocked by:** no predecessor; each production declaration still requires qualified mapper evidence before expansion. Backend/shared implementation dispatched first; frontend follows the stable Interface within this same vertical ticket.

### End-to-end behavior to deliver

A newly created empty text/image/video/audio output node whose qualified contract explicitly permits upstream text shows the existing `添加素材` entry. Open the existing picker, select a ready canvas text output, confirm once, preview the bound content, and capture that same content at the production submission/mapper chain. Stop and resume use without deleting the source or edge; local-only generation still works when its contract permits it. A purely local `node_field`, an ASR/source-only task, a missing catalog, and an unlisted operation do not manufacture upstream text support.

### Acceptance

1. Parameterize the same contract/discovery/binding/request journey over `text`, `image`, `video`, `audio`. Empty graph and empty editor still show an entry when upstream origin is proven, but missing required input still blocks. No output-based slot suppression or media-only entry predicate remains on this new path.
2. Contract origins, groups, implementation, limits, routing and defaults pass unchanged through catalog/canvas projection. Representative production declarations have offline mapper evidence; generic `node_field` never grants permission. Qualification/draft-negative tests remain strict.
3. Current-version bindings are initialized explicitly on new nodes. All execution preparation respects that version and cannot autofill unselected text. Selected text has source/output/edge/role/order/use identity and enters the same selection traversal as media. With bound text A and unselected supply B, captured content contains A once and B zero times. Inactivate A: source/edge/card remain, captured A count is zero. Reactivate via full-set validation: A once. Deleting an editor token is not a consumption change.
4. Add/cancel/undo leave coherent graph and consumption state. Single-body speech already follows the approved body rule, never an interim two-source rejection. Multiple-source details are expanded in V2; no temporary output-specific input engine is accepted.
5. In the real task-private canvas UI, independently create each output node, open its panel, click the empty entry, select text, confirm, preview and inactivate/reactivate. Keep same-run screenshots and loaded bundle identity. Static source assertions are supplementary only.

### Approved seams and responsibility inside slice

A1, A2, A3 baseline, A4, A5 baseline, A8. 寇豆码 extends original contract/DTO/matcher/binding/submit interfaces and captures the real assembly chain; 裴像素 adapts existing wells, picker, preview and approved local-editor role copy. Contract owner checks source/mapping evidence. No paid call, no draft listing.

### Bounded implementation scope

Use only the V1 scope row in technical notes. Introduce the new interface and new-graph consumption version first; switch all V1 consumers together; contract only the replaced text bypasses. Existing unmigrated graphs are preserved, not opportunistically consumed; V5 supplies versioned migration. If required migration evidence is unavailable, show a migration gap rather than guessing bindings. Broad renaming and unrelated model lists are excluded.

### Exact future test-file permission request

Existing files to append behavior tests (not permission to alter conflicting expectations):

- `plugins/omnimux/src/catalog/contract/schema.parity.test.js`
- `plugins/omnimux/src/catalog/contract/load.test.js`
- `plugins/omnimux/src/catalog/project.test.js`
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs`
- `plugins/omnimux-workflow/src/shared/validation/compatKernel.test.mjs`
- `plugins/omnimux-workflow/src/shared/graph/feedSlot/feedSlotKernel.test.mjs`
- `plugins/omnimux-workflow/src/canvas/editor/utils/resourcePickerPolicy.test.mjs`
- `plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/feedSlotSubmission.test.mjs`

New behavioral integration/capture suite: `plugins/omnimux-workflow/src/workflow/execution/unifiedUpstreamInput2848.test.mjs`.
New real-browser suite: `plugins/omnimux-workflow/tests/unified-upstream-input-2848.browser.test.mjs`.

Separate legacy-case permission request for V1: `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/textSlotAcceptance.test.mjs` (TC-T01-05/TC-T02-01 origin-qualified positive/local-only negative and TC-T01-07 explicit-current-mode protection), plus the TTS layout cases at lines 212–239 in the already listed feedSlotKernel test. Preserve original failure evidence and replacement negative coverage; this is not permission to weaken them.

No new on-disk fixtures requested; use inline cases and test-owned temporary real files only. Legacy test conflicts below need **separate expectation-level approval**, even if their file appears in this list.

### Verification and demonstration exit

Run targeted tests at the listed paths through Node's existing test mechanism, red before source changes and green after, then the applicable command union below. Capture actual executor → gateway → Hub guard/mapper → blocked external transport; do not construct an expected request and call it capture. Demonstrate four empty-node journeys and inactive-text exclusion. Record failure/skip counts, unresolved old tests and capability gaps; V1 is not accepted with unexplained red regression.

---

## V2 — Preserve ordered multi-source text through replacement and speech

**Status:** Draft. **Blocked by:** accepted V1 and V2 test-path approval.

### End-to-end behavior to deliver

Select multiple ready canvas texts in a stable material order, retain local editor text, and capture all intended content without duplicating sources. Ordinary generation receives source content plus local requirements. A single-body speech task receives upstream A, then upstream B, then local body joined by paragraph boundaries, with no names, source labels or token syntax. Replace A with C in place; inactivate B and resume it; switch to a supported separate-role task without silently reinterpreting local body as instruction.

### Acceptance

1. The four outputs share the same bindings and assembler; composition comes from the qualified operation/route contract. A single request field with `max=1` accepts several composable text sources unless an independently evidenced source constraint says otherwise. Aggregate final-field character limits include all sources and local text; oversize rejects without truncation.
2. Speech exact example: `第一段。\n\n第二段。\n\n最后一段。`; no `台词.txt`, `来源`, `补充要求`, or reference tokens enter the narrated body. Inactivate B → A/local; replace A → C/B/local in the same positions. Identical text in different legitimate identities remains; same source/output/role is sent once.
3. Ordinary composition preserves content/requirement boundaries. Separate-role, lyric and style mappings only exist where the actual mapper supports them. Unsupported role transitions retain intent visibly and block; no text-content guessing, no global audio rule, no two-source speech block.
4. Missing/waiting/current-output changes cannot be silently omitted. A submitted request uses its frozen text/configuration; edits during an await affect only the next request. Browser previews/card order and offline captured order agree.

### Approved seams and roles

A4, A5, A6 final text limits, A7 snapshot baseline, A8. 寇豆码 owns composition and mapper/capture parity; 裴像素 owns same-row order, in-place replacement, inactive state, preview and exact editor placeholder. No separate text section, merge toggle or TTS warning panel.

### Bounded scope

Only V2 paths in technical notes; reuse the V1 interface, do not create another composer. Role fields are contractual semantics, not UI decoration. The externally visible ordering/replacement flow is the delivery unit, not a backend task.

### Exact future test-file permission request

- `plugins/omnimux-workflow/src/shared/graph/feedSlot/feedSlotKernel.test.mjs`
- `plugins/omnimux-workflow/tests/generationPrompt.regression.test.mjs`
- `plugins/omnimux-workflow/src/canvas/editor/utils/occupantReplacement.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/materialSpeechSubmission.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/unifiedUpstreamInput2848.test.mjs` (created in V1)
- `plugins/omnimux/src/catalog/contract/submit-guard/submit-guard-map.test.js`
- `plugins/omnimux/src/catalog/contract/submit-guard/seed-audio.test.js`
- `plugins/omnimux-workflow/tests/unified-upstream-input-2848.browser.test.mjs` (extend same suite)

Separate legacy-case permission request: the declared-audio stripping case in materialSpeechSubmission and changed identity/fallback cases in generationPrompt.regression, both already listed. Preserve unsupported-mapper rejection and ordinary content/requirement boundaries.

These are requested, not granted; fixture/helper edits are not implicitly included. Any legacy expectation changes require the conflict gate below.

### Verification and demonstration exit

Red/green ordered capture cases including max-one aggregate field, character-limit boundaries, identical bodies with different identities, replacement/inactivation and concurrent edit. Show real browser material order/preview across the four output rows and the speech-specific body capture. Run applicable union. Unsupported separate-role profiles are explicitly reported as unavailable, never simulated as supplier support.

---

## V3 — Confirm one complete mode/channel plan in the picker

**Status:** Draft. **Blocked by:** accepted V2 and V3 test-path approval.

### End-to-end behavior to deliver

From the common entry, discover qualified same-model modes and select a whole text/media group. When the group requires another mode/channel, the **same picker** shows the target mode/channel and `添加` confirms both selection and change atomically. Cancel leaves graph/configuration intact. Known format, capacity, role, input-group and route conflicts prevent confirmation; pending metadata can remain visibly pending but never enables generation. Switch model/mode/channel with existing inputs, see preserved conflicts, and repair by replacement or inactivation.

### Acceptance

1. Parameterize positive and negative complete-group cases across four output kinds. Image-only mode plus audio-only mode is discoverable but not a mixed plan; route accepting image plus a different route accepting audio is not a mixed plan. A genuine mixed mode on a single route works. All active bindings and local semantics participate in every toggle and final recheck.
2. Named first/last frame entries and generic entry use the same picker/matcher. Ambiguous image roles require explicit role choice. Swap preserves edges/identities and succeeds only if both roles and whole-group constraints remain valid; duplicate output in distinct roles needs explicit contract permission.
3. Type and concrete format filters derive from qualified plans and implemented import/mapper paths. Known MIME mismatch, inclusive/exclusive size and duration boundaries, totals/combined output duration, count and input-group minimums have the same truth at picker, binding, readiness and actual workflow/Hub dispatch. Required minimums may remain incomplete while loading; generated-call count stays zero until ready.
4. Necessary unknown MIME/size/duration/route constraints remain unknown/pending, not zero, unlimited or ready. Empty parameter/type route intersections invalidate the plan rather than restoring broad capability or deleting required slots/groups. Every automatic/fallback route independently accepts the complete frozen request. External/BYOK routes without qualification fail closed.
5. Mode/channel confirmation is visible before mutation, never delayed to billable submit. Source/config changes between picker render and confirmation force revalidation. Rejection leaves no partial bindings/imports/mode change. Switch conflicts stay on original cards in approved states and block generation until resolved; no silent first-item trimming.

### Approved seams and roles

A1 route fidelity, A2 candidate provenance, A3, A4 conflict preservation, A6, A8. 寇豆码 removes client-side-effect dependence from route constraints and revalidates every dispatch candidate; 裴像素 presents mode/channel/role and formats in the existing picker with the PM literal copy. Source-only/document-negative cases remain honest.

### Bounded scope

Only V3 notes row. Reuse original matcher and route narrowing/guards; no new router or endpoint. Expand route-context arguments, switch UI/host callers, then remove broad-contract fallback for this mechanism. Update exact affected L1 rules through their owners only after authorization, not by treating this draft as an override.

### Exact future test-file permission request

- `plugins/omnimux-workflow/src/shared/validation/compatKernel.test.mjs`
- `plugins/omnimux-workflow/src/shared/validation/lineConstraints.test.mjs`
- `plugins/omnimux-workflow/src/shared/validation/executionReadiness.test.mjs`
- `plugins/omnimux-workflow/src/shared/graph/canvasInputMutationGateway.compat.test.mjs`
- `plugins/omnimux-workflow/src/canvas/editor/utils/resourcePickerPolicy.test.mjs`
- `plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.test.mjs`
- `plugins/omnimux-workflow/src/workflow/seam/submitGuard.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/feedSlotSubmission.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/unifiedUpstreamInput2848.test.mjs`
- `plugins/omnimux/src/catalog/project-channel-groups.test.js`
- `plugins/omnimux/src/catalog/contract/submit-guard/submit-guard-slots.test.js`
- `plugins/omnimux/src/catalog/contract/submit-guard/submit-guard-execute.test.js`
- `plugins/omnimux-workflow/tests/unified-upstream-input-2848.browser.test.mjs`

Separate legacy structure-test permission request: `plugins/omnimux-workflow/tests/e2e/modelSlotBorrow-material-picker.e2e.test.mjs`, limited to replacing first-borrow/implicit-switch/loose-types source assertions with confirmed whole-plan behavioral regressions. Run it explicitly with `node --test plugins/omnimux-workflow/tests/e2e/modelSlotBorrow-material-picker.e2e.test.mjs` because the package glob excludes nested e2e files; it is still not browser acceptance. Active-invalid omission cases in the already-listed feedSlotSubmission suite also require exact expectation authorization; preserve the supply-only B-selection regression.

### Verification and demonstration exit

Red/green same-op/same-route and metadata boundary matrix; actual rejected submissions yield zero external calls. Demonstrate cancel, target-mode confirmation, frame role/swap, incompatible switch and repair in the real canvas. Run applicable union including model-contract verification and both touched packages. Static source-regex E2E suites do not satisfy this exit.

---

## V4 — Import real TXT and Markdown into the same bindings

**Status:** Draft. **Blocked by:** accepted V3, V4 test-path approval and importer interface approval in technical notes (not a product-scope question).

### End-to-end behavior to deliver

In the existing picker local tab, native-select or drag a real `.txt`, `.md` or `.markdown` file. Read and validate actual bytes through the existing host file adapter; preview parsed raw text as a candidate, then `添加` creates a text upstream node/edge/binding in the same transaction. The file name is a card name, never body text. Inactivate, replace, reorder, restore and submit this imported text exactly like canvas text.

### Acceptance

1. Four output rows use the same text import and bindings; TXT and both Markdown extensions have real filesystem-read evidence, not extension-only readiness. Markdown preserves source markup. UTF-8 with optional BOM is decoded strictly; unsupported/binary encoding, NUL, empty/blank file, stat/read failure, invalid/nonregular path, over-limit bytes and vanished file have visible failure and no ready text.
2. Read limits are an explicitly documented importer safety policy, separate from supplier limits. Necessary size is real stat/read length, never draft zero. Final composed text limits still apply. Original user files are not modified; project-owned file paths/asset identity follow the existing ownership seam. A file invalidated before the next submit is unavailable, not silently replaced by cached content.
3. Same batch: parse every intended file and whole-group validate before graph confirmation; any failure leaves no partial target edge/binding and reports failure, not partial success. Cancel/removal discards only drafts, with async session ownership guarding late reads. No text pasted into the local editor and no parallel attachment-consumption path.
4. Format choices reflect importer+effective contract intersection. TXT/Markdown become parsed text, not a claimed vendor document MIME. PDF/Office and unknown document support remain excluded without complete model/route/import/mapper evidence. Browser file selection, parsed preview, add, inactivate and actual captured request all match.

### Approved seams and roles

File-read seam in the spec plus A2–A6 and A8. 寇豆码 owns bounded host decoding/read/path/probe and execution re-read; 裴像素 owns the existing local tab/draft preview/async cancel and common cards. No new document extractor, upload service or dependency.

### Bounded scope

Use V4 notes row and existing pick/local-file/ingestion/asset seams. A new method on the existing local-file route is acceptable; a new capability API or importer subsystem is not. Importer policy values are proposed for approval in technical notes and may not be misreported as observed supplier constraints.

### Exact future test-file permission request

- `plugins/omnimux-workflow/src/workflow/routes/localFileRoutes.test.mjs`
- `plugins/omnimux-workflow/src/shared/localMedia.test.mjs`
- `plugins/omnimux-workflow/src/canvas/editor/utils/assetImportAdapter.test.mjs`
- `plugins/omnimux-workflow/src/canvas/editor/utils/resourcePickerPolicy.test.mjs`
- `plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.test.mjs`
- `plugins/omnimux-workflow/src/shared/graph/nodeInputSource.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/unifiedUpstreamInput2848.test.mjs`
- `plugins/omnimux-workflow/tests/unified-upstream-input-2848.browser.test.mjs`

New draft-boundary suite: `plugins/omnimux-workflow/src/canvas/editor/utils/localFileDraft.test.mjs`.
Use test-owned temporary files rather than adding fixture directories; filesystem/browser writes during future tests require their own approved test runtime scope.

### Verification and demonstration exit

Red/green actual-byte file tests and batch/cancel tests. Real browser file choice/drag on a private canvas, raw Markdown preview, bound card and provider-boundary capture; separately report unsupported encoding/document paths. Run applicable union, including product-baseline and host boundary tests because import paths are touched. No real supplier request.

---

## V5 — Reopen saved intent and execute the same snapshot everywhere

**Status:** Draft. **Blocked by:** accepted V4, V5 exact test authorization and reviewed legacy migration evidence.

### End-to-end behavior to deliver

Save/reopen a graph with ordered active/inactive/conflicting text and media bindings, and retain intent through undo/redo and model/route changes. Open an eligible legacy graph, migrate only historically evidenced consumption once, preserve results and source content, and never activate new supply by loading. Execute the same graph through direct node, quick action, Agent and dependency workflow paths; after dependencies finish, freeze and validate the same input plan before actual dispatch.

### Acceptance

1. Versioned migration is deterministic/idempotent and lazy. Existing saved bindings, inactive flags, order, explicit operation/roles, source content and historical results survive unchanged. Only old-version inputs with proven historical consumption are hydrated, in their old stable order. Ambiguous old consumption yields a visible migration gap and blocks that request, not a guessed binding. No current-version empty bindings are treated as permission to auto-consume all text edges.
2. Four output rows exercise direct/quick/Agent/workflow entry points with the same plan. Dependency placeholders are never sent; completion triggers revalidation of current selected output and metadata. Required/optional active invalid bindings block equally, while merely supplied/inactive inputs do not consume capacity or body text.
3. Introduce a controlled await, then edit upstream output, order, local body, route or catalog: the in-flight request contains one coherent frozen version and later execution sees the new version. Explicit inactive intent cannot be overwritten by legacy edge mirrors or execution preparation. Rejection has zero provider submissions.
4. Reopened browser graph shows the same material order/states and supports repair/undo. Final functional demonstrations cover all PM journeys for the four outputs, both real text formats, whole-group/format/route negatives, themes, keyboard/Esc/focus and literal white-list copy. Record every unresolved model/profile/document/translation gap rather than reporting universal support.

### Approved seams and roles

A4, A6, A7, A8 and old-graph criterion in the approved spec. 寇豆码 owns versioned migration, shared execution preparation and snapshot/revalidation; 裴像素 owns reopened state rendering, undo/focus and final design/white-list review. QA and PM final acceptance are independent roles, not claimed by the implementer.

### Bounded scope

V5 notes row only. Expand migration/version support, run all entry paths against new bindings, then contract old text auto-consumption/TTS clearing/mirror-authority branches proven unused. Do not rename Feed/Slot directories or mechanically rewrite unrelated models/tests. Any extra fixture or storage schema path is an explicit scope amendment.

### Exact future test-file permission request

- `plugins/omnimux-workflow/src/workflow/workspace/snapshotMigration.test.mjs`
- `plugins/omnimux-workflow/src/shared/graph/catalogReconcile.test.mjs`
- `plugins/omnimux-workflow/src/shared/graph/feedSlot/feedSlotKernel.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/executionReadinessEntries.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/feedSlotSubmission.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/executionInputs.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution/unifiedUpstreamInput2848.test.mjs`
- `plugins/omnimux-workflow/src/workflow/agent-graph-tools.test.mjs`
- `plugins/omnimux-workflow/src/workflow/execution-scheduler.test.mjs`
- `plugins/omnimux-workflow/tests/unified-upstream-input-2848.browser.test.mjs`

New history suite: `plugins/omnimux-workflow/src/canvas/store/unifiedInputHistory2848.test.mjs`.

### Verification and demonstration exit

Red/green migration/reload, entry-point capture and deferred-await races. Run the final affected-package union, independent source review, OCR CLI review, PM implementation-vs-white-list review and QA behavioral acceptance. Demonstrate before merge and obtain explicit user confirmation. Do not sign PM PASS, merge, publish, install into shared Dev or call paid suppliers from planning approval alone.

---

## Existing-test and L1 conflict register — never weaken

Observed conflicts are not failing-test execution results; no tests ran in this round.

| Read evidence | Conflict/qualification | Gate before modification |
|---|---|---|
| [textSlotAcceptance.test.mjs:265–322](../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/textSlotAcceptance.test.mjs#L265-L322) | TC-T01-05/TC-T02-01 assert pure-text no wells. Legacy `node_field` fixture alone does not prove upstream permission; retain the local-only negative and add a separately verified-origin positive. | Precise case/fixture authorization; no globally inverted expectation |
| [textSlotAcceptance.test.mjs:300–307](../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/textSlotAcceptance.test.mjs#L300-L307) | Explicit saved chat is overwritten with vision_chat, unlike current intent preservation. | Separate approved versioned-migration case, preserve explicit-current-operation regression |
| [feedSlotKernel.test.mjs:212–239](../../plugins/omnimux-workflow/src/shared/graph/feedSlot/feedSlotKernel.test.mjs#L212-L239) | Declared TTS audio inputs are suppressed globally. | Profile-qualified positive plus unsupported-mapper negative; do not globally enable all audio references |
| [materialSpeechSubmission.test.mjs:52–61](../../plugins/omnimux-workflow/src/workflow/execution/materialSpeechSubmission.test.mjs#L52-L61) | Declared audio refs/tracks are always stripped. | Exact expectation adjustment only after route/mapper evidence; keep genuine unsupported-field rejection |
| [feedSlotSubmission.test.mjs:84–110](../../plugins/omnimux-workflow/src/workflow/execution/feedSlotSubmission.test.mjs#L84-L110) | Removed active slots and optional unavailable intent can be omitted without blocking. | Distinguish active conflicting intent from inactive/supply; exact expectation approval |
| [feedSlotSubmission.test.mjs:91–96](../../plugins/omnimux-workflow/src/workflow/execution/feedSlotSubmission.test.mjs#L91-L96) | Three supply edges with only B bound send B; this is compatible, not grounds to demand all Feed be consumed. | Preserve this supply-vs-consumption regression; add explicit multi-selected overflow rejection |
| [generationPrompt.regression.test.mjs:6–57](../../plugins/omnimux-workflow/tests/generationPrompt.regression.test.mjs#L6-L57) | Node-only dedupe and implicit table/document prose fallback can disagree with selected-output/role identity. Ordinary source/requirement boundary expectations remain valid. | Approve exact changed identity/fallback cases; retain ordinary boundary assertions |
| [modelSlotBorrow-material-picker.e2e.test.mjs:30–59](../../plugins/omnimux-workflow/tests/e2e/modelSlotBorrow-material-picker.e2e.test.mjs#L30-L59) | Source-regex checks pin first borrowed mode and implicit switch; not real browser E2E. | Approve replacement behavioral coverage before adjusting brittle structure assertions |
| [node-input-submission.md:57,121–124](../contracts/node-input-submission.md#L57) | L1 still separates media/text and allows some explicit-invalid optional intent to disappear/nonblock. | Contract-owner scoped update aligned with current approved requirements; no claim L1 already changed |

When a test conflicts: retain the red evidence and exact assertion, identify approved behavior and replacement regression, request permission for the exact file/case (including fixture path if any), and stop that modification until approved. Never skip/delete/weaken assertions, change a hook, switch tools/paths, or hide failures with filters to claim package-green. Plan approval is not anti-cheat exemption. All current test permissions are **NOT GRANTED**.

## Commands — concrete, future only

Observed script authorities: [root package](../../package.json), [workflow package](../../plugins/omnimux-workflow/package.json), [Hub package](../../plugins/omnimux/package.json), [Hub runner](../../plugins/omnimux/scripts/run-tests.mjs), and [QA command matrix](../contracts/plugin-qa.md#L128-L160). Run from the explicit task worktree; all Git commands include `-C`. Do not pipe tests through `tail` and lose the real exit status.

### Current plan-only validation

`git -C /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-unified-input-issue-2848 diff --check`

Inspect newly written Markdown too: untracked files are not included by `git diff --check`. Verify local links and documented future paths, review whitespace, and confirm no new changes outside the three allowed artifacts. No staging is required for this validation.

### Per-ticket red/green fast loops

Use `node --test <exact workflow test paths listed in the ticket>`; there is no fictitious `test:unified-input` script. Examples:

`node --test plugins/omnimux-workflow/src/workflow/execution/unifiedUpstreamInput2848.test.mjs plugins/omnimux-workflow/src/shared/validation/compatKernel.test.mjs`

Hub fast loops preserve its network guard:

`node --import ./plugins/omnimux/scripts/test-network-guard.mjs --test plugins/omnimux/src/catalog/contract/schema.parity.test.js plugins/omnimux/src/catalog/project.test.js`

V4 read loop:

`node --test plugins/omnimux-workflow/src/workflow/routes/localFileRoutes.test.mjs plugins/omnimux-workflow/src/canvas/editor/utils/localFileDraft.test.mjs`

Future functional browser suite:

`node --test plugins/omnimux-workflow/tests/unified-upstream-input-2848.browser.test.mjs`

It must load actual production canvas modules in a task-private runtime through existing runtime/bootstrap seams, exercise UI events and preserve real PNG/runtime identity. It must fail with a clear environment-blocked result when browser/runtime capabilities are absent, not report an all-skipped PASS. Existing `pnpm test:worktree-web -- --stage workflow` addresses a workflow-library Stage fixture, not the complete material-input journey, and is **not selected as substitute acceptance**. Use the approved ego-browser task space when needed; no made-up CLI flags, shared Dev or homepage evidence.

### Minimal affected-surface union at slice acceptance

| Trigger | Concrete command | Selection |
|---|---|---|
| Actual diff classification | `node scripts/impact-matrix.mjs --git-diff --base 39c6449778c57d2b11451016e17cbb70b508f343` | Every slice; record browser.required and actual changed paths |
| Markdown/whitespace | `git -C /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-unified-input-issue-2848 diff --check` | Every slice |
| Hub business/contract changes | `pnpm --filter omnimux test` | V1/V2/V3; V4/V5 only if actual Hub diff requires it |
| Workflow/shared/UI/host changes | `pnpm --filter omnimux-workflow test` | All slices, entire affected package, not just new tests |
| TS interfaces | `pnpm --filter omnimux-workflow typecheck` | All slices; existing noEmit canvas+host script |
| Production canvas integration | `pnpm --filter omnimux-workflow build` | Before the workflow package suite: observed execution-scheduler tests import dist/index.js. All UI slices; generated outputs stay worktree-local, never edit lib by hand |
| Model schema/route changes | `pnpm verify:model-contracts` | V1/V2/V3; later only if model surface changes |
| Cross-plugin model contract propagation | `pnpm verify:cross-plugin-models` | V1/V2/V3; later only if relevant DTO/route changes |
| Client/Stage/wells/copy | `pnpm verify:stages`; `pnpm verify:slots`; `pnpm test:ui` | All five, deduped |
| Cross-plugin seams | `pnpm check:boundaries` | V1/V3/V4/V5 or any new cross-plugin import risk; never import Hub source into workflow |
| New-user local file paths | `pnpm verify:product-baseline` | V4; also V5 if migration/default-path surfaces change |
| Real function-path browser | `node --test plugins/omnimux-workflow/tests/unified-upstream-input-2848.browser.test.mjs` | Every applicable slice; four parameter rows, fresh same-version evidence |
| Agent schema/tools actually modified | `pnpm test:agent-tools`; `pnpm verify:tools` | Only V5 if actual tool/schema diff; not automatically required merely invoking existing Agent entry |

Final union is the deduplicated set for the **actual accumulated diff**, not unconditionally every row. Do not run `pnpm test:all`, `pnpm verify:all`, root `pnpm test`, recursive all-plugin tests or unrelated release/lifecycle gates. `test:ui` does not prove geometry; package tests do not prove real browser; a build does not prove supplier execution. DSH inject/cordis, stage-scroll, pricing and Electron are not planned changes, so their unrelated checks are omitted unless actual scope changes and is approved. Pure plan artifacts require no package tests/build/browser/runtime.

## Completion, decision and failure gates

Approval request is for this draft topology, minimal interfaces/importer policy and bounded ticket scopes. Afterwards the coordinator requests **exact scoped test authoring permission per ticket**, including separately identified conflicting legacy cases. Only then does a fresh expert begin red-first implementation. If permission is denied, stop that write and return the denial to the coordinator; do not change path/tool to evade it.

A slice closes only after red/green evidence, affected-package regressions, real functional browser demonstration, provider-boundary captures and independent review are recorded; missing capability evidence stays unknown. V2 and V3 are explicit user-visible checkpoints before further integration. Final PM sign-off, QA verdict, user demo confirmation, merge authorization and supplier-generation authorization are separately reported. This document authorizes none of them and claims no implementation success.
