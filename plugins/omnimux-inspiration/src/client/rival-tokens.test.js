import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RIVAL_TOKENS_CSS,
  RIVAL_TOKENS_ID,
  injectRivalTokens,
} from './rival-tokens.js'

/**
 * The two token families the prototype's cards depend on.
 *
 * The spec's media/velocity styles (`--dsw-specific-media-*` and
 * `--dsw-specific-velocity-*`) exist only inside the prototype HTML today:
 * without an injector every cover-bound pill and overlay silently falls back.
 * These assertions pin the token names, their dark-room semantics (media tokens
 * stay dark in the light theme), and idempotent injection.
 */

const EXPECTED_MEDIA_TOKENS = [
  '--dsw-specific-media-fg',
  '--dsw-specific-media-fg-strong',
  '--dsw-specific-media-fg-secondary',
  '--dsw-specific-media-fg-dimmed',
  '--dsw-specific-media-ink',
  '--dsw-specific-media-badge-bg',
  '--dsw-specific-media-badge-bg-strong',
  '--dsw-specific-media-pill-bg',
  '--dsw-specific-media-pill-bg-dim',
  '--dsw-specific-media-chip-bg',
  '--dsw-specific-media-btn-bg',
  '--dsw-specific-media-btn-hover',
  '--dsw-specific-media-border',
  '--dsw-specific-media-border-strong',
  '--dsw-specific-media-border-dim',
  '--dsw-specific-media-border-faint',
  '--dsw-specific-media-scrim',
  '--dsw-specific-media-overlay',
  '--dsw-specific-media-glow-hot',
]

const EXPECTED_VELOCITY_TOKENS = [
  '--dsw-specific-velocity-hot-bg',
  '--dsw-specific-velocity-hot-fg',
  '--dsw-specific-velocity-hot-ring',
  '--dsw-specific-velocity-rising-fg',
  '--dsw-specific-velocity-rising-bg',
  '--dsw-specific-velocity-rising-ring',
]

describe('rival-tokens — 两族 token 覆盖', () => {
  it('declares every media token the spec §9.1/§9.2 styles consume', () => {
    for (const name of EXPECTED_MEDIA_TOKENS) {
      assert.ok(
        RIVAL_TOKENS_CSS.includes(`${name}:`),
        `missing media token ${name} — its consumers would silently fall back`,
      )
    }
  })

  it('declares every velocity token the §3.3 hot/rising pills consume', () => {
    for (const name of EXPECTED_VELOCITY_TOKENS) {
      assert.ok(
        RIVAL_TOKENS_CSS.includes(`${name}:`),
        `missing velocity token ${name}`,
      )
    }
  })

  it('keeps the media family theme-agnostic: the light theme does not redefine it', () => {
    const lightSection = RIVAL_TOKENS_CSS.split('data-theme="light"')[1] || ''
    assert.equal(
      lightSection.includes('--dsw-specific-media-'),
      false,
      'media tokens must stay dark in the light theme (design.md 暗房原则)',
    )
    // The velocity family IS redefined for light (spec §3.3 pill colours change
    // per theme: #f0453a → #dc2626, amber ring adjusts) — that is the prototype's
    // own split and is pinned here so nobody "simplifies" it away.
    assert.ok(
      lightSection.includes('--dsw-specific-velocity-hot-bg'),
      'light theme must carry the hot pill colour of the prototype',
    )
  })

  it('injects exactly once under its own style id', () => {
    const fakeDocument = {
      nodes: new Map(),
      head: {
        children: [],
        appendChild(node) { this.children.push(node) },
      },
      getElementById(id) { return this.nodes.get(id) || null },
      createElement() {
        return { id: '', textContent: '' }
      },
    }
    const previous = globalThis.document
    globalThis.document = fakeDocument
    try {
      injectRivalTokens()
      assert.equal(fakeDocument.head.children.length, 1, 'the first call must inject')
      const node = fakeDocument.head.children[0]
      assert.equal(node.id, RIVAL_TOKENS_ID)
      fakeDocument.nodes.set(RIVAL_TOKENS_ID, node)
      injectRivalTokens()
      assert.equal(
        fakeDocument.head.children.length,
        1,
        'a second call must not duplicate the style node',
      )
    } finally {
      globalThis.document = previous
    }
  })

  it('is a no-op without a document (SSR / Node)', () => {
    const previous = globalThis.document
    globalThis.document = undefined
    try {
      injectRivalTokens()
    } finally {
      globalThis.document = previous
    }
  })
})
