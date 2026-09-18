import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupPickerCandidates } from '../../src/canvas/editor/components/MaterialNode/ConfigPanel/modelPickerCandidates.ts';

const here = dirname(fileURLToPath(import.meta.url));
const brandCandidatesPath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/modelPickerCandidates.ts');
const brandCandidatesSrc = readFileSync(brandCandidatesPath, 'utf8');

const brandIconPath = join(here, '../../src/canvas/ui/ModelBrandIcon.tsx');
const brandIconSrc = readFileSync(brandIconPath, 'utf8');

test('e2e: model cascade menu groups gxgenai/index-tts as Index TTS2 brand', () => {
  // 1. 确认候选列表分组算法将 indextts 正确归集为 Index TTS2
  const options = [
    { id: 'index-tts', label: 'Index TTS2 声音克隆', family: 'indextts' },
    { id: 'seed-audio-1.0', label: 'Seed Audio 1.0', family: 'bytedance' },
  ];
  const groups = groupPickerCandidates(options);
  assert.equal(groups[0].name, 'Index TTS2', 'Brand column must display Index TTS2 instead of gxgenai');
  assert.equal(groups[0].id, 'indextts');

  // 2. 确认兼容原始 gxgenai 标识仍能映射到 Index TTS2
  const legacyOptions = [
    { id: 'index-tts', label: 'Index TTS2 声音克隆', family: 'gxgenai' },
  ];
  const legacyGroups = groupPickerCandidates(legacyOptions);
  assert.equal(legacyGroups[0].name, 'Index TTS2', 'Legacy gxgenai family must map to Index TTS2');

  // 3. 确认源码中已配置 Index TTS2 别名
  assert.match(brandCandidatesSrc, /\['indextts',\s*'Index TTS2'/, 'modelPickerCandidates.ts must register Index TTS2 brand');

  // 4. 确认 ModelBrandIcon 具备 indextts 对应规则与 SVG
  assert.match(brandIconSrc, /indextts:/, 'ModelBrandIcon must contain indextts SVG asset');
  assert.match(brandIconSrc, /brand:\s*'indextts'/, 'ModelBrandIcon must match indextts brand rule');
});
