import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { startInspirationCollectionsFixture } from './inspiration-collections.fixture.mjs'
import { startCollectionsBrowser } from './inspiration-collections.browser.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const LOCAL = '/omnimux/inspiration/local'
const DIALOG = '.omnimux-inspiration-collection-dialog'
const card = id => '[data-inspiration-id="' + id + '"]'
const collection = id => '[data-collection-id="' + id + '"]'
const livePrecondition = 'Task #3392: .workbuddy/evidence/inspiration-collections-3392/live-verification.md and create-dialog.png, Ego space 196, bundle 1c8d6564646eaec29aeedb1af749fd421fa4952a8796f872f09625b410389d65; manually verified before adding this regression.'

async function eventually(fn, message) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (fn()) return
    await sleep(20)
  }
  throw new Error(message)
}

async function within(promise, message) {
  let timer
  try {
    await Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), 10000) })])
  } finally { clearTimeout(timer) }
}

async function withEnvironment(name, run) {
  const parent = join(root, '.workbuddy/evidence/inspiration-collections-regression')
  mkdirSync(parent, { recursive: true })
  const evidenceDir = mkdtempSync(join(parent, name + '-'))
  const report = { name, pass: false, livePrecondition, checks: [], screenshots: [], evidenceDir }
  let fixture, browser
  try {
    fixture = await startInspirationCollectionsFixture({ root, evidenceDir })
    browser = await startCollectionsBrowser(evidenceDir)
    report.identity = fixture.identity
    report.origin = fixture.origin
    report.browser = { kind: 'independent-headless-chromium-regression', pid: browser.pid, port: browser.port, replacesEgoAcceptance: false }
    await browser.send('Page.navigate', { url: fixture.origin })
    await browser.wait(() => Boolean(document.querySelector('[role="tab"]')))
    await browser.clickText('灵感库', '[role="tab"]')
    await expectRows(browser, definitions)
    await browser.wait(() => {
      const images = [...document.querySelectorAll('[data-inspiration-id] img')]
      return images.length >= 8 && images.every(image => image.complete && image.naturalWidth > 0)
    })
    await run({ fixture, browser, report })
    assert.equal(fixture.counters.blockedCapabilities, 0)
    assert.equal(fixture.counters.blockedExternalFetch, 0)
    assert.deepEqual(browser.consoleErrors, [])
    report.finalDisk = fixture.readDisk()
    report.pass = true
  } catch (error) {
    report.error = String(error.stack || error)
    if (browser) {
      try { report.screenshots.push(await browser.screenshot('failure')) } catch {}
    }
    throw error
  } finally {
    const cleanupErrors = []
    try { if (browser) report.browserCleanup = await browser.close() } catch (error) { cleanupErrors.push(error) }
    if (fixture) {
      report.requests = fixture.requests
      report.counters = fixture.counters
      try { report.fixtureCleanup = await fixture.close() } catch (error) { cleanupErrors.push(error) }
    }
    if (cleanupErrors.length) { report.pass = false; report.cleanupErrors = cleanupErrors.map(error => String(error)) }
    writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2))
    console.log('Collections regression evidence: ' + evidenceDir)
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Collection regression cleanup failed')
  }
}

const definitions = ['qa-dance1', 'qa-dance2', 'qa-fashion1', 'qa-fashion2', 'qa-portrait1', 'qa-portrait2', 'qa-city1', 'qa-travel1']
async function expectRows(browser, ids) {
  await browser.wait(ids => {
    const actual = [...document.querySelectorAll('.omnimux-inspiration-collection-surface [data-inspiration-id]')].map(element => element.dataset.inspirationId).sort()
    return JSON.stringify(actual) === JSON.stringify([...ids].sort())
  }, ids)
}
async function dismiss(browser) {
  await browser.clickText('取消', DIALOG + ' button')
  await browser.wait(() => !document.querySelector('.omnimux-inspiration-collection-dialog'))
}
async function confirm(browser, label = '确认') {
  await browser.clickText(label, DIALOG + ' button')
  await browser.wait(() => !document.querySelector('.omnimux-inspiration-collection-dialog'))
}
async function createDance(fixture, browser) {
  await browser.drag(card('qa-dance1'), card('qa-dance2'))
  await confirm(browser)
  const result = fixture.readDisk().collections.find(entry => entry.title === '舞蹈合集')
  assert.ok(result)
  await browser.wait(id => Boolean(document.querySelector('[data-collection-id="' + id + '"]')), result.id)
  return result.id
}
async function undo(browser) {
  await browser.wait(() => Boolean(document.querySelector('.omnimux-inspiration-toast.has-action button')))
  await browser.clickText('撤销', '.omnimux-inspiration-toast button')
}
function members(fixture, id) {
  return fixture.readDisk().collections.find(entry => entry.id === id).item_ids
}

test('collections: cancel, validation, real create/add/remove/undo and durable reload', { timeout: 120000 }, async () => {
  await withEnvironment('journey', async ({ fixture, browser, report }) => {
    await browser.drag(card('qa-dance1'), card('qa-dance2'))
    assert.equal(await browser.evaluate(() => document.querySelector('.omnimux-inspiration-collection-dialog input').value), '舞蹈合集')
    assert.equal(await browser.evaluate(() => document.querySelectorAll('.omnimux-inspiration-collection-dialog-preview .omnimux-inspiration-collection-column').length), 2)
    report.screenshots.push(await browser.screenshot('create-preview'))
    await dismiss(browser)
    await expectRows(browser, definitions)
    assert.equal(fixture.readDisk().collections.length, 0)
    assert.equal(fixture.requests.filter(entry => entry.method === 'POST' && entry.path === LOCAL + '/collections').length, 0)
    assert.equal(await browser.evaluate(() => Boolean(document.querySelector('[data-collection-dragging],.omnimux-inspiration-collection-drag-ghost'))), false)
    report.checks.push('native drag opens two-column suggestion; cancel neither writes nor leaves gesture state')

    const dance = await createDance(fixture, browser)
    assert.deepEqual(new Set(members(fixture, dance)), new Set(['qa-dance1', 'qa-dance2']))
    await expectRows(browser, definitions.filter(id => !id.startsWith('qa-dance')))
    assert.equal(await browser.evaluate(id => document.querySelector('[data-collection-id="' + id + '"] .omnimux-inspiration-collection-title').textContent.trim(), dance), '舞蹈合集')

    await browser.drag(card('qa-fashion1'), card('qa-fashion2'))
    for (const [value, message] of [[' ', '填写合集名称'], ['字'.repeat(21), '名称最多20个字'], ['舞蹈合集', '此名称已被使用']]) {
      await browser.input(value)
      assert.equal(await browser.evaluate(() => [...document.querySelectorAll('.omnimux-inspiration-collection-dialog button')].find(button => button.textContent.trim() === '确认').disabled), true)
      assert.ok(await browser.evaluate(message => document.querySelector('.omnimux-inspiration-collection-dialog').textContent.includes(message), message))
    }
    assert.equal(fixture.readDisk().collections.length, 1)
    await browser.input('  穿搭参考  ')
    await confirm(browser)
    assert.ok(fixture.readDisk().collections.some(entry => entry.title === '穿搭参考'))
    report.checks.push('blank, overlength and duplicate names block writes; valid trimmed name is persisted')

    await browser.drag(card('qa-portrait1'), collection(dance))
    assert.equal(await browser.evaluate(() => Boolean(document.querySelector('.omnimux-inspiration-collection-dialog input'))), false)
    await dismiss(browser)
    assert.equal(members(fixture, dance).length, 2)
    await browser.drag(card('qa-portrait1'), collection(dance))
    await confirm(browser, '加入合集')
    assert.equal(members(fixture, dance).length, 3)
    await browser.wait(id => document.querySelectorAll('[data-collection-id="' + id + '"] .omnimux-inspiration-collection-column').length === 3, dance)

    await browser.drag(card('qa-portrait2'), collection(dance))
    await confirm(browser, '加入合集')
    assert.equal(members(fixture, dance).length, 4)
    await browser.wait(id => document.querySelector('[data-collection-id="' + id + '"] .omnimux-inspiration-collection-more-count')?.textContent === '+1', dance)
    await undo(browser)
    await eventually(() => members(fixture, dance).length === 3, 'Undo must remove the fourth relation')
    await expectRows(browser, ['qa-portrait2', 'qa-city1', 'qa-travel1'])
    report.checks.push('add cancellation is inert; confirmed additions update preview and fourth-item count; undo restores root membership')

    await browser.click(collection(dance))
    await expectRows(browser, ['qa-dance1', 'qa-dance2', 'qa-portrait1'])
    assert.equal(await browser.evaluate(() => document.querySelectorAll('.omnimux-inspiration-collection-surface [data-collection-id]').length), 0)
    await browser.click(card('qa-portrait1') + ' button[aria-label="更多操作"]')
    await browser.clickText('移出合集', '[role="menuitem"]')
    await expectRows(browser, ['qa-dance1', 'qa-dance2'])
    assert.equal(fixture.readDisk().items.length, 8)
    assert.equal(members(fixture, dance).length, 2)
    await undo(browser)
    await expectRows(browser, ['qa-dance1', 'qa-dance2', 'qa-portrait1'])
    assert.equal(members(fixture, dance).length, 3)
    report.checks.push('menu removal changes only the relation; undo restores it without deleting source records')

    await browser.clickText('重命名', '.omnimux-inspiration-collection-navigation button')
    await browser.input('舞蹈动作参考')
    await confirm(browser)
    await browser.wait(() => document.querySelector('.omnimux-inspiration-collection-heading')?.textContent === '舞蹈动作参考')
    await browser.clickText('返回灵感库', '.omnimux-inspiration-collection-navigation button')
    await expectRows(browser, ['qa-portrait2', 'qa-city1', 'qa-travel1'])
    await browser.clickText('爆款趋势', '[role="tab"]')
    await browser.clickText('灵感库', '[role="tab"]')
    await expectRows(browser, ['qa-portrait2', 'qa-city1', 'qa-travel1'])
    assert.equal(fixture.readDisk().collections.length, 2)
    report.screenshots.push(await browser.screenshot('root-after-mutations'))
    report.checks.push('renamed relations survive revisiting previous tab/cache scopes without resurrecting grouped cards')

    const diskBefore = fixture.readDisk()
    fixture.restart()
    assert.equal(fixture.instance, 2)
    assert.deepEqual(fixture.readDisk().collections, diskBefore.collections)
    await browser.send('Page.reload', { ignoreCache: true })
    await browser.wait(() => Boolean(document.querySelector('[role="tab"]')))
    await browser.clickText('灵感库', '[role="tab"]')
    await expectRows(browser, ['qa-portrait2', 'qa-city1', 'qa-travel1'])
    await browser.click(collection(dance))
    await expectRows(browser, ['qa-dance1', 'qa-dance2', 'qa-portrait1'])
    assert.equal(await browser.evaluate(() => document.querySelector('.omnimux-inspiration-collection-heading').textContent), '舞蹈动作参考')
    report.screenshots.push(await browser.screenshot('persisted-members'))
    report.checks.push('new production plugin/store instance and fresh page read the same durable names and memberships')
    assert.equal(fixture.requests.filter(entry => entry.method === 'POST' && entry.path === LOCAL + '/collections').length, 2)
    assert.equal(fixture.requests.filter(entry => entry.path === LOCAL + '/collections/undo').length, 2)
  })
})

test('collections: delayed or failed scope reads cannot expose stale root/member cards', { timeout: 90000 }, async () => {
  await withEnvironment('scope', async ({ fixture, browser, report }) => {
    const dance = await createDance(fixture, browser)
    const delayed = fixture.planListRead({ match: url => url.searchParams.get('collection_id') === dance })
    await browser.click(collection(dance))
    await within(delayed.reached, 'Expected deferred collection request')
    assert.equal(await browser.evaluate(() => document.querySelectorAll('.omnimux-inspiration-collection-surface [data-inspiration-id],.omnimux-inspiration-collection-surface [data-collection-id]').length), 0)
    await browser.clickText('爆款趋势', '[role="tab"]')
    delayed.release()
    await eventually(() => browser.network.some(event => event.url?.includes('collection_id=' + dance) && event.status === 'Network.loadingFinished'), 'Deferred response must actually finish')
    await browser.evaluate(async () => { await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))) })
    assert.equal(await browser.evaluate(() => document.querySelectorAll('.omnimux-inspiration-collection-surface [data-inspiration-id],.omnimux-inspiration-collection-surface [data-collection-id]').length), 0)
    assert.equal(await browser.evaluate(() => Boolean(document.querySelector('.omnimux-inspiration-collection-navigation'))), false)
    report.checks.push('changing scope hides old rows immediately; a completed late member response cannot paint the cloud scope')

    await browser.clickText('灵感库', '[role="tab"]')
    await expectRows(browser, definitions.filter(id => !id.startsWith('qa-dance')))
    await browser.click(collection(dance))
    await expectRows(browser, ['qa-dance1', 'qa-dance2'])
    // A previously successful root scope is legitimately cached. Use a real,
    // previously unseen user query before inducing a transport failure, rather
    // than silently clearing application caches to force the test path.
    await browser.fill('input[placeholder="搜索标题、文案或标签"]', '参考')
    await eventually(() => fixture.requests.some(entry => entry.query.collection_id === dance && entry.query.q === '参考' && entry.status === 200), 'User query must reach the real member list')
    const failure = fixture.planListRead({ match: url => url.searchParams.get('root_only') === 'true' && !url.searchParams.has('collection_id'), failure: true })
    await browser.clickText('返回灵感库', '.omnimux-inspiration-collection-navigation button')
    await within(failure.reached, 'Expected root read failure')
    await browser.wait(() => document.querySelector('.omnimux-inspiration-error')?.textContent.includes('qa-list-unavailable'))
    assert.equal(await browser.evaluate(() => document.querySelectorAll('.omnimux-inspiration-collection-surface [data-inspiration-id],.omnimux-inspiration-collection-surface [data-collection-id]').length), 0)
    await browser.clickText('重试', '.omnimux-inspiration-error button')
    await expectRows(browser, definitions.filter(id => !id.startsWith('qa-dance')))
    await browser.wait(id => Boolean(document.querySelector('[data-collection-id="' + id + '"]')), dance)
    assert.equal(fixture.counters.injectedReadFailures, 1)
    assert.equal(fixture.requests.filter(entry => entry.status === 503).length, 1)
    report.screenshots.push(await browser.screenshot('scope-recovered'))
    report.checks.push('failed root read does not render prior members as current; explicit retry reaches real persisted root data')
  })
})
