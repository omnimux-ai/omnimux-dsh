/**
 * OrganicShimmerOverlay & GenerationStateContainer 动效结构契约门禁测试
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shimmerSrc = readFileSync(join(here, 'OrganicShimmer.tsx'), 'utf8');
const gscSrc = readFileSync(join(here, 'GenerationStateContainer.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../theme/components.css'), 'utf8');
const themeCssSrc = readFileSync(join(here, '../../theme/workbench-theme.css'), 'utf8');

test('OrganicShimmerOverlay TSX 契约：完整挂载 components.css 定义的 5 大流光折射层级', () => {
  // 1. 宿主容器
  assert.match(shimmerSrc, /className=\{`wf-organic-shimmer \$\{className\}`\}/);
  assert.match(shimmerSrc, /data-playing=\{playing \? 'true' : 'false'\}/);

  // 2. 画布与光谱底光
  assert.match(shimmerSrc, /className="wf-organic-shimmer__canvas"/);
  assert.match(shimmerSrc, /className="wf-organic-shimmer__field"/);

  // 3. SVG 湍流折射液体波浪层
  assert.match(shimmerSrc, /className="wf-organic-shimmer__distortion"/);

  // 4. 三层边缘发光系统
  assert.match(shimmerSrc, /className="wf-organic-shimmer__glow-layer"/);
  assert.match(shimmerSrc, /className="wf-organic-shimmer__glow-wrap"/);
  assert.match(shimmerSrc, /className="wf-organic-shimmer__glow-deep"/);
  assert.match(shimmerSrc, /className="wf-organic-shimmer__glow-mid"/);
  assert.match(shimmerSrc, /className="wf-organic-shimmer__glow-border"/);

  // 5. 动态过渡遮罩与内容插槽
  assert.match(shimmerSrc, /className="wf-organic-shimmer__mask"/);
  assert.match(shimmerSrc, /className="wf-organic-shimmer__content"/);
});

test('components.css 契约：包含完整的 Transitions.dev 物理级流体微光动画规则', () => {
  assert.match(cssSrc, /@keyframes wf-organic-shimmer-sweep/);
  assert.match(cssSrc, /\.wf-organic-shimmer/);
  assert.match(cssSrc, /\.wf-organic-shimmer__field/);
  assert.match(cssSrc, /\.wf-organic-shimmer__distortion/);
  assert.match(cssSrc, /\.wf-organic-shimmer__glow-deep/);
  assert.match(cssSrc, /\.wf-organic-shimmer__glow-mid/);
  assert.match(cssSrc, /\.wf-organic-shimmer__glow-border/);
  assert.match(cssSrc, /\.wf-organic-shimmer__mask/);
  assert.match(cssSrc, /\.wf-organic-shimmer__content/);
});

test('components.css 契约：流光必须 linear + alternate 连续往返，禁止 ease-out 尾段停顿', () => {
  assert.match(
    cssSrc,
    /animation:\s*wf-organic-shimmer-sweep\s+var\(--wf-shimmer-dur[^)]*\)\s+var\(--wf-shimmer-ease,\s*linear\)\s+infinite\s+var\(--wf-shimmer-direction,\s*alternate\)/,
  );
  assert.equal((cssSrc.match(/animation:\s*wf-organic-shimmer-sweep/g) || []).length, 2);
  assert.doesNotMatch(cssSrc, /wf-organic-shimmer-sweep[^;]*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
});

test('workbench-theme.css 契约：定义双主题 SVG 湍流滤镜与物理流光 Token', () => {
  assert.match(themeCssSrc, /--wf-shimmer-dur:/);
  assert.match(themeCssSrc, /--wf-shimmer-ease:\s*linear/);
  assert.match(themeCssSrc, /--wf-shimmer-direction:\s*alternate/);
  assert.match(themeCssSrc, /--wf-shimmer-svg-light:/);
  assert.match(themeCssSrc, /--wf-shimmer-svg-dark:/);
  assert.match(themeCssSrc, /--wf-shimmer-svg-url:/);
});

test('GenerationStateContainer 契约：渲染骨架屏接入 OrganicShimmerOverlay', () => {
  assert.match(gscSrc, /import \{ OrganicShimmerOverlay \} from '\.\/OrganicShimmer'/);
  assert.match(gscSrc, /<OrganicShimmerOverlay borderRadius="inherit">/);
  assert.match(gscSrc, /wf-gsc__progress-text/);
});

test('MaterialNode 契约：文本节点生成态也接入 GenerationStateContainer（同款 OrganicShimmer）', () => {
  const materialSrc = readFileSync(join(here, 'MaterialNode/index.tsx'), 'utf8');
  assert.match(materialSrc, /materialType === 'text'/);
  assert.match(materialSrc, /loadingAspectRatio="auto"/);
  assert.match(materialSrc, /hasResult[\s\S]*materialType === 'text'[\s\S]*effectiveTextContent/);
  assert.match(materialSrc, /generationStatus \? \([\s\S]*<GenerationStateContainer[\s\S]*\{textBody\}/);
  assert.match(cssSrc, /\.wf-material-node__text-shell--gsc/);
  assert.match(cssSrc, /\.wf-material-node__text-shell > \.wf-gsc/);
});

test('MaterialNode 契约：音频节点生成态动画铺满整张卡片（消除内边距、上下黑底与双重边框）', () => {
  const freshCss = readFileSync(join(here, '../../theme/components.css'), 'utf8');
  assert.match(freshCss, /\.wf-material-node--audio \.wf-gsc/);
  assert.match(freshCss, /\.wf-material-node--audio \.wf-gsc__skeleton-card/);
  assert.match(freshCss, /\.wf-material-node--audio \.wf-organic-shimmer/);
  assert.doesNotMatch(freshCss, /\.wf-gsc__box--audio \{ padding-top: 48px/);
});
