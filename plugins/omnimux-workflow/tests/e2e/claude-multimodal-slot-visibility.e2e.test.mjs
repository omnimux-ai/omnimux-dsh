import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const configPanelPath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx');
const textModelsYamlPath = join(root, 'plugins/omnimux/src/catalog/specs/text-models.yaml');

const configPanelSrc = readFileSync(configPanelPath, 'utf8');
const textModelsYamlSrc = readFileSync(textModelsYamlPath, 'utf8');

test('E2E: Claude Sonnet 4.6 多模态契约完整性与画布空态卡槽展示可见性', async () => {
  // 1. ConfigPanel 文本节点不得被 preferredOperationId === 'chat' 锁死，必须委托 resolveSlotOperation
  assert.match(
    configPanelSrc,
    /isTextTask\s*=\s*outputTypeForCompat === 'text'/,
    'ConfigPanel 必须正确判定文本任务',
  );
  assert.match(
    configPanelSrc,
    /currentInputs && preferredOperationId && !isTextTask \? preferredOperationId\s*:\s*resolveSlotOperation/,
    'ConfigPanel 文本节点必须通过 resolveSlotOperation 解析多模态卡槽，避免空态 chat 锁死',
  );

  // 2. text-models.yaml 中 Claude Sonnet 4.6 必须包含完整 valueSources 与 composition 声明
  assert.match(
    textModelsYamlSrc,
    /- id:\s*"claude-sonnet-4-6"[\s\S]*?valueSources:\s*\["local_field",\s*"upstream_output"\]/,
    'Claude Sonnet 4.6 必须包含 upstream_output 输入源声明',
  );
  assert.match(
    textModelsYamlSrc,
    /- id:\s*"claude-sonnet-4-6"[\s\S]*?composition:\s*\{\s*kind:\s*"content_with_instruction"/,
    'Claude Sonnet 4.6 必须包含 content_with_instruction 组合声明',
  );

  // 3. 动态验证：画布加载真实 Catalog 时，Claude 4.6 在空态下 100% 派生媒体卡槽
  const { getHealthyContractIndex, projectCatalog } = await import(join(root, 'plugins/omnimux/src/catalog/project.js'));
  const catalog = projectCatalog(getHealthyContractIndex());
  const { resolveSlotOperation, deriveSlotLayout } = await import(join(here, '../../src/shared/graph/feedSlot/index.ts'));

  const emptyFingerprint = { prompt: '', assets: [], mediaAssets: [], texts: [] };
  const opId = resolveSlotOperation(catalog, 'claude-sonnet-4-6', 'chat', 'text', emptyFingerprint);
  assert.equal(opId, 'vision_chat', '空态下 Claude Sonnet 4.6 即使带 chat 也必须自适应解析为 vision_chat');

  const layout = deriveSlotLayout(catalog, 'claude-sonnet-4-6', opId);
  assert.equal(layout.preset, 'strip', '空态卡槽预设必须为 strip');
  assert.equal(layout.addButton, true, '空态卡槽必须展示添加按钮 (addButton: true)');
  assert.ok(layout.slots.some((s) => s.slot === 'reference_images'), '空态卡槽必须展示 reference_images 参考图槽位');
});
