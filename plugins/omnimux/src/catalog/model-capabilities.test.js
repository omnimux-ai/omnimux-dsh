import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAll,
  resetContractCache,
  verifyContracts,
  DEFAULT_SPECS_DIR,
} from './contract/index.js';
import { loadDispositions, forbiddenListedIds } from './contract/dispositions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = join(__dirname, 'specs');

const PHASE_ONE_VIDEO_OPERATIONS = {
  'seedance-2-0': ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref'],
  'seedance-2-5': ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref', 'video_edit', 'video_extend'],
  'minimax-h3': ['text_to_video', 'first_frame', 'end_frame', 'first_last_frame', 'video_multi_ref', 'digital_human'],
};

test('MCC 契约门禁: 视频模型能力声明文件完备性（contract loader）', () => {
  resetContractCache();
  const index = loadAll(SPECS_DIR, { useCache: false });
  assert.equal((index.parseErrors ?? []).length, 0);

  const videoModels = index.all().filter((m) => m.managementGroup === 'video');
  assert.ok(videoModels.length >= 6, '必须至少声明主流视频模型');
  // #1751：数字人 kling-avatar 整款撤架后，video 目录收敛为 11 款合约型号
  // #3209：google-vids-omni（本机 vids2api 通道）下线、契约行删除 → 11
  assert.equal(videoModels.length, 11);

  for (const [modelId, expected] of Object.entries(PHASE_ONE_VIDEO_OPERATIONS)) {
    const model = index.get(modelId);
    assert.ok(model, `必须声明 ${modelId}`);
    assert.deepEqual(model.operations.map((operation) => operation.id), expected, modelId);
  }
});

test('H2: 处置表 67 行 + implementation-ready 集合与处置一致', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  assert.equal(index.schemaVersion, '1.1');

  const doc = loadDispositions();
  assert.equal(doc.dispositions.length, 67); // P1b：13 条 unavailable + 3 条 draft 行删除 → 67
  const byId = new Map(doc.dispositions.map((r) => [r.id, r]));
  const forbidden = forbiddenListedIds(doc);
  // P1b：13 条墓碑行与 3 条 draft 行已删除，禁止 listed 集合为空。
  assert.equal(forbidden.size, 0);
  for (const id of forbidden) assert.equal(index.get(id), undefined, id);

  for (const model of index.all()) {
    const row = byId.get(model.id);
    // P1b: only ids that expose a listed operation need a disposition row; the three
    // withdrawn draft ids stay contracted but can never be offered.
    if (!row) {
      assert.deepEqual(model.listedOperations ?? [], [], `${model.id} has no disposition row, so it must not list`);
      continue;
    }
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

  // 2026-10-21 网关对账 #3516：上架面收敛为 9 模型 / 24 operation。
  assert.equal(index.listedOperations.length, 24);
  assert.equal(index.listedOperations.includes('doubao-asr-bigmodel#speech_to_text'), false);
  // #3516：minimax-h3 上游渠道停用，全部 operation 仅登记不上架；seedance 系列保持上架。
  for (const [modelId, operations] of Object.entries(PHASE_ONE_VIDEO_OPERATIONS)) {
    const delisted = modelId === 'minimax-h3';
    for (const operation of operations) {
      const key = `${modelId}#${operation}`;
      // 契约行必须仍在（unlisted ≠ deleted），只改变上架状态。
      assert.ok(index.get(modelId).operations.some((op) => op.id === operation), key);
      assert.equal(index.listedOperations.includes(key), !delisted, key);
    }
  }
  // gpt-image-2.5 的 multi_reference 已于 2026-10-05 真机出图验证通过并上架（#3138）
  assert.ok(index.listedOperations.includes('gpt-image-2.5#multi_reference'));
  assert.ok(index.listedOperations.includes('gpt-image-2.5#text_to_image'));
  // #3516：flare 与 sunburst 上游渠道停用 → 转为仅登记不上架。
  assert.equal(index.listedOperations.includes('gpt-image-2.5-flare#text_to_image'), false);
  // 对照：契约行的 research/implementation 仍可查询（unlisted ≠ deleted）。
  assert.equal(index.get('gpt-image-2.5-flare').operations[0].listed, false);
  assert.equal(index.listedOperations.includes('gpt-image-2.5-sunburst#text_to_image'), false);
  // #3516：TTS 渠道停用；语音识别改由 whisper-1 上架，suno 上架音乐生成。
  assert.equal(index.listedOperations.includes('seed-audio-1.0#text_to_speech'), false);
  assert.ok(index.listedOperations.includes('whisper-1#speech_to_text'));
  assert.ok(index.listedOperations.includes('suno#text_to_music'));
  assert.ok(!index.listedOperations.some((key) => key.startsWith('kling-avatar#')));
  assert.equal(index.listedOperations.includes('minimax-h3#end_frame'), false);
  assert.ok(!index.listedOperations.some((key) => key.startsWith('minimax-h3-endframe#')));

  const report = verifyContracts({ strict: true });
  assert.equal(report.ok, true, JSON.stringify(report.issues.filter((i) => i.level === 'error'), null, 2));
  assert.equal(report.schemaVersion, '1.1');
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'version'), false);
  assert.ok(report.listedOperations.length > 0);
  assert.equal(report.dispositions.total, 67); // P1b：13 条 unavailable + 3 条 draft 行删除 → 67
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
  assert.ok(index.get('gpt-image-2.5'));
  // #1751：gpt-image-2 整款撤架（unavailable），YAML 行不再存在
  assert.equal(index.get('gpt-image-2'), undefined);
  // #1751：高清别名行 gpt-image-2-hd / gpt-image2-hd 一并删除，旧写法不再归一
  assert.equal(index.get('gpt-image-2.5-hd')?.aliases, undefined);
  assert.ok(index.get('whisper-1'));
  // extra ghost ids deleted
  assert.equal(index.get('deepseek-v3'), undefined);
  assert.equal(index.get('deepseek-r1'), undefined);
  assert.equal(index.get('gpt-4o'), undefined);
});
