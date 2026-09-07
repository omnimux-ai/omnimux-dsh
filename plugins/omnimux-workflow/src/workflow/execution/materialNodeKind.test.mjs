import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveNodeKind, isGenerativeTool } from '../../shared/graph/materialNode.ts';
import { resolveExecutorKey } from './nodeExecutors.ts';
import { createImportExecutor } from './importExecutor.ts';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { catalogFor, operation, slot } from '../seam/submissionFixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const mediaFixtureRoot = mkdtempSync(`${tmpdir()}/workflow-input-`);
after(() => rmSync(mediaFixtureRoot, { recursive: true, force: true }));
function mediaFixture(name) {
  const path = `${mediaFixtureRoot}/${name}`;
  writeFileSync(path, 'fixture media');
  return path;
}

describe('resolveNodeKind - 全仓唯一节点身份判定真源', () => {
  it('显式 nodeKind 优先', () => {
    assert.equal(resolveNodeKind({ nodeKind: 'import' }), 'import');
    assert.equal(resolveNodeKind({ nodeKind: 'generate' }), 'generate');
    // 即使 tool 与 nodeKind 相左，以不可变 nodeKind 为准
    assert.equal(resolveNodeKind({ nodeKind: 'import', selectedTool: 'text-to-image' }), 'import');
    assert.equal(resolveNodeKind({ nodeKind: 'generate', selectedTool: 'import' }), 'generate');
  });

  it('老数据/未标注兜底：selectedTool === "import" 判定为 import', () => {
    assert.equal(resolveNodeKind({ selectedTool: 'import' }), 'import');
    assert.equal(resolveNodeKind({ selectedTool: 'text-to-image' }), 'generate');
    assert.equal(resolveNodeKind({ selectedTool: 'video-generation' }), 'generate');
    assert.equal(resolveNodeKind({ selectedTool: 'text-editor' }), 'generate');
  });

  it('★ F1 严重故障回归：selectedTool="import" 且残留 prompt/model 时，必须坚决判定为 import（绝不误烧钱）', () => {
    const dirtyNode = {
      selectedTool: 'import',
      realPath: '/path/to/my-photo.jpg',
      prompt: 'A futuristic city in cyberpunk style',
      params: { model: 'kling-v2', aspectRatio: '16:9' },
    };
    assert.equal(resolveNodeKind(dirtyNode), 'import');
  });

  it('空输入与非法数据安全兜底', () => {
    assert.equal(resolveNodeKind({}), 'generate');
    assert.equal(resolveNodeKind({ selectedTool: null }), 'generate');
    assert.equal(resolveNodeKind({ selectedTool: 123 }), 'generate');
    assert.equal(resolveNodeKind({ nodeKind: 'unknown' }), 'generate');
  });

  it('isGenerativeTool 兼容包装函数行为一致', () => {
    assert.equal(isGenerativeTool('import'), false);
    assert.equal(isGenerativeTool('text-to-image'), true);
    assert.equal(isGenerativeTool('video-generation'), true);
  });
});

describe('resolveExecutorKey - 调度分派键派生', () => {
  it('非 material 节点原样返回 node.type', () => {
    assert.equal(resolveExecutorKey({ type: 'video_composition' }), 'video_composition');
    assert.equal(resolveExecutorKey({ type: 'table' }), 'table');
    assert.equal(resolveExecutorKey({ type: 'custom_future_node' }), 'custom_future_node');
  });

  it('material 节点按 resolveNodeKind 派生专职 key', () => {
    assert.equal(
      resolveExecutorKey({ type: 'material', data: { selectedTool: 'import' } }),
      'material:import',
    );
    assert.equal(
      resolveExecutorKey({ type: 'material', data: { selectedTool: 'text-to-image' } }),
      'material:generate',
    );
    assert.equal(
      resolveExecutorKey({ type: 'material', data: { nodeKind: 'import' } }),
      'material:import',
    );
    assert.equal(
      resolveExecutorKey({ type: 'material', data: { nodeKind: 'generate' } }),
      'material:generate',
    );
  });
});

describe('importExecutor - 专职导入执行器契约', () => {
  it('★ 架构硬约束：源码严禁 import GenerationGateway 或 seam 模块（结构上杜绝烧钱）', () => {
    const code = readFileSync(join(here, 'importExecutor.ts'), 'utf8');
    assert.doesNotMatch(code, /^import\s+.*(?:GenerationGateway|seam\/gateway)/m);
    assert.doesNotMatch(code, /gateway\.submit/);
  });

  it('执行器注册 key 为 material:import', () => {
    const executor = createImportExecutor();
    assert.equal(executor.key, 'material:import');
  });

  it('relativePath + workspaceId 派生 project-file URL', async () => {
    const executor = createImportExecutor();
    const mockCtx = {
      upstreamOutputs: new Map(),
      signal: new AbortController().signal,
      mediaDir: '/tmp',
      workspaceId: 'ws_abc',
    };
    const output = await executor.execute(
      {
        id: 'node-rel',
        type: 'material',
        data: {
          materialType: 'image',
          relativePath: 'assets/imported/pic.png',
          assetId: 'ast_1',
          realPath: '/Users/test/pic.png',
        },
      },
      mockCtx,
    );
    assert.equal(output.relativePath, 'assets/imported/pic.png');
    assert.equal(output.assetId, 'ast_1');
    assert.match(output.mediaAssets[0].url, /\/api\/workspaces\/ws_abc\/file\?rel=/);
    assert.equal(output.mediaAssets[0].relativePath, 'assets/imported/pic.png');
  });

  it('realPath 存在时透传 localFileMediaUrl 与 path 字段', async () => {
    const executor = createImportExecutor();
    const mockCtx = {
      upstreamOutputs: new Map(),
      signal: new AbortController().signal,
      mediaDir: '/tmp',
    };
    const output = await executor.execute(
      {
        id: 'node-1',
        type: 'material',
        data: {
          materialType: 'image',
          realPath: '/Users/test/pic.png',
        },
      },
      mockCtx,
    );
    assert.ok(output.mediaAssets);
    assert.equal(output.mediaAssets[0].type, 'image');
    assert.match(output.mediaAssets[0].url, /local-file/);
    assert.equal(output.mediaAssets[0].path, '/Users/test/pic.png');
    assert.equal(output.realPath, '/Users/test/pic.png');
  });

  it('mediaUrl 存在时透传', async () => {
    const executor = createImportExecutor();
    const mockCtx = {
      upstreamOutputs: new Map(),
      signal: new AbortController().signal,
      mediaDir: '/tmp',
    };
    const output = await executor.execute(
      {
        id: 'node-2',
        type: 'material',
        data: {
          materialType: 'video',
          mediaUrl: 'https://example.com/demo.mp4',
        },
      },
      mockCtx,
    );
    assert.ok(output.mediaAssets);
    assert.equal(output.mediaAssets[0].url, 'https://example.com/demo.mp4');
  });
});

describe('materialGatewayExecutor - 专职生成执行器契约', () => {
  it('执行器注册 key 为 material:generate', () => {
    const mockGateway = {
      submit: async () => ({ taskId: 't1', mode: 'stub' }),
      awaitTask: async () => ({ status: 'completed', url: 'https://example.com/out.png' }),
      capabilities: async () => catalogFor('text', 'gemini-3.7-flash', [operation('vision_chat', 'text', [slot('image')])]),
      mode: 'mock',
    };
    const executor = createMaterialGatewayExecutor({ gateway: mockGateway });
    assert.equal(executor.key, 'material:generate');
  });

  it('★ Issue #320 核心回归：文本节点上游连接带文件名文本的图片节点时，必须正确传递 image 物理路径给 gateway', async () => {
    /** @type {any[]} */
    const submissions = [];
    const mockGateway = {
      submit: async (req) => {
        submissions.push(req);
        return { taskId: 't1', mode: 'stub' };
      },
      awaitTask: async () => ({ text: '这是识别到的图片内容' }),
      capabilities: async () => catalogFor('text', 'gemini-3.7-flash', [operation('vision_chat', 'text', [slot('image')])]),
      mode: 'mock',
    };
    const executor = createMaterialGatewayExecutor({ gateway: mockGateway });

    const upstreamOutputs = new Map();
    // 模拟上游导入的图片节点输出：既有 content: '截屏2026-08-09 15.18.59.png'，又有 mediaAssets
    upstreamOutputs.set('img-node-1', {
      text: '截屏2026-08-09 15.18.59.png',
      realPath: mediaFixture('截屏2026-08-09.png'),
      mediaAssets: [
        {
          type: 'image',
          url: `/omnimux-workflow/api/local-file?path=${encodeURIComponent(mediaFixture('截屏2026-08-09.png'))}`,
          path: mediaFixture('截屏2026-08-09.png'),
        },
      ],
    });

    const mockCtx = {
      upstreamOutputs,
      signal: new AbortController().signal,
      mediaDir: '/tmp/workflow/media/executions/e1',
    };

    const output = await executor.execute(
      {
        id: 'txt-node-1',
        type: 'material',
        data: {
          materialType: 'text',
          selectedTool: 'text-to-text',
          prompt: '解释下这个图片',
          params: { model: 'gemini-3.7-flash' },
        },
      },
      mockCtx,
    );

    assert.equal(submissions.length, 1, 'gateway.submit 应该被调用一次');
    const req = submissions[0];
    assert.equal(req.capability, 'text');
    assert.equal(req.prompt, '解释下这个图片');
    assert.equal(req.model, 'gemini-3.7-flash');
    assert.equal(req.image, mediaFixture('截屏2026-08-09.png'), 'image 必须成功解析为物理绝对路径');
    assert.equal(output.text, '这是识别到的图片内容');
  });

  it('上游图片节点仅有 local-file URL 且无显式 path 时，能正确从 URL 解码物理路径', async () => {
    /** @type {any[]} */
    const submissions = [];
    const mockGateway = {
      submit: async (req) => {
        submissions.push(req);
        return { taskId: 't2', mode: 'stub' };
      },
      awaitTask: async () => ({ text: 'ok' }),
      capabilities: async () => catalogFor('text', 'gemini-3.7-flash', [operation('vision_chat', 'text', [slot('image')])]),
      mode: 'mock',
    };
    const executor = createMaterialGatewayExecutor({ gateway: mockGateway });

    const upstreamOutputs = new Map();
    upstreamOutputs.set('img-node-url', {
      text: 'photo.jpg',
      mediaAssets: [
        {
          type: 'image',
          url: `/omnimux-workflow/api/local-file?path=${encodeURIComponent(mediaFixture('photo.jpg'))}`,
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
        id: 'txt-node-2',
        type: 'material',
        data: {
          materialType: 'text',
          prompt: '识别图片',
        },
      },
      mockCtx,
    );

    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].image, mediaFixture('photo.jpg'));
  });
});
