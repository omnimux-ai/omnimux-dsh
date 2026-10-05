# Issue #3146 — 成片节点重复导出后预览不自动刷新

Worktree: `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/clip-preview-refresh-3146`
Branch: `fix/clip-preview-refresh-3146-issue-3146` (base `origin/main` @ `9508af171`)
Spec: `specs/clip-preview-refresh-3146.spec.md` (uncommitted, worktree-local)
Report written: 2026-10-05

---

## 1. Conclusion

**FIXED and verified in a real browser.** The downstream 成片 node's `<video>` element now
reloads and becomes playable after a re-export **without any user action and without calling
`video.load()`**.

Root cause was a missing *data* dimension, not a rendering bug: the exported file is
overwritten in place (`<DSH_HOME>/omnimux/clip/exports/<projectId>.mp4`), so the node's
`mediaUrl` was byte-identical across exports. React therefore kept the same `<video>` DOM
element and never re-set `src`, leaving it stuck in whatever state the first load produced
(`readyState=0` / `error.code=4`). `planClipExportDownstream` also produced an empty patch
(`null`) because nothing in the node data had changed.

Fix: the clip host now returns the written file's content identity (`mtimeMs:size`) as
`revision` on `save-export`; the canvas carries it into the downstream node's `mediaUrl` as
`&rev=<token>`. The URL — i.e. the state itself — changes on every export, so the browser
fetches the new bytes. No DOM manipulation, no `load()` call, no CSS, no client blacklist.

---

## 2. Root cause — file + line evidence

Read from the worktree at `origin/main` @ `9508af171` **before** any edit.

| # | File | Line | Evidence |
| --- | --- | --- | --- |
| R1 | `plugins/omnimux-workflow/src/canvas/nodes/definitions/videoCompositionDownstream.ts` | 30–35 | `clipExportMediaUrl(videoPath)` built `?path=<enc>` from the path alone — no version dimension existed. |
| R2 | same | 115–124 | `existingDownstreamNode` matched on `data.mediaUrl === mediaUrl`; identity was path-only. |
| R3 | same | 132–140 | `desiredData()` set `mediaUrl: clipExportMediaUrl(videoPath)` — identical for every export of the same project. |
| R4 | same | 148–155 | `reuseRefresh()` whitelist included `mediaUrl`; `changedFields()` therefore found **no** difference on re-export and `planClipExportDownstream` returned `null` (line 210–214 of `videoComposition.tsx` → no patch, no re-render). |
| R5 | `plugins/omnimux-clip/src/http/routes.js` | 245–258 (pre-edit) | `POST …/save-export` returned `{ id, saved, path, bytes }` — no content identity, so the client had no way to express "the file changed". |
| R6 | `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/MediaPreview.tsx` | 74–82 | `video` case renders `<video src={url} …>` with no `key`; React reuses the element when `url` is unchanged. This is *correct* behaviour — the fix belongs upstream of it. |

Confirmation that the value never changed is in `reuseRefresh`'s own docstring (line 174–178
pre-edit): the patch is deliberately a no-op when nothing changed. On a re-export nothing
changed, hence no reload — exactly the reported symptom.

---

## 3. The change

### 3.1 Files

| File | Change |
| --- | --- |
| `plugins/omnimux-clip/src/http/routes.js` | + `exportFileRevision(file, fs)` (`mtimeMs:size`, same convention as `omnimux-workflow/src/projects/mediaRevision.ts`); `save-export` response now also returns `revision`. |
| `plugins/omnimux-clip/src/client/openreel/web/services/export-runner.ts` | `persistExportBlobToHost` return type gains `revision`; it is forwarded into the canvas `notifyCanvasSave` payload's `output`. |
| `plugins/omnimux-workflow/src/canvas/bridge/clipEvents.ts` | `SaveClipEditorPayload.output.revision?: string`; `VideoCompositionNodeData.outputRevision?: string`. |
| `plugins/omnimux-workflow/src/canvas/nodes/definitions/videoCompositionDownstream.ts` | `clipExportMediaUrl(videoPath, revision?)` appends `&rev=`; `ClipExportOutput.revision?`; `desiredData()` passes it; `existingDownstreamNode()` additionally matches by the decoded `?path=` so an older-`rev` node is still reused, not duplicated. |
| `plugins/omnimux-workflow/src/canvas/nodes/definitions/videoComposition.tsx` | `onSave` stores `outputRevision`; the repair effect feeds `revision: nodeData.outputRevision` back into `planClipExportDownstream` (and the field joins that effect's dependency list). |
| `plugins/omnimux-workflow/src/canvas/nodes/definitions/videoCompositionDownstream.test.mjs` | +5 regression cases (U2–U6). |
| `plugins/omnimux-clip/src/export-upload.test.js` | +1 case (E1: `save-export` returns a revision that differs between two writes). |

### 3.2 Before → after (the essential line)

```ts
// before
mediaUrl: clipExportMediaUrl(videoPath)                       // …?path=%2F…%2Fclip_node_1.mp4
// after
mediaUrl: clipExportMediaUrl(videoPath, input.output.revision) // …?path=%2F…%2Fclip_node_1.mp4&rev=1760000123456%3A2097152
```

With **no** `revision` (historical/3rd-party callers) the URL is byte-identical to before —
asserted by the existing test `clipExportMediaUrl：绝对路径转宿主 URL，已解析的 URL 原样透传`.

### 3.3 Why each acceptance criterion holds

- **AC1** — `save-export` returns `revision = "<mtimeMs>:<size>"` of the file it just wrote
  (`routes.js`, `exportFileRevision`). E1 proves two successive writes to the same path yield
  different tokens.
- **AC2 (fix data at its source)** — the token lands in `data.mediaUrl` on the downstream
  node. React re-renders `<video src>` because the *string changed*; the browser issues a new
  request. No `load()`, no `key`, no DOM/CSS masking, no blacklist.
- **AC3** — `existingDownstreamNode` keeps the `origin` + `sourceCompositionNodeId` identity
  and now also compares the decoded `?path=`, so a node carrying an older `rev` resolves to
  the same file. U5 covers this.
- **AC4** — re-applying the same `revision` yields `plan === null` (U4); the repair effect
  re-derives `mediaUrl` **from the stored `outputRevision`**, so the two effects cannot strip
  each other's `rev` (U6).
- **AC5** — real-browser evidence below.
- **AC6** — 12 pre-existing `videoCompositionDownstream` cases and 5 pre-existing
  `export-upload` cases still pass; `pnpm --filter omnimux-workflow test` 2428/2428,
  `pnpm --filter omnimux-clip test` 140/140.

---

## 4. Evidence

### 4.1 Exact commands and REAL exit codes

All run with `workdir = /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/clip-preview-refresh-3146`.

| Command | REAL exit | Cross-check |
| --- | --- | --- |
| `node --test plugins/omnimux-workflow/src/canvas/nodes/definitions/videoCompositionDownstream.test.mjs` | **0** | `ℹ tests 17 / pass 17 / fail 0` |
| `node --test plugins/omnimux-clip/src/export-upload.test.js` | **0** | `ℹ tests 6 / pass 6 / fail 0` |
| `pnpm verify:stages` | **0** | log `.agent-reports/clip-preview-refresh-3146/verify-stages.log` |
| `node --test scripts/verify-anti-slop.test.mjs` | **0** | `ℹ tests 3 / pass 3 / fail 0` |
| `pnpm --filter omnimux-workflow test` | **0** | `ℹ tests 2428 / pass 2428 / fail 0`; `grep -c ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` = 0 |
| `pnpm --filter omnimux-clip test` | **0** | `ℹ tests 140 / pass 140 / fail 0`; `grep -c ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` = 0 |
| `pnpm verify:app -- --journey .workbuddy/qa-journeys/clip-preview-refresh-3146.mjs` | **0** | `✅ 应用级 Web 验收通过（mode=ui，24 项断言…）`; `report.pass = true` |

Every command was captured as `cmd > log 2>&1; echo "REAL_EXIT=$?"` — no pipelines.

### 4.2 Live browser observations BEFORE and AFTER

Run `runId 9d275018-85f0-4c23-a381-0f3d4571789d`, real headless Chrome via CDP, dynamic port
`55981`, `mode=ui`, self-cleaning. The journey mounts the **real canvas island** through the
product's own mount contract (`window.__omnimuxWorkflowCanvas.mountCanvas(el, props)`), seeds
a `video_composition` node through the product's own persistence route
(`PUT /omnimux-workflow/api/workspaces/ws_qa_media`), performs real exports through the real
`POST /omnimux-clip/api/projects/<id>/save-export` route with real MP4 bytes, and drives
`videoComposition.tsx`'s `onSave` with the real `omnimux-clip-save` CustomEvent.

Readings of the downstream 成片 node's `<video>`, **without ever calling `load()`**:

| Stage | `src` | `readyState` | `error.code` | `duration` | `networkState` |
| --- | --- | --- | --- | --- | --- |
| **P0** — element pointing at the overwritten/absent file (stale broken state) | `…?path=…clip_node_qa_3146.mp4` (no `rev`) | **0** | **4** | `null` | 3 |
| **BEFORE** — after a *successful* re-export, pre-fix payload shape (no `revision`) | unchanged (no `rev`) | **0** | **4** | `null` | 3 |
| **AFTER** — after a successful re-export, fixed payload shape (`revision` present) | `…clip_node_qa_3146.mp4&rev=1791222980889.4944%3A2290` | **4** | `null` | **1** | 1 |

`revision` across the two exports: `1791222975615.8013:2290` → `1791222980889.4944:2290`
(identical byte size, different mtime — so a size-only token would have been insufficient).

The BEFORE row is the defect reproduced under controlled conditions; the AFTER row is the
acceptance assertion. They differ **only** in whether the save payload carried `revision`.

### 4.3 Retained artefacts

- `.agent-reports/clip-preview-refresh-3146/worktree-app-qa-report.json` — full structured report (24 assertions, `pass: true`).
- `.agent-reports/clip-preview-refresh-3146/app-qa/` — `report.json` plus screenshots:
  - `j1-canvas-seeded.png` — real canvas with the `video_composition` node mounted
  - `j1-stale-broken.png` — element in the `readyState=0 / error.code=4` state
  - `j1-before-reexport.png` — after re-export, still broken (defect)
  - `j1-after-reexport.png` — after re-export with the fix, playable
  - `app-home.png`, `hub-business-path.png` — harness baseline assertions
- `.agent-reports/clip-preview-refresh-3146/{verify-stages,anti-slop,workflow-test,clip-test}.log` — raw logs.
- Journey source: `.workbuddy/qa-journeys/clip-preview-refresh-3146.mjs` (plus the two throwaway exploration journeys `…-explore.mjs`, `…-explore2.mjs`).

---

## 5. Checks that could not run, and why

1. **The literal "click the real Export button in the clip editor" step was not executed.**
   The worktree QA fixture (`tests/fixtures/qa-workspace-media`) seeds a *chat workspace*, not
   a workflow project, so `项目 → 创作画布` shows `还没有工作流项目`; creating one goes through
   `新建项目 → 本地项目` and a native directory picker that does not exist in a headless run.
   The clip editor's own Export path additionally requires WebCodecs encoding of a real
   composition. Instead the journey:
   - mounts the **real canvas island** via the product's documented mount API (the same code
     path `CanvasBridge.jsx` uses for the right-sidebar canvas tab);
   - calls the **real `save-export` route** with real MP4 bytes — this is precisely the call
     `export-runner.ts` makes after encoding, and the only step substituted;
   - dispatches the **real `omnimux-clip-save` event** with the real payload shape — the
     production seam `videoComposition.tsx` listens on.

   The substituted step (WebCodecs encode) is upstream of every line this fix touches.
   Recorded as a limitation, not as a pass.
2. **`ego-browser` was not used.** The repo contract accepts the worktree web QA runner
   (`pnpm verify:app`) as the real-browser path; that is what was used.
3. **Electron/shell evidence was not collected.** Not applicable: the change is pure
   client/plugin source with no shell-specific behaviour.
4. **Dev app on port 45120 was not touched.** Human-owned per `AGENTS.md`.

---

## 6. Unknowns

- The real clip editor may re-export with a byte-identical file (same size **and** same
  mtime ms). `mtimeMs:size` would then not change and the element would not reload. Judged
  practically impossible (the encoder writes a new temp file per export and `renameSync`
  preserves its fresh mtime), and not worth a fallback path. E1 exercises the
  "same size, different mtime" case that actually occurs.
- Whether `MotionCreatorShell.tsx`'s separate motion-scene export (`window.__openreelExportPath`)
  has the same staleness issue was **not** investigated; it is a different code path from the
  one in the issue and was left untouched.
- The fix was verified only in headless Chrome (CDP), not in the Electron renderer.

---

## 7. Confidence

**High** for the fix and for the root cause.

- Root cause is established by reading the exact lines that produced the URL and the patch,
  and is *reproduced* live (BEFORE row: a successful re-export leaves the element at
  `readyState=0 / error.code=4`).
- The fix is confirmed by an internal control: the only difference between the failing and
  passing stages is the presence of `revision` in the payload.
- The change is small, additive, and backward compatible: without `revision` the media URL is
  byte-identical to before.
- Medium confidence only on the "real Export button" end-to-end chain, because that one step
  (WebCodecs encode) was substituted by its real HTTP boundary — see §5.1.

---

## 8. State of the worktree

- `git status --porcelain`: 7 modified source/test files + 1 untracked spec. No commits, no
  push, no PR (the Lead owns shared Git state).
- `docs/evidence/worktree-app-qa-report.json` (generated by the QA run) was restored to HEAD
  so the diff contains only intended changes.
- `.agent-reports/` and `.workbuddy/` are gitignored.
