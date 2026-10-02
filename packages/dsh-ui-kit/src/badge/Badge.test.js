import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tsx = readFileSync(join(here, 'Badge.tsx'), 'utf8')
const css = readFileSync(join(here, 'Badge.module.css'), 'utf8')

describe('Badge component contract', () => {
  it('declares all 7 semantic variants and 3 shapes in TypeScript types', () => {
    assert.match(tsx, /"default"/)
    assert.match(tsx, /"neutral"/)
    assert.match(tsx, /"brand"/)
    assert.match(tsx, /"success"/)
    assert.match(tsx, /"warning"/)
    assert.match(tsx, /"error"/)
    assert.match(tsx, /"info"/)

    assert.match(tsx, /"capsule"/)
    assert.match(tsx, /"dot"/)
    assert.match(tsx, /"square"/)
  });

  it('handles maxCount formatting and dot role status', () => {
    assert.match(tsx, /maxCount = 99/)
    assert.match(tsx, /maxCount \? `\$\{maxCount\}\+`/)
    assert.match(tsx, /role=\{isPureDot \? "status" : undefined\}/)
  });

  it('consumes official --dsw-alias-* tokens across all variants without raw hex or rgb', () => {
    assert.match(css, /var\(--dsw-alias-bg-layer-2\)/)
    assert.match(css, /var\(--dsw-alias-brand-primary\)/)
    assert.match(css, /var\(--dsw-alias-state-success-primary\)/)
    assert.match(css, /var\(--dsw-alias-state-warning-primary\)/)
    assert.match(css, /var\(--dsw-alias-state-error-primary\)/)
    assert.match(css, /var\(--dsw-alias-state-info-primary\)/)

    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(css, /rgba?\(/)
  });

  it('defines standard height, padding and font sizes according to typography rules', () => {
    assert.match(css, /\.sm\s*\{[^}]*height:\s*16px/)
    assert.match(css, /\.md\s*\{[^}]*height:\s*20px/)
    assert.match(css, /\.lg\s*\{[^}]*height:\s*24px/)
    assert.match(css, /font-size:\s*11px/)
    assert.match(css, /font-size:\s*12px/)
    assert.match(css, /font-size:\s*13px/)
  });
})
