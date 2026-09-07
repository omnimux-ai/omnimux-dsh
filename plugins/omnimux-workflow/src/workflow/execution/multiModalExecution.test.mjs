import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { createOmnimuxSeamClient } from '../seam/omnimuxGateway.ts';
import { createMockGateway } from '../seam/mockGateway.ts';
import { catalogFor, operation, slot } from '../seam/submissionFixtures.mjs';
const captureCatalog = Object.assign({}, catalogFor('text'), {
  defaults: { text: 'capture-text', image: 'capture-image', video: 'capture-video' },
  ...Object.fromEntries(['text', 'image', 'video'].map((type) => [type, [{ id: `capture-${type}`, label: type }]])),
  models: ['text', 'image', 'video'].map((type) => ({ id: `capture-${type}`, label: type,
    operations: [operation('capture', type, [slot('image'), slot('audio')])] })),
});

const mediaFixtureRoot = mkdtempSync(`${tmpdir()}/workflow-input-`);
after(() => rmSync(mediaFixtureRoot, { recursive: true, force: true }));
function mediaFixture(name) {
  const path = `${mediaFixtureRoot}/${name}`;
  writeFileSync(path, 'fixture media');
  return path;
}

describe('Phase 0: multiModalExecution (多模态数据流与执行调度)', () => {
  it('测试 1：单上游图片接入 -> references 包含 1 张图，req.image 正确填充', async () => {
    /** @type {any[]} */
    const submissions = [];
    const mockGateway = {
      submit: async (req) => {
        submissions.push(req);
        return { taskId: 't1', mode: 'stub' };
      },
      awaitTask: async () => ({ url: '/tmp/out.png' }),
      capabilities: async () => captureCatalog,
      mode: 'mock',
    };
    const executor = createMaterialGatewayExecutor({ gateway: mockGateway });

    const upstreamOutputs = new Map();
    upstreamOutputs.set('node-img-1', {
      text: 'hero.png',
      mediaAssets: [
        {
          type: 'image',
          url: `/omnimux-workflow/api/local-file?path=${encodeURIComponent(mediaFixture('hero.png'))}`,
          path: mediaFixture('hero.png'),
        },
      ],
    });

    const mockCtx = {
      upstreamOutputs,
      signal: new AbortController().signal,
      mediaDir: '/tmp/workflow/media/executions/e1',
    };

    await executor.execute(
      {
        id: 'gen-node-1',
        type: 'material',
        data: {
          materialType: 'image',
          prompt: 'Generate an anime version',
        },
      },
      mockCtx,
    );

    assert.equal(submissions.length, 1);
    const req = submissions[0];
    assert.equal(req.capability, 'image');
    assert.equal(req.prompt, 'Generate an anime version');
    assert.equal(req.image, mediaFixture('hero.png'), 'req.image 向后兼容字段应填充首张图物理路径');
    assert.ok(Array.isArray(req.references), 'references 应为数组');
    assert.equal(req.references.length, 1);
    assert.deepEqual(req.references[0], {
      role: 'reference',
      type: 'image',
      pathOrUrl: mediaFixture('hero.png'),
      sourceNodeId: 'node-img-1', targetSlot: 'reference_images', mimeType: 'image/png', sizeBytes: 13,
    });
  });

  it('测试 2：多上游图片接入（例如 3 张不同节点的图片） -> references 包含 3 张图，顺序稳定且无截断', async () => {
    /** @type {any[]} */
    const submissions = [];
    const mockGateway = {
      submit: async (req) => {
        submissions.push(req);
        return { taskId: 't2', mode: 'stub' };
      },
      awaitTask: async () => ({ url: '/tmp/out.mp4' }),
      capabilities: async () => captureCatalog,
      mode: 'mock',
    };
    const executor = createMaterialGatewayExecutor({ gateway: mockGateway });

    const upstreamOutputs = new Map();
    upstreamOutputs.set('node-1', {
      mediaAssets: [
        {
          type: 'image',
          url: 'https://example.com/frame1.png',
          path: mediaFixture('frame1.png'),
        },
      ],
    });
    upstreamOutputs.set('node-2', {
      mediaAssets: [
        {
          type: 'image',
          url: 'https://example.com/frame2.png',
          path: mediaFixture('frame2.png'),
        },
      ],
    });
    upstreamOutputs.set('node-3', {
      mediaAssets: [
        {
          type: 'image',
          url: 'https://example.com/frame3.png',
          path: mediaFixture('frame3.png'),
        },
      ],
    });

    const mockCtx = {
      upstreamOutputs,
      signal: new AbortController().signal,
      mediaDir: '/tmp/workflow/media/executions/e2',
    };

    await executor.execute(
      {
        id: 'gen-video-1',
        type: 'material',
        data: {
          materialType: 'video',
          prompt: 'Transition smoothly across keyframes',
        },
      },
      mockCtx,
    );

    assert.equal(submissions.length, 1);
    const req = submissions[0];
    assert.equal(req.capability, 'video');
    assert.equal(req.image, mediaFixture('frame1.png'), 'req.image 填充第一张图');
    assert.ok(Array.isArray(req.references));
    assert.equal(req.references.length, 3, '必须收集全部 3 张图片，无短路截断');
    assert.equal(req.references[0].pathOrUrl, mediaFixture('frame1.png'));
    assert.equal(req.references[1].pathOrUrl, mediaFixture('frame2.png'));
    assert.equal(req.references[2].pathOrUrl, mediaFixture('frame3.png'));
  });

  it('测试 3：混合上游（1 文本 + 2 图片 + 1 音频） -> 音频默认保留为有序参考素材', async () => {
    /** @type {any[]} */
    const submissions = [];
    const mockGateway = {
      submit: async (req) => {
        submissions.push(req);
        return { taskId: 't3', mode: 'stub' };
      },
      awaitTask: async () => ({ url: '/tmp/out.mp4' }),
      capabilities: async () => captureCatalog,
      mode: 'mock',
    };
    const executor = createMaterialGatewayExecutor({ gateway: mockGateway });

    const upstreamOutputs = new Map();
    upstreamOutputs.set('text-node', {
      text: 'Upstream story narrative text',
    });
    upstreamOutputs.set('img-node-1', {
      mediaAssets: [
        {
          type: 'image',
          url: 'https://example.com/character.png',
          path: mediaFixture('character.png'),
        },
      ],
    });
    upstreamOutputs.set('img-node-2', {
      mediaAssets: [
        {
          type: 'image',
          url: 'https://example.com/background.png',
          path: mediaFixture('background.png'),
        },
      ],
    });
    upstreamOutputs.set('audio-node', {
      mediaAssets: [
        {
          type: 'audio',
          url: 'https://example.com/voiceover.mp3',
          path: mediaFixture('voiceover.mp3'),
        },
      ],
    });

    const mockCtx = {
      upstreamOutputs,
      signal: new AbortController().signal,
      mediaDir: '/tmp/workflow/media/executions/e3',
    };

    // 节点自身未填 prompt，回退使用上游文本
    await executor.execute(
      {
        id: 'gen-video-2',
        type: 'material',
        data: {
          materialType: 'video',
        },
      },
      mockCtx,
    );

    assert.equal(submissions.length, 1);
    const req = submissions[0];
    assert.equal(req.prompt, 'Upstream story narrative text', '上游文本作为 prompt 回退');
    assert.equal(req.image, mediaFixture('character.png'), '向后兼容 image 字段');
    assert.equal(req.audio, mediaFixture('voiceover.mp3'), '向后兼容 audio 字段');
    assert.equal(req.audioTrack, undefined, '未显式标为 audio_track 时不应改写参考音频角色');
    assert.equal(req.references.length, 3, '2 张图片和 1 个参考音频均进入 references');
    assert.equal(req.references[0].pathOrUrl, mediaFixture('character.png'));
    assert.equal(req.references[1].pathOrUrl, mediaFixture('background.png'));
    assert.deepEqual(req.references[2], {
      role: 'reference',
      type: 'audio',
      pathOrUrl: mediaFixture('voiceover.mp3'),
      sourceNodeId: 'audio-node', targetSlot: 'reference_audios', mimeType: 'audio/mpeg', sizeBytes: 13,
    });
  });

  it('测试 4：无上游媒体纯文本 -> references 为空/undefined，prompt 正常', async () => {
    /** @type {any[]} */
    const submissions = [];
    const mockGateway = {
      submit: async (req) => {
        submissions.push(req);
        return { taskId: 't4', mode: 'stub' };
      },
      awaitTask: async () => ({ text: 'generated story' }),
      capabilities: async () => captureCatalog,
      mode: 'mock',
    };
    const executor = createMaterialGatewayExecutor({ gateway: mockGateway });

    const upstreamOutputs = new Map();
    upstreamOutputs.set('text-node-only', {
      text: 'A pure text prompt from upstream',
    });

    const mockCtx = {
      upstreamOutputs,
      signal: new AbortController().signal,
      mediaDir: '/tmp/workflow/media/executions/e4',
    };

    await executor.execute(
      {
        id: 'gen-text-1',
        type: 'material',
        data: {
          materialType: 'text',
        },
      },
      mockCtx,
    );

    assert.equal(submissions.length, 1);
    const req = submissions[0];
    assert.equal(req.capability, 'text');
    assert.equal(req.prompt, 'A pure text prompt from upstream');
    assert.equal(req.references, undefined);
    assert.equal(req.audioTrack, undefined);
    assert.equal(req.image, undefined);
  });

  it('测试 5：向后兼容性验证（直接通过 gateway.submit 传入 image 或 references 均能正常工作）', async () => {
    // 1. 测试 omnimuxGateway 透传 references 和 audioTrack
    /** @type {any[]} */
    const seamRequests = [];
    const mockImageSeam = {
      execute: async (req) => {
        seamRequests.push(req);
        return { mode: 'submitted', taskId: 'hub-task-99' };
      },
    };

    const client = createOmnimuxSeamClient({
      getSeam: (name) => name === 'imageGenerate' ? mockImageSeam : name === 'modelCatalog'
        ? { list: () => catalogFor('image', 'gpt-image-2', [operation('image_to_image', 'image', [slot('image'), slot('audio', 'audio_track')])]) } : undefined,
    });

    const submitRes = await client.submit({
      capability: 'image',
      prompt: 'A futuristic city',
      operation: 'image_to_image',
      dest: '/tmp/dest.png',
      image: mediaFixture('legacy-image.png'),
      references: [
        { role: 'reference', type: 'image', pathOrUrl: mediaFixture('modern-image1.png') },
        { role: 'reference', type: 'image', pathOrUrl: mediaFixture('modern-image2.png') },
      ],
      audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: mediaFixture('track.mp3') },
    });

    assert.equal(submitRes.taskId, 'hub-task-99');
    assert.equal(seamRequests.length, 1);
    const seamReq = seamRequests[0];
    assert.equal(seamReq.prompt, 'A futuristic city');
    assert.equal(seamReq.image, mediaFixture('legacy-image.png'));
    assert.equal(seamReq.references.length, 2);
    assert.equal(seamReq.audioTrack.pathOrUrl, mediaFixture('track.mp3'));

    // 2. 测试 mockGateway 接受带 references 的 SubmitRequest
    const mockGw = createMockGateway({ minLatencyMs: 1, maxLatencyMs: 2 });
    const mockRes = await mockGw.submit({
      capability: 'image',
      prompt: 'Mock city',
      operation: 'image_to_image',
      dest: '/tmp/mock-dest.svg',
      references: [
        { role: 'reference', type: 'image', pathOrUrl: mediaFixture('ref1.png') },
      ],
    });
    assert.ok(mockRes.taskId);
  });
});
