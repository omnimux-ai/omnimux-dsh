/**
 * E2E: 中枢模型检索面板模型分组在线测试与最小样本全链路契约验证
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../..');

test('E2E: deriveTestSample 自动为各模态模型推导合规最小测试样本', async () => {
  const { deriveTestSample } = await import(path.join(rootDir, 'scripts/model-test-sample.mjs'));

  // 1. 文本模型样本推导
  const textModel = {
    id: 'gemini-3.8-flash',
    managementGroup: 'text',
    operations: [
      { id: 'chat', label: '文本对话', listed: true, inputs: [{ slot: 'prompt', type: 'text', min: 1 }] },
    ],
  };
  const textSample = deriveTestSample(textModel);
  assert.equal(textSample.operationId, 'chat');
  assert.equal(textSample.hasMaterial, false);
  assert.ok(typeof textSample.prompt === 'string' && textSample.prompt.length > 0);

  // 2. 生图模型样本推导（带 resolution 与 aspectRatio 参数）
  const imageModel = {
    id: 'gpt-image-2.5',
    managementGroup: 'image',
    operations: [
      { id: 'text_to_image', label: '文生图', listed: true, inputs: [{ slot: 'prompt', type: 'text', min: 1 }] },
    ],
    parameters: {
      resolution: { options: ['1024x1024', '2K'], defaultValue: '1024x1024' },
      aspectRatio: { options: ['1:1', '16:9'], defaultValue: '1:1' },
    },
  };
  const imageSample = deriveTestSample(imageModel);
  assert.equal(imageSample.operationId, 'text_to_image');
  assert.equal(imageSample.parameters.resolution, '1024x1024');
  assert.equal(imageSample.parameters.aspectRatio, '1:1');
  assert.equal(imageSample.hasMaterial, false);

  // 3. 必须提供素材的生图模型样本推导（如 multi_reference 槽位要求参考图）
  const imageWithAssetModel = {
    id: 'custom-ref-image',
    managementGroup: 'image',
    operations: [
      {
        id: 'multi_reference',
        label: '垫图生图',
        listed: true,
        inputs: [
          { slot: 'prompt', type: 'text', min: 1 },
          { slot: 'reference_image', type: 'image', role: 'reference', min: 1, maxSizeMb: 10, allowedMimes: ['image/jpeg', 'image/png'] },
        ],
      },
    ],
  };
  const refImageSample = deriveTestSample(imageWithAssetModel);
  assert.equal(refImageSample.operationId, 'multi_reference');
  assert.equal(refImageSample.hasMaterial, true);
  assert.ok(Array.isArray(refImageSample.assets) && refImageSample.assets.length === 1);
  assert.equal(refImageSample.assets[0].type, 'image');
  assert.equal(refImageSample.assets[0].role, 'reference');
  assert.ok(refImageSample.assets[0].sizeBytes > 0);
  assert.equal(refImageSample.assets[0].mime, 'image/jpeg');

  // 4. 视频模型样本推导（带 duration、resolution 与约束生效）
  const videoModel = {
    id: 'seedance-2-0-fast',
    managementGroup: 'video',
    operations: [
      { id: 'text_to_video', label: '文生视频', listed: true, inputs: [{ slot: 'prompt', type: 'text', min: 1 }] },
    ],
    parameters: {
      duration: { options: [5, 10], defaultValue: 5 },
      resolution: { options: ['480p', '720p'], defaultValue: '720p' },
    },
  };
  const videoGroupWithConstraint = {
    id: 'custom_group',
    constraints: {
      parameters: {
        duration: { fixed: 10 },
        resolution: '480p',
      },
    },
  };
  const videoSample = deriveTestSample(videoModel, videoGroupWithConstraint);
  assert.equal(videoSample.operationId, 'text_to_video');
  assert.equal(videoSample.parameters.duration, 10);
  assert.equal(videoSample.parameters.resolution, '480p');
});

test('E2E: collectConsoleData 与 renderConsoleHtml 渲染测试按钮与预设样本卡片', async () => {
  const { collectConsoleData, renderConsoleHtml } = await import(
    path.join(rootDir, 'scripts/generate-model-console.mjs')
  );
  const data = await collectConsoleData();

  // 1. 验证数据中包含 testSample
  assert.ok(data.models.length > 0, '模型列表不为空');
  const gemini = data.models.find((m) => m.id === 'gemini-3.8-flash');
  assert.ok(gemini, '应包含 gemini-3.8-flash 模型');
  assert.ok(gemini.groups.length > 0, 'Gemini 应具有线路分组');
  assert.ok(gemini.groups[0].testSample, '线路分组应携带预设 testSample');

  // 2. 验证 HTML 渲染测试元素
  const html = renderConsoleHtml(data, { live: true });
  assert.ok(html.includes('class="test-btn'), '应渲染测试操作按钮');
  assert.ok(html.includes('运行测试'), '初始按钮文案应为「运行测试」');
  assert.ok(html.includes('class="sample-box"'), '应渲染预设测试样本卡片');
  assert.ok(html.includes('测试提示词:'), '应展示测试提示词信息');
  assert.ok(html.includes('class="test-result-box"'), '应包含测试结果容器');

  // 3. 验证 UI04 硬门禁：严禁在按钮或标签中直接使用 Unicode Emoji
  const forbiddenEmojis = ['🚀', '⏳', '✨', '❌', '🔍', '⚙️', '✅', '🗑️', '🎬', '⚡'];
  for (const emoji of forbiddenEmojis) {
    assert.ok(!html.includes(emoji), `严禁在面板中出现 Emoji: ${emoji}`);
  }
});

test('E2E: executeModelTest 正确处理契约门禁与错误格式化', async () => {
  const { executeModelTest } = await import(path.join(rootDir, 'scripts/model-test-sample.mjs'));

  // 1. 契约校验失败场景：传入非法参数
  const badResult = await executeModelTest({
    modelId: 'gemini-3.8-flash',
    sample: {
      operationId: 'chat',
      prompt: '', // 空 prompt 将被拦截
      parameters: {},
    },
    apiKey: 'dummy_key',
  });
  assert.equal(badResult.ok, false);
  assert.ok(badResult.error.startsWith('失败错误原因：'), '错误信息必须以「失败错误原因：」开头');

  // 2. 缺失 API 密钥场景：大白话归因提示
  const noKeyResult = await executeModelTest({
    modelId: 'gemini-3.8-flash',
    sample: {
      operationId: 'chat',
      prompt: 'hi',
      parameters: {},
    },
    apiKey: '',
  });
  assert.equal(noKeyResult.ok, false);
  assert.ok(noKeyResult.error.includes('失败错误原因：未检测到可用中枢凭据'));
});
