import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { Readable } from 'node:stream';
import { withDefaults } from '../config-store.js';
import { handleApi, DEFAULT_MARKET_EXPERTS } from '../local-api.js';
function mockReq(method, url, headers = {}, body) {
    const bodyStr = body !== undefined ? JSON.stringify(body) : '';
    const stream = new Readable({
        read() {
            if (bodyStr)
                this.push(Buffer.from(bodyStr));
            this.push(null);
        },
    });
    stream.method = method;
    stream.url = url;
    stream.headers = {
        host: '127.0.0.1:3080',
        ...headers,
    };
    return stream;
}
function mockRes() {
    const res = {
        statusCode: 200,
        _status: 200,
        _body: '',
        _json: null,
        setHeader() { },
        end(chunk) {
            this._status = this.statusCode;
            this._body = chunk == null ? '' : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
            try {
                this._json = JSON.parse(this._body);
            }
            catch {
                this._json = null;
            }
        },
    };
    return res;
}
test('DEFAULT_MARKET_EXPERTS defines 8 experts from screenshots', () => {
    assert.equal(DEFAULT_MARKET_EXPERTS.length, 8);
    const ids = DEFAULT_MARKET_EXPERTS.map(e => e.id);
    assert.deepEqual(ids, [
        'shopee-ops-expert',
        'youtube-creator-expert',
        'amazon-ops-expert',
        'tiktok-shop-ops-expert',
        'media-creator',
        'html-generator',
        'amazon-operations-expert',
        'tiktok-ecommerce-expert',
    ]);
    for (const exp of DEFAULT_MARKET_EXPERTS) {
        assert.ok(exp.name, `${exp.id} has name`);
        assert.ok(exp.nameEn, `${exp.id} has nameEn`);
        assert.ok(exp.description, `${exp.id} has description`);
        assert.ok(exp.avatar, `${exp.id} has avatar`);
    }
});
test('expertMarketList returns 8 items with status', async () => {
    const cfg = withDefaults({});
    const req = mockReq('POST', '/api', {
        origin: 'http://127.0.0.1:3080',
        'sec-fetch-site': 'same-origin',
    }, { method: 'expertMarketList' });
    const res = mockRes();
    await handleApi(req, res, cfg);
    assert.equal(res._status, 200);
    assert.equal(res._json?.ok, true);
    assert.equal(res._json?.items?.length, 8);
    const items = res._json.items;
    const shopee = items.find((it) => it.id === 'shopee-ops-expert');
    assert.ok(shopee);
    assert.equal(shopee.status, 'enabled');
    const comingSoon = items.find((it) => it.id === 'amazon-operations-expert');
    assert.ok(comingSoon);
    assert.equal(comingSoon.status, 'coming_soon');
});
test('expertMarketInstall and expertMarketDisable toggle preset lifecycle', async () => {
    const cfg = withDefaults({});
    const testId = 'html-generator';
    // Install
    const reqInstall = mockReq('POST', '/api', {
        origin: 'http://127.0.0.1:3080',
        'sec-fetch-site': 'same-origin',
    }, { method: 'expertMarketInstall', id: testId });
    const resInstall = mockRes();
    await handleApi(reqInstall, resInstall, cfg);
    assert.equal(resInstall._status, 200);
    assert.equal(resInstall._json?.ok, true);
    assert.equal(resInstall._json?.status, 'enabled');
    // Verify list reflects enabled
    const reqList1 = mockReq('POST', '/api', {
        origin: 'http://127.0.0.1:3080',
        'sec-fetch-site': 'same-origin',
    }, { method: 'expertMarketList' });
    const resList1 = mockRes();
    await handleApi(reqList1, resList1, cfg);
    const itemAfterInstall = resList1._json?.items?.find((it) => it.id === testId);
    assert.equal(itemAfterInstall?.status, 'enabled');
    // Disable
    const reqDisable = mockReq('POST', '/api', {
        origin: 'http://127.0.0.1:3080',
        'sec-fetch-site': 'same-origin',
    }, { method: 'expertMarketDisable', id: testId });
    const resDisable = mockRes();
    await handleApi(reqDisable, resDisable, cfg);
    assert.equal(resDisable._status, 200);
    assert.equal(resDisable._json?.ok, true);
    assert.equal(resDisable._json?.status, 'disabled');
    // Verify list reflects disabled (已离职)
    const reqList2 = mockReq('POST', '/api', {
        origin: 'http://127.0.0.1:3080',
        'sec-fetch-site': 'same-origin',
    }, { method: 'expertMarketList' });
    const resList2 = mockRes();
    await handleApi(reqList2, resList2, cfg);
    const itemAfterDisable = resList2._json?.items?.find((it) => it.id === testId);
    assert.equal(itemAfterDisable?.status, 'disabled');
    // Re-install after disabled
    const reqReinstall = mockReq('POST', '/api', {
        origin: 'http://127.0.0.1:3080',
        'sec-fetch-site': 'same-origin',
    }, { method: 'expertMarketInstall', id: testId });
    const resReinstall = mockRes();
    await handleApi(reqReinstall, resReinstall, cfg);
    assert.equal(resReinstall._status, 200);
    assert.equal(resReinstall._json?.status, 'enabled');
});
test('i18n and UI contracts for 技能/专家 and 专家市场', () => {
    const i18n = readFileSync(new URL('../../src/client/i18n.js', import.meta.url), 'utf8');
    assert.match(i18n, /"plaza\.title": "技能\/专家"/);
    assert.match(i18n, /"plaza\.title": "Skills\/Experts"/);
    assert.match(i18n, /"workshop\.tabExpertsMarket": "专家市场"/);
    assert.match(i18n, /"workshop\.tabExpertsMarket": "Experts Market"/);
    assert.match(i18n, /"expertMarket\.title": "专家市场"/);
    assert.match(i18n, /"expertMarket\.title": "Experts Market"/);
    assert.match(i18n, /"expertMarket\.searchPlaceholder": "搜索全部专家"/);
    assert.match(i18n, /"expertMarket\.searchPlaceholder": "Search all experts\.\.\."/);
    assert.match(i18n, /"expertMarket\.createExpert": "创建专家"/);
    assert.match(i18n, /"expertMarket\.createExpert": "Create Expert"/);
    assert.match(i18n, /"expertMarket\.enabled": "已入职"/);
    assert.match(i18n, /"expertMarket\.enabled": "Employed"/);
    assert.match(i18n, /"expertMarket\.available": "可聘用"/);
    assert.match(i18n, /"expertMarket\.available": "Hireable"/);
    assert.match(i18n, /"expertMarket\.disabled": "已离职"/);
    assert.match(i18n, /"expertMarket\.disabled": "Resigned"/);
    assert.match(i18n, /"workshop\.title": "技能\/专家"/);
    assert.match(i18n, /"workshop\.title": "Skills\/Experts"/);
    const plaza = readFileSync(new URL('../../src/client/skill-plaza.js', import.meta.url), 'utf8');
    assert.match(plaza, /mainTab === "experts-market"/);
    assert.match(plaza, /introHeading/);
    assert.match(plaza, /workshop-intro/);
    assert.match(plaza, /btn-create/);
    assert.match(plaza, /expertMarket\.createExpert/);
    assert.match(plaza, /expert-market-grid/);
    assert.match(plaza, /expert-card/);
    assert.match(plaza, /expert-pill-btn/);
    assert.match(plaza, /expertMarket\.disabled/);
    const css = readFileSync(new URL('../../src/client/css.js', import.meta.url), 'utf8');
    assert.match(css, /\.expert-market-grid/);
    assert.match(css, /\.expert-card/);
    assert.match(css, /\.expert-card-avatar-wrap/);
    assert.match(css, /\.expert-pill-btn/);
    assert.match(css, /\.expert-card-status\.disabled/);
    const apply = readFileSync(new URL('../../src/client/apply.js', import.meta.url), 'utf8');
    assert.doesNotMatch(apply, /plazaRemote\s*=\s*ctx\.remote/, 'must not synchronously access ctx.remote without inject');
    assert.match(apply, /ctx\.inject\(\["remote"\],/, 'must safely inject remote service');
});
test('all 8 circular avatar images exist in catalog/covers/', () => {
    for (const exp of DEFAULT_MARKET_EXPERTS) {
        const file = new URL(`../../${exp.avatar}`, import.meta.url);
        assert.ok(existsSync(file), `avatar file exists: ${exp.avatar}`);
    }
});
