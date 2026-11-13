/**
 * Message-source kinds declared for omnimux context injection messages.
 *
 * `@deepseek-ai/dsh-llm` 0.1.5 exposed a shared catch-all `kind: 'plugin'`.
 * 0.2.1-rc.3 removes it: `MessageSourceMap` is merge-extensible and each
 * producer declares its own `kind` in its own module (`omnimux-viewer` and
 * `omnimux-browser` ship the same pattern). Two separate kinds on purpose —
 * the session model pin and the workbench viewport are different producers'
 * facts and must stay distinguishable in transcripts:
 *
 * - `omnimux-session-model` — `session/context-injector.js`
 * - `omnimux-workbench` — `workbench/context-injector.js`
 *
 * Runtime values live in `./message-source.js` (this package is plain JS).
 *
 * @module
 */

import type { ContextFormed } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'omnimux-session-model': {
      kind: 'omnimux-session-model'
      /** Producer identity, kept for transcript grouping. */
      plugin: string
    } & ContextFormed
    'omnimux-workbench': {
      kind: 'omnimux-workbench'
      /** Producer identity, kept for transcript grouping. */
      plugin: string
    } & ContextFormed
  }
}

export {}
