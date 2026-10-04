import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolveEffectiveImageParams } from '../../canvas/editor/components/MaterialNode/ConfigPanel/imageParams/imageParamAdapter.ts';
import { createCompatTestCatalog } from './compatTestCatalog.ts';
import { createOmnimuxSeamClient } from '../../workflow/seam/omnimuxGateway.ts';

const model = 'gpt-image-2.5';
const schema = { resolution: { options: ['1K', '2K', '4K'].map(value => ({ value })), defaultValue: '1K' }, quality: { options: ['standard', 'hd'].map(value => ({ value })), defaultValue: 'standard' } };
test('canvas default/selected standard hide unsupported quality without mutating saved parameters', () => {
  for (const routing of [undefined, { allowedGroups: ['standard'] }]) {
    const params = { model, resolution: '4K', quality: 'hd', routing };
    const before = structuredClone(params);
    const effective = resolveEffectiveImageParams({ params, schema });
    assert.equal(effective.resolution, '1K');
    assert.equal(effective.quality, undefined);
    assert.deepEqual(effective.schema.quality.options, []);
    assert.deepEqual(params, before);
  }
  const economy = resolveEffectiveImageParams({ params: { model, resolution: '4K', quality: 'hd', routing: { allowedGroups: ['economy'] } }, schema });
  assert.equal(economy.resolution, '4K');
  assert.equal(economy.quality, 'hd');
});
test('application catalog projection consumes channelGroups defaults and retains other lines', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gpt-app3071-'));
  try {
    const output = join(dir, 'app.cjs');
    await build({ entryPoints: [new URL('../../client/projects/AppTab.jsx', import.meta.url).pathname], bundle: true, platform: 'node', format: 'cjs', outfile: output, packages: 'external' });
    const { createRequire } = await import('node:module');
    // Place external module resolution in the package tree, not the OS scratch dir.
    const require = createRequire(import.meta.url);
    const { readFileSync } = await import('node:fs');
    const module = { exports: {} };
    new Function('require', 'module', 'exports', readFileSync(output, 'utf8'))(require, module, module.exports);
    const raw = { id: model, parameters: schema, channelGroups: [{ id: 'standard', default: true, constraints: { parameters: { resolution: { fixed: '1K' } } } }, { id: 'economy' }] };
    const { normalizeCatalogModels, resolveFieldModelOptions } = module.exports;
    const result = normalizeCatalogModels([raw], 'image')[0];
    assert.deepEqual(resolveFieldModelOptions({}, result, true, false).map(o => o.value), ['1K']);
    assert.equal(result.channels.length, 2);
    const economy = normalizeCatalogModels([raw], 'image', { [model]: { allowedGroups: ['economy'] } })[0];
    assert.deepEqual(resolveFieldModelOptions({}, economy, true, false).map(o => o.value), ['1K', '2K', '4K']);
    assert.equal(raw.parameters.resolution.options.length, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('workflow public seam forwards explicit quality instead of silently dropping it', async () => {
  const catalog = createCompatTestCatalog();
  const row = catalog.models.find(m => m.id === 'img-prompt-only');
  row.id = model;
  row.listedOperations = row.operations.filter(op => op.listed).map(op => `${model}#${op.id}`);
  catalog.image = [{ id: model, label: model }];
  assert.equal(row.id, model);
  let captured;
  const client = createOmnimuxSeamClient({ getSeam(name) {
    if (name === 'modelCatalog') return { build: () => catalog, read: () => catalog, list: () => catalog };
    if (name === 'imageGenerate') return { execute: async request => { captured = request; assert.equal(request.quality, 'hd'); return { type: 'image', taskId: 'task-quality', mode: 'submitted' }; } };
  } });
  const operation = row.operations.find(op => op.listed && op.output.type === 'image').id;
  await client.submit({ capability: 'image', model: row.id, operation, prompt: 'cat', quality: 'hd', n: 4, allowedGroups: ['economy'] });
  assert.equal(captured.quality, 'hd');
  assert.equal(captured.n, 4);
  assert.deepEqual(captured.allowedGroups, ['economy']);
});
