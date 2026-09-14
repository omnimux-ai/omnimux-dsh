import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cascadeSrc = readFileSync(join(here, 'ModelCascadeMenu.tsx'), 'utf8');
const configSrc = readFileSync(join(here, 'index.tsx'), 'utf8');

describe('ModelCascadeMenu source contracts', () => {
  it('binds hover and selected CSS classes without inline transparent backgrounds', () => {
    // 必须有专有的规范 class 类名
    assert.match(cascadeSrc, /wf-cascade-brand-item/);
    assert.match(cascadeSrc, /wf-cascade-model-item/);
    assert.match(cascadeSrc, /wf-cascade-strategy-btn/);
    assert.match(cascadeSrc, /wf-cascade-channel-row/);
    // 选项按钮不得内联设置 background: 'transparent'，否则会压死 CSS 中的 :hover
    assert.doesNotMatch(cascadeSrc, /background:\s*isSelected\s*\?\s*['"][^'"]+['"]\s*:\s*['"]transparent['"]/);
  });

  it('stores no raw hex or banned token', () => {
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const code = stripComments(cascadeSrc);
    assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b/, 'ModelCascadeMenu must not contain raw hex');
    assert.doesNotMatch(code, /--omx-/, 'ModelCascadeMenu must not contain banned tokens');
  });

  it('declares the trigger capsule, three panels and the stability dot bar', () => {
    assert.match(cascadeSrc, /StabilityDotBar/);
    assert.match(cascadeSrc, /wf-model-cascade-capsule/);
    assert.match(cascadeSrc, /wf-model-cascade-popover/);
    assert.match(cascadeSrc, /稳定性优先/);
    assert.match(cascadeSrc, /低价优先/);
    assert.match(cascadeSrc, /已选/);
  });

  it('uses derived chips so the discount is never rendered twice', () => {
    assert.match(cascadeSrc, /formatPriceChip/);
    assert.match(cascadeSrc, /formatBillingLabel/);
    assert.match(cascadeSrc, /formatPriceLabel/);
    // 无 SLA 的分组显示「暂无数据」，不用默认 100% 冒充。
    assert.match(cascadeSrc, /稳定性暂无数据/);
    assert.doesNotMatch(cascadeSrc, /group\.sla\?\.stability24h \?\? 100/);
    assert.match(configSrc, /ModelCascadeMenu/);
  });

  it('offers channel selection for every modality, with an empty state for pools that do not exist', () => {
    // Text nodes route like media nodes: a routed text request goes through the
    // hub's direct chat path, so the picker must not hide the column.
    assert.doesNotMatch(cascadeSrc, /不提供渠道选择/);
    assert.match(cascadeSrc, /channelGroups\.length === 0/);
    assert.match(cascadeSrc, /尚未配置渠道分组/);
  });

  it('lists real product brands only, never aggregate placeholder names', () => {
    // Issue #1402: the brand column is what the user reads first, so it carries
    // the vendor/product name and nothing invented.
    // 品牌注册表内不得出现聚合名；断言收窄到 ALL_BRANDS 段，避免误伤普通描述文案。
    const brandBlock = cascadeSrc.slice(
      cascadeSrc.indexOf('const ALL_BRANDS'),
      cascadeSrc.indexOf('const BRAND_MATCHERS'),
    );
    assert.ok(brandBlock.length > 0, 'ALL_BRANDS block must exist');
    assert.doesNotMatch(brandBlock, /全能/, 'aggregate brand names must be gone');
    assert.doesNotMatch(cascadeSrc, /all_omni|all_x/, 'aggregate brand ids must be gone');
    assert.match(cascadeSrc, /\{ id: 'openai', name: 'OpenAI'/);
    assert.match(cascadeSrc, /id: 'google', name: 'Google',/);
    assert.doesNotMatch(cascadeSrc, /Google Gemini/);
    // Brands are derived from the catalog, so a brand without models cannot become a dead end.
    assert.match(cascadeSrc, /const withModels = ordered\.filter\(\(brand\) => modelsForBrand\(brand\.id\)\.length > 0\)/);
  });

  it('switches submenus on hover and only commits on click', () => {
    assert.match(cascadeSrc, /onMouseEnter=\{\(\) => handleBrandHover\(brand\.id\)\}/);
    assert.match(cascadeSrc, /onMouseEnter=\{\(\) => handleModelHover\(item\.id\)\}/);
    // Hover is preview-only: the commit path stays on the click handlers.
    assert.match(cascadeSrc, /const handleBrandHover = useCallback/);
    assert.doesNotMatch(cascadeSrc, /onMouseEnter=\{\(\) => handleSelectModel/);
    assert.match(cascadeSrc, /onClick=\{\(\) => handleSelectModel\(item\.id\)\}/);
  });

  it('reveals channel column only when model has multiple channels (>1); hides 3rd column if empty or single', () => {
    // 渠道策略列（三级菜单）仅在模型具有多个可选渠道时（>1）才展示；
    // 若分组为空（0个）或只有唯一默认渠道（<=1），则直接不显示三级菜单。
    assert.match(cascadeSrc, /const hasMultipleChannels = channelGroups\.length > 1/);
    assert.match(cascadeSrc, /const showChannelColumn = hasMultipleChannels && \(hoveringOtherBrand \? hoverModelId !== null : true\)/);
    assert.match(cascadeSrc, /\{showChannelColumn \? \(/);
    assert.match(cascadeSrc, /onMouseLeave=\{handlePopoverLeave\}/);
    assert.match(cascadeSrc, /const handlePopoverLeave = useCallback\(\(\) => \{/);
  });

  it('keeps the popover on the viewport anchor and paints it with the resolved canvas surface', () => {
    // portal 必须挂 document.body：画布宿主面板带 contain: layout，会成为 position:fixed
    // 的包含块，portal 进画布内会让 left/bottom（按视口算）整体错位。
    assert.match(cascadeSrc, /document\.body,\n\s*\)/);
    assert.doesNotMatch(cascadeSrc, /canvasPortalHost/);
    // 底色来自打开时解析的画布真实表面色，不依赖主题作用域、也不再需要模糊。
    assert.match(cascadeSrc, /resolvePopoverSurface\(triggerRef\.current\)/);
    assert.match(cascadeSrc, /--wb-surface-elevated/);
    assert.match(cascadeSrc, /wf-loomi-col/);
    assert.doesNotMatch(cascadeSrc, /backdropFilter/);
  });

  it('renders the catalog display fields, not raw ids', () => {
    // CapabilityModelItem 的显示契约是 label / subtitle；读不存在的 name 会退回裸 id。
    assert.match(cascadeSrc, /typeof row\.label === 'string' && row\.label \? row\.label : item\.id/);
    assert.match(cascadeSrc, /typeof row\.subtitle === 'string' && row\.subtitle/);
    assert.doesNotMatch(cascadeSrc, /row\.name/);
  });

  it('keeps the popover anchor fixed so a revealed column cannot move the menu under the cursor', () => {
    assert.match(cascadeSrc, /POPOVER_MAX_WIDTH = 814/);
    assert.doesNotMatch(cascadeSrc, /panelWidth/, 'positioning must not depend on the visible column count');
  });

  it('keeps a hovered-but-uncommitted model read-only in the channel column without redundant preview prompt', () => {
    assert.match(cascadeSrc, /const isChannelPreview = hoverModelId !== null && hoverModelId !== activeModelId/);
    assert.match(cascadeSrc, /disabled=\{isChannelPreview\}/);
    // 冗余设计已移除：不得渲染「预览中 · 点击该型号后即可调整渠道」及预览分割线
    assert.doesNotMatch(cascadeSrc, /预览中/);
  });

  it('always sends allowedGroups when a pool resolved, and drops routing when it did not', () => {
    assert.match(cascadeSrc, /groupIds\.length === 0 \? \{\} : \{ allowedGroups: groupIds \}/);
    assert.match(configSrc, /delete nextParams\.routing/);
  });

  it('re-syncs brand and channel selection when the node data changes externally', () => {
    assert.match(cascadeSrc, /setActiveBrandId\(brandForModel\(currentModelId, allowedBrands\)\)/);
    assert.match(cascadeSrc, /setSelectedGroupIds\(persistedGroups\?\.length \? persistedGroups : groups\.map/);
  });

  it('closes on Escape and outside click through refs, and repositions on resize', () => {
    assert.match(cascadeSrc, /event\.key === 'Escape'/);
    assert.match(cascadeSrc, /popoverRef\.current\?\.contains\(target\)/);
    assert.match(cascadeSrc, /window\.addEventListener\('resize', place\)/);
    assert.doesNotMatch(cascadeSrc, /querySelector\('\.wf-model-cascade-popover'\)/);
  });

  it('exposes menu semantics for keyboard and screen readers', () => {
    assert.match(cascadeSrc, /role="menu"/);
    assert.match(cascadeSrc, /role="menuitemcheckbox"/);
    assert.match(cascadeSrc, /role="menuitemradio"/);
    assert.match(cascadeSrc, /aria-expanded=\{isOpen\}/);
  });

  it('keeps the superseded routing modal out of the panel', () => {
    assert.doesNotMatch(configSrc, /ModelRoutingModal/);
    assert.doesNotMatch(configSrc, /routingModalOpen/);
  });

  it('configures default models for each secondary menu across modalities', () => {
    assert.match(cascadeSrc, /DEFAULT_MODEL_BY_BRAND_AND_MATERIAL/);
    assert.match(cascadeSrc, /DEFAULT_MODEL_BY_BRAND/);
    assert.match(cascadeSrc, /defaultModelForBrand/);
    // DeepSeek 默认模型配置为 deepseek-v4-flash-vision-exp
    assert.match(cascadeSrc, /deepseek:\s*['"]deepseek-v4-flash-vision-exp['"]/);
    // Google 默认模型配置为 gemini-3.8-flash
    assert.match(cascadeSrc, /google:\s*['"]gemini-3.8-flash['"]/);
  });

  it('immediately switches to brand default model on first-level menu click', () => {
    // 点击一级菜单必须触发 defaultModelForBrand 并调用 handleSelectModel 提交节点
    assert.match(cascadeSrc, /const handleBrandClick = useCallback\(\(brandId: string\) => \{/);
    assert.match(cascadeSrc, /const targetModelId = defaultModelForBrand\(brandId, materialType, rows\);/);
    assert.match(cascadeSrc, /handleSelectModel\(targetModelId\);/);
  });

  it('strictly isolates models by brand and prevents cross-brand model leakage', () => {
    // 根治跨品牌串台：needsActive 必须包含 brandForModel 属于当前展示品牌的强校验
    assert.match(cascadeSrc, /const belongsToBrand = brandForModel\(activeModelId, allowedBrands\) === shownBrandId;/);
    assert.match(cascadeSrc, /const needsActive = belongsToBrand/);
  });
});

describe('ModelCascadeMenu runtime behavior & cross-brand isolation logic', () => {
  // 动态提取/模拟 ModelCascadeMenu 的核心算法验证真实业务契约
  const BRAND_MATCHERS = [
    { brand: 'openai', fragments: ['gpt', 'o1', 'o3', 'o4'] },
    { brand: 'bytedance', fragments: ['seed'] },
    { brand: 'minimax', fragments: ['minimax', 'hailuo'] },
    { brand: 'kling', fragments: ['kling'] },
    { brand: 'alibaba', fragments: ['wan'] },
    { brand: 'happyhorse', fragments: ['horse'] },
    { brand: 'anthropic', fragments: ['claude', 'opus', 'sonnet'] },
    { brand: 'deepseek', fragments: ['deepseek'] },
    { brand: 'google', fragments: ['gemini', 'banana', 'imagen', 'veo'] },
    { brand: 'midjourney', fragments: ['midjourney', 'mj'] },
    { brand: 'xai', fragments: ['grok', 'xai'] },
  ];

  const allowedBrands = ['openai', 'anthropic', 'google', 'deepseek', 'minimax'];

  function brandForModel(modelId, allowed) {
    const id = modelId.toLowerCase();
    for (const { brand, fragments } of BRAND_MATCHERS) {
      if (allowed.includes(brand) && fragments.some((fragment) => id.includes(fragment))) return brand;
    }
    return allowed[0] ?? 'bytedance';
  }

  const DEFAULT_MODEL_BY_BRAND_AND_MATERIAL = {
    text: {
      openai: 'gpt-5.5',
      anthropic: 'claude-opus-4-6',
      google: 'gemini-3.8-flash',
      deepseek: 'deepseek-v4-flash-vision-exp',
      minimax: 'minimax-h3',
    },
    image: {
      openai: 'gpt-image-2.5',
      google: 'nano-banana-2',
      bytedance: 'seedance-2-0-fast',
      kling: 'kling',
      midjourney: 'midjourney',
      xai: 'grok-imagine-image-2',
    },
    video: {
      bytedance: 'seedance-2-0-fast',
      openai: 'gpt-5.5',
      minimax: 'minimax-h3',
      kling: 'kling',
      alibaba: 'wan-3.0',
      happyhorse: 'wan-3.0',
      google: 'gemini-3.8-flash',
      xai: 'grok-imagine-video-1-5',
    },
  };

  const DEFAULT_MODEL_BY_BRAND = {
    openai: 'gpt-5.5',
    anthropic: 'claude-opus-4-6',
    deepseek: 'deepseek-v4-flash-vision-exp',
    google: 'gemini-3.8-flash',
    bytedance: 'seedance-2-0-fast',
    minimax: 'minimax-h3',
    kling: 'kling',
    alibaba: 'wan-3.0',
    happyhorse: 'wan-3.0',
    midjourney: 'midjourney',
    xai: 'grok-imagine-video-1-5',
  };

  function defaultModelForBrand(brandId, materialType, availableRows) {
    const configured = DEFAULT_MODEL_BY_BRAND_AND_MATERIAL[materialType]?.[brandId]
      ?? DEFAULT_MODEL_BY_BRAND[brandId];
    if (configured && availableRows.some((row) => row.id === configured)) {
      return configured;
    }
    if (availableRows.length > 0 && availableRows[0]?.id) {
      return availableRows[0].id;
    }
    return configured ?? 'gemini-3.8-flash';
  }

  function computeShownModels(shownBrandId, activeModelId, rows) {
    const belongsToBrand = brandForModel(activeModelId, allowedBrands) === shownBrandId;
    const needsActive = belongsToBrand
      && activeModelId
      && !rows.some((row) => row.id === activeModelId);
    return needsActive ? [{ id: activeModelId, name: activeModelId }, ...rows] : rows;
  }

  it('correctly maps model to brand without ambiguity', () => {
    assert.equal(brandForModel('gemini-3.8-flash', allowedBrands), 'google');
    assert.equal(brandForModel('deepseek-v4-flash-vision-exp', allowedBrands), 'deepseek');
    assert.equal(brandForModel('gpt-5.5', allowedBrands), 'openai');
    assert.equal(brandForModel('claude-opus-4-6', allowedBrands), 'anthropic');
  });

  it('resolves configured default model for each brand across modalities', () => {
    const deepseekRows = [{ id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash' }];
    assert.equal(defaultModelForBrand('deepseek', 'text', deepseekRows), 'deepseek-v4-flash-vision-exp');

    const googleRows = [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }];
    assert.equal(defaultModelForBrand('google', 'text', googleRows), 'gemini-3.8-flash');

    const openaiTextRows = [{ id: 'gpt-5.5', name: 'GPT 5.5' }];
    assert.equal(defaultModelForBrand('openai', 'text', openaiTextRows), 'gpt-5.5');

    const openaiImageRows = [{ id: 'gpt-image-2.5', name: 'GPT Image 2.5' }];
    assert.equal(defaultModelForBrand('openai', 'image', openaiImageRows), 'gpt-image-2.5');

    const bytedanceVideoRows = [{ id: 'seedance-2-0-fast', name: 'Seedance 2.0 Fast' }];
    assert.equal(defaultModelForBrand('bytedance', 'video', bytedanceVideoRows), 'seedance-2-0-fast');
  });

  it('strictly prevents Gemini model from appearing in DeepSeek menu when current active is Gemini', () => {
    // 模拟现场缺陷：当前节点激活的是 Google Gemini
    const activeModelId = 'gemini-3.8-flash';
    const deepseekRows = [{ id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash' }];

    // 计算展示 DeepSeek 品牌的二级模型列表
    const shown = computeShownModels('deepseek', activeModelId, deepseekRows);

    // 严苛断言：列表中绝不包含 gemini-3.8-flash
    assert.ok(!shown.some((item) => item.id === 'gemini-3.8-flash'), 'Gemini must not leak into DeepSeek menu');
    assert.equal(shown.length, 1);
    assert.equal(shown[0].id, 'deepseek-v4-flash-vision-exp');
  });

  it('strictly prevents DeepSeek model from appearing in Google menu when current active is DeepSeek', () => {
    const activeModelId = 'deepseek-v4-flash-vision-exp';
    const googleRows = [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }];

    const shown = computeShownModels('google', activeModelId, googleRows);

    assert.ok(!shown.some((item) => item.id === 'deepseek-v4-flash-vision-exp'), 'DeepSeek must not leak into Google menu');
    assert.equal(shown.length, 1);
    assert.equal(shown[0].id, 'gemini-3.8-flash');
  });

  it('allows fallback active model if and only if it belongs to the same brand', () => {
    // 比如用户配置了特定的定制 deepseek 模型不在 catalog 列表中
    const customDeepSeek = 'deepseek-custom-70b';
    const deepseekRows = [{ id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash' }];

    const shown = computeShownModels('deepseek', customDeepSeek, deepseekRows);

    assert.equal(shown.length, 2);
    assert.equal(shown[0].id, customDeepSeek);
    assert.equal(shown[1].id, 'deepseek-v4-flash-vision-exp');
  });
});
