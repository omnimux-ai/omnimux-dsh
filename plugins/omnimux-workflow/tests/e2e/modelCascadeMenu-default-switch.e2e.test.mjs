import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cascadePath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/ModelCascadeMenu.tsx');
const cascadeSrc = readFileSync(cascadePath, 'utf8');

test('e2e: model cascade menu switches to default model on first-level menu click', () => {
  // 1. 验证存在各模态与品牌的默认模型映射表
  assert.match(cascadeSrc, /DEFAULT_MODEL_BY_BRAND_AND_MATERIAL/, 'Must declare default models by brand and modality');
  assert.match(cascadeSrc, /defaultModelForBrand/, 'Must declare defaultModelForBrand helper');

  // 2. 验证 DeepSeek 与 Google 默认模型配置符合契约
  assert.match(cascadeSrc, /deepseek:\s*['"]deepseek-v4-flash-vision-exp['"]/, 'DeepSeek default must be deepseek-v4-flash-vision-exp');
  assert.match(cascadeSrc, /google:\s*['"]gemini-3.8-flash['"]/, 'Google default must be gemini-3.8-flash');

  // 3. 验证点击一级品牌菜单时立即调用 defaultModelForBrand 并切换选中该模型
  assert.match(
    cascadeSrc,
    /const handleBrandClick = useCallback\(\(brandId: string\) => \{[\s\S]*?const targetModelId = defaultModelForBrand\(brandId, materialType, rows\);[\s\S]*?handleSelectModel\(targetModelId\);/m,
    'handleBrandClick must immediately resolve and commit default model',
  );

  // 4. 验证 handleSelectModel 正确提交 modelId 与渠道分组
  assert.match(cascadeSrc, /emit\(modelId, activeStrategy, groupIds\);/, 'handleSelectModel must emit selected model and routing to node');
});

test('e2e: model cascade menu enforces strict brand boundary and prevents cross-brand leakage', () => {
  // 1. 验证存在严格的 modelBelongsToBrand 判定函数
  assert.match(
    cascadeSrc,
    /function modelBelongsToBrand\(modelId: string, brandId: string\): boolean/,
    'Must declare strict modelBelongsToBrand helper',
  );

  // 2. 验证 shownModels 计算中，补全 needsActive 包含所属品牌强校验（严格特征词判定，无兜底假阳性）
  assert.match(
    cascadeSrc,
    /const belongsToBrand = modelBelongsToBrand\(activeModelId, shownBrandId\);/,
    'Must check if activeModelId actually belongs to shownBrandId via modelBelongsToBrand',
  );
  assert.match(
    cascadeSrc,
    /const needsActive = belongsToBrand\s*&&\s*activeModelId\s*&&\s*!rows\.some\(\(row\) => row\.id === activeModelId\);/,
    'needsActive must guard with belongsToBrand',
  );

  // 3. 确保不存在任何仅判断 shownBrandId === activeBrandId 就直接插入跨品牌模型的漏洞
  assert.doesNotMatch(
    cascadeSrc,
    /const needsActive = shownBrandId === activeBrandId\s*&&\s*activeModelId\s*&&\s*!rows\.some/,
    'Vulnerable needsActive check must be completely eliminated',
  );
});
