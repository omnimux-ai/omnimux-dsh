import assert from 'node:assert/strict';
import test from 'node:test';
import { withDefaults } from '../config-store.js';
import { clearHttpJsonCache, configureHttpJsonCache } from '../http.js';
import { handleApi } from '../local-api.js';
import { clearEvalScoreMemo } from '../skill-detail.js';
function mockRes() {
    const chunks = [];
    const res = {
        statusCode: 200,
        _status: 200,
        _body: '',
        setHeader() { },
        end(chunk) {
            this._status = this.statusCode;
            this._body = chunk == null ? '' : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        },
    };
    return res;
}
test('search returns before ratings resolve (does not await attachRatings)', async () => {
    clearHttpJsonCache();
    clearEvalScoreMemo();
    configureHttpJsonCache({ ttlMs: 0 });
    let evalCalls = 0;
    let releaseEval = () => { };
    const blocked = new Promise((resolve) => { releaseEval = resolve; });
    const orig = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes('/api/skills?')) {
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    total: 1,
                    skills: [{
                            slug: 'slow-rating-skill',
                            name: 'Slow',
                            description: 'x',
                            category: 'ai-agent',
                            downloads: 1,
                            stars: 0,
                            installs: 0,
                            version: '1.0.0',
                        }],
                },
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.includes('/evaluation')) {
            evalCalls += 1;
            await blocked;
            return new Response(JSON.stringify({
                dimensions: { trust: { items: { a: { score: 5 } } } },
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('nope', { status: 404 });
    };
    try {
        const cfg = withDefaults({ skillsDir: '/tmp/omnimux-market-no-skills', timeoutMs: 5000, userAgent: 't' });
        const req = {
            method: 'POST',
            url: '/omnimux-market',
            [Symbol.asyncIterator]: async function* () {
                yield Buffer.from(JSON.stringify({ method: 'search', query: 'slow', limit: 1, channels: ['skillhub'] }));
            },
        };
        const res = mockRes();
        const started = Date.now();
        await handleApi(req, res, cfg);
        const elapsed = Date.now() - started;
        assert.equal(res._status, 200);
        const body = JSON.parse(res._body);
        assert.equal(body.ok, true);
        assert.equal(body.items[0].slug, 'slow-rating-skill');
        assert.equal(body.items[0].rating, undefined);
        // Would hang forever if search awaited attachRatings; we resolved under 2s.
        assert.ok(elapsed < 2000, `search blocked too long: ${elapsed}ms`);
        // Background attach may or may not have started; unblock so the promise settles.
        releaseEval();
        await new Promise((r) => setTimeout(r, 20));
        assert.ok(evalCalls >= 0);
    }
    finally {
        globalThis.fetch = orig;
        releaseEval();
        clearHttpJsonCache();
        clearEvalScoreMemo();
        configureHttpJsonCache({ ttlMs: 90_000 });
    }
});
test('ratings method returns scores independently', async () => {
    clearEvalScoreMemo();
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
        dimensions: {
            trust: { items: { a: { score: 5 } } },
            reliability: { items: { a: { score: 4 } } },
            adaptability: { items: { a: { score: 4 } } },
            convention: { items: { a: { score: 4 } } },
            effectiveness: { items: { a: { score: 5 } } },
        },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    try {
        const cfg = withDefaults({ skillsDir: '/tmp/omnimux-market-no-skills', timeoutMs: 5000, userAgent: 't' });
        const req = {
            method: 'POST',
            url: '/omnimux-market',
            [Symbol.asyncIterator]: async function* () {
                yield Buffer.from(JSON.stringify({ method: 'ratings', slugs: ['slow-rating-skill'] }));
            },
        };
        const res = mockRes();
        await handleApi(req, res, cfg);
        const body = JSON.parse(res._body);
        assert.equal(body.ok, true);
        assert.equal(typeof body.ratings['slow-rating-skill'], 'number');
    }
    finally {
        globalThis.fetch = orig;
        clearEvalScoreMemo();
    }
});
test('skillContent and exploreFile alias resolve bundled catalog skill and return structure', async () => {
    const cfg = withDefaults({ skillsDir: '/tmp/omnimux-market-no-skills', timeoutMs: 5000, userAgent: 't' });
    for (const method of ['skillContent', 'exploreFile']) {
        const req = {
            method: 'POST',
            url: '/omnimux-market',
            [Symbol.asyncIterator]: async function* () {
                yield Buffer.from(JSON.stringify({ method, slug: 'esc-demo-note' }));
            },
        };
        const res = mockRes();
        await handleApi(req, res, cfg);
        assert.equal(res._status, 200);
        const body = JSON.parse(res._body);
        assert.equal(body.ok, true);
        assert.equal(body.found, true);
        assert.ok(Array.isArray(body.tree));
        assert.ok(typeof body.skillMd === 'string' && body.skillMd.length > 0);
    }
});
test('skillTab method returns requested tab payload', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
        versions: [{ version: '1.0.0', changelog: 'Init release', createdAt: Date.now() }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    try {
        const cfg = withDefaults({ skillsDir: '/tmp/omnimux-market-no-skills', timeoutMs: 5000, userAgent: 't' });
        const req = {
            method: 'POST',
            url: '/omnimux-market',
            [Symbol.asyncIterator]: async function* () {
                yield Buffer.from(JSON.stringify({ method: 'skillTab', slug: 'demo', tab: 'versions' }));
            },
        };
        const res = mockRes();
        await handleApi(req, res, cfg);
        assert.equal(res._status, 200);
        const body = JSON.parse(res._body);
        assert.equal(body.ok, true);
        assert.equal(body.tab, 'versions');
        assert.ok(Array.isArray(body.versions));
    }
    finally {
        globalThis.fetch = orig;
    }
});
