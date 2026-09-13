import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';
import { Readable } from 'node:stream';
import { dshHome, withDefaults } from '../config-store.js';
import { handleApi, BUILTIN_AGENT_PRESETS, DEFAULT_MARKET_EXPERTS, STATIC_MARKET_EXPERTS, listMarketExperts, } from '../local-api.js';
/** 磁盘扫描夹具 id：测试用完即删，不污染真实预设目录。 */
const SCAN_FIXTURE_ID = 'omnimux-market-scan-fixture';
const RETIRED_FIXTURE_ID = 'omnimux-market-retired-fixture';
const FIXTURE_IDS = [SCAN_FIXTURE_ID, RETIRED_FIXTURE_ID];
/**
 * .retired 残留 id：市场专家 8 项 + 夹具 + 内置预设。
 * 内置预设只在 .retired 写标记文件，其目录由应用分发、测试绝不触碰。
 */
const RESIDUE_IDS = [
    ...DEFAULT_MARKET_EXPERTS.map((exp) => exp.id),
    ...FIXTURE_IDS,
    ...BUILTIN_AGENT_PRESETS.map((preset) => preset.id),
];
function presetRoot() {
    return join(dshHome(), '.agent-presets');
}
function retiredRoot() {
    return join(presetRoot(), '.retired');
}
function retireEntryId(name) {
    return name.replace(/-\d{9,}$/, '');
}
function cleanupResidue() {
    for (const id of FIXTURE_IDS)
        rmSync(join(presetRoot(), id), { recursive: true, force: true });
    const retired = retiredRoot();
    if (!existsSync(retired))
        return;
    for (const name of readdirSync(retired)) {
        if (!RESIDUE_IDS.includes(retireEntryId(name)))
            continue;
        rmSync(join(retired, name), { recursive: true, force: true });
    }
}
function writePresetFixture(id, meta) {
    const dir = join(presetRoot(), id);
    mkdirSync(dir, { recursive: true });
    const avatarLine = meta.avatar ? `avatar: ${meta.avatar}\n` : '';
    writeFileSync(join(dir, 'preset.yml'), `name: ${meta.name}\ndescription: ${meta.description}\norder: ${meta.order}\n${avatarLine}`, 'utf8');
}
beforeEach(() => {
    cleanupResidue();
});
afterEach(() => {
    cleanupResidue();
});
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
async function callApi(body) {
    const cfg = withDefaults({});
    const req = mockReq('POST', '/api', {
        origin: 'http://127.0.0.1:3080',
        'sec-fetch-site': 'same-origin',
    }, body);
    const res = mockRes();
    await handleApi(req, res, cfg);
    return { status: res._status, json: res._json };
}
async function listItems() {
    const { status, json } = await callApi({ method: 'expertMarketList' });
    assert.equal(status, 200);
    assert.equal(json?.ok, true);
    return json.items;
}
const PIXEL_AVATAR_PALETTE_KEYS = [
    'PIXEL_AVATAR_SKIN_TONES',
    'PIXEL_AVATAR_HAIR_COLORS',
    'PIXEL_AVATAR_CLOTHING',
    'PIXEL_AVATAR_BACKGROUNDS',
    'PIXEL_AVATAR_EYE_COLORS',
    'PIXEL_AVATAR_EYE_STYLES',
    'PIXEL_AVATAR_MOUTH_STYLES',
    'PIXEL_AVATAR_FACIAL_HAIR',
    'PIXEL_AVATAR_ACCESSORIES',
    'PIXEL_AVATAR_HAIR_STYLES',
];
async function loadPixelAvatar() {
    const url = new URL('../../src/client/plaza/pixel-avatar.js', import.meta.url).href;
    return (await import(url));
}
/** 调色板与像素几何数据在常量模块里，与生成逻辑分家。 */
async function loadPixelAvatarPalette() {
    const url = new URL('../../src/client/plaza/pixel-avatar-constants.js', import.meta.url).href;
    return (await import(url));
}
test('BUILTIN_AGENT_PRESETS defines the 6 factory presets with fixed order', () => {
    assert.equal(BUILTIN_AGENT_PRESETS.length, 6);
    assert.deepEqual(BUILTIN_AGENT_PRESETS.map((p) => p.id), [
        'tiktok-agent',
        'standard',
        'daily-work',
        'cordis',
        'ptc',
        'minimal',
    ]);
    assert.deepEqual(BUILTIN_AGENT_PRESETS.map((p) => p.order), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(BUILTIN_AGENT_PRESETS.map((p) => p.name), [
        '全能社媒操盘手',
        '代码开发',
        '日常工作',
        '创造模式',
        'PTC 模式',
        '极简模式',
    ]);
    assert.deepEqual(BUILTIN_AGENT_PRESETS.map((p) => p.nameEn), [
        'Social Media Lead',
        'CodeDev',
        'WorkAssistant',
        'Creator Mode',
        'PTC Mode',
        'Minimal Mode',
    ]);
    for (const preset of BUILTIN_AGENT_PRESETS) {
        assert.ok(preset.description, `${preset.id} has description`);
        assert.ok(preset.descriptionEn, `${preset.id} has descriptionEn`);
        assert.equal(preset.avatar, '', `${preset.id} 不带预设头像，交由像素头像兜底`);
        assert.equal(preset.initialStatus, 'enabled');
    }
});
test('DEFAULT_MARKET_EXPERTS keeps the 8 preset-market experts', () => {
    assert.equal(DEFAULT_MARKET_EXPERTS.length, 8);
    assert.deepEqual(DEFAULT_MARKET_EXPERTS.map((e) => e.id), [
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
test('STATIC_MARKET_EXPERTS puts the 6 built-ins ahead of the 8 market experts', () => {
    assert.equal(STATIC_MARKET_EXPERTS.length, 14);
    assert.deepEqual(STATIC_MARKET_EXPERTS.map((e) => e.id), [...BUILTIN_AGENT_PRESETS.map((p) => p.id), ...DEFAULT_MARKET_EXPERTS.map((e) => e.id)]);
});
test('expertMarketList aggregates built-ins, market experts and disk presets', async () => {
    writePresetFixture(SCAN_FIXTURE_ID, { name: '扫描夹具预设', description: '磁盘预设动态扫描夹具。', order: 7 });
    const items = await listItems();
    const ids = items.map((it) => it.id);
    assert.equal(new Set(ids).size, ids.length, '专家列表不得出现重复 id');
    for (const preset of BUILTIN_AGENT_PRESETS) {
        const hit = items.find((it) => it.id === preset.id);
        assert.ok(hit, `内置预设 ${preset.id} 必须出现在专家市场`);
        assert.equal(hit.status, 'enabled', `${preset.id} 应为已入职`);
        assert.equal(hit.source, 'builtin');
        assert.equal(hit.order, preset.order);
        assert.equal(hit.name, preset.name);
    }
    for (const exp of DEFAULT_MARKET_EXPERTS) {
        assert.ok(ids.includes(exp.id), `预设市场专家 ${exp.id} 必须在列表中`);
    }
    const scanned = items.find((it) => it.id === SCAN_FIXTURE_ID);
    assert.ok(scanned, '磁盘预设目录必须被动态扫描出来');
    assert.equal(scanned.name, '扫描夹具预设');
    assert.equal(scanned.description, '磁盘预设动态扫描夹具。');
    assert.equal(scanned.status, 'enabled');
    assert.equal(scanned.source, 'installed');
    assert.equal(scanned.avatar, '', '无 avatar 的预设交由客户端生成像素头像');
    assert.deepEqual(ids.slice(0, 6), BUILTIN_AGENT_PRESETS.map((p) => p.id));
});
test('disk scan loads the local software-company preset when present', async () => {
    const presetFile = join(presetRoot(), 'software-company', 'preset.yml');
    if (!existsSync(presetFile))
        return;
    const items = await listItems();
    const hit = items.find((it) => it.id === 'software-company');
    assert.ok(hit, '本地已存在的 software-company 预设必须被完整加载');
    assert.equal(hit.name, '软件开发团队');
    assert.equal(hit.status, 'enabled');
    assert.ok(hit.description.length > 0, '磁盘预设的描述必须保留');
});
test('retired preset is listed as disabled and can be re-hired by install', async () => {
    writePresetFixture(RETIRED_FIXTURE_ID, { name: '离职夹具预设', description: '离职状态夹具。', order: 8 });
    const disable = await callApi({ method: 'expertMarketDisable', id: RETIRED_FIXTURE_ID });
    assert.equal(disable.status, 200);
    assert.equal(disable.json?.status, 'disabled');
    const afterDisable = (await listItems()).find((it) => it.id === RETIRED_FIXTURE_ID);
    assert.ok(afterDisable, '已离职预设仍应出现在专家市场');
    assert.equal(afterDisable.status, 'disabled');
    assert.equal(afterDisable.source, 'retired');
    assert.equal(afterDisable.name, '离职夹具预设', '离职条目应从 .retired 里的 preset.yml 还原展示信息');
    const reinstall = await callApi({ method: 'expertMarketInstall', id: RETIRED_FIXTURE_ID });
    assert.equal(reinstall.status, 200);
    assert.equal(reinstall.json?.status, 'enabled');
    const afterInstall = (await listItems()).find((it) => it.id === RETIRED_FIXTURE_ID);
    assert.equal(afterInstall.status, 'enabled');
    assert.equal(afterInstall.source, 'installed');
    assert.ok(existsSync(join(presetRoot(), RETIRED_FIXTURE_ID, 'preset.yml')), '重新聘用应把预设目录还原回原位');
});
test('built-in preset disable and install only toggle the retire marker', async () => {
    const builtinDir = join(presetRoot(), 'standard');
    const existedBefore = existsSync(builtinDir);
    const disable = await callApi({ method: 'expertMarketDisable', id: 'standard' });
    assert.equal(disable.status, 200);
    assert.equal(disable.json?.status, 'disabled');
    const disabled = (await listItems()).find((it) => it.id === 'standard');
    assert.equal(disabled.status, 'disabled');
    assert.equal(existsSync(builtinDir), existedBefore, '内置预设目录不得被搬走或删除');
    const install = await callApi({ method: 'expertMarketInstall', id: 'standard' });
    assert.equal(install.json?.status, 'enabled');
    const enabled = (await listItems()).find((it) => it.id === 'standard');
    assert.equal(enabled.status, 'enabled');
    assert.equal(enabled.source, 'builtin');
    assert.equal(existsSync(builtinDir), existedBefore, '重新安装内置预设不得伪造用户级副本');
});
test('built-in preset install never restores a stale .retired archive as a user preset', async () => {
    const builtinId = 'standard';
    const builtinDir = join(presetRoot(), builtinId);
    const stashDir = join(presetRoot(), `${SCAN_FIXTURE_ID}-stash`);
    const existedBefore = existsSync(builtinDir);
    // 只有本地缺副本时才会触发归档还原：把既有副本挪开，强制走进「陈旧归档被当用户预设」的缺陷路径。
    if (existedBefore)
        renameSync(builtinDir, stashDir);
    const staleName = `${builtinId}-1757000000000`;
    const staleArchive = join(retiredRoot(), staleName);
    mkdirSync(staleArchive, { recursive: true });
    writeFileSync(join(staleArchive, 'preset.yml'), 'name: 陈旧归档山寨预设\ndescription: 不应被还原成用户级副本。\norder: 99\n', 'utf8');
    try {
        const install = await callApi({ method: 'expertMarketInstall', id: builtinId });
        assert.equal(install.status, 200);
        assert.equal(install.json?.status, 'enabled');
        assert.equal(existsSync(join(staleArchive, 'preset.yml')), true, '内置预设安装不得搬动 .retired 归档');
        assert.equal(existsSync(join(builtinDir, 'preset.yml')), false, '内置预设安装不得伪造用户级副本');
        const hit = (await listItems()).find((it) => it.id === builtinId);
        assert.ok(hit, '内置预设必须仍在专家市场');
        assert.equal(hit.status, 'enabled');
        assert.equal(hit.source, 'builtin', '内置预设来源不得被陈旧归档改写');
        assert.equal(hit.name, '代码开发', '内置预设展示名不得被陈旧归档覆盖');
    }
    finally {
        rmSync(staleArchive, { recursive: true, force: true });
        rmSync(builtinDir, { recursive: true, force: true });
        if (existedBefore)
            renameSync(stashDir, builtinDir);
    }
});
test('market expert install keeps the full preset lifecycle', async () => {
    const testId = 'html-generator';
    const install = await callApi({ method: 'expertMarketInstall', id: testId });
    assert.equal(install.status, 200);
    assert.equal(install.json?.ok, true);
    assert.equal(install.json?.status, 'enabled');
    assert.ok(existsSync(join(presetRoot(), testId, 'preset.yml')), '安装后必须生成 preset.yml');
    const enabled = (await listItems()).find((it) => it.id === testId);
    assert.equal(enabled?.status, 'enabled');
    const disable = await callApi({ method: 'expertMarketDisable', id: testId });
    assert.equal(disable.json?.status, 'disabled');
    const disabled = (await listItems()).find((it) => it.id === testId);
    assert.equal(disabled?.status, 'disabled');
    const reinstall = await callApi({ method: 'expertMarketInstall', id: testId });
    assert.equal(reinstall.json?.status, 'enabled');
});
test('amazon-operations-expert installs with a specialized preset', async () => {
    const install = await callApi({ method: 'expertMarketInstall', id: 'amazon-operations-expert' });
    assert.equal(install.status, 200);
    assert.equal(install.json?.status, 'enabled');
    const cordis = readFileSync(join(presetRoot(), 'amazon-operations-expert', 'agent.cordis.yml'), 'utf8');
    assert.match(cordis, /亚马逊运营专家/);
    const disable = await callApi({ method: 'expertMarketDisable', id: 'amazon-operations-expert' });
    assert.equal(disable.json?.status, 'disabled');
});
test('unknown expert id is rejected', async () => {
    const res = await callApi({ method: 'expertMarketInstall', id: 'not-a-real-expert' });
    assert.equal(res.status, 400);
    assert.equal(res.json?.ok, false);
});
test('every listed expert exposes a render-ready card shape', async () => {
    writePresetFixture(SCAN_FIXTURE_ID, { name: '扫描夹具预设', description: '磁盘预设动态扫描夹具。', order: 7 });
    const items = await listItems();
    for (const item of items) {
        assert.equal(typeof item.id, 'string');
        assert.ok(item.id.length > 0);
        assert.equal(typeof item.name, 'string');
        assert.ok(item.name.length > 0, `${item.id} 必须有可显示名称`);
        assert.equal(typeof item.description, 'string');
        assert.equal(typeof item.avatar, 'string');
        assert.ok(['enabled', 'available', 'disabled', 'coming_soon'].includes(item.status), `${item.id} 状态非法: ${item.status}`);
        assert.ok(['builtin', 'preset', 'installed', 'retired'].includes(item.source), `${item.id} 来源非法: ${item.source}`);
    }
});
test('listMarketExperts is stable and tolerates a missing preset root', () => {
    const first = listMarketExperts(dshHome()).map((it) => it.id);
    const second = listMarketExperts(dshHome()).map((it) => it.id);
    assert.deepEqual(first, second);
    const empty = listMarketExperts('/tmp/omnimux-market-missing-home-fixture');
    assert.equal(empty.length, STATIC_MARKET_EXPERTS.length);
    for (const item of empty) {
        assert.ok(item.status === 'enabled' || item.status === 'available');
    }
});
test('pixel avatar generator is deterministic, crisp and feature-rich', async () => {
    const avatar = await loadPixelAvatar();
    const svg = avatar.generatePixelAvatarSvg('software-company');
    assert.equal(svg, avatar.generatePixelAvatarSvg('software-company'), '同一种子必须生成完全相同的头像');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /viewBox="0 0 16 16"/);
    assert.match(svg, /shape-rendering="crispEdges"/);
    assert.match(svg, /<rect /);
    assert.doesNotMatch(svg, /<script|onload=/i);
    const zh = avatar.generatePixelAvatarSvg('全能社媒操盘手');
    const en = avatar.generatePixelAvatarSvg('Social Media Lead');
    assert.notEqual(zh, en);
    assert.equal(zh, avatar.generatePixelAvatarSvg('全能社媒操盘手'));
    assert.equal(avatar.generatePixelAvatarSvg(''), avatar.generatePixelAvatarSvg());
    assert.match(avatar.generatePixelAvatarSvg(''), /^<svg /);
    const seeds = Array.from({ length: 20 }, (_, i) => `expert-${i}`);
    const distinct = new Set(seeds.map((seed) => avatar.generatePixelAvatarSvg(seed)));
    assert.ok(distinct.size >= 18, `20 个种子只产出 ${distinct.size} 种头像，多样性不足`);
    assert.match(avatar.generatePixelAvatarSvg('size-check', { size: 128 }), /width="128" height="128"/);
});
test('pixel avatar generator draws a full character (skin, hair, eyes, clothes, background)', async () => {
    const avatar = await loadPixelAvatar();
    const palette = await loadPixelAvatarPalette();
    for (const key of PIXEL_AVATAR_PALETTE_KEYS) {
        assert.ok(palette[key], `缺少 ${key} 定义`);
    }
    assert.ok(palette.PIXEL_AVATAR_SKIN_TONES.length >= 5, '肤色至少 5 种');
    assert.ok(Object.keys(palette.PIXEL_AVATAR_HAIR_STYLES).length >= 10, '发型（含帽子）至少 10 种');
    assert.ok(palette.PIXEL_AVATAR_HAIR_COLORS.length >= 8, '发色至少 8 种');
    assert.ok(palette.PIXEL_AVATAR_CLOTHING.length >= 8, '服装配色至少 8 种');
    assert.ok(palette.PIXEL_AVATAR_BACKGROUNDS.length >= 6, '柔和背景色至少 6 种');
    assert.ok(palette.PIXEL_AVATAR_EYE_COLORS.length >= 3, '眼睛配色至少 3 种');
    assert.ok(Object.keys(palette.PIXEL_AVATAR_EYE_STYLES).length >= 3, '眼睛表情至少 3 种');
    assert.ok(Object.keys(palette.PIXEL_AVATAR_MOUTH_STYLES).length >= 3, '嘴型至少 3 种');
    assert.ok(Object.keys(palette.PIXEL_AVATAR_FACIAL_HAIR).length >= 3, '胡须至少 3 种');
    assert.ok(Object.keys(palette.PIXEL_AVATAR_ACCESSORIES).length >= 4, '配件至少 4 种');
    assert.equal(palette.PIXEL_AVATAR_GRID, 16);
    assert.equal(palette.PIXEL_AVATAR_DEFAULT_RENDER_SIZE, 96);
    const usedColors = new Set();
    for (let i = 0; i < 40; i += 1) {
        const svg = avatar.generatePixelAvatarSvg(`coverage-${i}`);
        for (const match of svg.matchAll(/fill="(#[0-9a-f]{6})"/g))
            usedColors.add(match[1]);
    }
    assert.ok(usedColors.size >= 20, `像素头像用色过少（${usedColors.size}），特征丰富度不足`);
    const skinColors = new Set(palette.PIXEL_AVATAR_SKIN_TONES.flatMap((tone) => [tone.base, tone.shade]));
    const usedSkin = [...skinColors].filter((color) => usedColors.has(color));
    assert.ok(usedSkin.length >= 3, '肤色多样性未生效');
});
test('pixel avatar data URL is img-src safe and stable', async () => {
    const avatar = await loadPixelAvatar();
    const dataUrl = avatar.generatePixelAvatarDataUrl('tiktok-agent');
    assert.match(dataUrl, /^data:image\/svg\+xml;charset=utf-8,/);
    assert.equal(dataUrl, avatar.generatePixelAvatarDataUrl('tiktok-agent'));
    assert.equal(decodeURIComponent(dataUrl.split(',').slice(1).join(',')), avatar.generatePixelAvatarSvg('tiktok-agent'));
    assert.doesNotMatch(dataUrl, /["<>]/);
    assert.equal(avatar.isPixelAvatarDataUrl(dataUrl), true);
    assert.equal(avatar.isPixelAvatarDataUrl('catalog/covers/expert-shopee-ops.png'), false);
    const hash = avatar.hashPixelAvatarSeed('standard');
    assert.equal(hash, avatar.hashPixelAvatarSeed('standard'));
    assert.ok(Number.isInteger(hash) && hash >= 0 && hash <= 0xffffffff);
    assert.notEqual(avatar.hashPixelAvatarSeed('standard'), avatar.hashPixelAvatarSeed('minimal'));
});
test('client contract: expert cards fall back to pixel avatars', () => {
    const expertCard = readFileSync(new URL('../../src/client/plaza/ExpertCard.jsx', import.meta.url), 'utf8');
    assert.match(expertCard, /resolveExpertAvatarSrc/);
    assert.match(expertCard, /resolveExpertPixelAvatar/);
    assert.match(expertCard, /pixelFallback/);
    const plazaUtils = readFileSync(new URL('../../src/client/plaza/plazaUtils.js', import.meta.url), 'utf8');
    assert.match(plazaUtils, /export function resolveExpertPixelAvatar/);
    assert.match(plazaUtils, /export function resolveExpertAvatarSrc/);
    assert.match(plazaUtils, /generatePixelAvatarDataUrl/);
    assert.match(plazaUtils, /'tiktok-agent'/);
    assert.match(plazaUtils, /data:image\/svg\+xml/);
    const bundle = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8');
    assert.match(bundle, /crispEdges/, '打包产物必须包含像素头像渲染逻辑');
    assert.match(bundle, /resolveExpertAvatarSrc/);
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
