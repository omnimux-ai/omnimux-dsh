/**
 * Message-source kind for browser-context snapshot messages.
 *
 * `@deepseek-ai/dsh-llm` 0.1.5 exposed a shared catch-all `kind: 'plugin'`.
 * 0.2.1-rc.3 removes it: `MessageSourceMap` is merge-extensible and every
 * producer declares its own `kind` in its own module. Supersession keys on the
 * declared kind plus `form: 'snapshot'`, so the kind must be ours alone.
 *
 * @module
 */

import type { ContextFormed } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'omnimux-browser-context': {
      kind: 'omnimux-browser-context'
      /** Producer identity, kept for transcript grouping. */
      plugin: string
    } & ContextFormed
  }
}

export {}
