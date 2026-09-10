import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAll,
  resetContractCache,
  getModelContract,
  verifyContracts,
  DEFAULT_SPECS_DIR,
} from './contract/index.js';
import { loadDispositions, forbiddenListedIds } from './contract/dispositions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = join(__dirname, 'specs');

const PHASE_ONE_VIDEO_OPERATIONS = {
  'seedance-2-0': ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref'],
  'seedance-2-0-fast': ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref'],
  'seedance-2-0-mini': ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref'],
  'seedance-2-5': ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref', 'video_edit', 'video_extend'],
  'wan-3.0': ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref', 'document_to_video', 'webpage_to_video'],
  'minimax-h3': ['text_to_video', 'first_frame', 'end_frame', 'first_last_frame', 'video_multi_ref'],
  'grok-imagine-video-1-5': ['text_to_video', 'video_multi_ref'],
  'minimax-h3-max': ['text_to_video', 'first_frame', 'end_frame', 'first_last_frame', 'video_multi_ref'],
  'minimax-h3-max-turbo': ['text_to_video', 'first_frame', 'end_frame', 'first_last_frame'],
};

test('MCC 契约门禁: 视频模型能力声明文件完备性（contract loader）', () => {
  resetContractCache();
  const index = loadAll(SPECS_DIR, { useCache: false });
  assert.equal((index.parseErrors ?? []).length, 0);

  const videoModels = index.all().filter((m) => m.managementGroup === 'video');
  assert.ok(videoModels.length >= 6, '必须至少声明主流视频模型');

  // 断言 Kling Avatar 纯数字人绝无首尾帧
  const avatar = index.get('kling-avatar') ?? getModelContract('kling-avatar', SPECS_DIR);
  assert.ok(avatar, '必须声明 kling-avatar 数字人');
  const avatarOps = avatar.operations.map((m) => m.id);
  assert.ok(avatarOps.includes('digital_human'), '数字人必须包含 digital_human 模式');
  assert.ok(!avatarOps.includes('first_last_frame'), '数字人严禁包含首尾帧模式');
  assert.equal(avatar.listed, false);
  assert.equal(avatar.operations[0].listed, false);

  for (const [modelId, expected] of Object.entries(PHASE_ONE_VIDEO_OPERATIONS)) {
    const model = index.get(modelId);
    assert.ok(model, `必须声明 ${modelId}`);
    assert.deepEqual(model.operations.map((operation) => operation.id), expected, modelId);
  }
});

test('H2: 处置表 71 行 + implementation-ready 集合与处置一致', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  assert.equal(index.schemaVersion, '1.1');

  const doc = loadDispositions();
  assert.equal(doc.dispositions.length, 71);
  const byId = new Map(doc.dispositions.map((r) => [r.id, r]));
  const forbidden = forbiddenListedIds(doc);

  for (const model of index.all()) {
    const row = byId.get(model.id);
    assert.ok(row, `model ${model.id} must have a disposition row`);
    if (forbidden.has(model.id)) {
      assert.deepEqual(model.listedOperations ?? [], [], `${model.id} must not list (disposition ${row.disposition})`);
    }
    for (const op of model.operations) {
      const documentedAndReady = op.research.status === 'verified' && op.implementation.status === 'ready';
      if (documentedAndReady) {
        assert.equal(op.listed, true, `${model.id}#${op.id} documented+ready should be listed`);
        assert.ok(op.research.docUrl, `${model.id}#${op.id} verified requires docUrl`);
        assert.ok(op.research.verifiedAt, `${model.id}#${op.id} verified requires verifiedAt`);
      }
    }
  }

  assert.equal(index.listedOperations.length, 65);
  assert.ok(index.listedOperations.includes('doubao-asr-bigmodel#speech_to_text'));
  for (const [modelId, operations] of Object.entries(PHASE_ONE_VIDEO_OPERATIONS)) {
    for (const operation of operations) {
      assert.ok(index.listedOperations.includes(`${modelId}#${operation}`), `${modelId}#${operation}`);
    }
  }
  assert.ok(!index.listedOperations.includes('gpt-image-2#multi_reference'));
  assert.ok(index.listedOperations.includes('seed-audio-1.0#text_to_speech'));
  // Existing draft audio models remain unlisted.
  assert.ok(!index.listedOperations.some((key) => key.startsWith('suno#')));
  assert.ok(!index.listedOperations.some((key) => key.startsWith('whisper-1#')));
  assert.ok(!index.listedOperations.some((key) => key.startsWith('kling-avatar#')));
  assert.ok(index.listedOperations.includes('minimax-h3#end_frame'));
  assert.ok(!index.listedOperations.some((key) => key.startsWith('minimax-h3-endframe#')));

  const report = verifyContracts({ strict: true });
  assert.equal(report.ok, true, JSON.stringify(report.issues.filter((i) => i.level === 'error'), null, 2));
  assert.equal(report.schemaVersion, '1.1');
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'version'), false);
  assert.ok(report.listedOperations.length > 0);
  assert.equal(report.dispositions.total, 71);
  assert.deepEqual(report.dispositions.unresolvedDispositions, []);
});

test('phase-one limits come from APIMart docs; unpublished limits stay unknown', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });

  const grokVideo = index.get('grok-imagine-video-1-5');
  const grokMultiRef = grokVideo.operations.find((op) => op.id === 'video_multi_ref');
  const grokRefSlot = grokMultiRef.inputs.find((s) => s.type === 'image');
  assert.equal(grokRefSlot.max, null, 'Grok 官方未公布参考图数量上限');

  const fast = index.get('seedance-2-0-fast');
  const fastMulti = fast.operations.find((op) => op.id === 'video_multi_ref');
  const fastSlot = fastMulti.inputs.find((s) => s.type === 'image');
  assert.equal(fastSlot.max, 9, 'Seedance 2.0 Fast 使用 APIMart 官方图片上限');
  assert.equal(fastSlot.limitSource?.kind, 'official_docs');

  const s25 = index.get('seedance-2-5');
  const s25Multi = s25.operations.find((op) => op.id === 'video_multi_ref');
  const s25Slot = s25Multi.inputs.find((s) => s.type === 'image');
  assert.equal(s25Slot.max, 30, 'Seedance 2.5 使用 APIMart 官方图片上限');
  assert.equal(s25Slot.limitSource?.kind, 'official_docs');

  const wan = index.get('wan-3.0');
  const wanMulti = wan.operations.find((op) => op.id === 'video_multi_ref');
  const wanImageSlot = wanMulti.inputs.find((s) => s.slot === 'reference_images');
  const wanVideoSlot = wanMulti.inputs.find((s) => s.slot === 'reference_videos');
  assert.equal(wanImageSlot.max, 10, 'Wan 3.0 使用 APIMart 官方参考图上限');
  assert.equal(wanVideoSlot.combinedOutputMaxDurationSec, 30);
  assert.equal(wanImageSlot.limitSource?.kind, 'official_docs');
});

test('real specs load via DEFAULT_SPECS_DIR with canonical schemaVersion', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  assert.equal(index.schemaVersion, '1.1');
  assert.ok(index.get('kling-v3'));
  assert.ok(index.get('suno'));
  assert.ok(index.get('gpt-image-2'));
  assert.ok(index.get('whisper-1'));
  // extra ghost ids deleted
  assert.equal(index.get('deepseek-v3'), undefined);
  assert.equal(index.get('deepseek-r1'), undefined);
  assert.equal(index.get('gpt-4o'), undefined);
});
