import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const libJsPath = join(root, 'lib/index.js')
const libDtsPath = join(root, 'lib/index.d.ts')
const srcIndexPath = join(root, 'src/index.ts')

const EXPECTED_EXPORTS = [
  "Button",
  "IconButton",
  "SearchField",
  "InputField",
  "DropdownSelect",
  "Toolbar",
  "FilterBar",
  "Divider",
  "ModalDialog",
  "ConfirmModal",
  "EmptyState",
  "StageContainer",
  "StageHeader",
  "PageHeader",
  "StatBar",
  "ActionRow",
  "GenWaveCard",
  "Tabs",
  "createStageStore",
  "createSidebarEntry",
  // P0 & P1 additions
  "Badge",
  "SelectableTile",
  "CopyButton",
  "Table",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
  "TableHead",
  "DataTable",
  "MediaCard",
  "CardGrid",
  "Drawer",
  "DrawerPortal",
  "copyToClipboard",
  "trapFocus",
  "focusFirstDescendant",
  "createPortalSafe",
  "resolvePortalContainer",
]

function extractEsmExports(code) {
  const exportIndex = code.lastIndexOf('export {')
  if (exportIndex === -1) return []
  const closeIndex = code.indexOf('}', exportIndex)
  if (closeIndex === -1) return []
  const block = code.slice(exportIndex + 'export {'.length, closeIndex)
  return block
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

describe('dsh-ui-kit export contract', () => {
  it('verifies that lib/index.js exists and exports all required runtime symbols', () => {
    assert.ok(existsSync(libJsPath), 'lib/index.js must exist (run pnpm build first)')
    const code = readFileSync(libJsPath, 'utf8')
    const exportedSymbols = new Set(extractEsmExports(code))

    for (const name of EXPECTED_EXPORTS) {
      assert.ok(
        exportedSymbols.has(name),
        'Missing expected export "' + name + '" in lib/index.js exports: ' + Array.from(exportedSymbols).join(', ')
      )
    }
  })

  it('verifies that lib/index.d.ts exists and declares all component & function exports', () => {
    assert.ok(existsSync(libDtsPath), 'lib/index.d.ts must exist (run pnpm build first)')
    const dts = readFileSync(libDtsPath, 'utf8')
    for (const name of EXPECTED_EXPORTS) {
      assert.ok(
        dts.includes(name),
        'lib/index.d.ts must declare "' + name + '"'
      )
    }
  })

  it('verifies that src/index.ts declares all expected exports', () => {
    const src = readFileSync(srcIndexPath, 'utf8')
    for (const name of EXPECTED_EXPORTS) {
      assert.ok(
        src.includes(name),
        'src/index.ts must export "' + name + '"'
      )
    }
  })

  it('verifies that no raw hex/rgb/rgba colors exist in src/**/*.module.css or src/**/*.tsx', () => {
    function scanDir(dir) {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(full)
        } else if (entry.name.endsWith('.module.css') || entry.name.endsWith('.tsx')) {
          const content = readFileSync(full, 'utf8')
          const hexMatches = content.match(/#[0-9A-Fa-f]{3,8}/g)
          if (hexMatches) {
            assert.fail('Found raw hex color(s) in ' + full + ': ' + hexMatches.join(', '))
          }
          const lines = content.split(String.fromCharCode(10))
          lines.forEach((line, idx) => {
            if ((line.includes('rgb(') || line.includes('rgba(')) && !line.includes('var(')) {
              assert.fail('Found raw rgb/rgba color in ' + full + ':' + (idx + 1) + ' -> ' + line.trim())
            }
          })
        }
      }
    }
    scanDir(join(root, 'src'))
  })
})
