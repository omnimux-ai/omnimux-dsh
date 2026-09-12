import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cascadeSrc = readFileSync(join(here, 'ModelCascadeMenu.tsx'), 'utf8');
const configSrc = readFileSync(join(here, 'index.tsx'), 'utf8');

describe('ModelCascadeMenu source contracts', () => {
  it('stores no raw hex or banned token', () => {
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const code = stripComments(cascadeSrc);
    assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b/, 'ModelCascadeMenu must not contain raw hex');
    assert.doesNotMatch(code, /--omx-/, 'ModelCascadeMenu must not contain banned tokens');
  });

  it('declares the trigger capsule, three panels and the stability dot bar', () => {
    assert.match(cascadeSrc, /StabilityDotBar/);
    assert.match(cascadeSrc, /wf-model-cascade-capsule/);
    assert.match(cascadeSrc, /wf-model-cascade-popover/);
    assert.match(cascadeSrc, /稳定性优先/);
    assert.match(cascadeSrc, /低价优先/);
    assert.match(cascadeSrc, /已选/);
  });

  it('uses derived chips so the discount is never rendered twice', () => {
    assert.match(cascadeSrc, /formatDiscountLabel/);
    assert.match(cascadeSrc, /formatBillingLabel/);
    assert.match(cascadeSrc, /formatPointsLabel/);
    assert.match(configSrc, /ModelCascadeMenu/);
  });

  it('offers no channel affordance the node cannot honour', () => {
    // Text nodes run through llm.stream: the request cannot carry a group, so the
    // third panel explains that instead of rendering selectable channels.
    assert.match(cascadeSrc, /materialType === 'text'/);
    assert.match(cascadeSrc, /llm\.stream/);
    assert.match(cascadeSrc, /channelGroups\.length === 0/);
    assert.match(cascadeSrc, /尚未配置渠道分组/);
  });

  it('omits routing for text nodes and for pools that resolved to nothing', () => {
    assert.match(cascadeSrc, /materialType === 'text' \|\| groupIds\.length === 0 \? \{\} : \{ allowedGroups: groupIds \}/);
    // A stale routing object must not survive a modality that cannot carry it.
    assert.match(configSrc, /delete nextParams\.routing/);
  });

  it('re-syncs brand and channel selection when the node data changes externally', () => {
    assert.match(cascadeSrc, /setActiveBrandId\(brandForModel\(currentModelId, allowedBrands\)\)/);
    assert.match(cascadeSrc, /setSelectedGroupIds\(persistedGroups\?\.length \? persistedGroups : groups\.map/);
  });

  it('closes on Escape and outside click through refs, and repositions on resize', () => {
    assert.match(cascadeSrc, /event\.key === 'Escape'/);
    assert.match(cascadeSrc, /popoverRef\.current\?\.contains\(target\)/);
    assert.match(cascadeSrc, /window\.addEventListener\('resize', place\)/);
    assert.doesNotMatch(cascadeSrc, /querySelector\('\.wf-model-cascade-popover'\)/);
  });

  it('exposes menu semantics for keyboard and screen readers', () => {
    assert.match(cascadeSrc, /role="menu"/);
    assert.match(cascadeSrc, /role="menuitemcheckbox"/);
    assert.match(cascadeSrc, /role="menuitemradio"/);
    assert.match(cascadeSrc, /aria-expanded=\{isOpen\}/);
  });

  it('keeps the superseded routing modal out of the panel', () => {
    assert.doesNotMatch(configSrc, /ModelRoutingModal/);
    assert.doesNotMatch(configSrc, /routingModalOpen/);
  });
});
