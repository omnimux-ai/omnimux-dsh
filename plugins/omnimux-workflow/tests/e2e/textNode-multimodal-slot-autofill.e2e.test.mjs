import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const configPanelPath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx');
const slotRecomputePath = join(here, '../../src/shared/graph/canvasSlotRecompute.ts');
const resolveSlotOpPath = join(here, '../../src/shared/graph/feedSlot/resolveSlotOperation.ts');

const configPanelSrc = readFileSync(configPanelPath, 'utf8');
const slotRecomputeSrc = readFileSync(slotRecomputePath, 'utf8');
const resolveSlotOpSrc = readFileSync(resolveSlotOpPath, 'utf8');

test('E2E: 文本节点连入多模态素材自动穿透旧空绑定并装填进卡槽', () => {
  // 1. ConfigPanel 必须对文本节点空 slotBindings 对象进行自愈穿透，允许自动装填
  assert.match(
    configPanelSrc,
    /storedSlotBindings\s*=\s*useMemo\([\s\S]*?raw\s*=\s*nodeData\.slotBindings[\s\S]*?Object\.keys\(raw\)\.length === 0/,
    'ConfigPanel 必须包含空 slotBindings 穿透逻辑，避免历史残留阻断装填',
  );

  // 2. canvasSlotRecompute 必须在文本节点选中多模态模型时自愈 operation 与空 slotBindings
  assert.match(
    slotRecomputeSrc,
    /outputType === 'text'[\s\S]*?params\.operation === 'chat'/,
    'canvasSlotRecompute 必须自动将文本节点的 chat 操作重新评估为多模态 operation',
  );
  assert.match(
    slotRecomputeSrc,
    /outputType === 'text' && explicit && Object\.keys\(explicit\)\.length === 0/,
    'canvasSlotRecompute 必须穿透文本节点空 explicit 绑定',
  );

  // 3. resolveSlotOperation 强制对具备多模态能力的文本节点返回多模态 operation
  assert.match(
    resolveSlotOpSrc,
    /const isTextTask = outputType === 'text' \|\| !outputType;/,
    'resolveSlotOperation 必须标识文本任务',
  );
  assert.match(
    resolveSlotOpSrc,
    /op\.output\.type === 'text' &&[\s\S]*?op\.inputs\.some\(\(input\) => input\.type !== 'text'/,
    'resolveSlotOperation 必须根据多模态输入槽位匹配多模态 operation',
  );
});
