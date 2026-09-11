import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoFillSlots, deriveSlotLayout, hydrateSlotBindings, assembleEffectiveInputsFromSlots, swapNamedSlots, feedFromFingerprint } from './index.ts';
import { buildUpstreamFingerprint } from '../../validation/compatKernel.ts';

const input = (slot, type, role, min = 1, max = 1) => ({ slot, type, role, min, max, source: 'upstream_edge' });
const catalog = { models: [{ id: 'video', operations: [
  { id: 'text_to_video', inputs: [] },
  { id: 'first_frame', inputs: [input('first_frame', 'image', 'first_frame')] },
  { id: 'first_last_frame', inputs: [input('start_frame', 'image', 'first_frame'), input('end_frame', 'image', 'last_frame')] },
  { id: 'video_multi_ref', inputs: [input('reference', 'image', 'reference', 1, 1)] },
  { id: 'digital_human', inputs: [input('character', 'image', 'reference'), input('audio_track', 'audio', 'audio_track')] },
].map((op) => ({ ...op, listed: true, output: { type: 'video' } })) }] };
const layout = (id) => deriveSlotLayout(catalog, 'video', id);
const feed = (id, type = 'image', extra = {}) => ({ edgeId: `e${id}`, sourceNodeId: `s${id}`, outputId: `o${id}`, type, ordinal: id, availability: 'ready', url: `https://fixture.test/${id}.png`, ...extra });
const occupant = (asset, pinned = true) => ({ edgeId: asset.edgeId, sourceNodeId: asset.sourceNodeId, outputId: asset.outputId, pinned });
const assemble = (l, assets, bindings) => assembleEffectiveInputsFromSlots({ layout: l, bindings, feedAssets: assets, conflicts: [], nodeData: {}, incomingText: [] });

for (const [id, preset] of [['text_to_video', 'none'], ['first_frame', 'named'], ['first_last_frame', 'pair'], ['video_multi_ref', 'strip'], ['digital_human', 'named']]) {
  test(`${id} derives ${preset} from catalog`, () => assert.equal(layout(id).preset, preset));
}
test('pair uses real catalog aliases, roles and swap', () => {
  assert.deepEqual(layout('first_last_frame').slots.map((slot) => slot.slot), ['start_frame', 'end_frame']);
  assert.equal(layout('first_last_frame').swap, true);
});
test('missing/unlisted op never invents slots', () => {
  assert.deepEqual(layout('absent').implementationGaps, ['operation_unlisted']);
  assert.equal(layout('absent').slots.length, 0);
});
test('unknown listed layout degrades to strip and keeps null maximum', () => {
  const custom = structuredClone(catalog);
  custom.models[0].operations.push({ id: 'custom', listed: true, output: { type: 'video' }, inputs: [input('videos', 'video', 'source', 0, null)] });
  const l = deriveSlotLayout(custom, 'video', 'custom');
  assert.equal(l.preset, 'strip'); assert.equal(l.slots[0].max, null); assert.ok(l.implementationGaps.includes('missing_layout'));
  assert.equal(autoFillSlots(Array.from({ length: 10 }, (_, i) => feed(i, 'video')), l, {}).bindings.videos.length, 10);
});
test('three supplies with max one keep overflow observable and never submit it', () => {
  const assets = [feed(3), feed(1), feed(2)]; const l = layout('video_multi_ref');
  const fill = autoFillSlots(assets, l, {});
  assert.equal(fill.bindings.reference.length, 1); assert.equal(fill.bindings.reference[0].edgeId, 'e1');
  assert.deepEqual(fill.unusedFeed.map((asset) => asset.edgeId), ['e2', 'e3']);
  const payload = assemble(l, assets, fill.bindings);
  assert.equal(payload.references.length, 1); assert.equal(payload.references[0].edgeId, 'e1');
});
test('none keeps all supply unused, including waiting inputs', () => {
  const assets = [feed(1, 'image', { availability: 'waiting' })]; const l = layout('text_to_video');
  const fill = autoFillSlots(assets, l, {});
  assert.deepEqual(fill.bindings, {}); assert.equal(fill.unusedFeed.length, 1);
  assert.equal(assemble(l, assets, fill.bindings).blockedInputs.length, 0);
});
test('pinned choice beats earlier auto occupant and new feed', () => {
  const assets = [feed(1), feed(2), feed(3)];
  const fill = autoFillSlots(assets, layout('video_multi_ref'), { reference: [occupant(assets[0], false), occupant(assets[2])] });
  assert.equal(fill.bindings.reference[0].edgeId, 'e3'); assert.equal(fill.bindings.reference[0].pinned, true);
});
test('first frame alone leaves tail empty; second source fills tail without reusing first', () => {
  const l = layout('first_last_frame'); const a = feed(1); const b = feed(2);
  const first = autoFillSlots([a], l, {});
  assert.deepEqual(assemble(l, [a], first.bindings).emptyRequiredSlots, ['end_frame']);
  const both = autoFillSlots([a, b], l, first.bindings);
  assert.equal(both.bindings.end_frame[0].edgeId, 'e2');
});
test('swap changes roles without changing edges; same image can occupy two explicit roles', () => {
  const l = layout('first_last_frame'); const assets = [feed(1), feed(2)];
  const filled = autoFillSlots(assets, l, {}).bindings;
  const swapped = swapNamedSlots(filled, 'start_frame', 'end_frame');
  assert.equal(swapped.start_frame[0].edgeId, 'e2'); assert.equal(swapped.end_frame[0].pinned, true);
  assert.equal(filled.start_frame[0].edgeId, 'e1');
  const same = autoFillSlots([assets[0]], l, { start_frame: [occupant(assets[0])], end_frame: [occupant(assets[0])] });
  assert.deepEqual(assemble(l, assets, same.bindings).references.map((ref) => ref.role), ['first_frame', 'last_frame']);
});
test('digital human separates character and audio track, ignoring extra audio', () => {
  const l = layout('digital_human'); const assets = [feed(1), ...Array.from({ length: 10 }, (_, i) => feed(i + 2, 'audio'))];
  const fill = autoFillSlots(assets, l, {}); const payload = assemble(l, assets, fill.bindings);
  assert.equal(payload.references.length, 1); assert.equal(payload.audioTrack.edgeId, 'e2'); assert.equal(payload.unusedFeedEdgeIds.length, 9);
});
test('invalid pinned types and removed slots become conflicts, deleted edges disappear', () => {
  const a = feed(1, 'audio'); const fill = autoFillSlots([a], layout('first_frame'), { first_frame: [occupant(a)], old: [occupant(feed(9))] });
  assert.equal(fill.conflicts[0].reason, 'type_mismatch'); assert.equal(fill.unusedFeed.length, 1);
  const removed = autoFillSlots([a], layout('text_to_video'), { old: [occupant(a)] });
  assert.equal(removed.conflicts[0].reason, 'slot_removed');
});
test('waiting occupied inputs block, optional included inputs cannot be silently skipped', () => {
  const a = feed(1, 'image', { availability: 'waiting' }); const l = layout('first_frame');
  const payload = assemble(l, [a], autoFillSlots([a], l, {}).bindings);
  assert.equal(payload.blockedInputs[0].reason, 'input_waiting'); assert.equal(payload.references.length, 0);
});
test('MIME mismatch stays feed; unknown MIME is not treated as unsupported', () => {
  const l = layout('first_frame'); l.slots[0].allowedMimes = ['image/png'];
  assert.equal(autoFillSlots([feed(1, 'image', { mimeType: 'image/gif' })], l, {}).unusedFeed.length, 1);
  assert.equal(autoFillSlots([feed(1)], l, {}).bindings.first_frame.length, 1);
});
test('legacy edge mirrors hydrate in role order without mutating graph', () => {
  const assets = [feed(1), feed(2)]; const l = layout('first_last_frame');
  const edges = [{ id: 'e1', source: 's1', data: { slotBinding: { slot: 'end_frame' } } }, { id: 'e2', source: 's2' }];
  const before = structuredClone(edges); const fill = hydrateSlotBindings(assets, l, edges);
  assert.equal(fill.bindings.end_frame[0].edgeId, 'e1'); assert.equal(fill.bindings.end_frame[0].pinned, false);
  assert.deepEqual(edges, before);
});
test('legacy type mismatch remains an explicit conflict rather than guessing another role', () => {
  const a = feed(1, 'audio');
  const fill = hydrateSlotBindings([a], layout('first_frame'), [{ id: 'e1', source: 's1', data: { targetSlot: 'first_frame' } }]);
  assert.equal(fill.conflicts[0].reason, 'type_mismatch');
});
test('same source and result deduplicate by role, not path or supply-edge id', () => {
  const a = feed(1); const duplicate = { ...a, edgeId: 'duplicate' }; const b = feed(2, 'image', { url: a.url });
  const l = layout('video_multi_ref'); l.slots[0].max = 4;
  const fill = autoFillSlots([a, duplicate, b], l, {});
  assert.equal(fill.bindings.reference.length, 2);
  const duplicatePin = autoFillSlots([a, duplicate], layout('first_frame'), { first_frame: [occupant(a), occupant(duplicate)] });
  assert.equal(duplicatePin.bindings.first_frame.length, 1); assert.deepEqual(duplicatePin.conflicts, []);
  const refs = assemble(l, [a, duplicate, b], { reference: [occupant(a), occupant(duplicate), occupant(b)] }).references;
  assert.deepEqual(refs.map((ref) => ref.sourceNodeId), ['s1', 's2']);
  const pair = autoFillSlots([a], layout('first_last_frame'), { start_frame: [occupant(a, false)], end_frame: [occupant(a, false)] });
  assert.equal(pair.bindings.end_frame.length, 0, 'automatic duplicates cannot imply same-image first/last');
});
test('fallback edge identity preserves ordinal among text and media inputs', () => {
  const fp = buildUpstreamFingerprint({ assets: [{ sourceNodeId: 'text', type: 'text' }, { sourceNodeId: 'image', type: 'image' }] });
  assert.equal(feedFromFingerprint(fp)[0].edgeId, 'feed-image-1');
});
test('snapshot is detached and refreshes selected output rather than stale occupant output', () => {
  const assets = [feed(1)]; const l = layout('first_frame'); const explicit = { first_frame: [occupant(assets[0])] };
  assets[0].outputId = 'new-output';
  const fill = autoFillSlots(assets, l, explicit); const snapshot = assemble(l, assets, fill.bindings);
  assert.equal(fill.bindings.first_frame[0].outputId, 'new-output');
  assets[0].url = 'https://fixture.test/changed.png'; explicit.first_frame[0].sourceNodeId = 'changed';
  assert.equal(snapshot.references[0].pathOrUrl, 'https://fixture.test/1.png'); assert.equal(fill.bindings.first_frame[0].sourceNodeId, 's1');
});
test('image operations derive strip preset and have addButton enabled', () => {
  const imgCatalog = {
    models: [{
      id: 'nanobanana-2',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
        { id: 'image_to_image', listed: true, output: { type: 'image' }, inputs: [input('reference_image', 'image', 'reference', 0, 5)] },
        { id: 'multi_reference', listed: true, output: { type: 'image' }, inputs: [input('reference', 'image', 'reference', 0, 10)] },
      ],
    }],
  };
  for (const opId of ['text_to_image', 'image_to_image', 'multi_reference']) {
    const l = deriveSlotLayout(imgCatalog, 'nanobanana-2', opId, 'image');
    assert.equal(l.preset, 'strip');
    assert.equal(l.addButton, true);
    assert.ok(l.slots.length > 0);
  }
});
test('image node slotLayout defaults to strip with reference_image slot even when operation is unlisted or has no inputs', () => {
  const imgCatalog = {
    models: [{
      id: 'gpt-image-2',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
      ],
    }],
  };
  const l1 = deriveSlotLayout(imgCatalog, 'gpt-image-2', 'text_to_image', 'image');
  assert.equal(l1.preset, 'strip');
  assert.equal(l1.addButton, true);
  assert.equal(l1.slots.length, 1);
  assert.equal(l1.slots[0].slot, 'reference_image');
  assert.equal(l1.slots[0].role, 'reference');
  assert.equal(l1.slots[0].type, 'image');
  assert.equal(l1.slots[0].min, 0);
  assert.equal(l1.slots[0].max, 10);

  const l2 = deriveSlotLayout(imgCatalog, 'gpt-image-2', 'absent_op', 'image');
  assert.equal(l2.preset, 'strip');
  assert.equal(l2.addButton, true);
  assert.equal(l2.slots.length, 1);
  assert.equal(l2.slots[0].slot, 'reference_image');

  const l3 = deriveSlotLayout(imgCatalog, 'gpt-image-2', undefined, 'image');
  assert.equal(l3.preset, 'strip');
  assert.equal(l3.addButton, true);
  assert.equal(l3.slots.length, 1);
  assert.equal(l3.slots[0].slot, 'reference_image');
});
test('image slot name aliases match reference, references, input_image and input_images', () => {
  const customCatalog = {
    models: [{
      id: 'test-model',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [input('input_images', 'image', 'reference', 0, 4)] },
      ],
    }],
  };
  const l = deriveSlotLayout(customCatalog, 'test-model', 'text_to_image', 'image');
  assert.equal(l.preset, 'strip');
  assert.equal(l.slots.length, 1);
  assert.equal(l.slots[0].slot, 'input_images');
});
test('Issue #763: text_to_speech derives strip preset with reference_audio slot and addButton', () => {
  const ttsCatalog = {
    models: [{
      id: 'seed-audio-1.0',
      operations: [
        { id: 'text_to_speech', listed: true, output: { type: 'audio' }, inputs: [input('reference_audio', 'audio', 'reference', 0, 5)] },
      ],
    }],
  };
  const l = deriveSlotLayout(ttsCatalog, 'seed-audio-1.0', 'text_to_speech', 'audio');
  assert.equal(l.preset, 'strip');
  assert.equal(l.addButton, true);
  assert.equal(l.slots.length, 1);
  assert.equal(l.slots[0].slot, 'reference_audio');
  assert.equal(l.slots[0].type, 'audio');
  assert.equal(l.slots[0].min, 0);
  assert.equal(l.slots[0].max, 5);
  assert.equal(l.slots[0].labelKey, 'panel.slot.reference_audio');
});
test('Issue #763: reference_audio aliases match reference, references, input_audio, audio_track and audio', () => {
  for (const slotName of ['reference', 'references', 'input_audio', 'audio_track', 'audio']) {
    const customCatalog = {
      models: [{
        id: 'tts-model',
        operations: [
          { id: 'text_to_speech', listed: true, output: { type: 'audio' }, inputs: [input(slotName, 'audio', 'reference', 0, 3)] },
        ],
      }],
    };
    const l = deriveSlotLayout(customCatalog, 'tts-model', 'text_to_speech', 'audio');
    assert.equal(l.preset, 'strip', `${slotName} 应派生 strip 预设`);
    assert.equal(l.slots.length, 1, `${slotName} 应命中卡槽`);
    assert.equal(l.slots[0].slot, slotName);
  }
});

test('text multimodal model derives strip preset with reference_images and reference_videos even when op is chat', () => {
  const textMultimodalCatalog = {
    models: [{
      id: 'gemini-3.8-flash',
      operations: [
        { id: 'chat', listed: true, output: { type: 'text' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }] },
        {
          id: 'vision_chat',
          listed: true,
          output: { type: 'text' },
          inputs: [
            { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' },
            input('reference_images', 'image', 'reference', 0, 10),
            input('reference_videos', 'video', 'reference', 0, 3),
          ],
        },
      ],
    }],
  };
  // 当当前操作为默认 chat 时
  const chatLayout = deriveSlotLayout(textMultimodalCatalog, 'gemini-3.8-flash', 'chat', 'text');
  assert.equal(chatLayout.preset, 'strip');
  assert.equal(chatLayout.addButton, true);
  assert.equal(chatLayout.slots.length, 2);
  assert.equal(chatLayout.slots[0].slot, 'reference_images');
  assert.equal(chatLayout.slots[0].type, 'image');
  assert.equal(chatLayout.slots[0].max, 10);
  assert.equal(chatLayout.slots[0].labelKey, 'panel.slot.reference_images');
  assert.equal(chatLayout.slots[1].slot, 'reference_videos');
  assert.equal(chatLayout.slots[1].type, 'video');
  assert.equal(chatLayout.slots[1].max, 3);
  assert.equal(chatLayout.slots[1].labelKey, 'panel.slot.reference_videos');

  // 当当前操作为 vision_chat 时
  const visionLayout = deriveSlotLayout(textMultimodalCatalog, 'gemini-3.8-flash', 'vision_chat', 'text');
  assert.equal(visionLayout.preset, 'strip');
  assert.equal(visionLayout.addButton, true);
  assert.equal(visionLayout.slots.length, 2);
  assert.equal(visionLayout.slots[0].slot, 'reference_images');
  assert.equal(visionLayout.slots[1].slot, 'reference_videos');
});

test('pure text model derives none preset with empty slots', () => {
  const pureTextCatalog = {
    models: [{
      id: 'deepseek-v4-pro',
      operations: [
        { id: 'chat', listed: true, output: { type: 'text' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }] },
      ],
    }],
  };
  const l = deriveSlotLayout(pureTextCatalog, 'deepseek-v4-pro', 'chat', 'text');
  assert.equal(l.preset, 'none');
  assert.equal(l.slots.length, 0);
  assert.equal(l.addButton, false);
});

test('reference_images and reference_videos aliases match expected variants', () => {
  for (const slotName of ['reference_image', 'reference', 'references', 'input_images']) {
    const customCatalog = {
      models: [{
        id: 'text-vision',
        operations: [
          { id: 'vision_chat', listed: true, output: { type: 'text' }, inputs: [input(slotName, 'image', 'reference', 0, 5)] },
        ],
      }],
    };
    const l = deriveSlotLayout(customCatalog, 'text-vision', 'vision_chat', 'text');
    assert.equal(l.preset, 'strip');
    assert.equal(l.slots.length, 1);
    assert.equal(l.slots[0].slot, slotName);
  }

  for (const slotName of ['reference_video', 'reference', 'references', 'input_videos']) {
    const customCatalog = {
      models: [{
        id: 'text-video',
        operations: [
          { id: 'vision_chat', listed: true, output: { type: 'text' }, inputs: [input(slotName, 'video', 'reference', 0, 3)] },
        ],
      }],
    };
    const l = deriveSlotLayout(customCatalog, 'text-video', 'vision_chat', 'text');
    assert.equal(l.preset, 'strip');
    assert.equal(l.slots.length, 1);
    assert.equal(l.slots[0].slot, slotName);
  }
});

test('Issue #1104: 卡槽装填过滤 — 不支持格式与超量素材不进入卡槽，仅展示非空就绪素材', () => {
  // 1. 首帧模式卡槽（仅支持 1 张图片）
  const firstFrameLayout = layout('first_frame');
  const imageReady = { ...feed(1, 'image'), availability: 'ready', url: 'https://test.com/frame.png' };
  const imageExtra = { ...feed(2, 'image'), availability: 'ready', url: 'https://test.com/extra.png' };
  const videoFeed = { ...feed(3, 'video'), availability: 'ready', url: 'https://test.com/video.mp4' };

  // 连入 2 张图片和 1 个视频：卡槽只接受第 1 张图片，超量图片与视频不进入卡槽
  const fillFirstFrame = autoFillSlots([imageReady, imageExtra, videoFeed], firstFrameLayout, {});
  assert.equal(fillFirstFrame.bindings.first_frame.length, 1, '首帧卡槽仅应装填 1 张图片');
  assert.equal(fillFirstFrame.bindings.first_frame[0].sourceNodeId, 's1');
  assert.equal(fillFirstFrame.unusedFeed.length, 2, '超量图片与不匹配视频应保留在未消费池（Feed）');

  // 2. 全能参考卡槽（支持图片）
  const multiRefLayout = layout('video_multi_ref');
  const fillMultiRef = autoFillSlots([imageReady, imageExtra, videoFeed], multiRefLayout, {});
  assert.equal(fillMultiRef.bindings.reference.length, 1, '满足容量上限的图片进入参考卡槽');
  assert.equal(fillMultiRef.unusedFeed.length, 2, '超量与不匹配格式保留在 Feed');
});
