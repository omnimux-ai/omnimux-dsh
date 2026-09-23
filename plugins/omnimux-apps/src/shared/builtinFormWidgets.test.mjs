/**
 * plugins/omnimux-apps/src/shared/builtinFormWidgets.test.mjs
 *
 * Issue #2596: the three new builtin apps (商品生视频 / 爆款复刻 / 视频转提示词)
 * must be present in both builtin catalog sources, their form schemas must pass
 * the fail-closed validator, and each must actually use the new widgets.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateFormSchema } from './schemaValidator.ts';
import { BUILTIN_MANIFESTS } from './builtinCatalogData.ts';

const NEW_APP_IDS = [
  'app-builtin-product-video',
  'app-builtin-viral-replication',
  'app-builtin-video-to-prompt',
];

const catalogPath = path.resolve(import.meta.dirname, '../../catalog/builtin-apps.json');
const catalogApps = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

describe('Builtin form widgets catalog (Issue #2596)', () => {
  it('ships the three new apps in both the JSON catalog and BUILTIN_MANIFESTS', () => {
    const jsonIds = new Set(catalogApps.map((a) => a.appId));
    const tsIds = new Set(BUILTIN_MANIFESTS.map((a) => a.appId));
    for (const id of NEW_APP_IDS) {
      assert.ok(jsonIds.has(id), `${id} missing from builtin-apps.json`);
      assert.ok(tsIds.has(id), `${id} missing from BUILTIN_MANIFESTS`);
    }
  });

  it('keeps the JSON catalog and BUILTIN_MANIFESTS in sync for the new apps', () => {
    for (const id of NEW_APP_IDS) {
      const fromJson = catalogApps.find((a) => a.appId === id);
      const fromTs = BUILTIN_MANIFESTS.find((a) => a.appId === id);
      assert.deepEqual(fromTs, fromJson, `${id} diverged between catalog sources`);
    }
  });

  it('each new app form schema passes the fail-closed validator', () => {
    for (const id of NEW_APP_IDS) {
      const app = catalogApps.find((a) => a.appId === id);
      const res = validateFormSchema(app.formSchema);
      assert.equal(res.valid, true, `${id} formSchema invalid: ${res.errors.join('; ')}`);

      // fieldMappings cover every exposed property
      const propKeys = Object.keys(app.formSchema.properties);
      const mappingKeys = Object.keys(app.fieldMappings);
      assert.deepEqual(new Set(mappingKeys), new Set(propKeys), `${id} mapping parity`);
    }
  });

  it('uses the new compound widgets with the intended library bindings', () => {
    const productVideo = catalogApps.find((a) => a.appId === 'app-builtin-product-video');
    assert.equal(productVideo.formSchema.properties.product_image.widget, 'library-picker');
    assert.equal(productVideo.formSchema.properties.product_image.library, 'asset');
    assert.equal(productVideo.formSchema.properties.product_link.widget, 'product-link');
    assert.equal(productVideo.formSchema.properties.content_mode.widget, 'segmented-tabs');
    assert.equal(productVideo.formSchema.properties.platforms.widget, 'multi-tags');
    assert.equal(productVideo.formSchema.properties.platforms.maxItems, 3);

    const replication = catalogApps.find((a) => a.appId === 'app-builtin-viral-replication');
    assert.equal(replication.formSchema.properties.reference_video.widget, 'media-extractor');
    assert.equal(replication.formSchema.properties.reference_inspiration.widget, 'library-picker');
    assert.equal(replication.formSchema.properties.reference_inspiration.library, 'inspiration');

    const toPrompt = catalogApps.find((a) => a.appId === 'app-builtin-video-to-prompt');
    assert.equal(toPrompt.formSchema.properties.source_video.widget, 'media-extractor');
    assert.equal(toPrompt.formSchema.properties.analysis_focus.widget, 'multi-tags');
    assert.equal(toPrompt.formSchema.properties.prompt_language.widget, 'segmented-tabs');
  });

  it('ships a preset workflow snapshot per new app with matching slot nodes', () => {
    for (const id of NEW_APP_IDS) {
      const presetPath = path.resolve(import.meta.dirname, `../../catalog/presets/${id}.workflow.json`);
      assert.ok(fs.existsSync(presetPath), `missing preset snapshot for ${id}`);
      const preset = JSON.parse(fs.readFileSync(presetPath, 'utf-8'));
      const nodeIds = new Set(preset.nodes.map((n) => n.id));
      const app = catalogApps.find((a) => a.appId === id);
      for (const mapping of Object.values(app.fieldMappings)) {
        assert.ok(nodeIds.has(mapping.nodeId), `${id}: preset missing node ${mapping.nodeId}`);
      }
    }
  });
});
