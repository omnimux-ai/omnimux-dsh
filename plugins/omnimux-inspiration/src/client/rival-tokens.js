/**
 * The `--dsw-specific-media-*` and `--dsw-specific-velocity-*` token families
 * the 账号监控 v2.1 cards consume.
 *
 * The spec styles reference these tokens, but product code never defined them —
 * they existed only inside the prototype's <style> block, so every cover-bound
 * pill and overlay silently fell back. This module is the one owner of the two
 * families: values are copied verbatim from
 * `docs/prototypes/account-monitor-v2-prototype.html` (PM_SIGN_OFF: PASS).
 *
 * Semantics (B15 / design.md 暗房原则): media tokens describe text and badges
 * sitting on cover media, so they keep the same dark-room values in both themes
 * and are deliberately NOT redefined under `data-theme="light"`. The velocity
 * family IS redefined for light because the spec's pill colours differ there
 * (#f0453a → #dc2626, amber ring adjusts).
 *
 * Raw colour values are token definitions, not component colours — the
 * UI03 bare-colour rule is exempted per line for exactly this file purpose.
 */

export const RIVAL_TOKENS_ID = 'omnimux-rival-tokens'

export const RIVAL_TOKENS_CSS = `
:root {
  --dsw-specific-velocity-hot-bg: #f0453a; /* exempt-ui03 token definition */
  --dsw-specific-velocity-hot-fg: #ffffff; /* exempt-ui03 token definition */
  --dsw-specific-velocity-hot-ring: rgba(240,69,58,0.45); /* exempt-ui03 token definition */
  --dsw-specific-velocity-rising-fg: #fbbf24; /* exempt-ui03 token definition */
  --dsw-specific-velocity-rising-bg: rgba(251,191,36,0.20); /* exempt-ui03 token definition */
  --dsw-specific-velocity-rising-ring: rgba(251,191,36,0.30); /* exempt-ui03 token definition */
  --dsw-specific-media-fg: #ffffff; /* exempt-ui03 token definition */
  --dsw-specific-media-fg-strong: rgba(255,255,255,0.92); /* exempt-ui03 token definition */
  --dsw-specific-media-fg-secondary: rgba(255,255,255,0.85); /* exempt-ui03 token definition */
  --dsw-specific-media-fg-dimmed: rgba(255,255,255,0.55); /* exempt-ui03 token definition */
  --dsw-specific-media-ink: #111113; /* exempt-ui03 token definition */
  --dsw-specific-media-badge-bg: rgba(0,0,0,0.55); /* exempt-ui03 token definition */
  --dsw-specific-media-badge-bg-strong: rgba(0,0,0,0.60); /* exempt-ui03 token definition */
  --dsw-specific-media-pill-bg: rgba(0,0,0,0.38); /* exempt-ui03 token definition */
  --dsw-specific-media-pill-bg-dim: rgba(0,0,0,0.30); /* exempt-ui03 token definition */
  --dsw-specific-media-chip-bg: rgba(0,0,0,0.40); /* exempt-ui03 token definition */
  --dsw-specific-media-btn-bg: rgba(0,0,0,0.45); /* exempt-ui03 token definition */
  --dsw-specific-media-btn-hover: rgba(255,255,255,0.16); /* exempt-ui03 token definition */
  --dsw-specific-media-avatar-bg: rgba(255,255,255,0.14); /* exempt-ui03 token definition */
  --dsw-specific-media-border-strong: rgba(255,255,255,0.30); /* exempt-ui03 token definition */
  --dsw-specific-media-border: rgba(255,255,255,0.26); /* exempt-ui03 token definition */
  --dsw-specific-media-border-dim: rgba(255,255,255,0.24); /* exempt-ui03 token definition */
  --dsw-specific-media-border-faint: rgba(255,255,255,0.16); /* exempt-ui03 token definition */
  --dsw-specific-media-scrim: linear-gradient(180deg, rgba(0,0,0,0.02) 40%, rgba(0,0,0,0.62) 100%); /* exempt-ui03 token definition */
  --dsw-specific-media-overlay: linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.30) 45%, rgba(0,0,0,0.82) 100%); /* exempt-ui03 token definition */
  --dsw-specific-media-glow-hot: rgba(240,69,58,0.12); /* exempt-ui03 token definition */
}
html[data-theme="light"] {
  --dsw-specific-velocity-hot-bg: #dc2626; /* exempt-ui03 token definition */
  --dsw-specific-velocity-hot-fg: #ffffff; /* exempt-ui03 token definition */
  --dsw-specific-velocity-hot-ring: rgba(220,38,38,0.30); /* exempt-ui03 token definition */
  --dsw-specific-velocity-rising-fg: #d97706; /* exempt-ui03 token definition */
  --dsw-specific-velocity-rising-bg: rgba(217,119,6,0.16); /* exempt-ui03 token definition */
  --dsw-specific-velocity-rising-ring: rgba(217,119,6,0.30); /* exempt-ui03 token definition */
}
`

/**
 * Inject the token stylesheet once. Idempotent and document-guarded so callers
 * (panel and shell) can both ask for it without coordinating.
 */
export function injectRivalTokens() {
  if (typeof document === 'undefined' || !document) return
  if (document.getElementById(RIVAL_TOKENS_ID)) return
  const node = document.createElement('style')
  node.id = RIVAL_TOKENS_ID
  node.textContent = RIVAL_TOKENS_CSS
  document.head.appendChild(node)
}
