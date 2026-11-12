import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function read(name) {
  return readFileSync(join(here, name), 'utf8')
}

function styleBodies(source) {
  return [...source.matchAll(/style=\{\{([\s\S]*?)\}\}/g)].map((match) => match[1])
}

function assertOnlyCustomProperties(source, file) {
  for (const body of styleBodies(source)) {
    const compact = body.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const part of compact.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      if (/^display\s*:\s*(open\s*\?\s*undefined\s*:\s*['"]none['"]|['"]none['"])/.test(trimmed)) continue
      assert.match(
        trimmed,
        /^['"]?--[A-Za-z0-9-]+['"]?\s*:/,
        `${file} inline style must be a CSS custom property: ${trimmed}`,
      )
    }
  }
}

const FILES = [
  'AppsStage.jsx',
  'LoginGate.jsx',
  'ProfileSection.jsx',
  'ProfileAvatar.jsx',
  'PluginsSection.jsx',
  'plugin-helpers.jsx',
  'ModelsSettingsCard.jsx',
]

describe('hub client UI kit contract (B5 drawer)', () => {
  it('replaces visible native buttons with dsh-ui-kit controls', () => {
    for (const file of FILES) {
      const source = read(file)
      assert.doesNotMatch(source, /<button\b/, `${file} still has a raw <button>`)
      assert.match(source, /from 'dsh-ui-kit'/, `${file} must import dsh-ui-kit`)
    }
  })

  it('keeps inline style objects to CSS custom properties (hidden file input allowed)', () => {
    for (const file of FILES) {
      assertOnlyCustomProperties(read(file), file)
    }
  })

  it('positions AppsStage with --stage-* and kit PageHeader', () => {
    const stage = read('AppsStage.jsx')
    const styles = read('styles.js')
    assert.match(stage, /className="omnimux-apps-stage"/)
    assert.match(stage, /'--stage-top'/)
    assert.match(stage, /'--stage-left'/)
    assert.match(stage, /'--stage-width'/)
    assert.match(stage, /'--stage-height'/)
    assert.match(stage, /<PageHeader/)
    assert.doesNotMatch(stage, /position:\s*['"]fixed['"]/)
    assert.match(styles, /\.omnimux-apps-stage \{/)
    assert.match(styles, /top:\s*var\(--stage-top\)/)
  })

  it('keeps the Apps page stage inside the viewport and scrollable', () => {
    const styles = read('styles.js')
    const stageRule = (styles.match(/\.omnimux-apps-stage \{[\s\S]*?\}/) || [''])[0]
    const bodyRule = (styles.match(/\.omnimux-apps-stage-body \{[\s\S]*?\}/) || [''])[0]
    // The measured conversation box can be taller than the remaining viewport.
    // The fixed stage must be clamped to the visible remainder so it never spills
    // past the bottom edge (which left the inner body with nothing to scroll and
    // pushed the last cards off-screen).
    assert.match(stageRule, /max-height:\s*calc\(100vh - var\(--stage-top\)/, 'stage must clamp to the remaining viewport height')
    assert.match(stageRule, /overflow:\s*hidden/, 'stage must not scroll; the body is the single scroll container')
    // The body is the one scroll container for the card list.
    assert.match(bodyRule, /overflow-y:\s*auto/, 'stage body must scroll vertically')
    assert.match(bodyRule, /min-height:\s*0/, 'stage body must be allowed to shrink so it can overflow')
    // AppsStage also caps --stage-height to the visible remainder at the source.
    const stage = read('AppsStage.jsx')
    assert.match(stage, /innerHeight/, 'AppsStage must read the viewport height')
    assert.match(stage, /'--stage-height':\s*`\$\{stageHeight\}px`/, 'AppsStage must pass the clamped stage height')
  })

  it('keeps SidebarUpdateAction as a null footer occupant (no ghost status UI)', () => {
    const source = read('SidebarUpdateAction.jsx')
    const index = read('index.js')
    assert.match(source, /return null/)
    assert.doesNotMatch(source, /fetch\s*\(/)
    assert.doesNotMatch(source, /#DC2626|#2563EB|#1D4ED8|#93C5FD|#FFFFFF/)
    assert.match(index, /sidebar\.footer\.action/)
    assert.match(index, /omnimux-desktop-updater/)
    assert.match(index, /SidebarUpdateAction/)
  })

  it('does not fetch /api/desktop/updates/status or setInterval from the footer occupant or index', () => {
    const action = read('SidebarUpdateAction.jsx')
    const index = read('index.js')
    assert.doesNotMatch(action, /\bsetInterval\b/)
    assert.doesNotMatch(index, /\bsetInterval\b/)
    assert.doesNotMatch(action, /\/api\/desktop\/updates\/status/)
    assert.doesNotMatch(index, /\/api\/desktop\/updates\/status/)
    assert.doesNotMatch(action, /fetch\s*\(/)
    assert.doesNotMatch(index, /fetch\s*\(/)
    assert.doesNotMatch(action, /['"`]\/api\/desktop\/updates\/check['"`]/)
    assert.doesNotMatch(index, /['"`]\/api\/desktop\/updates\/check['"`]/)
    assert.doesNotMatch(action, /\/api\/desktop\/updates\/download/)
    assert.doesNotMatch(action, /\/api\/desktop\/updates\/apply/)
    assert.doesNotMatch(index, /\/api\/desktop\/updates\/download/)
    assert.doesNotMatch(index, /\/api\/desktop\/updates\/apply/)
  })

  it('does not leave a naked hex/rgba as the primary color in hub styles', () => {
    const styles = read('styles.js')
    assert.doesNotMatch(styles, /background:\s*#DC2626/)
    assert.doesNotMatch(styles, /background:\s*#2563EB/)
    assert.doesNotMatch(styles, /background:\s*#1D4ED8/)
    assert.doesNotMatch(styles, /color:\s*#93C5FD/)
  })
})
