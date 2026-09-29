import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getModelChannelGroups,
  resolveChannelCandidates,
} from '../../../omnimux/src/catalog/serving/channel-groups.js';
import {
  DEFAULT_FALLBACK_CATALOG,
  parseCatalogToCascade,
} from '../../../omnimux/src/client/media-viewer/MediaViewerComposerData.js';
import { withRoutingGroup } from '../../../omnimux/src/media/protocols/openai-media.js';

test('gpt-image-2.5 registers three official channel groups and enables third-level cascade', async () => {
  // AC-1: hub groups
  const groups = getModelChannelGroups('gpt-image-2.5');
  assert.equal(groups.length, 3, 'gpt-image-2.5 必须提供 3 个渠道分组');

  const pro = groups.find((g) => g.id === 'pro');
  const standard = groups.find((g) => g.id === 'standard');
  const economy = groups.find((g) => g.id === 'economy');

  assert.ok(pro, '必须包含 pro');
  assert.equal(pro.label, '旗舰版');
  assert.equal(pro.wireGroup, 'gpt-image-2.5-pro');
  assert.equal(pro.pricing.pointsEstimate, 0.2);

  assert.ok(standard, '必须包含 standard');
  assert.equal(standard.label, '标准版');
  assert.equal(standard.wireGroup, 'default');
  assert.equal(standard.default, true);
  assert.equal(standard.pricing.pointsEstimate, 0.1);

  assert.ok(economy, '必须包含 economy');
  assert.equal(economy.label, '经济版');
  assert.equal(economy.wireGroup, 'gpt-image-2.5-economy');
  assert.equal(economy.pricing.pointsEstimate, 0.1);

  // AC-4 gate: groups.length > 1 => showChannelColumn
  assert.equal(groups.length > 1, true, '分组数 > 1 必须激活第三级菜单');

  // AC-3: media viewer fallback catalog
  const cascadeImage = parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.image);
  const openAiBrand = cascadeImage.find((b) => b.brandId === 'openai');
  assert.ok(openAiBrand, '必须存在 OpenAI 品牌');
  const gpt25Model = openAiBrand.models.find((m) => m.id === 'gpt-image-2.5');
  assert.ok(gpt25Model, '必须包含 gpt-image-2.5 型号');
  assert.equal(gpt25Model.channels.length, 3, '媒体查看器后备目录必须同步包含 3 个渠道');
  assert.deepEqual(
    gpt25Model.channels.map((c) => c.id),
    ['flagship', 'standard', 'economy'],
  );

  // AC-5 routing candidates use real API: { group } => string[]
  assert.equal(
    resolveChannelCandidates('gpt-image-2.5', { group: 'pro' })[0],
    'gpt-image-2.5@gpt-image-2.5-pro',
  );
  assert.equal(
    resolveChannelCandidates('gpt-image-2.5', { group: 'economy' })[0],
    'gpt-image-2.5@gpt-image-2.5-economy',
  );
  assert.equal(
    resolveChannelCandidates('gpt-image-2.5', { group: 'standard' })[0],
    'gpt-image-2.5@default',
  );

  // AC-5 header contract for the three wire groups
  for (const wireGroup of ['gpt-image-2.5-pro', 'default', 'gpt-image-2.5-economy']) {
    let seen = null;
    const routed = withRoutingGroup(async (_input, init) => {
      seen = new Headers(init?.headers).get('X-Omnimux-Group');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }, wireGroup);
    await routed.fetcher('https://api.omnimux.ai/v1/images/generations', { method: 'POST' });
    assert.equal(seen, wireGroup, `X-Omnimux-Group must equal ${wireGroup}`);
  }
});
