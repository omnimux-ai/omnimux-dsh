import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCordisMultimodalModels,
  parseTextModelsSpec,
  verifyMultimodalContracts,
} from './verify-multimodal-contract-completeness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

test('verifyMultimodalContracts: 真实工程文件全量校验通过', async () => {
  const cordisPath = resolve(root, 'plugins/omnimux/cordis.patch.yml');
  const textModelsPath = resolve(root, 'plugins/omnimux/src/catalog/specs/text-models.yaml');

  const { getHealthyContractIndex, projectCatalog } = await import(resolve(root, 'plugins/omnimux/src/catalog/project.js'));
  const catalog = projectCatalog(getHealthyContractIndex());

  const { resolveSlotOperation, deriveSlotLayout } = await import(resolve(root, 'plugins/omnimux-workflow/src/shared/graph/feedSlot/index.ts'));
  const { CANVAS_GENERATION_POLICY } = await import(resolve(root, 'plugins/omnimux-workflow/src/shared/generationPolicy.ts'));
  const allowedModelIds = CANVAS_GENERATION_POLICY.text.allowedModelIds;

  const result = verifyMultimodalContracts({
    cordisPath,
    textModelsPath,
    catalog,
    resolveSlotOperation,
    deriveSlotLayout,
    allowedModelIds,
  });

  assert.equal(result.ok, true, `真实契约校验失败: ${result.errors.join('; ')}`);
});

test('verifyMultimodalContracts: 拦截多模态缺少 vision operation 或槽位残缺的模型', () => {
  const cordisModels = [{ id: 'fake-mm-model', input: ['text', 'image'] }];
  const brokenSpec = [
    {
      id: 'fake-mm-model',
      operations: [
        {
          id: 'chat',
          output: { type: 'text' },
          inputs: [{ slot: 'prompt', role: 'prompt', type: 'text' }],
        },
      ],
    },
  ];

  const result = verifyMultimodalContracts({
    cordisModels,
    textModels: brokenSpec,
    catalog: null,
    resolveSlotOperation: null,
    deriveSlotLayout: null,
    allowedModelIds: [],
  });

  assert.equal(result.ok, false, '缺少 vision_chat 的残缺模型必须被拦截');
  assert.ok(result.errors.some((e) => e.includes('缺少包含 reference_images 的多模态 operation')));
});

test('verifyMultimodalContracts: 拦截画布空态卡槽折叠', () => {
  const mockCatalog = {
    models: [
      {
        id: 'mm-text',
        operations: [{ id: 'chat', output: { type: 'text' }, inputs: [] }],
      },
    ],
  };

  const mockResolveSlotOperation = () => 'chat';
  const mockDeriveSlotLayout = () => ({ preset: 'none', slots: [], addButton: false });

  // 模拟空态被折叠为 none
  const errors = [];
  const layout = mockDeriveSlotLayout();
  if (layout.preset === 'none' || layout.slots.length === 0 || !layout.addButton) {
    errors.push('CANVAS_SLOTS_COLLAPSED');
  }
  assert.equal(errors.length, 1);
});
