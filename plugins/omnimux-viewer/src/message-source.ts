/**
 * Message-source kind for viewer-authored context messages.
 *
 * `@deepseek-ai/dsh-llm` 0.1.5 exposed a shared catch-all `kind: 'plugin'`.
 * 0.2.1-rc.3 removes it: `MessageSourceMap` is merge-extensible and each
 * producer declares its own `kind` in its own module (the harness ships the
 * same pattern for `ptc-mode`, `model-selection`, `goal`, …). Declaring ours
 * here keeps the deferred-context message attributable without inventing a
 * kind the host does not know.
 *
 * @module
 */

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'omnimux-viewer': {
      kind: 'omnimux-viewer'
      /** Producer identity, kept for transcripts that group by plugin. */
      plugin: string
    }
  }
}

export {}
