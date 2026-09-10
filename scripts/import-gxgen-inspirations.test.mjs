import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyImport,
  planImport,
  readPlan,
  verifyImport,
} from './import-gxgen-inspirations.mjs'

const execFileAsync = promisify(execFile)
const COVER = Buffer.from('real-cover-bytes')
const COVER_SHA = createHash('sha256').update(COVER).digest('hex')

function sourceRow(index, tiktokID = String(7500000000000000000n + BigInt(index))) {
  return {
    id: `row-${String(index).padStart(3, '0')}`,
    title: `Real title ${index}`,
    assets: {
      platform: 'tiktok',
      template_type: 'video',
      tiktok_video_id: tiktokID,
      caption: `Real caption ${index}`,
      views: String(1000 + index),
      tags: [`tag-${index}`],
      creator: { name: `Creator ${index}`, handle: `creator_${index}` },
      analysis: {
        attraction_analysis: `hook ${index}`,
        global_goal: `goal ${index}`,
        narrative_structure: `narrative ${index}`,
        visual_analysis: `visual ${index}`,
        replication_strategy: `replication ${index}`,
      },
      raw_source: {},
    },
    cover_r2_key: `publications/videos/${index}/cover.jpg`,
    is_active: true,
    deleted_at: null,
  }
}

function config(root, overrides = {}) {
  return {
    file: join(root, 'plan.json'),
    sourceURL: 'https://source.example',
    sourceKey: 'source-secret',
    targetURL: 'https://target.example/v1',
    targetToken: 'target-secret',
    inspector: '/fake/inspiration',
    limit: 1,
    pageSize: 2,
    ...overrides,
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

class Fixture {
  constructor(rows = []) {
    this.sourceRows = rows
    this.targetRows = []
    this.calls = []
    this.nextID = 100
    this.post = null
    this.cover = new Map(rows.map((row) => [`r2/${row.cover_r2_key}`, { status: 'ok', sha256: COVER_SHA, bytes: COVER.length, contentType: 'image/jpeg' }]))
  }

  inspect = async (manifest) => ({
    schemaVersion: 1,
    items: manifest.items.map((item) => ({ id: item.id, ref: item.ref, ...(this.cover.get(item.ref) || { status: 'invalid', errorCode: 'NOT_FOUND' }) })),
  })

  record(payload, overrides = {}) {
    const id = String(this.nextID++)
    const record = {
      id,
      ...structuredClone(payload),
      cover_key: `/v1/media/inspiration-covers/${id}`,
      created_at: '2026-09-06T00:00:00Z',
      updated_at: '2026-09-06T00:00:00Z',
      ...overrides,
    }
    this.targetRows.push(record)
    return record
  }

  fetch = async (input, init = {}) => {
    const url = new URL(input)
    const method = init.method || 'GET'
    this.calls.push({ method, url: url.toString(), redirect: init.redirect, body: init.body })
    if (url.hostname === 'source.example') {
      assert.equal(method, 'GET')
      assert.equal(url.searchParams.get('select'), 'id,title,country_code,duration_seconds,published_at,assets,cover_r2_key,is_active,deleted_at')
      assert.equal(url.searchParams.has('offset'), false)
      const after = url.searchParams.get('id')?.replace(/^gt\./, '')
      const limit = Number(url.searchParams.get('limit'))
      return json(this.sourceRows.filter((row) => !after || row.id > after).slice(0, limit))
    }
    if (url.hostname !== 'target.example') throw new Error(`unexpected host ${url.hostname}`)
    if (method === 'GET' && url.pathname === '/v1/inspirations') {
      const page = Number(url.searchParams.get('page'))
      const size = Number(url.searchParams.get('page_size'))
      return json({ success: true, data: { total: this.targetRows.length, page, size, items: this.targetRows.slice((page - 1) * size, page * size) } })
    }
    const detail = url.pathname.match(/^\/v1\/inspirations\/(\d+)$/)
    if (method === 'GET' && detail) {
      const row = this.targetRows.find((item) => String(item.id) === detail[1])
      return row ? json({ success: true, data: row }) : json({ success: false, code: 'NOT_FOUND' }, 404)
    }
    if (method === 'GET' && url.pathname.startsWith('/v1/media/inspiration-covers/')) {
      return new Response(COVER, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    }
    if (method === 'POST' && url.pathname === '/v1/inspirations') {
      const payload = JSON.parse(init.body)
      if (this.post) return this.post(payload, this)
      const record = this.record(payload)
      return json({ success: true, data: record, existed: false }, 201)
    }
    return json({ success: false, code: 'UNEXPECTED' }, 500)
  }
}

function deps(root, fixture, overrides = {}) {
  return {
    fetch: fixture.fetch,
    inspectCovers: fixture.inspect,
    lockPath: join(root, 'target.lock'),
    now: () => '2026-09-06T00:00:00.000Z',
    ...overrides,
  }
}

async function planned(root, fixture, overrides = {}) {
  const options = config(root, overrides)
  const document = await planImport(options, deps(root, fixture))
  return { options, document }
}

test('uses cursor pagination and applies limit after invalid covers', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-page-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fixture = new Fixture([sourceRow(1), sourceRow(2), sourceRow(3), sourceRow(4), sourceRow(5)])
  fixture.cover.set('r2/publications/videos/1/cover.jpg', { status: 'invalid', errorCode: 'DECODE' })
  fixture.targetRows.push({ id: '1', title: 'old 1' }, { id: '2', title: 'old 2' }, { id: '3', title: 'old 3' })
  const options = config(root, { limit: 2, pageSize: 2 })
  const plan = await planImport(options, deps(root, fixture))
  assert.deepEqual(plan.items.map((item) => item.gxgenId), ['row-002', 'row-003'])
  assert.equal(plan.stats.scanned, 5)
  assert.equal(plan.skips.find((item) => item.gxgenId === 'row-001').status, 'invalid_source')
  const sourceCalls = fixture.calls.filter((call) => call.url.includes('/rest/v1/'))
  assert.deepEqual(sourceCalls.map((call) => new URL(call.url).searchParams.get('id')), [null, 'gt.row-002', 'gt.row-004'])
  assert.ok(fixture.calls.every((call) => call.redirect === 'error'))
})

test('rejects source page sizes above the confirmed API maximum', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-page-max-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fixture = new Fixture([sourceRow(1)])
  await assert.rejects(
    planImport(config(root, { pageSize: 101 }), deps(root, fixture)),
    /--page-size must be no greater than 100/,
  )
  assert.equal(fixture.calls.length, 0)
})

test('deduplicates target TikTok identity despite author and query changes', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-target-id-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const row = sourceRow(1)
  const fixture = new Fixture([row])
  fixture.targetRows.push({
    id: '9', type: 'video', title: 'old', content: 'old',
    source_url: `https://www.tiktok.com/@renamed/video/${row.assets.tiktok_video_id}?sync=old`,
    analysis: {}, tags: [], media_keys: [], hot_score: 1, is_favorite: true,
  })
  const plan = await planImport(config(root), deps(root, fixture))
  assert.equal(plan.items.length, 0)
  assert.equal(plan.skips[0].status, 'existing')
  assert.equal(plan.skips[0].targetId, '9')
})

test('blocks whole source groups when one row claims inconsistent identities', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-conflict-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const idA = '7500000000000000001'
  const idB = '7500000000000000002'
  const a = sourceRow(1, idA)
  const b = sourceRow(2, idB)
  const bad = sourceRow(3, idA)
  bad.assets.source_url = `https://www.tiktok.com/@a/video/${idA}`
  bad.assets.tiktok_video_id = 7500000000000000000
  bad.assets.raw_source.id = idB
  const fixture = new Fixture([a, b, bad])
  const plan = await planImport(config(root, { limit: 2 }), deps(root, fixture))
  assert.equal(plan.items.length, 0)
  assert.ok(plan.skips.some((item) => item.gxgenId === bad.id && item.status === 'invalid_source'))
  assert.equal(plan.skips.filter((item) => [a.id, b.id].includes(item.gxgenId) && item.status === 'source_duplicate').length, 2)
})

test('accepts bare raw source video ID and collapses identical source content', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-identical-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const first = sourceRow(1)
  delete first.assets.tiktok_video_id
  first.assets.raw_source.id = '7500000000000000001'
  const second = structuredClone(first)
  second.id = 'row-002'
  const fixture = new Fixture([first, second])
  const plan = await planImport(config(root), deps(root, fixture))
  assert.equal(plan.items.length, 1)
  assert.equal(plan.items[0].tiktokId, '7500000000000000001')
  assert.equal(plan.skips.find((item) => item.gxgenId === second.id).status, 'source_duplicate')
})

test('skips the entire TikTok group when duplicate source rows map to different content', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-content-conflict-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const first = sourceRow(1)
  const second = structuredClone(first)
  second.id = 'row-002'
  second.title = 'Different real title'
  const fixture = new Fixture([first, second])
  const plan = await planImport(config(root), deps(root, fixture))
  assert.equal(plan.items.length, 0)
  assert.equal(plan.skips.filter((item) => item.status === 'source_duplicate' && /conflicting source content/.test(item.reason)).length, 2)
})

test('target malformed identity keeps valid URL claim and blocks duplication', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-target-conflict-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const row = sourceRow(1)
  const fixture = new Fixture([row])
  fixture.targetRows.push({ id: '8', source_url: `https://www.tiktok.com/@old/video/${row.assets.tiktok_video_id}`, analysis: { tiktok_video_id: 7500000000000000000 } })
  const plan = await planImport(config(root), deps(root, fixture))
  assert.equal(plan.items.length, 0)
  assert.match(plan.skips[0].reason, /malformed TikTok identity/)
})

test('selected source changes fail apply, while unrelated new rows do not', async (t) => {
  const rootA = mkdtempSync(join(tmpdir(), 'gxgen-import-source-change-'))
  const rootB = mkdtempSync(join(tmpdir(), 'gxgen-import-source-add-'))
  t.after(() => { rmSync(rootA, { recursive: true, force: true }); rmSync(rootB, { recursive: true, force: true }) })
  const changed = new Fixture([sourceRow(1)])
  const first = await planned(rootA, changed)
  changed.sourceRows[0].title = 'changed after plan'
  const failed = await applyImport(first.options, deps(rootA, changed))
  assert.equal(failed.ok, false)
  assert.match(failed.failure, /content conflict|changed since planning/)
  assert.equal(changed.calls.filter((call) => call.method === 'POST').length, 0)

  const extended = new Fixture([sourceRow(1)])
  const second = await planned(rootB, extended)
  extended.sourceRows.push(sourceRow(2))
  const applied = await applyImport(second.options, deps(rootB, extended))
  assert.equal(applied.ok, true)
  assert.equal(applied.counts.created, 1)
})

test('enforces the same-target local mutex', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-lock-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fixture = new Fixture([sourceRow(1)])
  const { options } = await planned(root, fixture)
  const lock = join(root, 'target.lock')
  const fd = openSync(lock, 'wx', 0o600)
  closeSync(fd)
  await assert.rejects(applyImport(options, deps(root, fixture)), /another import holds/)
  assert.equal(fixture.calls.filter((call) => call.method === 'POST').length, 0)
})

test('reconciles a timed-out POST that committed and verifies raw cover bytes', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-timeout-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fixture = new Fixture([sourceRow(1)])
  const { options } = await planned(root, fixture)
  fixture.post = async (payload, state) => { state.record(payload); throw new Error('socket timed out') }
  const applied = await applyImport(options, deps(root, fixture))
  assert.equal(applied.ok, true)
  assert.equal(applied.counts.created, 1)
  const receipts = JSON.parse(readFileSync(`${options.file}.receipts.json`, 'utf8'))
  assert.equal(receipts.rows['row-001'].attempts.at(-1).reconciled, true)
})

test('partial committed writes stay failed on repeat instead of becoming external skips', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-partial-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fixture = new Fixture([sourceRow(1)])
  const { options } = await planned(root, fixture)
  fixture.post = async (payload, state) => { state.record(payload, { tags: [] }); throw new Error('tag transaction failed') }
  const first = await applyImport(options, deps(root, fixture))
  assert.equal(first.counts.verification_failed, 1)
  fixture.post = async () => { throw new Error('must not POST again') }
  const second = await applyImport(options, deps(root, fixture))
  assert.equal(second.ok, false)
  assert.equal(second.counts.verification_failed, 1)
  assert.equal(fixture.calls.filter((call) => call.method === 'POST').length, 1)
})

test('same plan rerun creates zero and keeps stable target ID', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-rerun-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fixture = new Fixture([sourceRow(1)])
  const { options } = await planned(root, fixture)
  const first = await applyImport(options, deps(root, fixture))
  const targetID = fixture.targetRows[0].id
  const second = await applyImport(options, deps(root, fixture))
  const verified = await verifyImport(options, deps(root, fixture))
  assert.equal(first.counts.created, 1)
  assert.equal(second.counts.created, 0)
  assert.equal(second.counts.existing, 1)
  assert.equal(fixture.targetRows[0].id, targetID)
  assert.equal(verified.ok, true)
  assert.equal(fixture.calls.filter((call) => call.method === 'POST').length, 1)
})

test('an external record appearing after plan is preserved and rechecked by snapshot', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-external-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const row = sourceRow(1)
  const fixture = new Fixture([row])
  const { options } = await planned(root, fixture)
  const external = fixture.record({
    type: 'video', title: 'external title', content: 'external', source_url: `https://www.tiktok.com/@someone/video/${row.assets.tiktok_video_id}`,
    hot_score: 1, is_favorite: true, media_keys: [], analysis: { tiktok_video_id: row.assets.tiktok_video_id }, tags: ['external'], cover_key: 'ignored',
  })
  const first = await applyImport(options, deps(root, fixture))
  const second = await applyImport(options, deps(root, fixture))
  const verified = await verifyImport(options, deps(root, fixture))
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(verified.ok, true)
  assert.equal(fixture.targetRows[0].title, 'external title')
  assert.equal(fixture.targetRows[0].id, external.id)
  assert.equal(fixture.calls.filter((call) => call.method === 'POST').length, 0)
  fixture.targetRows[0].title = 'externally changed after binding'
  const failedOnce = await verifyImport(options, deps(root, fixture))
  const failedTwice = await verifyImport(options, deps(root, fixture))
  assert.equal(failedOnce.ok, false)
  assert.equal(failedTwice.ok, false)
  fixture.targetRows.length = 0
  const missing = await applyImport(options, deps(root, fixture))
  assert.equal(missing.ok, false)
  assert.equal(fixture.calls.filter((call) => call.method === 'POST').length, 0)
})

test('continues after definite row failure, stops after systemic failure, and never sends DELETE or PATCH', async (t) => {
  const rootA = mkdtempSync(join(tmpdir(), 'gxgen-import-400-'))
  const rootB = mkdtempSync(join(tmpdir(), 'gxgen-import-503-'))
  t.after(() => { rmSync(rootA, { recursive: true, force: true }); rmSync(rootB, { recursive: true, force: true }) })
  const row1 = sourceRow(1)
  const row2 = sourceRow(2)
  const definite = new Fixture([row1, row2])
  const planA = await planned(rootA, definite, { limit: 2 })
  definite.post = async (payload, state) => payload.analysis.tiktok_video_id === row1.assets.tiktok_video_id
    ? json({ success: false, code: 'INVALID_PARAM' }, 400)
    : json({ success: true, data: state.record(payload), existed: false }, 201)
  const resultA = await applyImport(planA.options, deps(rootA, definite))
  assert.equal(resultA.counts.write_failed, 1)
  assert.equal(resultA.counts.created, 1)

  const systemic = new Fixture([row1, row2])
  const planB = await planned(rootB, systemic, { limit: 2 })
  systemic.post = async () => json({ success: false, code: 'DB_UNAVAILABLE' }, 503)
  const resultB = await applyImport(planB.options, deps(rootB, systemic))
  assert.equal(resultB.ok, false)
  assert.equal(resultB.counts.unknown, 1)
  assert.equal(systemic.calls.filter((call) => call.method === 'POST').length, 1)
  assert.ok([...definite.calls, ...systemic.calls].every((call) => !['DELETE', 'PATCH'].includes(call.method)))
})

test('detects plan tampering after disk JSON round-trip', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-json-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fixture = new Fixture([sourceRow(1)])
  const { options } = await planned(root, fixture)
  const plan = JSON.parse(readFileSync(options.file, 'utf8'))
  plan.items[0].payload.title = 'tampered'
  writeFileSync(options.file, JSON.stringify(plan))
  assert.throws(() => readPlan(options.file), /digest mismatch/)
})

test('actual CLI uses env credentials, spawned inspector, HTTP envelopes, immutable plan, and receipts', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-cli-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const row = sourceRow(1)
  const records = []
  const methods = []
  let rejectPost = false
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    methods.push(request.method)
    if (url.pathname === '/rest/v1/published_tasks') return send(response, [row])
    if (url.pathname === '/v1/inspirations' && request.method === 'GET') return send(response, { success: true, data: { total: records.length, page: 1, size: 100, items: records } })
    if (url.pathname === '/v1/inspirations' && request.method === 'POST') {
      if (rejectPost) return send(response, { success: false, code: 'FORBIDDEN' }, 403)
      let body = ''
      for await (const chunk of request) body += chunk
      const payload = JSON.parse(body)
      const record = { id: '501', ...payload, cover_key: '/v1/media/inspiration-covers/501', created_at: '2026-09-06T00:00:00Z', updated_at: '2026-09-06T00:00:00Z' }
      records.push(record)
      return send(response, { success: true, data: record, existed: false }, 201)
    }
    if (url.pathname === '/v1/inspirations/501') return records.length ? send(response, { success: true, data: records[0] }) : send(response, { success: false, code: 'NOT_FOUND' }, 404)
    if (url.pathname === '/v1/media/inspiration-covers/501') {
      response.writeHead(200, { 'content-type': 'image/jpeg' })
      return response.end(COVER)
    }
    return send(response, { success: false }, 404)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.address().port}`
  const inspector = join(root, 'inspiration')
  writeFileSync(inspector, `#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);const p=(n)=>a[a.indexOf(n)+1];const m=JSON.parse(fs.readFileSync(p('--manifest'),'utf8'));fs.writeFileSync(p('--out'),JSON.stringify({schemaVersion:1,items:m.items.map(x=>({...x,status:'ok',sha256:process.env.COVER_SHA,bytes:Number(process.env.COVER_BYTES),contentType:'image/jpeg'}))}));
`)
  chmodSync(inspector, 0o755)
  const file = join(root, 'plan.json')
  const script = new URL('./import-gxgen-inspirations.mjs', import.meta.url).pathname
  const env = { ...process.env, GXGEN_SUPABASE_KEY: 'cli-source-secret', OMNIMUX_ACCESS_TOKEN: 'cli-target-secret', COVER_SHA, COVER_BYTES: String(COVER.length) }
  const common = ['--file', file, '--source-url', origin, '--target-url', `${origin}/v1`, '--inspector', inspector, '--limit', '1']
  const plannedRun = await execFileAsync(process.execPath, [script, 'plan', ...common], { env })
  assert.doesNotMatch(plannedRun.stdout + plannedRun.stderr, /cli-(source|target)-secret/)
  const frozen = readFileSync(file)
  rejectPost = true
  await assert.rejects(execFileAsync(process.execPath, [script, 'apply', ...common], { env }), (error) => {
    assert.equal(error.code, 1)
    assert.equal(JSON.parse(error.stderr).ok, false)
    assert.doesNotMatch(error.stdout + error.stderr, /cli-(source|target)-secret/)
    return true
  })
  assert.equal(existsSync(`${file}.receipts.json`), true)
  rejectPost = false
  const appliedRun = await execFileAsync(process.execPath, [script, 'apply', ...common], { env })
  const verifiedRun = await execFileAsync(process.execPath, [script, 'verify', ...common], { env })
  assert.deepEqual(readFileSync(file), frozen)
  assert.equal(JSON.parse(appliedRun.stdout).counts.created, 1)
  assert.equal(JSON.parse(verifiedRun.stdout).ok, true)
  assert.equal(existsSync(`${file}.receipts.json`), true)
  assert.ok(methods.every((method) => !['DELETE', 'PATCH'].includes(method)))
})

test('maps and verifies multidimensional filter fields from Gxgen row', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gxgen-import-multidim-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const row = sourceRow(99)
  row.country_code = 'US'
  row.duration_seconds = 45
  row.published_at = '2026-09-01T10:00:00.000Z'
  row.assets.category_zh = '美妆护肤'
  row.assets.views = '1.5M'
  row.assets.tags.push('tiktok_ad')

  const fixture = new Fixture([row])
  let capturedPayload = null
  fixture.post = async (payload) => {
    capturedPayload = payload
    const record = fixture.record(payload)
    return json({ success: true, data: record, existed: false }, 201)
  }
  const { document } = await planned(root, fixture)
  const item = document.items[0]
  assert.equal(item.payload.country_code, 'US')
  assert.equal(item.payload.category, '美妆护肤')
  assert.equal(item.payload.duration, 45)
  assert.equal(item.payload.views, 1500000)
  assert.equal(item.payload.traffic_type, 'ad')
  assert.equal(item.payload.posted_at, '2026-09-01T10:00:00.000Z')

  const applied = await applyImport(config(root), deps(root, fixture))
  assert.equal(applied.counts.created, 1)
  assert.equal(capturedPayload.country_code, 'US')
  assert.equal(capturedPayload.category, '美妆护肤')
  assert.equal(capturedPayload.duration, 45)
  assert.equal(capturedPayload.views, 1500000)
  assert.equal(capturedPayload.traffic_type, 'ad')
  assert.equal(capturedPayload.posted_at, '2026-09-01T10:00:00.000Z')

  const verified = await verifyImport(config(root), deps(root, fixture))
  assert.equal(verified.ok, true)
})

function send(response, body, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
