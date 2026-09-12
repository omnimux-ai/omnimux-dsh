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

  it('keeps a hovered-but-uncommitted model read-only in the channel column', () => {
    assert.match(cascadeSrc, /const isChannelPreview = hoverModelId !== null && hoverModelId !== activeModelId/);
    assert.match(cascadeSrc, /disabled=\{isChannelPreview\}/);
    assert.match(cascadeSrc, /预览中 · 点击该型号后即可调整渠道/);
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
});
