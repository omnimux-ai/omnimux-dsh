/**
 * Producer-owned message-source kinds for omnimux context injection.
 *
 * DSH `0.2.1-rc.3` removed the shared catch-all `kind: 'plugin'` from
 * `@deepseek-ai/dsh-llm`: `MessageSourceMap` is merge-extensible and every
 * producer declares its own kind (the harness does the same for `ptc-mode`,
 * `model-selection`, `goal`, …). A message whose `source.kind` is missing or
 * `'plugin'` is rejected by session-format v4 with
 * `format v4 message requires a producer-owned source kind`.
 *
 * Two injectors write context messages every turn, and they must stay
 * distinguishable in transcripts/logs, so they declare **two** kinds — never
 * one shared catch-all:
 *
 * - `SESSION_MODEL_SOURCE_KIND` — the session's model pin (`session/context-injector.js`)
 * - `WORKBENCH_SOURCE_KIND` — the workbench viewport snapshot (`workbench/context-injector.js`)
 *
 * Type-level declaration lives in `./message-source.ts` (same pattern as
 * `plugins/omnimux-viewer/src/message-source.ts` and
 * `plugins/omnimux-browser/src/message-source.ts`).
 *
 * Issue #4110 / #3742: this package was missed by the rc.3 migration and every
 * turn failed until these kinds were declared. `scripts/verify-message-source-kinds.mjs`
 * now refuses the catch-all anywhere in each plugin's `src` tree.
 */

/** Session model pin injected at the first step of every turn. */
export const SESSION_MODEL_SOURCE_KIND = 'omnimux-session-model'

/** Workbench viewport snapshot injected when the workbench panel is open. */
export const WORKBENCH_SOURCE_KIND = 'omnimux-workbench'
