import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCatalog } from '../expert/catalog.js';
import { mapSkill } from '../api.js';
import { createWorkshopSnapshot, pageWorkshopSnapshot, retainWorkshopSnapshot, workshopDate, workshopDomains, workshopQueryKey, workshopSourceOptions, isWorkshopResponseApplicable, } from '../workshop-query.js';
import { acceptWorkshopPage, canLoadWorkshopPage, createWorkshopLoadBudget } from '../workshop-query-budget.js';
const REQUEST = {
    view: 'discover', query: '', domain: 'all', source: 'all', uninstalledOnly: false, queryRevision: 7,
};
function catalogItem(token, extra = {}) {
    return {
        id: `sk-omx-${token}`, tab: 'skills', kind: 'skill', skill: token, title: token,
        summary: '动画 fixture', category: 'sk-visual', tags: ['动画'],
        titleZh: `中文标题 ${token}`, titleEn: `English title ${token}`,
        summaryZh: `中文摘要 ${token}`, summaryEn: `English summary ${token}`,
        source: { type: 'bundled', path: `catalog/skills/${token}` }, ...extra,
    };
}
function data(items = []) {
    return {
        catalog: { items }, catalogRevision: 'qa-catalog', remote: [],
        sourceStatus: [
            { origin: 'omnimux', status: 'complete', fetched: items.length, exhausted: true },
            { origin: 'workbuddy', status: 'complete', fetched: 0, exhausted: true },
            { origin: 'skillhub', status: 'complete', fetched: 0, exhausted: true },
        ],
        inventory: { scopeKey: 'qa-fixture-only', revision: 3, status: 'complete', entries: [] },
    };
}
function installed(token, extra = {}) {
    return {
        skillKey: token, token, title: token, description: 'history', domains: [], sourceRef: null,
        version: null, recommended: false, downloads: null, updatedAt: null, publishedAt: null,
        installed: true, enabled: null, ...extra,
    };
}
function versions(input) {
    return { scopeKey: input.inventory.scopeKey, inventoryRevision: input.inventory.revision, catalogRevision: input.catalogRevision };
}
function run(input, change = {}, size = 48, id = 'qa-snapshot') {
    const request = { ...REQUEST, ...change };
    const snapshot = createWorkshopSnapshot(input, request, id, 100, size);
    return { request, snapshot, result: pageWorkshopSnapshot(snapshot, request, versions(input), 100) };
}
function remote(token) {
    const card = mapSkill({ slug: token, name: token, description: '动画 fixture' }, 'https://example.invalid');
    return { card, sourceRef: { kind: 'skillhub', identity: `owner/${token}`, version: null }, downloads: null, updatedAt: null, publishedAt: null };
}
test('QA recommendation must be an own controlled field, not inherited metadata', () => {
    const row = Object.assign(Object.create({ recommended: true }), catalogItem('ordinary'));
    const catalog = parseCatalog({ schema: 1, generated_at: 'fixture', items: [row] });
    assert.equal(Object.hasOwn(row, 'recommended'), false);
    assert.equal('recommended' in catalog.items[0] && catalog.items[0].recommended, false);
    assert.equal(run({ ...data(), catalog }).result.featured.length, 0);
});
test('QA remote extra skill cannot impersonate a different installed slug', () => {
    const input = data();
    input.inventory.entries = [{ origin: 'local', skill: installed('victim', { enabled: true }) }];
    const candidate = remote('attacker');
    input.remote = [{ ...candidate, card: { ...candidate.card, ...{ skill: 'victim' } } }];
    const result = run(input, { query: 'fixture' }).result;
    assert.equal(result.items[0].skillKey, 'attacker');
    assert.equal(result.items[0].installed, false);
    assert.equal(result.items[0].enabled, null);
});
test('QA special identity keys do not read or write object prototypes', () => {
    const input = data();
    input.remote = ['__proto__', 'constructor', 'tostring'].map(remote);
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    const result = run(input, { query: 'fixture' }).result;
    assert.deepEqual(result.items.map((row) => row.skillKey), ['__proto__', 'constructor', 'tostring']);
    assert.ok(result.items.every((row) => !row.installed && !row.recommended));
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before);
});
test('QA complete three-source dedupe retains whole winner before AND or domain filtering', () => {
    const input = data([
        catalogItem('shared', { id: 'sk-shared', title: 'lower', recommended: true, version: '9', downloads: 999 }),
        catalogItem('shared', { title: 'winner', tags: ['教育'], summary: 'education', version: '1' }),
        catalogItem('distinct', { title: 'winner' }),
    ]);
    input.remote = [remote('SHARED')];
    const winner = run(input, { domain: '教育' }).result.items[0];
    assert.equal(winner.title, 'winner');
    assert.equal(winner.version, '1');
    assert.equal(winner.downloads, null);
    assert.equal(winner.recommended, false);
    assert.deepEqual(winner.sourceRef, { kind: 'catalog', catalogId: 'sk-omx-shared', revision: 'qa-catalog' });
    assert.equal(run(input, { query: 'lower' }).result.items.length, 0);
    assert.deepEqual(run(input, { query: 'fixture', domain: '动画' }).result.items.map((row) => row.skillKey), ['distinct']);
});
test('QA recommendation ignores external metadata and excludes out-of-shelf winners', () => {
    const input = data([catalogItem('empty', { tags: [], summary: 'unrelated', recommended: true })]);
    const row = remote('remote');
    input.remote = [{ ...row, card: { ...row.card, ...{ recommended: true, featured: true }, installed: true } }];
    input.inventory.entries = [{ origin: 'unknown', skill: installed('old', { recommended: true }) }];
    assert.equal(run(input, { query: 'fixture' }).result.featured.length, 0);
    assert.equal(run(input, { view: 'mine' }).result.items[0].recommended, false);
    assert.equal(run(input).result.featured.length, 0);
});
test('QA domain membership preserves shared explicit-tag precedence and bounded fallback', () => {
    for (const value of [null, undefined, 0, '动画'])
        assert.deepEqual(workshopDomains(value), []);
    assert.deepEqual(workshopDomains({ tags: ['教育', '动画', '教育'], summary: '电商' }), ['动画', '教育']);
    assert.deepEqual(workshopDomains({ tags: ['other'], summary: 'Shopify' }), ['电商']);
    assert.deepEqual(workshopDomains({ summary: 'music adapter advertising' }), []);
});
test('QA request keys normalize case and outer whitespace but retain independent filters', () => {
    assert.equal(workshopQueryKey({ ...REQUEST, query: ' ALPHA ' }), workshopQueryKey({ ...REQUEST, query: 'alpha' }));
    const key = workshopQueryKey(REQUEST);
    for (const change of [{ view: 'mine' }, { domain: '动画' }, { source: 'unknown' }, { uninstalledOnly: true }]) {
        assert.notEqual(workshopQueryKey({ ...REQUEST, ...change }), key);
    }
});
for (const [label, change] of Object.entries({
    'null query': { query: null }, 'array query': { query: [] }, 'prototype domain': { domain: '__proto__' },
    'prototype source': { source: 'constructor' }, 'negative revision': { queryRevision: -1 },
    'unsafe revision': { queryRevision: Number.MAX_SAFE_INTEGER + 1 }, 'nonboolean switch': { uninstalledOnly: 1 },
})) {
    test(`QA rejects invalid request: ${label}`, () => {
        assert.throws(() => run(data(), change), { code: 'INVALID_REQUEST' });
    });
}
test('QA source failures, duplicate evidence and invalid fetched counts cannot assert exact', () => {
    const base = data([catalogItem('a')]);
    for (const sourceStatus of [[], [...base.sourceStatus, base.sourceStatus[0]],
        base.sourceStatus.map((s) => ({ ...s, fetched: NaN })),
        base.sourceStatus.map((s) => ({ ...s, fetched: -1 })),
        base.sourceStatus.map((s) => ({ ...s, exhausted: false })),
        base.sourceStatus.map((s) => ({ ...s, status: 'error' }))]) {
        const result = run({ ...base, sourceStatus }).result;
        assert.deepEqual(result.count, { value: 1, mode: 'loaded' });
        assert.equal(result.sortScope, 'loaded-result');
        assert.equal(result.completeness, 'partial');
    }
    assert.equal(run(base).result.count.mode, 'exact');
});
test('QA historical source, version and enablement stay unknown and source filter stays orthogonal', () => {
    const input = data([catalogItem('old')]);
    input.inventory.entries = [
        { origin: 'unknown', skill: installed('old') },
        { origin: 'workbuddy', skill: installed('disabled', { enabled: false, domains: ['动画'], description: 'needle' }) },
        { origin: 'local', skill: installed('local') },
    ];
    const history = run(input, { view: 'mine', source: 'unknown' }).result.items[0];
    assert.equal(history.sourceRef, null);
    assert.equal(history.version, null);
    assert.equal(history.enabled, null);
    assert.equal(history.installed, true);
    assert.deepEqual(workshopSourceOptions(input.inventory), ['all', 'workbuddy', 'local', 'unknown']);
    assert.deepEqual(run(input, { view: 'mine', source: 'workbuddy', domain: '动画', query: ' NEEDLE ' }).result.items.map((s) => s.skillKey), ['disabled']);
    input.inventory.status = 'partial';
    assert.throws(() => run(input), { code: 'INVENTORY_UNAVAILABLE' });
    assert.equal(run(input, { view: 'mine' }).result.count.mode, 'loaded');
    input.inventory.status = 'error';
    assert.throws(() => workshopSourceOptions(input.inventory), { code: 'INVENTORY_UNAVAILABLE' });
    assert.throws(() => run(input, { view: 'mine' }), { code: 'INVENTORY_UNAVAILABLE' });
});
test('QA date validation rejects rollovers and selects genuine fallback with stable unknown ties', () => {
    for (const date of ['2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '2026-01-01T00:00:00+00:00', '', null]) {
        assert.equal(workshopDate(date), null);
    }
    assert.equal(workshopDate('2024-02-29T12:30:00.123Z'), '2024-02-29T12:30:00.123Z');
    const result = run(data([
        catalogItem('z'), catalogItem('b'), catalogItem('a'),
        catalogItem('fallback', { updatedAt: 'bad', publishedAt: '2026-01-02T00:00:00Z' }),
        catalogItem('updated', { updatedAt: '2026-01-01T00:00:00Z', publishedAt: '2026-09-01T00:00:00Z' }),
    ])).result;
    assert.deepEqual(result.items.map((s) => s.skillKey), ['fallback', 'updated', 'a', 'b', 'z']);
});
test('QA pagination partitions 163 results globally without repeats or count drift', () => {
    const input = data(Array.from({ length: 163 }, (_, i) => catalogItem(`id-${String(162 - i).padStart(3, '0')}`)));
    const { request, snapshot } = run(input, {}, 80);
    let cursor;
    const found = [];
    do {
        const result = pageWorkshopSnapshot(snapshot, { ...request, cursor }, versions(input), 101);
        assert.deepEqual(result.count, { value: 163, mode: 'exact' });
        found.push(...result.items.map((s) => s.skillKey));
        cursor = result.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(found.length, 163);
    assert.equal(new Set(found).size, 163);
    assert.deepEqual(found, [...found].sort());
});
test('QA snapshots detach nested data from input and returned pages', () => {
    const input = data([catalogItem('a', { cover: { asset: 'catalog/covers/a.png', alt: 'a' } })]);
    const { snapshot, request, result } = run(input);
    input.catalog.items[0].tags.push('教育');
    input.catalog.items[0].cover.alt = 'mutated-input';
    result.items[0].sourceRef = null;
    result.items[0].cover.alt = 'mutated-result';
    result.items[0].domains.push('教育');
    const again = pageWorkshopSnapshot(snapshot, request, versions(input), 101);
    assert.deepEqual(again.items[0].domains, ['动画']);
    assert.equal(again.items[0].cover.alt, 'a');
    assert.notEqual(again.items[0].sourceRef, null);
});
test('QA cursor rejects cross-snapshot, TTL and malformed offsets without accepting stale response', () => {
    const input = data([catalogItem('a'), catalogItem('b')]);
    const first = run(input, {}, 1, 'first');
    const second = run(input, {}, 1, 'second');
    const paged = { ...first.request, cursor: first.result.nextCursor };
    assert.throws(() => pageWorkshopSnapshot(second.snapshot, paged, versions(input), 101), { code: 'CURSOR_EXPIRED' });
    assert.equal(isWorkshopResponseApplicable(second.result, paged, versions(input)), false);
    for (const cursor of ['null', '{}', '[1,"first",0]', '[1,"first",0.5]', '[1,"first",9007199254740992]', '[1,"first",true]']) {
        assert.throws(() => pageWorkshopSnapshot(first.snapshot, { ...first.request, cursor }, versions(input), 101), { code: 'CURSOR_EXPIRED' });
    }
    assert.doesNotThrow(() => pageWorkshopSnapshot(first.snapshot, first.request, versions(input), 300099));
    for (const now of [300100, 99, NaN, Infinity]) {
        assert.throws(() => pageWorkshopSnapshot(first.snapshot, first.request, versions(input), now), { code: 'CURSOR_EXPIRED' });
    }
});
test('QA snapshot retention uses creation TTL and maximum eight across same-time insertions', () => {
    const input = data();
    let cache = [];
    for (let i = 0; i < 10; i++)
        cache = retainWorkshopSnapshot(cache, run(input, {}, 1, `s-${i}`).snapshot, 100);
    assert.deepEqual(cache.map((s) => s.id), Array.from({ length: 8 }, (_, i) => `s-${i + 2}`));
    const fresh = createWorkshopSnapshot(input, REQUEST, 'fresh', 300100);
    assert.deepEqual(retainWorkshopSnapshot(cache, fresh, 300100).map((s) => s.id), ['fresh']);
});
test('QA budget boundaries reject 81st candidate, preserve stopped states and accept empty exhaustion', () => {
    const initial = createWorkshopLoadBudget(100);
    const page = { candidates: 81, pageKey: 'oversize', nextCursor: null, exhausted: true };
    const limited = acceptWorkshopPage(initial, page, 101);
    assert.equal(limited.accepted, 80);
    assert.equal(limited.budget.candidates, 80);
    assert.equal(limited.budget.stop, 'limit');
    assert.equal(initial.candidates, 0);
    const empty = acceptWorkshopPage(initial, { ...page, candidates: 0 }, 101);
    assert.equal(empty.accepted, 0);
    assert.equal(empty.budget.stop, 'complete');
    assert.equal(canLoadWorkshopPage(initial, 30099), true);
    assert.equal(acceptWorkshopPage(initial, page, 30100).budget.stop, 'timeout');
    for (const stopped of [limited.budget, empty.budget]) {
        const next = acceptWorkshopPage(stopped, { ...page, candidates: 1 }, 30100);
        assert.equal(next.accepted, 0);
        assert.equal(next.budget.stop, stopped.stop);
    }
});
test('QA budget validates evidence and terminates repeated cursor, empty progress and source failure', () => {
    const initial = createWorkshopLoadBudget(0);
    const page = { candidates: 1, pageKey: 'p1', nextCursor: 'c1', exhausted: false };
    const first = acceptWorkshopPage(initial, page, 1).budget;
    for (const changed of [{ pageKey: 'p2' }, { nextCursor: 'c2' }, { candidates: 0, pageKey: 'p2', nextCursor: 'c2' }, { pageKey: 'p2', nextCursor: null }]) {
        assert.equal(acceptWorkshopPage(first, { ...page, ...changed }, 2).budget.stop, 'no-progress');
    }
    assert.equal(acceptWorkshopPage(initial, { ...page, failed: true }, 1).accepted, 0);
    assert.equal(acceptWorkshopPage(initial, { ...page, failed: true }, 1).budget.stop, 'source-error');
    for (const candidates of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => acceptWorkshopPage(initial, { ...page, candidates }, 1), { code: 'INVALID_REQUEST' });
    }
    for (const now of [-1, NaN, Infinity]) {
        assert.equal(canLoadWorkshopPage(initial, now), false);
        assert.equal(acceptWorkshopPage(initial, page, now).budget.stop, 'timeout');
    }
});
