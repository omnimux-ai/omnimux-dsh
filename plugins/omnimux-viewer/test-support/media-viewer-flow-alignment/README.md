# Flow alignment browser harness (Issue #3533)

Task-local evidence tooling. It renders the **real** `MediaViewerTab`, store,
composer and `HistoryPanel` in a stripped frame; it is not shipped and not part
of the plugin bundle.

## Reproduce

From the task worktree:

```sh
node plugins/omnimux-viewer/test-support/media-viewer-flow-alignment/build-harness.mjs
ego-browser nodejs < plugins/omnimux-viewer/test-support/media-viewer-flow-alignment/capture.mjs
node --test plugins/omnimux-viewer/src/media-viewer/flow-alignment.e2e.test.js
```

`build-harness.mjs` bundles `harness.jsx` into `/tmp/flow-alignment-3533/harness.html`
and writes `target.json` (harness path, evidence path, HEAD, source hashes inputs).
`capture.mjs` opens `?w=1280` and `?w=640` in Ego Lite, asserts computed rail /
drawer geometry and interactions, then writes:

- `docs/evidence/media-viewer-flow-alignment/report.json`
- `wide-1280.png`
- `narrow-640-closed.png`
- `narrow-640-open.png`

The harness seeds a synthetic session (`s1`), five generation groups (one batch
×2, one failed) and a synthetic model catalog with `pointsEstimate: 0.13`.
`dsh-ui-kit` is stubbed because the kit is not needed for history/cost behaviour;
the component under test is the production `MediaViewerTab`.

The browser evidence covers the live image catalog (cost 0.26). The 503 / video-only
cost-hidden branches are covered by the jsdom component test, not by a browser
run.

Evidence is ignored by `.git/info/exclude`; stage it explicitly with
`git add -f docs/evidence/media-viewer-flow-alignment/` when delivering.
