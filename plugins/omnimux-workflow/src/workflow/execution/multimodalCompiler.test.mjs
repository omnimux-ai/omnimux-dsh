import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMultimodalPrompt,
  MultimodalCompiler,
  formatFriendlyTag,
  inferMaterialType,
  PROMPT_REF_REGEX,
} from './multimodalCompiler.ts';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { catalogFor, operation, slot } from '../seam/submissionFixtures.mjs';

const captureCatalog = Object.assign({}, catalogFor('text'), {
  defaults: { text: 'capture-text', image: 'capture-image', video: 'capture-video' },
  ...Object.fromEntries(
    ['text', 'image', 'video'].map((type) => [type, [{ id: `capture-${type}`, label: type }]]),
  ),
  models: ['text', 'image', 'video'].map((type) => ({
    id: `capture-${type}`,
    label: type,
    operations: [operation('capture', type, [slot('image'), slot('audio')])],
  })),
});

describe('T05: 多模态执行编译网关 (multimodalCompiler)', () => {
  it('1. Interleaved 多模态切片编译（图文交错结构）', () => {
    const rawPrompt = '开头特写：@ref[node_char:0:hero.png] 随后转场至 @ref[node_bg:1:cyberpunk_city.jpg] 结束画面。';
    const upstreamOutputs = {
      node_char: {
        mediaUrl: 'https://cdn.example.com/hero.png',
        mimeType: 'image/png',
      },
      node_bg: {
        mediaUrl: 'https://cdn.example.com/cyberpunk_city.jpg',
        mimeType: 'image/jpeg',
      },
    };

    const result = compileMultimodalPrompt({
      rawPrompt,
      upstreamOutputs,
      modelContract: {
        supportsInterleaved: true,
      },
    });

    // 验证纯文本清洗
    assert.equal(
      result.cleanedPrompt,
      '开头特写：[参考图: hero.png] 随后转场至 [参考图: cyberpunk_city.jpg] 结束画面。',
    );

    // 验证 interleavedParts 切片
    assert.ok(Array.isArray(result.interleavedParts), 'interleavedParts 应为数组');
    assert.equal(result.interleavedParts.length, 5);

    assert.deepEqual(result.interleavedParts[0], {
      type: 'text',
      text: '开头特写：',
    });

    assert.equal(result.interleavedParts[1].type, 'image_url');
    assert.equal(result.interleavedParts[1].mediaUrl, 'https://cdn.example.com/hero.png');
    assert.equal(result.interleavedParts[1].sourceNodeId, 'node_char');
    assert.equal(result.interleavedParts[1].slotIndex, 0);
    assert.equal(result.interleavedParts[1].label, 'hero.png');

    assert.deepEqual(result.interleavedParts[2], {
      type: 'text',
      text: ' 随后转场至 ',
    });

    assert.equal(result.interleavedParts[3].type, 'image_url');
    assert.equal(result.interleavedParts[3].mediaUrl, 'https://cdn.example.com/cyberpunk_city.jpg');
    assert.equal(result.interleavedParts[3].sourceNodeId, 'node_bg');
    assert.equal(result.interleavedParts[3].slotIndex, 1);

    assert.deepEqual(result.interleavedParts[4], {
      type: 'text',
      text: ' 结束画面。',
    });

    // 验证 resolvedReferences
    assert.equal(result.resolvedReferences.length, 2);
    assert.equal(result.resolvedReferences[0].sourceNodeId, 'node_char');
    assert.equal(result.resolvedReferences[0].pathOrUrl, 'https://cdn.example.com/hero.png');
    assert.equal(result.resolvedReferences[1].sourceNodeId, 'node_bg');
    assert.equal(result.resolvedReferences[1].pathOrUrl, 'https://cdn.example.com/cyberpunk_city.jpg');
  });

  it('2. 传统模型纯文本清洗与 resolvedReferences 提取', () => {
    const rawPrompt = '生成电影级特写：参考 @ref[node_flux_1:0:character_sheet.png] 的角色形象与着装。';
    const upstreamOutputs = {
      node_flux_1: {
        mediaUrl: '/workspace/assets/character_sheet.png',
        mimeType: 'image/png',
      },
    };

    // 传统模型（例如 Flux / SDXL，不声明 supportsInterleaved）
    const result = compileMultimodalPrompt({
      rawPrompt,
      upstreamOutputs,
      modelContract: {
        supportsInterleaved: false,
      },
    });

    // 语法无污染验证
    assert.equal(result.cleanedPrompt, '生成电影级特写：参考 [参考图: character_sheet.png] 的角色形象与着装。');
    assert.equal(result.interleavedParts, undefined, '传统非交错模型不应附带 interleavedParts');

    // resolvedReferences 提取规范
    assert.equal(result.resolvedReferences.length, 1);
    assert.deepEqual(result.resolvedReferences[0], {
      role: 'reference',
      type: 'image',
      materialType: 'image',
      pathOrUrl: '/workspace/assets/character_sheet.png',
      mediaUrl: '/workspace/assets/character_sheet.png',
      sourceNodeId: 'node_flux_1',
      slotIndex: 0,
      label: 'character_sheet.png',
      mimeType: 'image/png',
    });
  });

  it('3. 混合模态引用（图片 + 音频 + 视频）编译', () => {
    const rawPrompt = '主体参考 @ref[n_img:0:main.png]，运镜参考 @ref[n_vid:1:camera.mp4]，背景音 @ref[n_aud:2:bgm.mp3]。';
    const upstreamOutputs = {
      n_img: { mediaUrl: 'http://assets.local/main.png' },
      n_vid: { mediaUrl: 'http://assets.local/camera.mp4' },
      n_aud: { mediaUrl: 'http://assets.local/bgm.mp3' },
    };

    const result = compileMultimodalPrompt({
      rawPrompt,
      upstreamOutputs,
      modelContract: {
        supportsInterleaved: true,
      },
    });

    // 文本清洗模态标签区分
    assert.equal(
      result.cleanedPrompt,
      '主体参考 [参考图: main.png]，运镜参考 [参考视频: camera.mp4]，背景音 [参考音频: bgm.mp3]。',
    );

    // 验证 resolvedReferences 中三种不同模态的准确识别
    assert.equal(result.resolvedReferences.length, 3);
    assert.equal(result.resolvedReferences[0].type, 'image');
    assert.equal(result.resolvedReferences[0].pathOrUrl, 'http://assets.local/main.png');
    assert.equal(result.resolvedReferences[1].type, 'video');
    assert.equal(result.resolvedReferences[1].pathOrUrl, 'http://assets.local/camera.mp4');
    assert.equal(result.resolvedReferences[2].type, 'audio');
    assert.equal(result.resolvedReferences[2].pathOrUrl, 'http://assets.local/bgm.mp3');

    // 验证交错切片中的对应模态 URL 类型
    const parts = result.interleavedParts || [];
    assert.equal(parts.length, 7);
    assert.equal(parts[1].type, 'image_url');
    assert.equal(parts[3].type, 'video_url');
    assert.equal(parts[5].type, 'audio_url');
  });

  it('4. 缺失素材平滑降级容错（不抛出致命异常）', () => {
    const rawPrompt = '存在素材 @ref[node_ready:0:ready.png] 和缺失素材 @ref[node_missing:1:deleted.png] 以及未连入 @ref[node_ghost:2:ghost.jpg]';
    const upstreamOutputs = {
      node_ready: {
        mediaUrl: 'https://cdn.example.com/ready.png',
      },
      // node_missing 只有空文本没有 mediaUrl
      node_missing: {
        text: 'deleted.png',
      },
      // node_ghost 完全不存在于 upstreamOutputs
    };

    assert.doesNotThrow(() => {
      const result = compileMultimodalPrompt({
        rawPrompt,
        upstreamOutputs,
        modelContract: {
          supportsInterleaved: true,
        },
      });

      // 清洗文本平滑回退
      assert.equal(
        result.cleanedPrompt,
        '存在素材 [参考图: ready.png] 和缺失素材 [参考图: deleted.png] 以及未连入 [参考图: ghost.jpg]',
      );

      // resolvedReferences 仅包含真实就绪的素材
      assert.equal(result.resolvedReferences.length, 1);
      assert.equal(result.resolvedReferences[0].sourceNodeId, 'node_ready');

      // interleavedParts 中缺失素材平滑降级为文本切片
      const missingPart = result.interleavedParts?.find(
        (p) => p.type === 'text' && p.text?.includes('deleted.png'),
      );
      assert.ok(missingPart, '未就绪素材应平滑降级为纯文本切片');
    });
  });

  it('5. slotState 备用查找（在 upstreamOutputs 缺失时能从卡槽状态恢复）', () => {
    const rawPrompt = '基于 @ref[node_slot_src:0:fallback.png] 生成场景';
    const slotState = {
      modelId: 'test-model',
      operationId: 'op1',
      capacity: 3,
      activeSlots: [
        {
          slotId: 'slot_0',
          slotIndex: 0,
          sourceNodeId: 'node_slot_src',
          materialType: 'image',
          mediaUrl: 'https://cdn.example.com/slot_fallback.png',
          label: 'fallback.png',
        },
      ],
      overflowPool: [],
    };

    const result = compileMultimodalPrompt({
      rawPrompt,
      slotState,
      upstreamOutputs: {},
    });

    assert.equal(result.resolvedReferences.length, 1);
    assert.equal(result.resolvedReferences[0].mediaUrl, 'https://cdn.example.com/slot_fallback.png');
    assert.equal(result.cleanedPrompt, '基于 [参考图: fallback.png] 生成场景');
  });

  it('6. MultimodalCompiler 类静态包装与工具函数契约', () => {
    assert.equal(inferMaterialType('test.png'), 'image');
    assert.equal(inferMaterialType('clip.mp4'), 'video');
    assert.equal(inferMaterialType('song.wav'), 'audio');
    assert.equal(formatFriendlyTag('image', 'photo.jpg'), '[参考图: photo.jpg]');
    assert.equal(formatFriendlyTag('video', 'movie.mp4'), '[参考视频: movie.mp4]');
    assert.equal(formatFriendlyTag('audio', 'voice.mp3'), '[参考音频: voice.mp3]');

    const payload = MultimodalCompiler.compile({
      rawPrompt: '参考 @ref[n1:0:a.png]',
      upstreamOutputs: { n1: { mediaUrl: 'https://test/a.png' } },
    });
    assert.equal(payload.cleanedPrompt, '参考 [参考图: a.png]');
    assert.equal(payload.resolvedReferences.length, 1);
  });

  it('7. 集成调度：materialGatewayExecutor 运行时自动触发编译并注入 cleanedPrompt 与 references', async () => {
    /** @type {any[]} */
    const submissions = [];
    const mockGateway = {
      submit: async (req) => {
        submissions.push(req);
        return { taskId: 't_t05_integ', mode: 'stub' };
      },
      awaitTask: async () => ({ url: '/tmp/out_t05.png' }),
      capabilities: async () => captureCatalog,
      mode: 'mock',
    };

    const executor = createMaterialGatewayExecutor({ gateway: mockGateway });

    const upstreamOutputs = new Map();
    upstreamOutputs.set('node_char_input', {
      text: 'character.png',
      mediaAssets: [
        {
          type: 'image',
          url: 'https://cdn.example.com/character.png',
        },
      ],
    });

    const mockCtx = {
      upstreamOutputs,
      signal: new AbortController().signal,
      mediaDir: '/tmp/workflow/media/executions/e_t05',
    };

    await executor.execute(
      {
        id: 'gen-node-t05',
        type: 'material',
        data: {
          materialType: 'image',
          prompt: '根据 @ref[node_char_input:0:character.png] 的外观生成机甲战士',
        },
      },
      mockCtx,
    );

    assert.equal(submissions.length, 1);
    const req = submissions[0];
    assert.equal(req.capability, 'image');
    // 验证 prompt 已经被清洗为自然文本标签，脏语法被完全清除
    assert.equal(req.prompt, '根据 [参考图: character.png] 的外观生成机甲战士');
    // 验证 references 正确填充
    assert.ok(Array.isArray(req.references), 'references 应为数组');
    assert.equal(req.references.length, 1);
    assert.equal(req.references[0].pathOrUrl, 'https://cdn.example.com/character.png');
    assert.equal(req.references[0].sourceNodeId, 'node_char_input');
  });
});
