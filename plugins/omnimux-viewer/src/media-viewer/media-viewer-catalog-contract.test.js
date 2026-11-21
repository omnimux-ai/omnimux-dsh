import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultMediaChannel,
  imageParameterOptions,
  parseCatalogToCascade,
} from './MediaViewerComposerData.js';

const row = (overrides) => ({
  label: overrides.id,
  family: 'openai',
  familyLabel: 'OpenAI',
  parameters: {},
  channelGroups: [{ id: 'standard', label: '标准版', default: true, enabled: true, constraints: {} }],
  operations: [],
  ...overrides,
});

test('catalog projection uses hub labels and family labels, never invents a fallback model list', () => {
  const cascade = parseCatalogToCascade([
    row({ id: 'seedream-5-5', label: 'Seedream 5.5', family: 'seedream', familyLabel: 'Seedream' }),
    row({ id: 'muse-image', label: 'Muse Image', family: 'muse', familyLabel: 'Muse' }),
  ]);
  assert.equal(cascade.length, 2);
  assert.equal(cascade[0].brandName, 'Seedream');
  assert.equal(cascade[0].models[0].name, 'Seedream 5.5');
  assert.equal(cascade[1].brandName, 'Muse');
  assert.equal(cascade[1].models[0].name, 'Muse Image');
  assert.deepEqual(parseCatalogToCascade([]), []);
});

test('imageParameterOptions only exposes fields present in the model contract', () => {
  const seedream = {
    id: 'seedream-5-5',
    raw: { parameters: { resolution: { defaultValue: '2K', options: [{ value: '2K' }] } } },
    channels: [{ id: 'default', constraints: {} }],
  };
  const seedreamOptions = imageParameterOptions(seedream, seedream.channels[0]);
  assert.deepEqual(seedreamOptions.aspectRatio.options, []);
  assert.deepEqual(seedreamOptions.resolution.options.map((item) => item.value), ['2K']);

  const muse = {
    id: 'muse-image',
    raw: { parameters: { aspectRatio: { defaultValue: '1:1', options: ['1:1', '16:9'] } } },
    channels: [{ id: 'pool', constraints: {} }],
  };
  const museOptions = imageParameterOptions(muse, muse.channels[0]);
  assert.deepEqual(museOptions.aspectRatio.options.map((item) => item.value), ['1:1', '16:9']);
  assert.deepEqual(museOptions.resolution.options, []);

  const gpt = {
    id: 'gpt-image-2.5',
    raw: { parameters: {
      aspectRatio: { defaultValue: '1:1', options: ['1:1', '16:9'] },
      resolution: { defaultValue: '1K', options: ['1K'] },
    } },
    channels: [{ id: 'standard', constraints: {} }],
  };
  const gptOptions = imageParameterOptions(gpt, gpt.channels[0]);
  assert.equal(gptOptions.aspectRatio.defaultValue, '1:1');
  assert.equal(gptOptions.resolution.defaultValue, '1K');
  assert.deepEqual(gptOptions.n.options.map((item) => item.value), ['1', '2', '4']);
});

test('defaultMediaChannel ignores disabled lines', () => {
  const model = {
    channels: [
      { id: 'disabled', default: true, enabled: false },
      { id: 'enabled', default: false, enabled: true },
    ],
  };
  assert.equal(defaultMediaChannel(model).id, 'enabled');
  assert.equal(defaultMediaChannel({ channels: [{ id: 'disabled', enabled: false }] }), undefined);
});
