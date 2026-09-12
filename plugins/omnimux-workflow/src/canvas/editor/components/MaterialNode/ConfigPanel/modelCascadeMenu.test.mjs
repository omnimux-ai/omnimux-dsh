import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cascadeSrc = readFileSync(join(here, 'ModelCascadeMenu.tsx'), 'utf8');
const configSrc = readFileSync(join(here, 'index.tsx'), 'utf8');

describe('ModelCascadeMenu source contracts', () => {
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

  it('reveals one level per hover: selected chain shows three, hovered branch shows the next one', () => {
    // 选中激活 → 三级；悬停非选中品牌 → 只显示二级；悬停到型号 → 才显示三级。
    assert.match(cascadeSrc, /const hoveringOtherBrand = hoverBrandId !== null && hoverBrandId !== activeBrandId/);
    assert.match(cascadeSrc, /const showChannelColumn = hoveringOtherBrand \? hoverModelId !== null : true/);
    assert.match(cascadeSrc, /\{showChannelColumn \? \(/);
    assert.match(cascadeSrc, /onMouseLeave=\{handlePopoverLeave\}/);
    assert.match(cascadeSrc, /const handlePopoverLeave = useCallback\(\(\) => \{/);
  });

  it('renders the popover on an opaque canvas surface inside the canvas theme scope', () => {
    // 画布主题 token 作用域在 .wf-canvas-root；portal 到 body 会退回宿主的半透明面，
    // 浮层就会透出底下的画布内容（用户报的缺陷）。
    assert.match(cascadeSrc, /anchor\?\.closest\('\.wf-canvas-root'\)/);
    assert.match(cascadeSrc, /canvasPortalHost\(triggerRef\.current\)/);
    assert.doesNotMatch(cascadeSrc, /backdropFilter/, '不透明面板不再需要背景模糊');
    assert.match(cascadeSrc, /var\(--wb-surface-elevated, var\(--dsw-alias-bg-elevated\)\)/);
  });

  it('renders the catalog display fields, not raw ids', () => {
    // CapabilityModelItem 的显示契约是 label / subtitle；读不存在的 name 会退回裸 id。
    assert.match(cascadeSrc, /typeof row\.label === 'string' && row\.label \? row\.label : item\.id/);
    assert.match(cascadeSrc, /typeof row\.subtitle === 'string' && row\.subtitle/);
    assert.doesNotMatch(cascadeSrc, /row\.name/);
  });

  it('keeps the popover anchor fixed so a revealed column cannot move the menu under the cursor', () => {
    assert.match(cascadeSrc, /POPOVER_MAX_WIDTH = 786/);
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
