import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tsx = readFileSync(join(here, 'Table.tsx'), 'utf8')
const css = readFileSync(join(here, 'Table.module.css'), 'utf8')

describe('Table family primitives contract', () => {
  it('exports Table, TableHeader, TableBody, TableRow, TableCell, TableHead', () => {
    assert.match(tsx, /export const Table = forwardRef/)
    assert.match(tsx, /export const TableHeader = forwardRef/)
    assert.match(tsx, /export const TableBody = forwardRef/)
    assert.match(tsx, /export const TableRow = forwardRef/)
    assert.match(tsx, /export const TableCell = forwardRef/)
    assert.match(tsx, /export const TableHead = forwardRef/)
  })

  it('calculates WAI-ARIA aria-sort dynamically on TableHead', () => {
    assert.match(tsx, /ariaSort =\s*sortDirection === "asc"\s*\?\s*"ascending"/)
    assert.match(tsx, /: sortDirection === "desc"\s*\?\s*"descending"/)
    assert.match(tsx, /: sortable\s*\?\s*"none"\s*:\s*undefined/)
    assert.match(tsx, /aria-sort=\{ariaSort\}/)
  })

  it('supports stickyHeader, bordered and dense variants', () => {
    assert.match(tsx, /stickyHeader && cssClass\(css\.stickyHeader, "stickyHeader"\)/)
    assert.match(tsx, /bordered && cssClass\(css\.bordered, "bordered"\)/)
    assert.match(tsx, /dense && cssClass\(css\.dense, "dense"\)/)
  })

  it('uses only official --dsw-alias-* tokens in Table.module.css', () => {
    assert.match(css, /var\(--dsw-alias-border-l1\)/)
    assert.match(css, /var\(--dsw-alias-border-l2\)/)
    assert.match(css, /var\(--dsw-alias-bg-layer-1\)/)
    assert.match(css, /var\(--dsw-alias-bg-layer-2\)/)
    assert.match(css, /var\(--dsw-alias-interactive-bg-hover\)/)
    assert.match(css, /var\(--dsw-alias-interactive-bg-selected\)/)
    assert.match(css, /var\(--dsw-alias-brand-primary\)/)

    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(css, /rgba?\(/)
  })
})
