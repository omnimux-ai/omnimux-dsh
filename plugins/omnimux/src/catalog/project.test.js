/**
 * Catalog v1.1 projection tests (H2 T03).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  projectCatalog,
  projectKindRows,
  projectChatRows,
  projectDirectoryRows,
  mergeInputCapability,
  visibleOps,
  assertContractHealthy,
  getHealthyContractIndex,
  resolveModelId,
} from './project.js';
import { loadAll, resetContractCache, DEFAULT_SPECS_DIR } from './contract/load.js';
import { loadDispositions, loadCatalogDefaults } from './contract/dispositions.js';

function freshIndex(specsDir = DEFAULT_SPECS_DIR) {
  resetContractCache();
  return loadAll(specsDir, { useCache: false });
}

function syntheticIndex(models) {
  const byId = new Map(models.map((m) => [m.id, m]));
  return {
    schemaVersion: '1.1',
    contentFingerprint: 'synthetic0000000',
    byId,
    issues: [],
    parseErrors: [],
    listedOperations: models.flatMap((m) => m.listedOperations ?? []),
    all: () => [...byId.values()],
    get: (id) => byId.get(id),
  };
}

const syntheticDispositions = {
  version: '1.0.0',
  dispositions: [
    { id: 'asr-model', disposition: 'canonical', reason: 'test' },
    { id: 'nano-banana-2', disposition: 'canonical', reason: 'test' },
    { id: 'quar-model', disposition: 'quarantine', reason: 'test' },
  ],
};

test('speech_to_text outputs text → text bucket, never the audio output bucket', () => {
  const sttOp = {
    id: 'speech_to_text',
    label: 'ASR',
    output: { type: 'text' },
    inputs: [{ slot: 'audio_input', type: 'audio', role: 'source', min: 1, max: 1 }],
    listed: true,
    research: { status: 'verified' },
    execution: { status: 'live' },
  };
  const model = {
    id: 'asr-model',
    label: 'ASR Model',
    managementGroup: 'audio', // managed under audio, but output is text
    operations: [sttOp],
    listed: true,
    listedOperations: ['asr-model#speech_to_text'],
  };
  const dto = projectCatalog(syntheticIndex([model]), syntheticDispositions, {});
  assert.deepEqual(dto.text.map((r) => r.id), ['asr-model']);
  assert.deepEqual(dto.audio, []);
  assert.deepEqual(dto.image, []);
  assert.deepEqual(dto.video, []);
});

test('nanobanana: legacy spellings normalize to the hyphen canonical — never double listed', () => {
  const t2i = {
    id: 'text_to_image',
    label: 't2i',
    output: { type: 'image' },
    inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 }],
    listed: true,
    research: { status: 'verified' },
    execution: { status: 'live' },
  };
  const model = {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    aliases: ['nano_banana_2', 'nanobanana-2'],
    managementGroup: 'image',
    operations: [t2i],
    listed: true,
    listedOperations: ['nano-banana-2#text_to_image'],
  };
  const index = syntheticIndex([model]);
  const dto = projectCatalog(index, syntheticDispositions, {});
  assert.deepEqual(dto.image.map((r) => r.id), ['nano-banana-2']);
  assert.equal(dto.image.some((r) => r.id === 'nano_banana_2'), false);
  assert.equal(dto.image.some((r) => r.id === 'nanobanana-2'), false);
  // resolveModelId normalizes every legacy spelling onto the canonical row
  assert.equal(resolveModelId(index, 'nanobanana-2'), 'nano-banana-2');
  assert.equal(resolveModelId(index, 'nano_banana_2'), 'nano-banana-2');
  assert.equal(resolveModelId(index, 'nano-banana-2'), 'nano-banana-2');
  assert.equal(resolveModelId(index, 'nope'), undefined);
});

test('withdrawn models leave models[]; unlisted canonical/draft rows stay authoritative but out of the four lists', () => {
  const index = freshIndex();
  const dto = projectCatalog(index, loadDispositions(), loadCatalogDefaults());
  assert.equal(dto.models.length, 41);
  // #1751: the 12 withdrawn (disposition=unavailable) rows have no YAML block, so they
  // vanish from the authoritative list and from every derived bucket.
  for (const gone of [
    'gpt-image-2', 'minimax-h3-max', 'minimax-h3-max-turbo', 'midjourney', 'midjourney-niji-7',
    'seedream-4.5', 'kling-o1', 'seedance2.5-stable-max-720p', 'omni_flash', 'kling-avatar',
    'veo-3.1', 'veo-3.1-fast',
  ]) {
    assert.equal(dto.models.some((m) => m.id === gone), false, `models[]:${gone}`);
    for (const kind of ['text', 'image', 'video', 'audio']) {
      assert.equal(dto[kind].some((r) => r.id === gone), false, `${kind}:${gone}`);
    }
  }
  // canonical-but-unlisted (#1751 un-quarantined) and draft rows keep their disposition
  assert.equal(dto.models.find((m) => m.id === 'kling-o3')?.disposition, 'canonical');
  assert.equal(dto.models.find((m) => m.id === 'kling-v3-motion-control')?.disposition, 'canonical');
  assert.equal(dto.models.find((m) => m.id === 'grok-imagine-image-2-0')?.disposition, 'canonical');
  assert.equal(dto.models.find((m) => m.id === 'whisper-1')?.disposition, 'draft');
  for (const kind of ['text', 'image', 'video', 'audio']) {
    for (const unlisted of [
      'whisper-1', 'suno', 'gpt-4o-mini-tts', 'jina-reader-v1',
      'kling-o3', 'kling-v2-6', 'kling-v3', 'kling-v3-motion-control', 'grok-imagine-image-2-0',
    ]) {
      assert.equal(dto[kind].some((r) => r.id === unlisted), false, `${kind}:${unlisted}`);
    }
  }
});

test('real specs: buckets derive only from output.type of listed ops', () => {
  const index = freshIndex();
  const dto = projectCatalog(index, loadDispositions(), loadCatalogDefaults());
  assert.equal(dto.schemaVersion, '1.1');
  assert.equal(dto.source, 'omnimux');
  assert.deepEqual(dto.image.map((r) => r.id).sort(), ['gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']);
  assert.deepEqual(dto.video.map((r) => r.id), [
    'grok-imagine-video-1-5',
    'minimax-h3',
    'seedance-2-0',
    'seedance-2-0-fast',
    'seedance-2-0-mini',
    'seedance-2-5',
    'wan-3.0',
  ]);
  assert.deepEqual(dto.audio.map((row) => row.id), ['seed-audio-1.0']);
  // Text bucket includes implementation-ready models without requiring live history.
  assert.deepEqual(dto.text.map((r) => r.id), [
    'claude-opus-4-6',
    'claude-opus-5',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'gemini-3.1-pro-preview',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'glm-5.3',
    'gpt-5.5',
    'gpt-5.6-sol',
    'grok-4.6',
    'kimi-k3',
    // #1789: the two ASR contracts output text, so both sit in the text bucket by output.type;
    // they are independent rows — seedasr-auc is not folded into doubao-asr-bigmodel.
    'seedasr-auc',
    'doubao-asr-bigmodel',
  ]);
  assert.equal(dto.defaultsByOperation.text_to_speech, 'seed-audio-1.0');
  assert.equal(dto.defaultsByOperation.text_to_video, 'seedance-2-0-fast');
  assert.equal(dto.defaultsByOperation.chat, 'gemini-3.8-flash');
});

test('mergeInputCapability: union roles, min floor, max ceiling, mimes union', () => {
  const cap = mergeInputCapability([
    {
      id: 'vision_chat',
      inputs: [
        { slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 },
        {
          slot: 'reference_images',
          type: 'image',
          role: 'reference',
          min: 0,
          max: 10,
          allowedMimes: ['image/png'],
        },
      ],
    },
    {
      id: 'other',
      inputs: [
        {
          slot: 'first_frame',
          type: 'image',
          role: 'first_frame',
          min: 1,
          max: 1,
          allowedMimes: ['image/jpeg'],
        },
      ],
    },
  ]);
  assert.deepEqual(cap.modalities, ['text', 'image']);
  assert.equal(cap.referenceImages.min, 0);
  assert.equal(cap.referenceImages.max, 10);
  assert.deepEqual(cap.referenceImages.allowedMimeTypes, ['image/png', 'image/jpeg']);
  assert.deepEqual(cap.referenceImages.supportedRoles, ['reference', 'first_frame']);
});

test('projectChatRows: full text directory with brand/role/input derived from ops', () => {
  const index = freshIndex();
  const rows = projectChatRows(index);
  assert.equal(rows.length, 12);
  const gemini = rows.find((r) => r.id === 'gemini-3.7-flash');
  assert.deepEqual([...gemini.input], ['text', 'image', 'video']);
  assert.equal(gemini.brand, 'google');
  assert.equal(gemini.role, 'flagship');
  const flash = rows.find((r) => r.id === 'deepseek-v4-flash');
  assert.equal(flash.role, 'classic');
  // #1751: the renamed canonical row keeps the measured image modality from vision_chat
  assert.ok(flash.input.includes('image'));
  const opus5 = rows.find((r) => r.id === 'claude-opus-5');
  assert.deepEqual([...opus5.input], ['text']);
});

test('projectDirectoryRows: media groups project every contracted model (listed or not)', () => {
  const index = freshIndex();
  assert.equal(projectDirectoryRows(index, 'image').length, 11);
  assert.equal(projectDirectoryRows(index, 'video').length, 11);
  // #1789: seedasr-auc joins the audio management group as its own contracted model.
  assert.equal(projectDirectoryRows(index, 'audio').length, 6);
  // whisper-1 stays in the audio management directory but its output is text
  const audio = projectDirectoryRows(index, 'audio');
  assert.ok(audio.some((r) => r.id === 'whisper-1'));
});

test('fingerprint sensitivity: any slot/MIME/listed change moves the contract fingerprint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omx-specs-'));
  for (const name of readdirSync(DEFAULT_SPECS_DIR)) {
    copyFileSync(join(DEFAULT_SPECS_DIR, name), join(dir, name));
  }
  const base = freshIndex(DEFAULT_SPECS_DIR);
  const baseFp = base.contentFingerprint;

  // widen one slot max in the copy
  const imagePath = join(dir, 'image-models.yaml');
  const yaml = readFileSync(imagePath, 'utf8');
  assert.ok(yaml.includes('max: 4'));
  writeFileSync(imagePath, yaml.replace('max: 4', 'max: 5'));
  const changed = freshIndex(dir);
  assert.notEqual(changed.contentFingerprint, baseFp);

  // listed set differences must also be fingerprint-visible downstream
  assert.notDeepEqual(changed.listedOperations, undefined);
});

test('assertContractHealthy throws on broken specs (fail-closed, no fallback)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omx-broken-'));
  writeFileSync(join(dir, 'broken.yaml'), 'schemaVersion: "1.1"\nmodels: [unclosed\n');
  const index = loadAll(dir, { useCache: false });
  assert.ok(index.parseErrors.length > 0);
  assert.throws(() => assertContractHealthy(index), /parse failure/);
});

test('getHealthyContractIndex returns the healthy on-disk index', () => {
  resetContractCache();
  const index = getHealthyContractIndex();
  assert.equal(index.schemaVersion, '1.1');
  assert.ok(index.get('seedance-2-0-fast'));
});

test('visibleOps only surfaces listed ops', () => {
  const index = freshIndex();
  const seedance = index.get('seedance-2-0-fast');
  assert.deepEqual(
    visibleOps(seedance).map((op) => op.id),
    ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref'],
  );
  assert.equal(projectKindRows(index, 'video').length, 7);
});
