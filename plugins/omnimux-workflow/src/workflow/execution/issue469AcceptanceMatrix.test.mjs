import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { createOmnimuxSeamClient } from '../seam/omnimuxGateway.ts';
import { createMockGateway } from '../seam/mockGateway.ts';
import { resolveCanvasSubmission, resolveExecutorSubmission } from '../seam/submitGuard.ts';
import { catalogFor, operation, slot } from '../seam/submissionFixtures.mjs';

const root = mkdtempSync(join(tmpdir(), 'qa-issue-469-matrix-'));
after(() => rmSync(root, { recursive: true, force: true }));

const context = (overrides = {}) => ({
  upstreamOutputs: new Map(),
  mediaDir: root,
  signal: new AbortController().signal,
  ...overrides,
});

const node = (type = 'video', params = {}) => ({
  id: 'target-node',
  type: 'material',
  data: { materialType: type, prompt: 'default prompt', params },
});

function createCountingGateway(catalog, result = { url: 'https://example.test/output.mp4', type: 'video' }) {
  let submitCalls = 0;
  let awaitCalls = 0;
  const requests = [];
  return {
    requests,
    get submitCalls() { return submitCalls; },
    get awaitCalls() { return awaitCalls; },
    capabilities: async () => catalog,
    submit: async (req) => {
      submitCalls++;
      requests.push(req);
      return { taskId: 'task-123', mode: 'submitted' };
    },
    awaitTask: async () => {
      awaitCalls++;
      return result;
    },
  };
}

describe('Issue #469 QA Acceptance Matrix Verification', () => {

  // ==========================================================================
  // TC-01: Operation 缺失与隐式补齐
  // ==========================================================================
  describe('TC-01: Operation 缺失与隐式补齐', () => {
    it('新建节点未显式指定 operation 时，能从唯一 canonical operation 自动隐式补齐', async () => {
      const singleOpCatalog = catalogFor('video', 'single-video-model', [
        operation('canonical_video', 'video', [slot('image', 'first_frame', 0, 1, 'start_frame')]),
      ]);
      const gw = createCountingGateway(singleOpCatalog);
      const executor = createMaterialGatewayExecutor({ gateway: gw });

      const n = node('video', { model: 'single-video-model' }); // operation omitted
      await executor.execute(n, context());

      assert.equal(gw.submitCalls, 1);
      assert.equal(gw.requests[0].operation, 'canonical_video');
    });

    it('多生成方式产生歧义时，若未指定 operation 则 fail-fast 拦截，底层 seam 调用次数为 0', async () => {
      const multiOpCatalog = catalogFor('video', 'multi-model', [
        operation('text_to_video', 'video', [], true),
        operation('first_last_frame', 'video', [
          slot('image', 'first_frame', 1, 1, 'start_frame'),
          slot('image', 'last_frame', 1, 1, 'end_frame'),
        ], false),
      ]);
      const gw = createCountingGateway(multiOpCatalog);
      const executor = createMaterialGatewayExecutor({ gateway: gw });

      const n = node('video', { model: 'multi-model' }); // operation omitted, ambiguous!
      await assert.rejects(
        executor.execute(n, context()),
        (err) => err.code === 'operation-required' || /请选择生成方式/.test(err.message),
      );

      assert.equal(gw.submitCalls, 0, 'seam calls must be 0 on ambiguous operation');
    });

    it('指定非法或未列出 (unlisted) 的 operation 时 fail-fast 拦截，底层 seam 调用次数为 0', async () => {
      const catalog = catalogFor('video', 'vid-model', [
        operation('valid_op', 'video'),
        { ...operation('draft_op', 'video'), listed: false },
      ]);
      const gw = createCountingGateway(catalog);
      const executor = createMaterialGatewayExecutor({ gateway: gw });

      for (const badOp of ['draft_op', 'non_existent_op']) {
        const n = node('video', { model: 'vid-model', operation: badOp });
        await assert.rejects(
          executor.execute(n, context()),
          (err) => err.code === 'operation-not-allowed' || /不支持所选生成方式/.test(err.message),
        );
      }

      assert.equal(gw.submitCalls, 0, 'seam calls must be 0 on invalid/unlisted operation');
    });
  });

  // ==========================================================================
  // TC-02: 连线 Slot Assignment 保持
  // ==========================================================================
  describe('TC-02: 连线 Slot Assignment 保持', () => {
    it('首帧、尾帧、参考图即便来自同一节点，正确附带 targetSlot 与 role，不折叠为通用 reference', async () => {
      const catalog = catalogFor('video', 'anim-model', [
        operation('interpolate', 'video', [
          slot('image', 'first_frame', 1, 1, 'start_frame'),
          slot('image', 'last_frame', 1, 1, 'end_frame'),
          slot('image', 'reference', 1, 1, 'ref_image'),
        ]),
      ]);
      const gw = createCountingGateway(catalog);
      const executor = createMaterialGatewayExecutor({ gateway: gw });

      const sharedImage = {
        mediaAssets: [{ type: 'image', url: 'https://example.test/pic.png', mimeType: 'image/png', sizeBytes: 100 }],
      };

      const upstreamBindings = [
        { sourceNodeId: 'node-img-src', edgeId: 'edge-first', role: 'first_frame', targetSlot: 'start_frame', output: sharedImage },
        { sourceNodeId: 'node-img-src', edgeId: 'edge-last', role: 'last_frame', targetSlot: 'end_frame', output: sharedImage },
        { sourceNodeId: 'node-img-src', edgeId: 'edge-ref', role: 'reference', targetSlot: 'ref_image', output: sharedImage },
      ];

      const n = node('video', { model: 'anim-model', operation: 'interpolate' });
      await executor.execute(n, context({ upstreamBindings }));

      assert.equal(gw.submitCalls, 1);
      const refs = gw.requests[0].references;
      assert.equal(refs.length, 3, 'Must retain all 3 bindings, no deduplication across different roles/slots');

      const firstRef = refs.find((r) => r.role === 'first_frame');
      const lastRef = refs.find((r) => r.role === 'last_frame');
      const refImage = refs.find((r) => r.role === 'reference');

      assert.ok(firstRef && firstRef.targetSlot === 'start_frame');
      assert.ok(lastRef && lastRef.targetSlot === 'end_frame');
      assert.ok(refImage && refImage.targetSlot === 'ref_image');
    });

    it('只有 targetSlot 未显式指定 role 时，根据 catalog slot 定义自动绑定 role 而不盲目转为 generic reference', async () => {
      const catalog = catalogFor('video', 'vid-model', [
        operation('slot_op', 'video', [
          slot('image', 'first_frame', 1, 1, 'start_frame'),
        ]),
      ]);
      const gw = createCountingGateway(catalog);
      const executor = createMaterialGatewayExecutor({ gateway: gw });

      const upstreamBindings = [
        {
          sourceNodeId: 'src-1',
          edgeId: 'e-1',
          targetSlot: 'start_frame', // role omitted!
          output: { mediaAssets: [{ type: 'image', url: 'https://example.test/first.png' }] },
        },
      ];

      const n = node('video', { model: 'vid-model', operation: 'slot_op' });
      await executor.execute(n, context({ upstreamBindings }));

      assert.equal(gw.submitCalls, 1);
      const ref = gw.requests[0].references[0];
      assert.equal(ref.targetSlot, 'start_frame');
      assert.equal(ref.role, 'first_frame', 'Bound role must be first_frame, not coerced reference');
    });
  });

  // ==========================================================================
  // TC-03: 素材元数据全链路透传
  // ==========================================================================
  describe('TC-03: 素材元数据全链路透传', () => {
    it('上游来源 metadata (mimeType, sizeBytes, durationSec, sourceNodeId, edgeId) 全链路透传无丢失', async () => {
      const catalog = catalogFor('video', 'meta-model', [
        operation('meta_op', 'video', [
          slot('video', 'reference', 1, 1, 'ref_video'),
        ]),
      ]);
      const gw = createCountingGateway(catalog);
      const executor = createMaterialGatewayExecutor({ gateway: gw });

      const videoAsset = {
        mediaAssets: [{
          type: 'video',
          url: 'https://example.test/in.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 999999,
          durationSec: 12.34,
        }],
      };

      const upstreamBindings = [
        {
          sourceNodeId: 'video-source-node',
          edgeId: 'video-edge-101',
          role: 'reference',
          targetSlot: 'ref_video',
          output: videoAsset,
        },
      ];

      const n = node('video', { model: 'meta-model', operation: 'meta_op' });
      await executor.execute(n, context({ upstreamBindings }));

      assert.equal(gw.submitCalls, 1);
      const ref = gw.requests[0].references[0];
      assert.equal(ref.sourceNodeId, 'video-source-node');
      assert.equal(ref.edgeId, 'video-edge-101');
      assert.equal(ref.mimeType, 'video/mp4');
      assert.equal(ref.sizeBytes, 999999);
      assert.equal(ref.durationSec, 12.34);
    });

    it('产物 mediaAssets 保持实际结果的 durationSec 与 sizeBytes，绝不被 request hint (如 params.duration) 污染', async () => {
      const catalog = catalogFor('video', 'dur-model', [operation('v_op', 'video')]);
      const settledResult = {
        type: 'video',
        url: 'https://example.test/out.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1234567,
        durationSec: 6.0,
      };
      const gw = createCountingGateway(catalog, settledResult);
      const executor = createMaterialGatewayExecutor({ gateway: gw });

      const n = node('video', { model: 'dur-model', operation: 'v_op', duration: 30 }); // hint duration: 30
      const output = await executor.execute(n, context());

      assert.equal(output.mediaAssets[0].durationSec, 6.0, 'Must be measured output duration (6.0), not request hint (30)');
      assert.equal(output.mediaAssets[0].sizeBytes, 1234567);
      assert.equal(output.mediaAssets[0].mimeType, 'video/mp4');
    });
  });

  // ==========================================================================
  // TC-04: Seam 前 Fail-Fast 拦截
  // ==========================================================================
  describe('TC-04: Seam 前 Fail-Fast 拦截', () => {
    it('缺少必需素材、缺少必需 prompt、不兼容格式时，在 seam 调用前全部阻断，调用次数为 0', async () => {
      let seamCalls = 0;
      const limitedCatalog = catalogFor('video', 'seedance-2-0-fast', [
        operation('strict_op', 'video', [
          {
            ...slot('video', 'reference', 1, 1, 'ref_video'),
            allowedMimes: ['video/mp4'],
            maxSizeMb: 5,
            maxDurationSec: 10,
          },
        ], true),
      ]);

      const client = createOmnimuxSeamClient({
        getSeam: (name) => {
          if (name === 'modelCatalog') return { list: () => limitedCatalog };
          if (name === 'videoGenerate') {
            return {
              execute: async () => {
                seamCalls++;
                return { mode: 'submitted', taskId: 'bad' };
              },
            };
          }
          return undefined;
        },
      });

      const baseReq = {
        capability: 'video',
        model: 'seedance-2-0-fast',
        operation: 'strict_op',
        dest: join(root, 'out.mp4'),
      };

      const validRef = {
        type: 'video',
        role: 'reference',
        targetSlot: 'ref_video',
        pathOrUrl: 'https://example.test/in.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024,
        durationSec: 3,
      };

      const cases = [
        // 1. 缺少 prompt (素材齐全但 prompt 为空)
        { req: { ...baseReq, prompt: '   ', references: [validRef] }, code: 'prompt_required' },
        // 2. 缺少必需素材 (prompt 满足但无素材)
        { req: { ...baseReq, prompt: 'valid' }, code: 'min_unsatisfied' },
        // 3. 不兼容的素材类型
        {
          req: {
            ...baseReq,
            prompt: 'valid',
            references: [{ type: 'document', pathOrUrl: 'https://example.test/doc.pdf', role: 'reference', targetSlot: 'ref_video' }],
          },
          code: 'operation_incompatible',
        },
        // 4. 不支持的 MIME
        {
          req: {
            ...baseReq,
            prompt: 'valid',
            references: [{ type: 'video', pathOrUrl: 'https://example.test/v.avi', mimeType: 'video/x-msvideo', role: 'reference', targetSlot: 'ref_video', sizeBytes: 100, durationSec: 2 }],
          },
          code: 'mime_unsupported',
        },
        // 5. 超出大小限制
        {
          req: {
            ...baseReq,
            prompt: 'valid',
            references: [{ type: 'video', pathOrUrl: 'https://example.test/v.mp4', mimeType: 'video/mp4', role: 'reference', targetSlot: 'ref_video', sizeBytes: 10 * 1024 * 1024, durationSec: 2 }],
          },
          code: 'size_exceeded',
        },
        // 6. 超出时长限制
        {
          req: {
            ...baseReq,
            prompt: 'valid',
            references: [{ type: 'video', pathOrUrl: 'https://example.test/v.mp4', mimeType: 'video/mp4', role: 'reference', targetSlot: 'ref_video', sizeBytes: 1024, durationSec: 20 }],
          },
          code: 'duration_exceeded',
        },
        // 7. 本地文件不存在
        {
          req: {
            ...baseReq,
            prompt: 'valid',
            references: [{ type: 'video', pathOrUrl: join(root, 'non-existent.mp4'), mimeType: 'video/mp4', role: 'reference', targetSlot: 'ref_video', sizeBytes: 100, durationSec: 2 }],
          },
          code: 'input_unavailable',
        },
      ];

      for (const { req, code } of cases) {
        await assert.rejects(client.submit(req), { name: 'SeamGatewayError', code });
      }

      assert.equal(seamCalls, 0, 'Seam execute must NEVER be invoked on invalid inputs');
    });
  });

  // ==========================================================================
  // TC-05: 输出产物类型校验
  // ==========================================================================
  describe('TC-05: 输出产物类型校验', () => {
    it('产物类型或 MIME 与契约不符时抛出 typed error 并阻断项目资产登记', async () => {
      const catalog = catalogFor('video', 'vid-model', [operation('v_op', 'video')]);
      const invalidResults = [
        { type: 'image', url: 'https://example.test/out.png' }, // 节点为 video，产物为 image
        { type: 'video', mimeType: 'audio/mpeg', url: 'https://example.test/out.mp4' }, // MIME 冲突
        { type: 'video', url: 'https://example.test/out.png' }, // URL 扩展名冲突且无 mime
        { text: 'not a video', url: null }, // text 产物回填到 video
      ];

      for (const res of invalidResults) {
        let persistCalls = 0;
        const gw = createCountingGateway(catalog, res);
        const executor = createMaterialGatewayExecutor({ gateway: gw });

        await assert.rejects(
          executor.execute(node('video', { model: 'vid-model', operation: 'v_op' }), context({
            persistGenerated: async () => { persistCalls++; return {}; },
          })),
          { name: 'SeamGatewayError', code: 'omnimux-invalid-response' },
        );

        assert.equal(persistCalls, 0, 'persistGenerated must NEVER be called on mismatched output');
      }
    });

    it('真实文件二进制内容 (Magic Numbers) 与扩展名不符时拦截', async () => {
      const fakeMp4 = join(root, 'fake.mp4');
      // PNG 头部签名 (0x89 0x50 0x4E 0x47)
      writeFileSync(fakeMp4, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      const catalog = catalogFor('video', 'vid-model', [operation('v_op', 'video')]);
      const gw = createCountingGateway(catalog, { url: fakeMp4, type: 'video' });
      const executor = createMaterialGatewayExecutor({ gateway: gw });

      let persistCalls = 0;
      await assert.rejects(
        executor.execute(node('video', { model: 'vid-model', operation: 'v_op' }), context({
          persistGenerated: async () => { persistCalls++; return {}; },
        })),
        { name: 'SeamGatewayError', code: 'omnimux-invalid-response' },
      );

      assert.equal(persistCalls, 0);
    });
  });

  // ==========================================================================
  // TC-06: TaskId 轮询恢复
  // ==========================================================================
  describe('TC-06: TaskId 轮询恢复', () => {
    it('awaitTask 仅依赖 taskId 和 dest 恢复轮询，跳过素材与 catalog 校验', async () => {
      const catalog = catalogFor('video', 'seedance-2-0-fast', [
        operation('v_op', 'video', [slot('image', 'reference', 1, 1, 'ref_image')]),
      ]);

      const localImg = join(root, 'source.png');
      writeFileSync(localImg, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      let seamExecutes = 0;
      const seamRequests = [];
      const client = createOmnimuxSeamClient({
        getSeam: (name) => {
          if (name === 'modelCatalog') return { list: () => catalog };
          if (name === 'videoGenerate') {
            return {
              execute: async (req) => {
                seamExecutes++;
                seamRequests.push(req);
                if (req.taskId) {
                  return { mode: 'live', type: 'video', url: 'https://example.test/done.mp4', mimeType: 'video/mp4', durationSec: 5 };
                }
                return { mode: 'submitted', taskId: 'hub-task-999' };
              },
            };
          }
          return undefined;
        },
      });

      // 1. Submit
      const submitRes = await client.submit({
        capability: 'video',
        model: 'seedance-2-0-fast',
        operation: 'v_op',
        prompt: 'test prompt',
        dest: join(root, 'dest.mp4'),
        references: [{
          type: 'image',
          role: 'reference',
          targetSlot: 'ref_image',
          pathOrUrl: localImg,
          mimeType: 'image/png',
          sizeBytes: 4,
        }],
      });
      assert.equal(submitRes.taskId, 'hub-task-999');

      // 2. 模拟本地源素材已被删除（如果在 await 时重新校验则会报错）
      rmSync(localImg, { force: true });

      // 3. 轮询恢复
      const awaitRes = await client.awaitTask(submitRes.taskId, join(root, 'dest.mp4'));
      assert.equal(awaitRes.type, 'video');
      assert.equal(awaitRes.durationSec, 5);

      assert.equal(seamExecutes, 2);
      assert.deepEqual(seamRequests[1], {
        taskId: 'hub-task-999',
        dest: join(root, 'dest.mp4'),
      }, 'awaitTask request only carries taskId, dest and signal, no source re-check');
    });
  });

  // ==========================================================================
  // TC-07: ASR Unavailable 阻断
  // ==========================================================================
  describe('TC-07: ASR Unavailable 阻断', () => {
    it('speech_to_text (ASR) 属于未列出 / 尚未支持的 operation，在 SubmitGuard 处被正确拦截', async () => {
      // 模拟包含未列出 ASR 模型的 catalog（Whisper listed: false, execution: none）
      const asrCatalog = {
        source: 'omnimux',
        schemaVersion: '1.1',
        defaults: { text: 'gpt-5.5' },
        text: [{ id: 'gpt-5.5', label: 'GPT 5.5' }, { id: 'whisper-1', label: 'Whisper 1' }],
        image: [],
        video: [],
        audio: [],
        models: [
          {
            id: 'gpt-5.5',
            label: 'GPT 5.5',
            listed: true,
            operations: [operation('chat', 'text')],
          },
          {
            id: 'whisper-1',
            label: 'Whisper 1',
            listed: false,
            operations: [
              {
                id: 'speech_to_text',
                label: '语音转文字',
                output: { type: 'text' },
                inputs: [slot('audio', 'source', 1, 1, 'audio_input')],
                listed: false,
                research: { status: 'draft' },
                execution: { status: 'none', seam: 'speechToText' },
              },
            ],
          },
        ],
      };

      let seamCalls = 0;
      const client = createOmnimuxSeamClient({
        getSeam: (name) => {
          if (name === 'modelCatalog') return { list: () => asrCatalog };
          if (name === 'textComplete') {
            return {
              execute: async () => {
                seamCalls++;
                return { mode: 'live', text: 'transcript' };
              },
            };
          }
          return undefined;
        },
      });

      // 尝试提交 Whisper ASR
      await assert.rejects(
        client.submit({
          capability: 'text',
          model: 'whisper-1',
          operation: 'speech_to_text',
          dest: join(root, 'transcript.txt'),
          references: [{
            type: 'audio',
            role: 'source',
            targetSlot: 'audio_input',
            pathOrUrl: 'https://example.test/audio.mp3',
            mimeType: 'audio/mpeg',
            sizeBytes: 100,
          }],
        }),
        (err) => err.code === 'model-not-allowed' || err.code === 'operation-not-allowed',
      );

      assert.equal(seamCalls, 0, 'seam execution must be 0 for unavailable ASR');
    });

    it('当接缝缺失（例如缺少 live execution seam）时，requireSeam 抛出 needs-provider 阻断', () => {
      // 模拟没有任何 seam 的 provider
      const emptyClient = createOmnimuxSeamClient({
        getSeam: () => undefined,
      });

      assert.rejects(
        emptyClient.submit({
          capability: 'text',
          model: 'some-model',
          operation: 'chat',
          dest: join(root, 'out.txt'),
        }),
        { name: 'SeamGatewayError', code: 'needs-provider' },
      );
    });
  });
});
