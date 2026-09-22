Review complete: 14 finding(s) across 13 selected item(s).

─── plugins/omnimux/src/client/components/asset-picker/AssetPicker.jsx:25-26 ───
[style · low] The diff adds a leading blank line as the first line of the `CSS` template literal,
injecting pure whitespace into the concatenated `<style>` output. This is formatting noise with no
behavioral value; please remove it for a cleaner diff/output.

  const CSS = `
- 
  /* 顶部 Tab 单层顶栏：宽度 = 6 列高密度微卡 + 5 个列间距（由契约推导）。


─── plugins/omnimux/src/client/components/product-picker/ProductPicker.jsx:25-26 ───
[style · low] Same spurious leading blank line added at the top of the `CSS` template literal. It
emits a meaningless leading newline into the injected stylesheet; please drop it.

  const CSS = `
- 
  /* 顶部 Tab 单层顶栏：宽度 = 6 列高密度微卡 + 5 个列间距（由契约推导）。


─── plugins/omnimux/src/client/components/inspiration-picker/InspirationPicker.jsx:31-32 ───
[style · low] Two formatting issues introduced here: a spurious leading blank line at the start of
the `CSS` template literal and an extra blank line left after the closing backtick. Both are
whitespace-only noise; please remove them.

  const CSS = `
- 
  .${PICKER_DIALOG_VARIANT_CLASS.inspiration} {


─── plugins/omnimux/src/client/session-guide/SessionGuide.jsx:150-154 ───
[bug · high] `onStage` returns early when `model` is falsy, so a stage-close signal delivered as
`LIBRARY_STAGE_EVENT` with `detail: null` is ignored. The controller emits exactly that on close
paths other than the stage's own close button (e.g. session switch in controller.js `close()` calls
`renderLibrary(null)`), so `libraryStage` stays set and the composer remains pinned — the stage UI
is left open/docked. Handle the null case by clearing state and unpinning.

        const model = event.detail
-       if (!model || model.sessionId !== sessionId) return
+       if (!model) {
+         setLibraryStage(null)
+         undock()
+         return
+       }
+       if (model.sessionId !== sessionId) return
        event.preventDefault()
        setLibraryStage(model)
        pin({ id: LIBRARY_STAGE_DOCK_ID })


─── plugins/omnimux/src/client/session-guide/SessionGuide.jsx:131-133 ───
[performance · medium] `onUndock: () => setLibraryStage(null)` is a fresh arrow on every render, so
`undock` (dep `[onUndock]`) → `dock` → `pin` are all recreated each render. That makes this effect's
`[pin, sessionId]` deps change every render, tearing down and re-adding the window listeners
repeatedly (and risking a handler swap racing a dispatch). Prefer a stable callback/ref for the
handler deps.



─── plugins/omnimux/src/client/session-guide/useComposerDocking.js:331-332 ───
[style · low] The `if (scrollTop <= READ_TOP_MAX && leftTop)` line is mis-indented (one level less
than its siblings), which makes it read as a stray/unreachable nested branch. The control flow is
actually correct (line 331 early-returns when pinned), but the indentation is misleading; align it
with the surrounding statements.

          if (pinnedRef.current) return 'docked'
-       if (scrollTop <= READ_TOP_MAX && leftTop) return 'inline'
+         if (scrollTop <= READ_TOP_MAX && leftTop) return 'inline'


─── plugins/omnimux/src/client/composer-add/install.js:79-79 ───
[bug · medium] `onPrompt` constructs a bare `CustomEvent`, while `renderLibrary` above deliberately
uses `doc.defaultView.CustomEvent` and dispatches via `doc.defaultView`. The listener is registered
on `window` (= `doc.defaultView`), so using the ambient JS global here is inconsistent and can break
in environments where the JS realm differs from `doc.defaultView` (iframes/tests). Also the event
name is hardcoded, duplicating the `LIBRARY_STAGE_EVENT` constant style. Use the same realm
constructor and a shared constant.

-       doc.defaultView?.dispatchEvent(new CustomEvent('omnimux:library-stage:prompt', { detail: { prompt } }))
+       doc.defaultView?.dispatchEvent(new doc.defaultView.CustomEvent(LIBRARY_STAGE_PROMPT_EVENT, { detail: { prompt } }))


─── plugins/omnimux/src/client/composer-add/install.js:66-70 ───
[bug · medium] `renderLibrary` unconditionally calls `root.render(null)` and then schedules a
`setTimeout` closure that captures the current `model`/`stageEvent`. Because the controller invokes
`render()` on every tab switch (`onTab`) and on each kept-open pick, multiple timeouts can be
queued; a stale closure may still render `LibraryBrowser` into `host` after newer state arrived (no
SessionGuide to `preventDefault`). Guard the fallback against staleness, e.g. track the latest
event/`model` and bail if the deferred callback is no longer the most recent render request.



─── plugins/omnimux/src/client/composer-add/library-stage-model.js:55-55 ───
[bug · low] `mergeLibraryPrompt` suppresses insertion when `current.includes(next)`. A short prompt
that happens to be a substring of unrelated draft text (or one prompt being a substring of another)
will be silently dropped. Compare against exact existing lines instead of a substring match.

-   if (current.includes(next)) return current
+   if (current.split('\n').some((line) => line.trim() === next)) return current


─── plugins/omnimux/src/client/composer-add/library-stage-model.js:104-105 ───
[bug · low] `loadInspiration` slices before mapping/filtering (order differs from
`loadAssets`/`loadProducts`), and `res.body?.data?.items || []` is not guarded against a non-array
payload — if `items` is an object/string, `.slice` throws and the lane fails instead of degrading
gracefully. Normalize with `Array.isArray` before slicing, and keep the slice-after-filter order
consistent with the other loaders.

-   const rows = res.body?.data?.items || []
-   return rows.slice(0, limit).map((row) => mapInspirationRow(row, true)).filter(Boolean).map((row) => ({
+   const rows = Array.isArray(res.body?.data?.items) ? res.body.data.items : []
+   return rows.map((row) => mapInspirationRow(row, true)).filter(Boolean).slice(0, limit).map((row) => ({


─── plugins/omnimux/src/client/composer-add/library-stage-model.js:123-124 ───
[bug · low] `loadTrending` likewise reads `res.body?.data?.items || []` without an `Array.isArray`
guard, so a non-array `items` payload would throw on `.slice` instead of degrading gracefully.
Normalize the shape before slicing.

-   const rows = res.body?.data?.items || []
+   const rows = Array.isArray(res.body?.data?.items) ? res.body.data.items : []
    return rows.slice(0, limit).map((row) => mapSourceItem(row)).filter(Boolean).map((item) => ({


─── plugins/omnimux/src/client/composer-add/library-stage-model.js:61-61 ───
[maintainability · low] The thrown message `'无法连接素材服务'` is a hardcoded, untranslated user-facing
string, inconsistent with the i18n approach used elsewhere (`text('composerAdd.toast.failed',
...)`). Route error messages through the translation layer (or return a code the UI maps) so this
doesn't leak an untranslatable string.



─── plugins/omnimux/src/client/composer-add/controller.js:150-157 ───
[maintainability · low] `pickCard` returns a Promise for the `assets` lane (via
`confirmLibrary(...).then(...)`) but a plain `counts`/`undefined` for the `products`/`inspiration`
lanes (`confirmDirect` is synchronous). The mixed sync/async return contract makes it easy for a
future caller to forget to `await` and drop rejections or mis-order prompt insertion. Consider
normalizing all lanes to return a Promise (e.g. `Promise.resolve(confirmDirect(...)).then(finish)`),
or document the contract explicitly.



─── plugins/omnimux/src/client/session-guide/LibraryBrowser.jsx:91-97 ───
[maintainability · low] `loadLibraryCards` never rejects: each lane loader is wrapped in its own
try/catch and a failed loader is turned into a per-lane `errors` entry, so `Promise.all` always
fulfils. This outer `.catch` is therefore unreachable, and its synthetic `errors: { featured: ... }`
branch (hardcoded lane key plus a generic empty message) can never surface. Consider removing it, or
if a top-level safety net is really desired, keep it but drop the misleading `featured` lane key.


