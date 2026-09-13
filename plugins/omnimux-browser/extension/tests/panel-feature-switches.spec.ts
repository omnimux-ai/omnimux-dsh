// @vitest-environment jsdom
/**
 * The two settings cards in the panel's settings view.
 *
 * The panel is the writer of both switches, so this spec pins the contract the
 * page side depends on: the card structure (feature name above a single switch
 * row), the key each switch is bound to, the state each switch reads, and the
 * three things a toggle does — persist, mirror, and tell the active tab.
 *
 * The React tree is read from source rather than rendered: the panel only mounts
 * against a live bridge, and what the page side actually depends on is the keys,
 * the copy and the switch wiring, all of which are static here.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAG, readFlagSync } from '../src/feature-flags.ts'
import { PANEL_COPY } from '../src/panel/strings.ts'

const root = process.cwd()
const APP = readFileSync(resolve(root, 'src/panel/App.tsx'), 'utf8')
const STYLES = readFileSync(resolve(root, 'src/panel/styles.css'), 'utf8')

/** The JSX of one settings card, from its `aria-labelledby` to its closing tag. */
function cardOf(source: string, id: string): string {
  const start = source.indexOf(`aria-labelledby="${id}"`)
  expect(start, `settings card not found: ${id}`).toBeGreaterThan(-1)
  const end = source.indexOf('</section>', start)
  expect(end, `settings card is not closed: ${id}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

/** The body of a top-level function declared in the panel source. */
function functionBodyOf(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  expect(start, `function not found: ${name}`).toBeGreaterThan(-1)
  const end = source.indexOf('\n  }', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

/** Declarations of the rule whose selector is exactly `selector`. */
function declarationsOf(css: string, selector: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const lines = clean.split('\n')
  const at = lines.findIndex((line) => line.trim() === `${selector} {`)
  expect(at, `css rule not found: ${selector}`).toBeGreaterThan(-1)
  const body = lines.slice(at).join('\n')
  return body.slice(body.indexOf('{') + 1, body.indexOf('}'))
}

describe('the two page-surface switches', () => {
  it('titles both cards and labels both switches in the user\'s language', () => {
    expect(PANEL_COPY.zh.settings.fabSection).toBe('悬浮球')
    expect(PANEL_COPY.zh.settings.fabToggle).toBe('启用悬浮球')
    expect(PANEL_COPY.zh.settings.fabToggleHelp).toBe('控制网页右下角全局悬浮球是否显示')

    expect(PANEL_COPY.zh.settings.mediaHoverSection).toBe('图片工具栏')
    expect(PANEL_COPY.zh.settings.mediaHoverToggle).toBe('悬停在图片上时显示')
    expect(PANEL_COPY.zh.settings.mediaHoverToggleHelp).toMatch(/悬停/)
    expect(PANEL_COPY.zh.settings.mediaHoverToggleHelp).toMatch(/工具栏/)

    expect(PANEL_COPY.en.settings.fabSection).not.toBe('')
    expect(PANEL_COPY.en.settings.fabToggle).not.toBe('')
    expect(PANEL_COPY.en.settings.fabToggleHelp).toMatch(/bottom-right/)
    expect(PANEL_COPY.en.settings.mediaHoverSection).not.toBe('')
    expect(PANEL_COPY.en.settings.mediaHoverToggle).not.toBe('')
    expect(PANEL_COPY.en.settings.mediaHoverToggleHelp).toMatch(/hover/i)
  })

  it('renders a floating-ball card bound to the floating-ball switch', () => {
    const card = cardOf(APP, 'omnimux-fab-setting')
    expect(card).toContain('settings-card-heading')
    expect(card).toContain('copy.settings.fabSection')
    expect(card).toContain('copy.settings.fabToggle')
    expect(card).toContain('copy.settings.fabToggleHelp')
    expect(card).toContain('className="setting-toggle"')
    expect(card).toContain('type="checkbox"')
    expect(card).toContain('checked={fabEnabled}')
    expect(card).toContain('updateFeatureFlag(FEATURE_FLAG.fab, event.target.checked)')
    expect(card).toContain('setting-toggle-control')
  })

  it('renders an image-toolbar card bound to the hover-capsule switch', () => {
    const card = cardOf(APP, 'omnimux-media-hover-setting')
    expect(card).toContain('settings-card-heading')
    expect(card).toContain('copy.settings.mediaHoverSection')
    expect(card).toContain('copy.settings.mediaHoverToggle')
    expect(card).toContain('copy.settings.mediaHoverToggleHelp')
    expect(card).toContain('className="setting-toggle"')
    expect(card).toContain('type="checkbox"')
    expect(card).toContain('checked={mediaHoverEnabled}')
    expect(card).toContain('updateFeatureFlag(FEATURE_FLAG.mediaHover, event.target.checked)')
    expect(card).toContain('setting-toggle-control')
  })

  it('shows both cards inside the settings view, ahead of the host settings', () => {
    const settingsView = APP.slice(APP.indexOf('if (showSettings) {'))
    const fab = settingsView.indexOf('omnimux-fab-setting')
    const mediaHover = settingsView.indexOf('omnimux-media-hover-setting')
    const workspace = settingsView.indexOf('Associated Workspace')
    expect(fab).toBeGreaterThan(-1)
    expect(mediaHover).toBeGreaterThan(fab)
    expect(workspace).toBeGreaterThan(mediaHover)
  })

  it('starts both switches from the stored value, which defaults to on', () => {
    expect(APP).toContain(`useState<boolean>(() => readFlagSync(FEATURE_FLAG.fab))`)
    expect(APP).toContain(`useState<boolean>(() => readFlagSync(FEATURE_FLAG.mediaHover))`)
    // A user who never touched a switch has nothing stored, and an absent value
    // has to read as on — a feature must not disappear on its own.
    expect(readFlagSync(FEATURE_FLAG.fab)).toBe(true)
    expect(readFlagSync(FEATURE_FLAG.mediaHover)).toBe(true)
  })

  it('persists a toggle and tells the active tab about it', () => {
    const update = functionBodyOf(APP, 'updateFeatureFlag')
    expect(update).toContain('void writeFlag(key, enabled)')
    expect(update).toContain('void notifyFeatureFlag(key, enabled)')
    expect(update).toContain('setFabEnabled(enabled)')
    expect(update).toContain('setMediaHoverEnabled(enabled)')

    const notify = functionBodyOf(APP, 'notifyFeatureFlag')
    expect(notify).toContain('chrome.tabs.query({ active: true, currentWindow: true })')
    expect(notify).toContain('chrome.tabs.sendMessage(tabId, featureFlagMessage(key, enabled))')
  })

  it('reads both switches back from storage and follows changes made elsewhere', () => {
    expect(APP).toContain('readFlag(FEATURE_FLAG.fab)')
    expect(APP).toContain('readFlag(FEATURE_FLAG.mediaHover)')
    expect(APP).toContain('subscribeFlag(FEATURE_FLAG.fab, setFabEnabled)')
    expect(APP).toContain('subscribeFlag(FEATURE_FLAG.mediaHover, setMediaHoverEnabled)')
  })
})

describe('the settings switch chrome', () => {
  it('draws the card heading inside the existing rounded card', () => {
    expect(declarationsOf(STYLES, '.settings-panel')).toMatch(/border-radius:\s*16px/)
    const heading = declarationsOf(STYLES, '.settings-card-heading')
    expect(heading).toMatch(/padding:/)
    expect(heading).toMatch(/font-weight:/)
  })

  it('slides the knob with a transition instead of snapping', () => {
    const track = declarationsOf(STYLES, '.setting-toggle-control')
    expect(track).toMatch(/border-radius:\s*999px/)
    expect(track).toMatch(/transition:[^;]*background-color/)

    const knob = declarationsOf(STYLES, '.setting-toggle-control > span')
    expect(knob).toMatch(/border-radius:\s*50%/)
    expect(knob).toMatch(/transition:[^;]*transform/)

    const checked = declarationsOf(STYLES, '.setting-toggle-input:checked + .setting-toggle-control > span')
    expect(checked).toMatch(/transform:\s*translateX\(/)
  })
})
