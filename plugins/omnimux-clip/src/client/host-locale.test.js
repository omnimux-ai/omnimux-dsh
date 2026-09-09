import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./useHostLocale.js', import.meta.url), 'utf8')
// Capture the external-store contract without pretending to render a browser UI.
const hook = await import(`data:text/javascript,${encodeURIComponent(source.replace(
  "import { useSyncExternalStore } from 'react'",
  'const useSyncExternalStore = (subscribe, getSnapshot) => ({ subscribe, getSnapshot })',
))}`)

test('host locale reads initial and reloaded preferences and subscribes with the receiver intact', () => {
  const locale = {
    snapshot: { active: 'en', revision: 1 },
    listeners: new Set(),
    getSnapshot() { return this.snapshot },
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) },
  }
  const face = hook.useHostLocale(locale)
  assert.equal(face.getSnapshot(), locale.snapshot)
  let changes = 0
  const dispose = face.subscribe(() => changes++)
  locale.snapshot = { active: 'zh', revision: 2 }
  locale.listeners.forEach((fn) => fn())
  assert.equal(changes, 1)
  assert.equal(face.getSnapshot().active, 'zh')
  locale.snapshot = { active: 'zh', revision: 3 }
  locale.listeners.forEach((fn) => fn())
  assert.equal(changes, 2, 'late dictionaries also invalidate translated copy')
  assert.equal(hook.useHostLocale(locale).getSnapshot(), locale.snapshot)
  dispose()
  assert.equal(locale.listeners.size, 0)
})

test('absent host has a stable fallback and no independent persistence', () => {
  const face = hook.useHostLocale()
  assert.equal(face.getSnapshot(), face.getSnapshot())
  assert.equal(typeof face.subscribe(() => {}), 'function')
  assert.doesNotMatch(source, /localStorage|setLocale|navigator/)
})

test('both Clip surfaces receive and subscribe to host locale without locale-key remounts', () => {
  const entry = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  assert.match(entry, /stageFace = \(\) => \(\{ t, stage, locale: ctx\.locale \}\)/)
  assert.match(entry, /createElement\(OpenReelStudioTab, \{ \.\.\.props, t, locale: ctx\.locale \}\)/)
  for (const path of ['./ClipStage.jsx', './OpenReelStudioTab.jsx']) {
    const component = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.match(component, /useHostLocale\(locale\)/)
    assert.doesNotMatch(component, /key=\{.*locale/)
  }
  const stage = readFileSync(new URL('./ClipStage.jsx', import.meta.url), 'utf8')
  assert.match(stage, /activeSession \?\? lastSession\.current/)

  const toolbar = readFileSync(new URL('./openreel/web/components/editor/Toolbar.tsx', import.meta.url), 'utf8')
  assert.match(toolbar, /useHostLocale\(\)/)
  assert.match(toolbar, /Back to canvas/)
  assert.match(toolbar, /返回画布/)
  assert.match(toolbar, /onClick=\{handleReturnToCanvas\}/)
  assert.match(toolbar, /notifyCanvasClose\(\{ nodeId: activeSession\.nodeId \}\)/)
})
