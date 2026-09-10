import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mapSkill } from '../api.js'
import { withDefaults } from '../config-store.js'
import { createWorkshopSources, enumerateWorkshopRemote, QueryService, readWorkshopCatalog } from '../workshop-sources.js'
import type { WorkshopSources, WorkshopCatalogResult } from '../workshop-sources.js'
import type { WorkshopInventoryResult, WorkshopQueryRequest, WorkshopRemoteCandidate } from '../types.js'

function row(index: number): WorkshopRemoteCandidate {
  return { card: mapSkill({ slug: `fixture-${index}`, name: `Fixture ${index}`, description: '动画 fixture' }, 'https://example.test')!,
    sourceRef: { kind: 'skillhub', identity: `owner/fixture-${index}`, version: '1' }, downloads: null, updatedAt: null, publishedAt: null }
}
function catalog(count = 100): WorkshopCatalogResult {
  return { revision: 'catalog-revision', catalog: { items: Array.from({ length: count }, (_, i) => ({ id: `sk-omx-fixture-${i}`, skill: `fixture-${i}`,
    kind: 'skill', tab: 'skills', title: `Fixture ${i}`, summary: '动画 fixture', tags: ['动画'] })) },
  sourceStatus: [{ origin: 'omnimux', status: 'complete', fetched: count, exhausted: true }, { origin: 'workbuddy', status: 'complete', fetched: 0, exhausted: true }] }
}
function inventory(): WorkshopInventoryResult {
  return { scopeKey: 'scope', revision: 1, status: 'complete', records: [], entries: [], reasons: [], sourceOptions: ['all'], scopeVerified: true, preferences: null }
}
const request: WorkshopQueryRequest = { view: 'discover', query: '', domain: 'all', source: 'all', queryRevision: 1, uninstalledOnly: false }
function sources(remotePage: WorkshopSources['remotePage']): WorkshopSources { return { catalog: async () => catalog(), remotePage } }

test('packaged real catalog is enumerated and fingerprinted without recommendation fabrication', async () => {
  const result = await readWorkshopCatalog()
  assert.match(result.revision, /^[a-f0-9]{64}$/)
  assert(result.sourceStatus.every((s) => s.status === 'complete' && s.exhausted))
  assert(result.catalog.items.some((r) => r.kind === 'skill'))
  assert.equal(result.catalog.items.filter((r) => r.kind === 'skill' && r.recommended).length, 69)
})
test('catalog failure returns per-source error rather than complete empty', async () => {
  const result = await readWorkshopCatalog('/not-a-task-catalog')
  assert(result.sourceStatus.every((s) => s.status === 'error' && s.code === 'CATALOG_UNREADABLE'))
})
test('full paginated enumeration consumes all candidates before sorting and reports exact on supported stable provider', async () => {
  let calls = 0
  const result = await enumerateWorkshopRemote(sources(async (_q, cursor) => {
    calls++; const page = Number(cursor || 0)
    return { rows: Array.from({ length: page === 2 ? 3 : 80 }, (_, i) => row(page * 80 + i)), stable: true,
      exhausted: page === 2, nextCursor: page === 2 ? null : String(page + 1) }
  }), 'fixture')
  assert.equal(calls, 3); assert.equal(result.remote.length, 163); assert.equal(result.status.status, 'complete')
})
test('20 pages and 1600 candidates stop real loader without requesting page 21', async () => {
  let calls = 0
  const result = await enumerateWorkshopRemote(sources(async () => {
    const page = calls++
    return { rows: Array.from({ length: 80 }, (_, i) => row(page * 80 + i)), stable: true, exhausted: false, nextCursor: String(calls) }
  }), 'fixture')
  assert.equal(calls, 20); assert.equal(result.remote.length, 1600); assert.equal(result.status.code, 'SOURCE_LIMIT')
})
test('repeated identities/cursor and overlong page cannot inflate accepted results', async () => {
  let calls = 0
  const repeated = await enumerateWorkshopRemote(sources(async () => { calls++; return { rows: [row(0)], stable: true, exhausted: false, nextCursor: '1' } }), 'fixture')
  assert.equal(calls, 2); assert.equal(repeated.remote.length, 1); assert.equal(repeated.status.code, 'SOURCE_NO_PROGRESS')
  const long = await enumerateWorkshopRemote(sources(async () => ({ rows: Array.from({ length: 81 }, (_, i) => row(i)), stable: true, exhausted: true, nextCursor: null })), 'fixture')
  assert.equal(long.remote.length, 80); assert.equal(long.status.code, 'SOURCE_LIMIT')
})
test('timeout aborts uncooperative provider and retains no false completeness', async () => {
  let signal: AbortSignal | undefined
  const result = await enumerateWorkshopRemote(sources(async (_q, _c, s) => { signal = s; return new Promise(() => {}) }), 'fixture', { timeoutMs: 5 })
  assert.equal(signal?.aborted, true); assert.equal(result.status.code, 'SOURCE_TIMEOUT')
})
test('source failure preserves accepted earlier page and sanitized reason', async () => {
  let calls = 0
  const result = await enumerateWorkshopRemote(sources(async () => {
    if (calls++) throw new Error('/private/secret')
    return { rows: [row(1)], stable: true, exhausted: false, nextCursor: '2' }
  }), 'fixture')
  assert.equal(result.remote.length, 1); assert.equal(result.status.status, 'partial'); assert.equal(result.status.code, 'SOURCE_ERROR')
})
test('actual SkillHub transport sends only query and fixed paging, keeps unknown evidence unknown', async () => {
  const seen: URL[] = []
  const api = createWorkshopSources(withDefaults({}), (async (url: string | URL | Request) => {
    seen.push(new URL(String(url)))
    return new Response(JSON.stringify({ code: 0, data: { skills: seen.length === 1 ? [{ slug: 'fixture', name: 'Fixture', description: '动画 fixture', downloads: 0 }] : [], total: 1 } }))
  }) as typeof fetch)
  const result = await enumerateWorkshopRemote(api, 'fixture')
  assert.equal(seen.length, 2); assert.equal(seen[0].pathname, '/api/skills'); assert.equal(seen[0].searchParams.get('keyword'), 'fixture')
  assert.deepEqual([...seen[0].searchParams.keys()].sort(), ['keyword', 'order', 'page', 'pageSize', 'sortBy'])
  assert.equal(result.remote[0].downloads, 0); assert.equal(result.remote[0].sourceRef, null); assert.equal(result.remote[0].updatedAt, null)
  assert.equal(result.status.code, 'SOURCE_SNAPSHOT_UNVERIFIED')
})
test('empty upstream search never triggers popular fallback', async () => {
  let calls = 0
  const api = createWorkshopSources(withDefaults({}), (async () => { calls++; return new Response(JSON.stringify({ code: 0, data: { skills: [], total: 0 } })) }) as typeof fetch)
  const result = await enumerateWorkshopRemote(api, 'unknown')
  assert.equal(calls, 1); assert.equal(result.remote.length, 0); assert.notEqual(result.status.status, 'complete')
})
test('full response byte limit and abort-aware body deadline are enforced', async () => {
  const huge = createWorkshopSources(withDefaults({}), (async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))) as typeof fetch)
  assert.equal((await enumerateWorkshopRemote(huge, 'fixture')).status.code, 'SOURCE_BODY_LIMIT')
  const stalled = createWorkshopSources(withDefaults({}), (async (_url, init) => new Response(new ReadableStream({
    start(controller) { init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true }) },
  }))) as typeof fetch)
  assert.equal((await enumerateWorkshopRemote(stalled, 'fixture', { timeoutMs: 5 })).status.code, 'SOURCE_TIMEOUT')
})
test('QueryService consumes snapshots: no remote browse, full exact count, revision and TTL rejection', async () => {
  let time = 0, revision = 1, calls = 0
  const service = new QueryService(sources(async () => { calls++; throw new Error('unexpected') }),
    { reconcile: async () => ({ ...inventory(), revision }) }, () => time)
  const first = await service.query(request)
  assert.equal(first.count.value, 100); assert.equal(first.items.length, 48); assert.equal(first.count.mode, 'exact'); assert.equal(calls, 0)
  const second = await service.query({ ...request, cursor: first.nextCursor! })
  assert.equal(second.items.length, 48); assert.equal(second.snapshotId, first.snapshotId)
  revision++
  await assert.rejects(service.query({ ...request, cursor: first.nextCursor! }), /CURSOR_EXPIRED/)
  revision--; time = 300000
  await assert.rejects(service.query({ ...request, cursor: first.nextCursor! }), /CURSOR_EXPIRED/)
})
test('snapshot eviction and catalog revision changes invalidate old pages', async () => {
  let rev = 'a'
  const src = sources(async () => { throw new Error('unused') }); src.catalog = async () => ({ ...catalog(), revision: rev })
  const service = new QueryService(src, { reconcile: async () => inventory() })
  const first = await service.query(request)
  for (let i = 0; i < 8; i++) await service.query({ ...request, queryRevision: i + 2 })
  await assert.rejects(service.query({ ...request, cursor: first.nextCursor! }), /CURSOR_EXPIRED/)
  const fresh = await service.query(request); rev = 'b'
  await assert.rejects(service.query({ ...request, cursor: fresh.nextCursor! }), /CURSOR_EXPIRED/)
})
test('detail binds exact catalog source and returns honest metadata completeness', async () => {
  const service = new QueryService(sources(async () => { throw new Error('must not fetch') }), { reconcile: async () => inventory() })
  const result = await service.detail({ skillKey: 'fixture-1', sourceRef: { kind: 'catalog', catalogId: 'sk-omx-fixture-1', revision: 'catalog-revision' } })
  assert.equal(result.skill.title, 'Fixture 1'); assert.equal(result.descriptionComplete, false)
  await assert.rejects(service.detail({ skillKey: 'fixture-1', sourceRef: { kind: 'catalog', catalogId: 'sk-omx-fixture-2', revision: 'catalog-revision' } }), /SOURCE_CHANGED/)
  await assert.rejects(service.detail({ skillKey: 'fixture-1', sourceRef: { kind: 'skillhub', identity: 'other', version: null } }), /EXACT_DETAIL_PROVIDER_UNAVAILABLE/)
})
test('catalog revision fingerprints bytes rather than fetch time', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workshop-source-'))
  try {
    await mkdir(join(root, 'catalog'))
    const doc = { schema: 1, generated_at: 'fixture', items: [] }
    await writeFile(join(root, 'catalog/index.json'), JSON.stringify(doc))
    const a = await readWorkshopCatalog(root), b = await readWorkshopCatalog(root)
    assert.equal(a.revision, b.revision)
    await writeFile(join(root, 'catalog/index.json'), JSON.stringify({ ...doc, generated_at: 'different' }))
    assert.notEqual((await readWorkshopCatalog(root)).revision, a.revision)
  } finally { await rm(root, { recursive: true, force: true }) }
})
