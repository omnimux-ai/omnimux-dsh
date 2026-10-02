import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(here, 'Button.module.css')
const css = readFileSync(CSS_PATH, 'utf8')

/**
 * Pull one CSS rule body (inner declarations only) for an exact selector.
 * Multi-selector rules are matched on the full selector text.
 * @param {string} source
 * @param {string} selector
 */
function ruleBody(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}(?![\\w.:\\[\\]-])\\s*\\{([^}]+)\\}`))
  assert.ok(match, `missing selector ${selector}`)
  return match[1]
}

/**
 * @param {string} body
 * @param {string} property
 */
function decl(body, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = body.match(new RegExp(`(?:^|[;{\\s])${escaped}\\s*:\\s*([^;]+);`))
  assert.ok(match, `missing ${property} in ${body}`)
  return match[1].trim()
}

describe('Button outline pressed tokens', () => {
  it('keeps ghost/secondary pressed on the inset box-shadow block (no outline)', () => {
    const body = ruleBody(css, '.ghost[aria-pressed="true"],\n.secondary[aria-pressed="true"]')
    assert.equal(decl(body, 'background'), 'var(--dsw-alias-button-ghost-active-fill)')
    assert.equal(decl(body, 'box-shadow'), 'inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border)')
    assert.doesNotMatch(body, /\.outline/)
  })

  it('declares outline pressed with fill + border tokens, not inset box-shadow', () => {
    const body = ruleBody(css, '.outline[aria-pressed="true"]')
    assert.equal(decl(body, 'background'), 'var(--dsw-alias-button-ghost-active-fill)')
    assert.equal(decl(body, 'border-color'), 'var(--dsw-alias-button-ghost-active-border)')
    assert.equal(decl(body, 'color'), 'var(--dsw-alias-label-primary)')
    assert.doesNotMatch(body, /box-shadow/)
  })

  it('defends pressed hover fill for ghost, secondary, and outline', () => {
    const selector = [
      '.ghost[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]),',
      '.secondary[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]),',
      '.outline[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"])',
    ].join('\n')
    const body = ruleBody(css, selector)
    assert.equal(decl(body, 'background'), 'var(--dsw-alias-button-ghost-active-hover)')
  })

  it('defends outline pressed hover border so .outline:hover cannot wash it', () => {
    // Combined fill rule ends with the same last selector; the standalone
    // border-color rule is the second exact match of this selector.
    const re = /\.outline\[aria-pressed="true"\]:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\)\s*\{([^}]+)\}/g
    const matches = [...css.matchAll(re)]
    assert.ok(matches.length >= 2, `expected standalone outline pressed hover rule, got ${matches.length}`)
    const borderRule = matches.find((m) => /border-color\s*:/.test(m[1]))
    assert.ok(borderRule, 'missing outline pressed hover border-color rule')
    assert.equal(decl(borderRule[1], 'border-color'), 'var(--dsw-alias-button-ghost-active-border)')
  })

  it('uses only --dsw-alias-* tokens in the new pressed rules (no hex/rgba)', () => {
    const outlinePressed = ruleBody(css, '.outline[aria-pressed="true"]')
    const hoverFill = ruleBody(
      css,
      [
        '.ghost[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]),',
        '.secondary[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]),',
        '.outline[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"])',
      ].join('\n'),
    )
    const re = /\.outline\[aria-pressed="true"\]:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\)\s*\{([^}]+)\}/g
    const hoverBorder = [...css.matchAll(re)].find((m) => /border-color\s*:/.test(m[1]))?.[1]
    assert.ok(hoverBorder, 'missing outline pressed hover border-color rule')
    for (const body of [outlinePressed, hoverFill, hoverBorder]) {
      assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}/)
      assert.doesNotMatch(body, /rgba?\(/)
      assert.match(body, /var\(--dsw-alias-/)
    }
  })
})
