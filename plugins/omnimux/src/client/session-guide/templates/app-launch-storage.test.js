import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

// Unit boundary harness: execute the source handler, not a second implementation.
// Real mounted UI and navigation are covered by the task's separate browser journey.
const source = readFileSync(new URL('./ExploreTemplatesSection.jsx', import.meta.url), 'utf8')
const start = source.indexOf('const handleAppLaunch = async (item) => {')
const end = source.indexOf('\n  // 统一分发卡片动作', start)
assert.ok(start >= 0 && end > start, 'source handler boundaries must exist')
const handlerSource = source.slice(start, end)

function harness(storage, getterError = false) {
  const errors = []
  const opened = []
  const events = []
  const win = { dispatchEvent(event) { events.push(event) } }
  Object.defineProperty(win, 'localStorage', {
    get() {
      if (getterError) throw new Error('SecurityError')
      return storage
    },
  })
  const pending = { current: false }
  const launch = runInNewContext(`${handlerSource}; handleAppLaunch`, {
    window: win,
    appLaunchPending: pending,
    setAppLaunchError(value) { errors.push(value) },
    isEn: false,
    currentLocale: 'zh',
    resolveTemplateCopy: () => ({ title: '应用' }),
    openWorkbench: async (value) => { opened.push(value); return true },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail } },
  })
  return { launch, errors, opened, events, pending }
}

const item = { appId: 'app-test', manifest: { metadata: { name: '测试应用' }, fields: [] } }

for (const value of ['{broken', 'null', '[]', '42']) {
  test(`app launch rebuilds invalid manifest cache ${value}`, async () => {
    let saved
    const env = harness({ getItem: () => value, setItem(_key, next) { saved = next } })
    await env.launch(item)
    assert.deepEqual(JSON.parse(saved), { 'app-test': item.manifest })
    assert.equal(env.opened.length, 1)
    assert.equal(env.opened[0].meta.appId, item.appId)
    assert.equal(env.events.length, 1)
    assert.deepEqual(env.errors, [''])
    assert.equal(env.pending.current, false)
  })
}

for (const point of ['getter', 'getItem', 'setItem']) {
  test(`app launch fails reliably when storage ${point} throws`, async () => {
    const env = harness({
      getItem() {
        if (point === 'getItem') throw new Error('SecurityError')
        return '{broken'
      },
      setItem() { throw new Error('QuotaExceededError') },
    }, point === 'getter')
    await env.launch(item)
    assert.equal(env.opened.length, 0)
    assert.equal(env.events.length, 0)
    assert.match(env.errors.at(-1), /应用暂时无法打开/)
    assert.equal(env.pending.current, false)
  })
}

test('app launch retains other manifests while updating current identity', async () => {
  let saved
  const env = harness({ getItem: () => JSON.stringify({ other: { name: 'keep' } }), setItem(_key, next) { saved = next } })
  await env.launch(item)
  assert.deepEqual(JSON.parse(saved), { other: { name: 'keep' }, 'app-test': item.manifest })
  assert.equal(env.opened[0].id, 'app_app-test')
})
