/**
 * scripts/verify-agents-md.test.mjs
 *
 * Gate for the always-on root instructions (AGENTS.md):
 * - size budget (lines and bytes) so the file stays a thin entrypoint;
 * - every relative Markdown link resolves to an existing path, and `#anchor`
 *   links into Markdown files match a heading;
 * - CLAUDE.md stays a pointer to AGENTS.md;
 * - hard bounds that must never be slimmed away keep their marker text.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const agentsPath = join(root, 'AGENTS.md')
const agents = readFileSync(agentsPath, 'utf8')

/** Raise only when new hard bounds genuinely need the space. */
const MAX_LINES = 100
const MAX_BYTES = 14_000

/** Markers for hard bounds that slimming must preserve. */
const REQUIRED_MARKERS = [
  'Product baseline',
  'No exclusive runtime modes',
  'Hub owns integration',
  'real-money transactions are human-only',
  'MUST NOT modify official DSH source',
  'Agents MUST NOT edit this section',
  'human-owned',
  'Never push to `main`',
]

/**
 * GitHub-style heading slug: lowercase, drop punctuation except `-`/`_`,
 * spaces become `-`. Non-ASCII letters (e.g. CJK) are kept.
 * @param {string} heading
 * @returns {string}
 */
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

/**
 * @param {string} markdown
 * @returns {Set<string>}
 */
function headingSlugs(markdown) {
  const slugs = new Set()
  for (const line of markdown.split('\n')) {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) slugs.add(slugify(m[1]))
  }
  return slugs
}

test('AGENTS.md stays within its always-on size budget', () => {
  const lines = agents.split('\n').length
  const bytes = Buffer.byteLength(agents, 'utf8')
  assert.ok(lines <= MAX_LINES, `AGENTS.md has ${lines} lines (max ${MAX_LINES}); move detail into contracts or skills`)
  assert.ok(bytes <= MAX_BYTES, `AGENTS.md has ${bytes} bytes (max ${MAX_BYTES}); move detail into contracts or skills`)
})

test('AGENTS.md relative links and anchors resolve', () => {
  const failures = []
  for (const [, target] of agents.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(target)) continue
    const [rawPath, anchor] = target.split('#')
    const full = join(root, decodeURIComponent(rawPath))
    if (!existsSync(full)) {
      failures.push(`missing path: ${target}`)
      continue
    }
    if (anchor && rawPath.endsWith('.md') && statSync(full).isFile()) {
      const slugs = headingSlugs(readFileSync(full, 'utf8'))
      if (!slugs.has(decodeURIComponent(anchor))) failures.push(`missing anchor: ${target}`)
    }
  }
  assert.deepEqual(failures, [])
})

test('CLAUDE.md is a pointer to AGENTS.md', () => {
  const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8')
  assert.match(claude, /\(AGENTS\.md\)/)
  assert.ok(claude.split('\n').length <= 5, 'CLAUDE.md must stay a short pointer, not a second rule set')
})

test('AGENTS.md preserves hard-bound markers', () => {
  const missing = REQUIRED_MARKERS.filter((marker) => !agents.includes(marker))
  assert.deepEqual(missing, [], 'a hard bound was removed or renamed; update the marker only with user approval')
})
