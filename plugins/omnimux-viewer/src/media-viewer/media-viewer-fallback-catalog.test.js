import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FALLBACK_CATALOG,
  defaultMediaChannel,
  parseCatalogToCascade,
} from './MediaViewerComposerData.js';

function seedance25() {
  const entry = DEFAULT_FALLBACK_CATALOG.video.find((item) => item.id === 'seedance-2-5');
  assert.ok(entry, 'seedance-2-5 必须存在于回退目录');
  return entry;
}

test('回退目录的 seedance-2-5 档位与中枢口径一致（480p 经济版 / 720p 标准版）', () => {
  const groups = seedance25().channelGroups;
  const p480 = groups.find((group) => group.id === '480p');
  const p720 = groups.find((group) => group.id === '720p');
  assert.ok(p480 && p720, '两档都必须在回退目录里');

  assert.equal(p480.label, '经济版');
  assert.notEqual(p480.default, true, '480p 是经济档，不是默认档');
  assert.equal(p720.label, '标准版');
  assert.equal(p720.default, true, '720p 才是默认档');
});

test('回退目录的线路绑定与计价不漂移', () => {
  const groups = seedance25().channelGroups;
  const p480 = groups.find((group) => group.id === '480p');
  const p720 = groups.find((group) => group.id === '720p');
  assert.equal(p480.wireGroup, 'desktop-480p');
  assert.equal(p720.wireGroup, 'desktop-720p');
  assert.equal(p480.pricing.pointsEstimate, 6.8);
  assert.equal(p720.pricing.pointsEstimate, 9.6);
});

test('级联投影把默认档落在 720p 标准版上', () => {
  const cascade = parseCatalogToCascade([seedance25()]);
  const model = cascade.flatMap((brand) => brand.models).find((item) => item.id === 'seedance-2-5');
  assert.ok(model, '级联投影必须产出 seedance-2-5');
  assert.equal(model.channels.map((channel) => channel.id).join(','), '480p,720p');
  assert.equal(model.channels.find((channel) => channel.id === '480p').name, '经济版');
  assert.equal(defaultMediaChannel(model).id, '720p');
  assert.equal(defaultMediaChannel(model).name, '标准版');
});
