import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'

// Execute the production registration callback without loading unrelated UI modules.
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
const start = source.indexOf("      ctx.inject(['betterSidebar', 'sessions', 'uiConversation'], (inner) => {")
const end = source.indexOf("\n    }\n    ctx.inject(['commandUi'", start)
assert.ok(start >= 0 && end > start, 'production media registration must exist')
const register = new Function('ctx', 'MEDIA_VIEWER_TAB_ID', 't', 'createElement', 'MediaViewerTab', source.slice(start, end))

function mount() {
  let tab, fileMount, dependencies
  const cleanups = []
  const fileCleanups = []
  const inner = {
    betterSidebar: { registerTab(value) { tab = value; return () => { tab = null } } },
    sessions: {},
    uiConversation: { imageUrl: (...args) => args },
    inject(keys, callback) { dependencies = keys; fileMount = callback },
    effect(setup) { cleanups.push(setup()) },
  }
  Object.defineProperty(inner, 'remote', { get() { throw new Error('remote without inject') } })
  const ctx = {
    inject(keys, callback) {
      assert.deepEqual(keys, ['betterSidebar', 'sessions', 'uiConversation'])
      callback(inner)
    },
    effect() { throw new Error('registration belongs to inner lifecycle') },
  }
  register(ctx, 'omnimux:media-viewer', () => '', (_component, props) => props, () => {})
  return {
    props: tab.component({}),
    hasTab: () => Boolean(tab),
    ready(readAll) {
      assert.deepEqual(dependencies, ['remote', 'remote.workspaceFiles'])
      let alive = true
      let cleanup
      const fileCtx = {
        get remote() {
          if (!dependencies.includes('remote')) throw new Error('remote without inject')
          return { get workspaceFiles() {
            if (!dependencies.includes('remote.workspaceFiles')) throw new Error('remote.workspaceFiles without inject')
            if (!alive) throw new Error('inactive context')
            return { readAll }
          } }
        },
        effect(setup) { cleanup = setup() },
      }
      fileMount(fileCtx)
      const stop = () => { cleanup(); alive = false }
      fileCleanups.push(stop)
      return stop
    },
    dispose() { fileCleanups.forEach(stop => stop()); cleanups.forEach(stop => stop?.()) },
  }
}

it('registers image tab without file capability and fails file reads explicitly', async () => {
  const scope = mount()
  assert.equal(scope.hasTab(), true)
  assert.deepEqual(scope.props.imageUrl('s', 'attachment'), ['s', 'attachment'])
  await assert.rejects(scope.props.readFile('s', '/sample.mp4'), /File preview unavailable/)
  scope.dispose()
  assert.equal(scope.hasTab(), false)
})

it('forwards session, path, signal and RpcResult only through declared child scope', async () => {
  const scope = mount()
  const result = { ok: true, value: { data: 'eA==', offset: 0, eof: true } }
  const signal = new AbortController().signal
  const calls = []
  const stop = scope.ready((...args) => { calls.push(args); return result })
  assert.equal(await scope.props.readFile('s', '/sample.mp4', signal), result)
  assert.deepEqual(calls, [['s', '/sample.mp4', signal]])
  stop()
  await assert.rejects(scope.props.readFile('s', '/sample.mp4', signal), /File preview unavailable/)
  assert.equal(calls.length, 1)
  scope.dispose()
})

it('old scope cleanup cannot clear a replacement reader; outer disposal clears registration', async () => {
  const scope = mount()
  const oldStop = scope.ready(() => ({ ok: true, value: 'old' }))
  const failure = { ok: false, error: { message: 'not found' } }
  scope.ready(() => failure)
  oldStop()
  assert.equal(await scope.props.readFile('s', '/missing.mp4'), failure)
  scope.dispose()
  assert.equal(scope.hasTab(), false)
  await assert.rejects(scope.props.readFile('s', '/sample.mp4'), /File preview unavailable/)
})
