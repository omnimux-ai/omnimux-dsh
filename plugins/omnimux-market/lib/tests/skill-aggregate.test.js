import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalog } from '../expert/catalog.js';
import { withDefaults } from '../config-store.js';
import { aggregateSkillSearch, catalogItemToCard, catalogSkillChannel, catalogSkillSlug, findCatalogSkill, scoreCatalogSkill, tokenizeSkillQuery, } from '../skill-aggregate.js';
function cfg() {
    return withDefaults({ skillsDir: '/tmp/omnimux-market-no-skills', timeoutMs: 5000, userAgent: 't' });
}
function catalogItem(partial) {
    return {
        tab: 'skills',
        kind: 'skill',
        subtitle: '',
        summary: '摘要',
        category: 'sk-visual',
        tags: [],
        source: { type: 'git', repo: 'infometa/workbuddyskills', path: 'skills/x', ref: 'main' },
        ...partial,
    };
}
const FAKE_CATALOG = {
    items: [
        catalogItem({
            id: 'sk-omx-face-warp',
            title: '人像拼图',
            summary: '拆分参考人脸以通过审核',
            tags: ['短剧漫剧'],
            skill: 'face-warp',
            source: { type: 'git', repo: 'infometa/OmniMux-skills', path: 'skills/face-warp', ref: 'main' },
        }),
        catalogItem({
            id: 'sk-omx-storyboard',
            title: '分镜',
            summary: '镜头分镜脚本',
            skill: 'storyboard',
            source: { type: 'git', repo: 'infometa/OmniMux-skills', path: 'skills/storyboard', ref: 'main' },
        }),
        catalogItem({
            id: 'sk-tencent-docs',
            title: '腾讯文档',
            summary: '读写腾讯文档表格',
            skill: 'tencent-docs',
            category: 'sk-office',
            source: { type: 'git', repo: 'infometa/workbuddyskills', path: 'skills/tencent-docs', ref: 'main' },
        }),
        catalogItem({
            id: 'esc-demo-skill',
            title: '画廊离线演示',
            summary: '本包随附的离线演示技能',
            skill: 'esc-demo-note',
            source: { type: 'bundled', path: 'catalog/skills/esc-demo-note/SKILL.md' },
        }),
        catalogItem({
            id: 'exp-product-manager',
            tab: 'experts',
            kind: 'expert',
            title: '产品经理',
            skill: 'product-manager',
        }),
    ],
};
function remoteCard(slug, name) {
    return {
        id: `@u/${slug}`,
        slug,
        name,
        description: '',
        category: 'ai-agent',
        categoryLabel: 'AI Agent',
        version: '1.0.0',
        downloads: 10,
        stars: 1,
        installs: 1,
        pageUrl: `https://skillhub.cn/skills/${slug}`,
        channel: 'skillhub',
        installBackend: 'skillhub',
    };
}
function remoteResult(items, extra = {}) {
    return {
        query: 'q',
        sortBy: 'score',
        items,
        total: items.length,
        offset: 0,
        hasMore: false,
        ...extra,
    };
}
test('tokenizeSkillQuery keeps face-warp and Chinese bigrams', () => {
    const kebab = tokenizeSkillQuery('face-warp');
    assert.ok(kebab.includes('face-warp'));
    assert.ok(kebab.includes('face'));
    assert.ok(kebab.includes('warp'));
    const tokens = tokenizeSkillQuery('人像拼图');
    assert.ok(tokens.includes('人像'));
    assert.ok(tokens.includes('拼图'));
});
test('catalogSkillChannel splits custom vs workbuddy', () => {
    assert.equal(catalogSkillChannel(FAKE_CATALOG.items[0]), 'custom');
    assert.equal(catalogSkillChannel(FAKE_CATALOG.items[2]), 'workbuddy');
    assert.equal(catalogSkillChannel(FAKE_CATALOG.items[3]), 'workbuddy');
    assert.equal(catalogSkillChannel(FAKE_CATALOG.items[4]), null);
});
test('scoreCatalogSkill ranks exact slug above summary', () => {
    const tokens = tokenizeSkillQuery('face-warp');
    const face = scoreCatalogSkill(FAKE_CATALOG.items[0], tokens);
    const story = scoreCatalogSkill(FAKE_CATALOG.items[1], tokens);
    assert.ok(face > story);
    assert.equal(story, 0);
});
test('aggregateSkillSearch finds custom face-warp / 人像拼图', async () => {
    const byZh = await aggregateSkillSearch('人像拼图', {
        cfg: cfg(),
        catalog: FAKE_CATALOG,
        channels: ['custom', 'workbuddy'],
        searchSkills: async () => {
            throw new Error('remote should not run');
        },
    });
    assert.equal(byZh.items[0].slug, 'face-warp');
    assert.equal(byZh.items[0].channel, 'custom');
    assert.equal(byZh.items[0].catalogId, 'sk-omx-face-warp');
    assert.equal(byZh.items[0].installBackend, 'catalog');
    assert.deepEqual(byZh.channelsServed, ['custom', 'workbuddy']);
    const bySlug = await aggregateSkillSearch('face-warp', {
        cfg: cfg(),
        catalog: FAKE_CATALOG,
        channels: ['custom'],
    });
    assert.equal(bySlug.items.some((it) => it.slug === 'face-warp' && it.channel === 'custom'), true);
});
test('aggregateSkillSearch finds workbuddy local skills', async () => {
    const result = await aggregateSkillSearch('腾讯文档', {
        cfg: cfg(),
        catalog: FAKE_CATALOG,
        channels: ['custom', 'workbuddy'],
    });
    assert.equal(result.items[0].slug, 'tencent-docs');
    assert.equal(result.items[0].channel, 'workbuddy');
    assert.equal(result.items[0].installBackend, 'catalog');
});
test('aggregateSkillSearch dedupes by slug and keeps higher-priority channel', async () => {
    const result = await aggregateSkillSearch('face-warp', {
        cfg: cfg(),
        catalog: FAKE_CATALOG,
        searchSkills: async () => remoteResult([
            remoteCard('face-warp', 'Face Warp (hub)'),
            remoteCard('other-remote', 'Other'),
        ]),
    });
    const faces = result.items.filter((it) => it.slug === 'face-warp');
    assert.equal(faces.length, 1);
    assert.equal(faces[0].channel, 'custom');
    assert.equal(faces[0].name, '人像拼图');
    assert.equal(result.items.some((it) => it.slug === 'other-remote'), true);
    assert.ok((result.channelCounts?.custom || 0) >= 1);
    assert.ok((result.channelCounts?.skillhub || 0) >= 1);
});
test('aggregateSkillSearch soft-fails remote and still returns local', async () => {
    const result = await aggregateSkillSearch('face-warp', {
        cfg: cfg(),
        catalog: FAKE_CATALOG,
        searchSkills: async () => {
            throw new Error('network timeout');
        },
    });
    assert.equal(result.items[0].slug, 'face-warp');
    assert.equal(result.items[0].channel, 'custom');
    assert.equal(result.channelErrors?.skillhub, 'timeout');
    assert.equal(result.channelsServed?.includes('skillhub'), false);
});
test('aggregateSkillSearch rethrows remote when soft-fail is off', async () => {
    await assert.rejects(() => aggregateSkillSearch('face-warp', {
        cfg: { ...cfg(), aggregateRemoteSoftFail: false },
        catalog: FAKE_CATALOG,
        channels: ['skillhub'],
        searchSkills: async () => {
            throw new Error('boom');
        },
    }), /boom/);
});
test('aggregateSkillSearch offline-only still pages', async () => {
    const result = await aggregateSkillSearch('', {
        cfg: cfg(),
        catalog: FAKE_CATALOG,
        channels: ['custom', 'workbuddy'],
        limit: 2,
        offset: 0,
    });
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].channel, 'custom');
    assert.equal(result.hasMore, true);
    const page2 = await aggregateSkillSearch('', {
        cfg: cfg(),
        catalog: FAKE_CATALOG,
        channels: ['custom', 'workbuddy'],
        limit: 2,
        offset: 2,
    });
    assert.equal(page2.items.length, 2);
    assert.notEqual(page2.items[0].slug, result.items[0].slug);
});
test('aggregateSkillSearch ignores remote popular fallback when local hits exist', async () => {
    const result = await aggregateSkillSearch('人像拼图', {
        cfg: cfg(),
        catalog: FAKE_CATALOG,
        searchSkills: async () => remoteResult([remoteCard('hot-skill', 'Hot')], { fallback: true, total: 99 }),
    });
    assert.equal(result.fallback, undefined);
    assert.equal(result.items.some((it) => it.slug === 'hot-skill'), false);
    assert.equal(result.items[0].slug, 'face-warp');
});
test('legacy Agent search retains popular fallback and its existing return fields', async () => {
    const result = await aggregateSkillSearch('unmatched', {
        cfg: cfg(), catalog: { items: [] },
        searchSkills: async () => remoteResult([remoteCard('hot', 'Hot')], { fallback: true }),
    });
    assert.equal(result.fallback, true);
    assert.equal(result.items[0].slug, 'hot');
    assert.equal(result.total, 1);
    assert.equal(result.totalApprox, false);
    assert.equal(result.offset, 0);
    assert.equal(result.hasMore, false);
    assert.equal(result.sortBy, 'score');
});
test('findCatalogSkill matches slug, catalog id, and sk-omx- prefix', () => {
    const a = findCatalogSkill('face-warp', undefined, FAKE_CATALOG);
    assert.equal(a?.id, 'sk-omx-face-warp');
    const b = findCatalogSkill('x', 'sk-omx-face-warp', FAKE_CATALOG);
    assert.equal(b?.skill, 'face-warp');
    const c = findCatalogSkill('sk-omx-face-warp', undefined, FAKE_CATALOG);
    assert.equal(c?.id, 'sk-omx-face-warp');
    assert.equal(catalogSkillSlug(c), 'face-warp');
});
test('live catalog still exposes face-warp as custom', async () => {
    const doc = loadCatalog();
    const hit = findCatalogSkill('face-warp', undefined, doc);
    assert.equal(hit?.id, 'sk-omx-face-warp');
    assert.equal(catalogSkillChannel(hit), 'custom');
    const result = await aggregateSkillSearch('人像拼图', {
        cfg: cfg(),
        loadCatalog: () => doc,
        channels: ['custom', 'workbuddy'],
    });
    assert.equal(result.items.some((it) => it.slug === 'face-warp' && it.channel === 'custom'), true);
});
// ---------------------------------------------------------------------------
// T03 · 卡片投影双语携带（仅门禁通过时外流，name/description 语义不变）
// ---------------------------------------------------------------------------
function cardFor(partial) {
    const row = catalogItem({ id: 'sk-omx-demo-skill', skill: 'demo-skill', title: '中文标题', summary: '中文摘要', ...partial });
    return catalogItemToCard(row, 'custom', cfg());
}
test('T03-01：双语齐备时卡片携带 4 字段，name/description 与 slug 语义不变', () => {
    const card = cardFor({ titleZh: '中文标题', titleEn: 'English title', summaryZh: '中文摘要', summaryEn: 'English summary' });
    assert.equal(card.titleZh, '中文标题');
    assert.equal(card.titleEn, 'English title');
    assert.equal(card.summaryZh, '中文摘要');
    assert.equal(card.summaryEn, 'English summary');
    assert.equal(card.name, '中文标题');
    assert.equal(card.description, '中文摘要');
    assert.equal(card.slug, 'demo-skill');
    assert.equal(card.catalogId, 'sk-omx-demo-skill');
    assert.equal(card.channel, 'custom');
});
test('T03-02：缺任一字段时卡片完全不携带双语（半截数据不得外流）', () => {
    const card = cardFor({ titleZh: '中文标题', titleEn: 'English title', summaryZh: '中文摘要' });
    assert.equal('titleZh' in card, false);
    assert.equal('titleEn' in card, false);
    assert.equal('summaryZh' in card, false);
    assert.equal('summaryEn' in card, false);
    assert.equal(card.name, '中文标题');
    assert.equal(card.description, '中文摘要');
});
test('T03-03：空白串同样视为缺失，绝不把 title 回填进英文字段', () => {
    const card = cardFor({ titleEn: '   ', summaryEn: '\n', titleZh: '中文标题', summaryZh: '中文摘要' });
    assert.equal('titleEn' in card, false);
    assert.equal('titleEn' in card ? card.titleEn : 'absent', 'absent');
});
test('T03-04：真实目录 69 项官方货架技能投影出的卡片全部携带双语', () => {
    const doc = loadCatalog();
    const cards = doc.items
        .filter((item) => item.kind === 'skill' && item.tab === 'skills' && item.recommended === true)
        .map((item) => catalogItemToCard(item, 'custom', cfg()));
    assert.equal(cards.length, 69);
    const missing = cards
        .filter((card) => !card.titleZh || !card.titleEn || !card.summaryZh || !card.summaryEn)
        .map((card) => card.slug);
    assert.deepEqual(missing, []);
    const sample = cards.find((card) => card.slug === '3d-animation-short-generator');
    assert.ok(sample);
    assert.equal(sample.titleZh, '3D动画短片');
    assert.ok(sample.titleEn && sample.titleEn !== sample.titleZh);
});
