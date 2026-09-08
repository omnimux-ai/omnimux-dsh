import test from 'node:test';
import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { canonicalWorkshopOrigin, RequestGuard } from '../workshop-request-guard.js';
import { handleWorkshopApi } from '../local-api.js';
import { createWorkshopReadHost } from '../host.js';
import { withDefaults } from '../config-store.js';
const origin = 'http://127.0.0.1:44444';
function request(url = '/omnimux-market/workshop/workshopInventory', method = 'GET') {
    const req = new IncomingMessage(new Socket());
    req.url = url;
    req.method = method;
    req.headers.origin = origin;
    req.rawHeaders = ['Origin', origin];
    return req;
}
function authorization(patch = {}) {
    return { connection: { requestRejection: () => undefined }, trustedOrigin: origin, authorizeRead: () => true, ...patch };
}
function response(req) {
    const res = new ServerResponse(req);
    let text = '';
    res.end = ((chunk) => { text = String(chunk); return res; });
    return { res, body: () => JSON.parse(text) };
}
const query = { view: 'discover', query: '', domain: 'all', source: 'all', uninstalledOnly: false, queryRevision: 1 };
test('exact Origin compares protocol/host/effective port; malformed values fail closed', () => {
    assert.equal(canonicalWorkshopOrigin('https://example.test:443'), 'https://example.test');
    for (const value of ['null', 'https://example.test/', 'https://u:p@example.test', 'https://example.test/path', ' https://example.test', 'file:///a', 'https://example.test?q=x'])
        assert.equal(canonicalWorkshopOrigin(value), null);
});
for (const [name, config, expected] of [
    ['missing auth', { connection: undefined }, 'AUTH_REQUIRED'],
    ['expired auth', { connection: { requestRejection: () => ({ status: 401 }) } }, 'AUTH_REQUIRED'],
    ['denied auth', { connection: { requestRejection: () => ({ status: 403 }) } }, 'FORBIDDEN_OPERATION'],
    ['missing origin config', { trustedOrigin: undefined }, 'ORIGIN_UNVERIFIED'],
    ['missing authorization', { authorizeRead: undefined }, 'FORBIDDEN_OPERATION'],
    ['cross scope denial', { authorizeRead: () => false }, 'FORBIDDEN_OPERATION'],
])
    test(`guard ${name} rejects before body iterator`, async () => {
        const req = request(undefined, 'POST');
        req[Symbol.asyncIterator] = () => { throw new Error('body touched'); };
        await assert.rejects(new RequestGuard(authorization(config)).authorizeHeaders(req, 'workshopInventory'), new RegExp(expected));
    });
for (const bad of ['https://127.0.0.1:44444', 'http://127.0.0.1:44445', 'http://evil.test:44444', undefined])
    test(`guard rejects Origin ${bad}`, async () => {
        const req = request();
        req.headers.origin = bad;
        req.headers['x-forwarded-host'] = '127.0.0.1:44444';
        await assert.rejects(new RequestGuard(authorization()).authorizeHeaders(req, 'workshopInventory'), /FORBIDDEN_ORIGIN/);
    });
test('guard rejects duplicate Origin, POST and GET bodies; legal read passes', async () => {
    const guard = new RequestGuard(authorization());
    const req = request();
    await guard.authorizeHeaders(req, 'workshopInventory');
    req.rawHeaders.push('Origin', origin);
    await assert.rejects(guard.authorizeHeaders(req, 'workshopInventory'), /FORBIDDEN_ORIGIN/);
    await assert.rejects(guard.authorizeHeaders(request(undefined, 'POST'), 'workshopInventory'), /METHOD_NOT_ALLOWED/);
    const body = request();
    body.headers['content-length'] = '20';
    await assert.rejects(guard.authorizeHeaders(body, 'workshopInventory'), /INVALID_REQUEST/);
});
test('public package export exposes read factory, not private fake runtime harness', () => {
    const require = createRequire(import.meta.url);
    assert.equal(require.resolve('omnimux-market'), require.resolve('../host.js'));
    assert.equal(typeof createWorkshopReadHost, 'function');
});
test('authorized public Host and actual local API consume real fixture files and catalog', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workshop-api-'));
    try {
        await mkdir(join(root, 'fixture'));
        await writeFile(join(root, 'fixture/SKILL.md'), '---\nname: Fixture\ndescription: Synthetic fixture description\n---\nOnly fixture body.\n');
        const auth = authorization();
        const host = createWorkshopReadHost(withDefaults({}), { ...auth, scope: { scopeKey: 'fixture-scope', label: 'Fixture', complete: true, reasons: [], roots: [{ id: 'root', path: root }] } });
        const req = request(), capture = response(req);
        await handleWorkshopApi(req, capture.res, 'workshopInventory', host, auth);
        const body = capture.body();
        assert.equal(capture.res.statusCode, 200);
        assert.equal(body.status, 'complete');
        assert.equal(body.records.length, 1);
        assert(!JSON.stringify(body).includes(root));
        const result = await host.workshopQuery(request(), query);
        assert(result.count.value > 0);
        assert.equal(result.count.mode, 'exact');
        const mine = await host.workshopQuery(request(), { ...query, view: 'mine' });
        assert.equal(mine.items[0].token, 'fixture');
        assert.equal(mine.items[0].enabled, null);
        const detail = await host.workshopDetail(request(), { skillKey: 'fixture', sourceRef: null, installId: (await host.workshopInventory(request())).records[0].installId });
        assert.equal(detail.skill.title, 'Fixture');
        assert.equal(detail.descriptionComplete, false);
        const caps = await host.workshopCapabilities(request());
        assert.equal(caps.writable, false);
        assert.equal(caps.unifiedPolicy, false);
        for (const extra of [{ scopeKey: 'other' }, { root }, { path: '/private' }, { inventory: [] }, { catalog: {} }]) {
            await assert.rejects(host.workshopQuery(request(), { ...query, ...extra }), /INVALID_REQUEST/);
        }
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('default Host missing scope reports unavailable; no guessed cfg.skillsDir scan', async () => {
    const host = createWorkshopReadHost(withDefaults({ skillsDir: '/private/never-read' }), authorization());
    const inv = await host.workshopInventory(request());
    assert.equal(inv.status, 'error');
    assert(inv.reasons.includes('SCOPE_UNVERIFIED'));
    await assert.rejects(host.workshopQuery(request(), query), /INVENTORY_UNAVAILABLE/);
});
test('Host without supplied authorization only permits non-sensitive capability read', async () => {
    const host = createWorkshopReadHost(withDefaults({}), { connection: { requestRejection: () => undefined }, trustedOrigin: origin });
    assert.equal((await host.workshopCapabilities(request())).scopeVerified, false);
    await assert.rejects(host.workshopInventory(request()), /FORBIDDEN_OPERATION/);
});
test('API refuses unknown query keys and malformed JSON without body reads or private errors', async () => {
    const auth = authorization(), host = createWorkshopReadHost(withDefaults({}), auth);
    for (const suffix of ['?path=/private', '?request=%7B', '?request=a&request=b']) {
        const req = request(`/omnimux-market/workshop/workshopQuery${suffix}`), capture = response(req);
        req[Symbol.asyncIterator] = () => { throw new Error('body touched'); };
        await handleWorkshopApi(req, capture.res, 'workshopQuery', host, auth);
        assert.equal(capture.res.statusCode, 400);
        assert.equal(capture.body().code, 'INVALID_REQUEST');
    }
});
test('API and public method each enforce auth, cannot bypass by calling Host directly', async () => {
    const auth = authorization({ authorizeRead: () => false }), host = createWorkshopReadHost(withDefaults({}), auth);
    const req = request(), capture = response(req);
    await handleWorkshopApi(req, capture.res, 'workshopInventory', host, auth);
    assert.equal(capture.res.statusCode, 403);
    await assert.rejects(host.workshopInventory(req), /FORBIDDEN_OPERATION/);
});
