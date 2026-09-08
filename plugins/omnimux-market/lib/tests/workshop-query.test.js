import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCatalog } from '../expert/catalog.js';
import { mapSkill } from '../api.js';
import { WORKSHOP_CATEGORIES, WORKSHOP_DOMAINS, createWorkshopSnapshot, pageWorkshopSnapshot, normalizeWorkshopDiscovery, workshopDate, workshopDomains, workshopSourceOptions, retainWorkshopSnapshot, isWorkshopResponseApplicable, } from '../workshop-query.js';
import { acceptWorkshopPage, canLoadWorkshopPage, createWorkshopLoadBudget } from '../workshop-query-budget.js';
const request = { view: 'discover', query: '', domain: 'all', source: 'all', uninstalledOnly: false, queryRevision: 1 };
function item(id, extra = {}) {
    return { id: `sk-omx-${id}`, kind: 'skill', tab: 'skills', skill: id, title: id, summary: '动画', category: 'sk-visual', tags: ['动画'], source: { type: 'bundled', path: 'catalog/skills/demo' }, ...extra };
}
function input(items = []) {
    return { catalog: { items }, catalogRevision: 'catalog-1', remote: [], sourceStatus: [
            { origin: 'omnimux', status: 'complete', fetched: items.length, exhausted: true },
            { origin: 'workbuddy', status: 'complete', fetched: 0, exhausted: true },
        ], inventory: { scopeKey: 'fixture-only', revision: 1, status: 'complete', entries: [] } };
}
function skill(id, extra = {}) {
    return { skillKey: id, token: id, title: id, description: '', domains: [], sourceRef: null, version: null,
        recommended: false, downloads: null, updatedAt: null, publishedAt: null, installed: true, enabled: null, ...extra };
}
function versions(data) {
    return { scopeKey: data.inventory.scopeKey, catalogRevision: data.catalogRevision, inventoryRevision: data.inventory.revision };
}
function query(data, change = {}, pageSize = 48) {
    const req = { ...request, ...change };
    const snapshot = createWorkshopSnapshot(data, req, 'snapshot-1', 0, pageSize);
    return { req, snapshot, result: pageWorkshopSnapshot(snapshot, req, versions(data), 0) };
}
test('AC-05: view order differs without replacing shared domain membership', () => {
    assert.deepEqual(WORKSHOP_CATEGORIES, ['all', 'featured', '短剧漫剧', '专业影视', '动画', '商业广告', '电商', '教育', '创意实验', '音频音乐', '平台工具']);
    assert.deepEqual(workshopDomains({ tags: ['动画', '动画'], description: '音频音乐' }), ['动画']);
    assert.deepEqual(workshopDomains({ description: 'SHOPIFY 独立站' }), ['电商']);
    assert.deepEqual(workshopDomains({ description: 'ad music administration' }), []);
    assert.equal(WORKSHOP_DOMAINS.length, 9);
});
test('AC-06–11: strict controlled recommendation, 0/1/multiple domains, no demo creation', () => {
    for (const recommended of [undefined, false, 'true', 1, {}, []]) {
        const data = input([item('a', { recommended })]);
        assert.equal(query(data).result.featured.length, 0);
        assert.equal(query(data, { domain: 'featured' }).result.items.length, 0);
    }
    const data = input([item('a', { recommended: true, tags: ['动画', '商业广告'] }), item('b')]);
    for (const domain of ['all', 'featured', '动画', '商业广告']) {
        assert.deepEqual(query(data, { domain }).result.featured.map((s) => s.skillKey), ['a']);
    }
    assert.deepEqual(query(data).result.items.map((s) => s.skillKey), ['b']);
    assert.equal(query(data, { query: 'missing' }).result.featured.length, 0);
    assert.equal(query(input([])).result.featured.length, 0);
    assert.equal(query(input([item('no-domain', { tags: [], summary: '', recommended: true })])).result.featured.length, 0);
});
test('AC-09/10: parsed catalog passes only skill metadata; expert featured list remains intact', () => {
    const expert = { ...item('expert'), id: 'exp-test', kind: 'expert', tab: 'experts', recommended: true };
    const parsed = parseCatalog({ schema: 1, generated_at: 'fixture', featured: ['exp-test'], items: [expert, item('a', { recommended: true })] });
    assert.deepEqual(parsed.featured, ['exp-test']);
    assert.equal('recommended' in parsed.items[0], false);
    assert.equal(query(input(parsed.items)).result.featured[0].skillKey, 'a');
});
test('controlled recommendation requires an own strict true at parser and direct query entrypoints', () => {
    const inherited = Object.assign(Object.create({ recommended: true }), item('inherited'));
    const ownTrue = Object.assign(Object.create(null), item('own-true', { recommended: true }));
    const ownFalse = Object.assign(Object.create({ recommended: true }), item('own-false', { recommended: false }));
    const items = [inherited, ownTrue, ownFalse];
    assert.equal(Object.hasOwn(inherited, 'recommended'), false);
    const parsed = parseCatalog({ schema: 1, generated_at: 'fixture', items });
    for (const catalogItems of [items, parsed.items]) {
        const data = input(catalogItems);
        assert.deepEqual(normalizeWorkshopDiscovery(data, false).map((row) => row.recommended), [false, true, false]);
        assert.deepEqual(query(data).result.featured.map((row) => row.skillKey), ['own-true']);
        assert.deepEqual(query(data).result.items.map((row) => row.skillKey), ['inherited', 'own-false']);
    }
});
for (const inherited of [false, true]) {
    test(`remote slug ignores ${inherited ? 'inherited' : 'own'} skill extension without borrowing installed state`, () => {
        const data = input();
        data.inventory.entries = [{ origin: 'local', skill: skill('victim', { enabled: true }) }];
        const card = mapSkill({ slug: 'attacker', name: 'Attacker', description: '动画 fixture' }, 'https://example.invalid');
        const extended = inherited
            ? Object.assign(Object.create({ skill: 'victim' }), card)
            : { ...card, ...{ skill: 'victim' } };
        assert.equal(Object.hasOwn(extended, 'skill'), !inherited);
        data.remote = [{ card: extended, sourceRef: { kind: 'skillhub', identity: 'owner/attacker', version: null },
                downloads: null, updatedAt: null, publishedAt: null }];
        const result = query(data, { query: 'fixture' }).result;
        assert.equal(result.items[0].skillKey, 'attacker');
        assert.equal(result.items[0].token, 'attacker');
        assert.equal(result.items[0].installed, false);
        assert.equal(result.items[0].enabled, null);
        assert.deepEqual(result.items[0].sourceRef, data.remote[0].sourceRef);
    });
}
test('legitimate remote slug preserves shared token normalization, installed state and catalog priority', () => {
    const data = input();
    const card = mapSkill({ slug: 'real-skill', name: 'Remote', description: '动画 fixture' }, 'https://example.invalid');
    data.remote = [{ card: { ...card, slug: ' /REAL-SKILL ' },
            sourceRef: { kind: 'skillhub', identity: 'owner/real-skill', version: '1' },
            downloads: null, updatedAt: null, publishedAt: null }];
    data.inventory.entries = [{ origin: 'skillhub', skill: skill('real-skill', { enabled: false }) }];
    const result = query(data, { query: 'fixture' }).result;
    assert.equal(result.items[0].skillKey, 'real-skill');
    assert.equal(result.items[0].installed, true);
    assert.equal(result.items[0].enabled, false);
    assert.equal(query(data, { query: 'fixture', uninstalledOnly: true }).result.items.length, 0);
    data.catalog.items = [item('real-skill', { title: 'Catalog', summary: '动画 fixture' })];
    const winner = query(data, { query: 'fixture' }).result.items;
    assert.equal(winner.length, 1);
    assert.equal(winner[0].title, 'Catalog');
    assert.equal(winner[0].sourceRef?.kind, 'catalog');
});
test('AC-14/15: identity wins before filtering, no lower-source recommendation/version splicing', () => {
    const data = input([
        item('a', { id: 'sk-a', title: 'WorkBuddy', recommended: true, version: '9', tags: ['动画'] }),
        item('a', { title: 'custom', tags: ['教育'], version: '1', recommended: false }),
        item('other', { title: 'custom' }),
    ]);
    const normalized = normalizeWorkshopDiscovery(data, true);
    assert.equal(normalized.find((s) => s.skillKey === 'a')?.title, 'custom');
    assert.equal(normalized.find((s) => s.skillKey === 'a')?.version, '1');
    assert.equal(normalized.find((s) => s.skillKey === 'a')?.recommended, false);
    assert.deepEqual(query(data, { domain: '动画' }).result.items.map((s) => s.skillKey), ['other']);
    assert.equal(query(data, { query: 'WorkBuddy' }).result.items.length, 0);
});
test('AC-15: case-insensitive trimmed multiword AND across title/description/token, no hot fallback', () => {
    const data = input([item('clip-tool', { title: 'ALPHA', summary: 'Beta 动画' }), item('hot', { title: 'Alpha' })]);
    assert.deepEqual(query(data, { query: '  alpha BETA clip  ' }).result.items.map((s) => s.skillKey), ['clip-tool']);
    assert.equal(query(data, { query: 'alpha absent' }).result.items.length, 0);
});
test('AC-16: inventory alone determines installed; disabled is not uninstalled; controls only ordinary', () => {
    const data = input([item('a'), item('b'), item('c'), item('f', { recommended: true })]);
    data.inventory.entries = [
        { origin: 'local', skill: skill('b', { enabled: true }) },
        { origin: 'workbuddy', skill: skill('c', { enabled: false }) },
        { origin: 'unknown', skill: skill('f', { enabled: false }) },
    ];
    const result = query(data, { uninstalledOnly: true }).result;
    assert.deepEqual(result.items.map((s) => s.skillKey), ['a']);
    assert.equal(result.featured[0].enabled, false);
    assert.equal(result.featured[0].installed, true);
});
test('AC-17/19: post-filter global sort and stable count across pages, featured catalog order', () => {
    const data = input([
        item('z'), item('b', { updatedAt: '2026-01-01T00:00:00Z' }), item('a', { publishedAt: '2026-01-01T00:00:00Z' }),
        item('new', { updatedAt: '2026-02-01T00:00:00Z' }),
        item('f2', { recommended: true }), item('f1', { recommended: true, updatedAt: '2026-09-01T00:00:00Z' }),
    ]);
    const { req, snapshot, result } = query(data, {}, 2);
    assert.deepEqual(result.items.map((s) => s.skillKey), ['new', 'a']);
    assert.deepEqual(result.featured.map((s) => s.skillKey), ['f2', 'f1']);
    assert.deepEqual(result.count, { value: 4, mode: 'exact' });
    const second = pageWorkshopSnapshot(snapshot, { ...req, cursor: result.nextCursor }, versions(data), 1);
    assert.deepEqual(second.items.map((s) => s.skillKey), ['b', 'z']);
    assert.deepEqual(second.count, result.count);
    assert.equal(second.nextCursor, null);
});
test('AC-18: unknown legacy counts/date/version do not become zero or fabricated timestamps', () => {
    assert.equal(workshopDate('2026-02-30T00:00:00Z'), null);
    assert.equal(workshopDate('2026-01-01'), null);
    assert.equal(workshopDate('2026-01-01T00:00:00+08:00'), null);
    const rows = query(input([item('unknown'), item('zero', { downloads: 0 }), item('bad', { downloads: NaN, updatedAt: 'bad' })])).result.items;
    assert.equal(rows.find((s) => s.skillKey === 'unknown')?.downloads, null);
    assert.equal(rows.find((s) => s.skillKey === 'zero')?.downloads, 0);
    assert.equal(rows.find((s) => s.skillKey === 'bad')?.updatedAt, null);
    assert.equal(rows[0].version, null);
});
test('AC-19/49: missing, partial, unexhausted and failed sources cannot claim exact', () => {
    for (const status of ['partial', 'error', 'complete']) {
        const data = input([item('a')]);
        data.sourceStatus = [{ origin: 'omnimux', status, fetched: 1, exhausted: false }];
        const result = query(data).result;
        assert.deepEqual(result.count, { value: 1, mode: 'loaded' });
        assert.equal(result.completeness, 'partial');
        assert.equal(result.sortScope, 'loaded-result');
    }
    assert.equal(query(input([item('a')]), { query: 'a' }).result.count.mode, 'loaded');
});
test('AC-20: cursors bind all filters, query revision, catalog, scope and inventory revisions', () => {
    const data = input([item('a'), item('b')]);
    const { req, snapshot, result } = query(data, {}, 1);
    for (const change of [{ query: 'a' }, { domain: '动画' }, { source: 'local' }, { view: 'mine' }, { uninstalledOnly: true }, { queryRevision: 2 }]) {
        assert.throws(() => pageWorkshopSnapshot(snapshot, { ...req, ...change, cursor: result.nextCursor }, versions(data), 1), /CURSOR_EXPIRED/);
    }
    for (const change of [{ catalogRevision: 'next' }, { inventoryRevision: 2 }, { scopeKey: 'other' }]) {
        assert.throws(() => pageWorkshopSnapshot(snapshot, req, { ...versions(data), ...change }, 1), /CURSOR_EXPIRED/);
    }
    for (const cursor of ['bad', '[]', '[2,"snapshot-1",1]', '[1,"other",1]', '[1,"snapshot-1",-1]', '[1,"snapshot-1",2]']) {
        assert.throws(() => pageWorkshopSnapshot(snapshot, { ...req, cursor }, versions(data), 1), /CURSOR_EXPIRED/);
    }
    assert.equal(isWorkshopResponseApplicable(result, req, versions(data)), true);
    assert.equal(isWorkshopResponseApplicable(result, { ...req, queryRevision: 2 }, versions(data)), false);
    assert.equal(isWorkshopResponseApplicable({ items: [], total: 100, totalApprox: true }, req, versions(data)), false);
    assert.equal(isWorkshopResponseApplicable({ ...result, schemaVersion: 2 }, req, versions(data)), false);
});
test('AC-21–23: fixture inventory independent from discovery, origin and unknown enabled preserved', () => {
    const data = input([item('a')]);
    data.inventory.entries = [
        { origin: 'workbuddy', skill: skill('a', { domains: ['动画'], description: 'needle', enabled: false }) },
        { origin: 'unknown', skill: skill('old') }, { origin: 'local', skill: skill('local') },
    ];
    assert.deepEqual(workshopSourceOptions(data.inventory), ['all', 'workbuddy', 'local', 'unknown']);
    assert.equal(query(data, { view: 'mine' }).result.items.length, 3);
    const result = query(data, { view: 'mine', source: 'workbuddy', domain: '动画', query: 'needle' }).result;
    assert.equal(result.items[0].enabled, false);
    assert.equal(result.count.mode, 'exact');
    assert.equal(query(data, { view: 'mine', source: 'unknown' }).result.items[0].sourceRef, null);
    data.inventory.status = 'error';
    assert.throws(() => query(data, { view: 'mine' }), /INVENTORY_UNAVAILABLE/);
    assert.throws(() => query(data, { uninstalledOnly: true }), /INVENTORY_UNAVAILABLE/);
});
test('partial inventory never fabricates uninstalled flags; duplicate identities reject ambiguous counts', () => {
    const data = input([item('a'), item('b')]);
    data.inventory.status = 'partial';
    data.inventory.entries = [{ origin: 'unknown', skill: skill('a') }];
    assert.throws(() => query(data), /INVENTORY_UNAVAILABLE/);
    assert.deepEqual(query(data, { view: 'mine' }).result.count, { value: 1, mode: 'loaded' });
    data.inventory.status = 'complete';
    data.inventory.entries = [data.inventory.entries[0], data.inventory.entries[0]];
    assert.throws(() => query(data, { view: 'mine' }), /INVALID_REQUEST/);
    assert.deepEqual(workshopDomains(null), []);
});
test('late pages from a different snapshot are not applicable to the requested cursor', () => {
    const data = input([item('a'), item('b')]);
    const { result, req } = query(data, {}, 1);
    const pagedRequest = { ...req, cursor: result.nextCursor };
    assert.equal(isWorkshopResponseApplicable({ ...result, snapshotId: 'new-snapshot' }, pagedRequest, versions(data)), false);
    assert.equal(isWorkshopResponseApplicable(result, { ...req, cursor: 'not-json' }, versions(data)), false);
});
test('remote evidence never trusts card recommendation/installed/placeholder downloads; browse excludes remote', () => {
    const data = input([]);
    data.remote = [{ card: { id: 'remote', slug: 'remote', name: 'Remote', description: '动画', category: '', categoryLabel: '',
                version: 'fake', downloads: 0, stars: 0, installs: 0, pageUrl: '', channel: 'skillhub', installed: true,
                ...{ recommended: true } }, sourceRef: { kind: 'skillhub', identity: 'owner/remote', version: null },
            downloads: null, updatedAt: null, publishedAt: null }];
    assert.equal(query(data).result.items.length, 0);
    const result = query(data, { query: 'remote' }).result;
    assert.equal(result.featured.length, 0);
    assert.equal(result.items[0].installed, false);
    assert.equal(result.items[0].downloads, null);
    assert.equal(result.items[0].version, null);
    assert.deepEqual(result.items[0].sourceRef, data.remote[0].sourceRef);
});
test('invalid filters/revisions/page sizes fail instead of broadening to all', () => {
    for (const change of [{ domain: 'unknown' }, { uninstalledOnly: 'false' }, { queryRevision: NaN }, { view: 'mine', domain: 'featured' }]) {
        assert.throws(() => query(input(), change), /INVALID_REQUEST/);
    }
    for (const size of [0, 81, 1.5])
        assert.throws(() => query(input(), {}, size), /INVALID_REQUEST/);
});
test('DATA-01: snapshot limit 8 and exact TTL boundary, duplicate IDs rejected, result copies isolated', () => {
    const data = input([item('a')]);
    let cache = [];
    for (let i = 0; i < 9; i++)
        cache = retainWorkshopSnapshot(cache, createWorkshopSnapshot(data, request, `s${i}`, i), i);
    assert.equal(cache.length, 8);
    assert.equal(cache[0].id, 's1');
    const snapshot = cache[0];
    assert.doesNotThrow(() => pageWorkshopSnapshot(snapshot, request, versions(data), 300_000));
    assert.throws(() => pageWorkshopSnapshot(snapshot, request, versions(data), 300_001), /CURSOR_EXPIRED/);
    assert.throws(() => retainWorkshopSnapshot(cache, snapshot, 10), /INVALID_REQUEST/);
    const result = pageWorkshopSnapshot(snapshot, request, versions(data), 2);
    result.items[0].title = 'mutated';
    assert.equal(snapshot.items[0].title, 'a');
    cache = retainWorkshopSnapshot(cache, createWorkshopSnapshot(data, request, 'fresh', 400_000), 400_000);
    assert.equal(cache.length, 1);
});
test('DATA-01: 20 pages/1600 candidates limit; exact last exhausted page allowed', () => {
    for (const exhausted of [false, true]) {
        let budget = createWorkshopLoadBudget(0);
        for (let i = 1; i <= 20; i++) {
            const end = exhausted && i === 20;
            const next = acceptWorkshopPage(budget, { candidates: 80, pageKey: `p${i}`, nextCursor: end ? null : `c${i}`, exhausted: end }, i);
            budget = next.budget;
            assert.equal(next.accepted, 80);
        }
        assert.equal(budget.pages, 20);
        assert.equal(budget.candidates, 1600);
        assert.equal(budget.stop, exhausted ? 'complete' : 'limit');
        assert.equal(canLoadWorkshopPage(budget, 21), false);
        assert.equal(acceptWorkshopPage(budget, { candidates: 1, pageKey: 'extra', nextCursor: null, exhausted: true }, 21).accepted, 0);
    }
});
test('DATA-01: wall time, oversize pages, duplicate page/cursor and source error stop immediately', () => {
    const initial = createWorkshopLoadBudget(0);
    const page = { candidates: 80, pageKey: 'p1', nextCursor: 'c1', exhausted: false };
    assert.equal(canLoadWorkshopPage(initial, 29_999), true);
    assert.equal(acceptWorkshopPage(initial, page, 30_000).budget.stop, 'timeout');
    assert.equal(acceptWorkshopPage(initial, { ...page, candidates: 81 }, 1).budget.stop, 'limit');
    const first = acceptWorkshopPage(initial, page, 1).budget;
    assert.equal(acceptWorkshopPage(first, { ...page, nextCursor: 'c2' }, 2).budget.stop, 'no-progress');
    assert.equal(acceptWorkshopPage(first, { ...page, pageKey: 'p2' }, 2).budget.stop, 'no-progress');
    assert.equal(acceptWorkshopPage(initial, { ...page, failed: true }, 1).budget.stop, 'source-error');
    assert.equal(acceptWorkshopPage(initial, { ...page, candidates: 0 }, 1).budget.stop, 'no-progress');
});
