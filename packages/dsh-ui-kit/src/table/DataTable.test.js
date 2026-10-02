import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tsx = readFileSync(join(here, 'DataTable.tsx'), 'utf8')
const css = readFileSync(join(here, 'DataTable.module.css'), 'utf8')

describe('DataTable composite component contract', () => {
  it('supports declarative ColumnDef with sorting, custom cells and widths', () => {
    assert.match(tsx, /interface ColumnDef<T>/)
    assert.match(tsx, /toggleSort\(column\.id\)/)
    assert.match(tsx, /column\.cell\(\{ row, rowIndex, column, value \}\)/)
  })

  it('implements horizontal scroll gradient indicators via scroll listeners', () => {
    assert.match(tsx, /updateScrollShadows/)
    assert.match(tsx, /hasScrollLeft/)
    assert.match(tsx, /hasScrollRight/)
    assert.match(css, /\.tableWrap::before/)
    assert.match(css, /\.tableWrap::after/)
    assert.match(css, /\.hasScrollLeft::before\s*\{\s*opacity:\s*1;\s*\}/)
    assert.match(css, /\.hasScrollRight::after\s*\{\s*opacity:\s*1;\s*\}/)
  })

  it('implements single and multiple selection with WAI-ARIA and no native input tags', () => {
    assert.doesNotMatch(tsx, /<input(?:\s|>)/)
    assert.match(tsx, /role="checkbox"/)
    assert.match(tsx, /aria-label="全选所有行"/)
    assert.match(tsx, /aria-label=\{`选择第 \$\{rowIndex \+ 1\} 行`\}/)
    assert.match(tsx, /isAllSelected \? "true" : isPartiallySelected \? "mixed" : "false"/)
  })

  it('integrates EmptyState for empty rows and skeleton loaders when loading', () => {
    assert.match(tsx, /import \{ EmptyState \} from "\.\.\/empty\/EmptyState\.tsx"/)
    assert.match(tsx, /emptyContent \?\? <EmptyState title="暂无数据" \/>/)
    assert.match(tsx, /skeletonRow/)
    assert.match(css, /@keyframes pulse/)
  })

  it('uses only official --dsw-alias-* tokens in DataTable.module.css without raw hex or rgb', () => {
    assert.match(css, /var\(--dsw-alias-bg-layer-1\)/)
    assert.match(css, /var\(--dsw-alias-bg-layer-2\)/)
    assert.match(css, /var\(--dsw-alias-border-l1\)/)
    assert.match(css, /var\(--dsw-alias-border-l2\)/)
    assert.match(css, /var\(--dsw-alias-border-l3\)/)
    assert.match(css, /var\(--dsw-alias-brand-primary\)/)

    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(css, /rgba?\(/)
  })
})
