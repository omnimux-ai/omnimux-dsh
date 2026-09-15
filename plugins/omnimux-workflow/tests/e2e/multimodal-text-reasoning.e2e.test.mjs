import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const connectionConfigPath = join(here, '../../src/shared/graph/connectionConfig.ts');
const materialNodeSpecPath = join(here, '../../src/shared/specs/nodes/materialNodeSpec.ts');
const handlesPath = join(here, '../../src/canvas/editor/components/MaterialNode/NodeHandles/MaterialNodeHandles.tsx');
const hookPath = join(here, '../../src/canvas/editor/hooks/useConnectionMenu.ts');
const dictZhPath = join(here, '../../src/canvas/i18n/dict.zh.ts');

const connectionConfigSrc = readFileSync(connectionConfigPath, 'utf8');
const materialNodeSpecSrc = readFileSync(materialNodeSpecPath, 'utf8');
const handlesSrc = readFileSync(handlesPath, 'utf8');
const hookSrc = readFileSync(hookPath, 'utf8');
const dictZhSrc = readFileSync(dictZhPath, 'utf8');

test('E2E: 多模态素材（图片、视频、音频）全链路支持生成文本推理节点与连线', () => {
  // 1. connectionConfig: image, video, audio 必须都包含 targetTool 为 text-to-text 的输出配置
  assert.match(
    connectionConfigSrc,
    /image:\s*\[[\s\S]*?targetTool:\s*'text-to-text'/,
    '图片节点必须支持生成文本推理',
  );
  assert.match(
    connectionConfigSrc,
    /video:\s*\[[\s\S]*?targetTool:\s*'text-to-text'/,
    '视频节点必须支持生成文本推理',
  );
  assert.match(
    connectionConfigSrc,
    /audio:\s*\[[\s\S]*?targetTool:\s*'text-to-text'/,
    '音频节点必须支持生成文本推理',
  );

  // 2. materialNodeSpec: text-to-text 工具的 acceptedInputTypes 必须包含 audio
  assert.match(
    materialNodeSpecSrc,
    /id:\s*'text-to-text'[\s\S]*?acceptedInputTypes:\s*\[[^\]]*'audio'[^\]]*\]/,
    '文本生成工具必须接纳 audio 多模态输入',
  );

  // 3. MaterialNodeHandles: 点击生成菜单必须传入 parsed.targetTool 作为 selectedTool
  assert.match(
    handlesSrc,
    /createMaterialNode\([\s\S]*?parsed\.targetMaterialType[\s\S]*?selectedTool:\s*parsed\.targetTool/,
    '句柄菜单选择创建节点必须显式指定 selectedTool 为 parsed.targetTool',
  );

  // 4. useConnectionMenu: 空白处释放菜单必须传入 parsed.targetTool 作为 selectedTool
  assert.match(
    hookSrc,
    /createMaterialNode\([\s\S]*?parsed\.targetMaterialType[\s\S]*?selectedTool:\s*parsed\.targetTool/,
    '释放菜单选择创建节点必须显式指定 selectedTool 为 parsed.targetTool',
  );

  // 5. dict.zh: 中文字典中包含图片、视频、音频的「文本推理」菜单文案
  assert.match(dictZhSrc, /'menu\.option\.image\.text-text-to-text':\s*'文本推理'/);
  assert.match(dictZhSrc, /'menu\.option\.video\.text-text-to-text':\s*'文本推理'/);
  assert.match(dictZhSrc, /'menu\.option\.audio\.text-text-to-text':\s*'文本推理'/);
});
