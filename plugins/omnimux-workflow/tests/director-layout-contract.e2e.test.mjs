/**
 * 端到端契约测试：导演台布局阈值（#3682 / #3646 §五）。
 *
 * 真实浏览器测量由 `scripts/director-acceptance-3289.mjs` 的 `DIRECTOR_MEASURE=1` 变体执行，
 * 实测证据在 docs/evidence/director-layout-3682/。本文件锁定「源码事实」与「测量口径」之间的
 * 契约，防止两者再次脱节——#3682 首跑抓到的四处偏差正是这种脱节：
 * 1. 时间轴槽位必须是栅格子项，否则 `lg:col-start-2` 是死样式、时间轴铺满整行；
 * 2. 场景检查器 h3 必须显式声明字号（否则继承出 15.21px，落在 {11,12,13,15} 之外）；
 * 3. 圆角不得硬编码 50%，统一走 `var(--r-full)`（999px）；
 * 4. 天空色值输入框必须 `border-0`，否则原生灰边 rgb(133,133,133) 露出。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const workbench = readFileSync(join(here, '..', 'src/director/vendor/components/canvas-director-workbench.tsx'), 'utf8');
const sceneInspector = readFileSync(join(here, '..', 'src/director/vendor/components/director-scene-inspector.tsx'), 'utf8');
const controlsCss = readFileSync(join(here, '..', 'src/director/controls.css'), 'utf8');
const layoutCss = readFileSync(join(here, '..', 'src/director/vendor/director-layout.css'), 'utf8');
const runner = readFileSync(join(repoRoot, 'scripts/director-acceptance-3289.mjs'), 'utf8');

test('时间轴槽位是栅格子项，col-start 不是死样式', () => {
  const gridOpen = workbench.indexOf('grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]');
  assert.notEqual(gridOpen, -1, 'workbench 栅格容器应存在');
  const gridClose = workbench.indexOf('\n            </div>', gridOpen);
  assert.notEqual(gridClose, -1, '栅格容器应有 12 空格缩进的关闭标签');
  const slot = workbench.indexOf('data-director-sequencer-slot="true"');
  assert.notEqual(slot, -1, '时间轴槽位应存在');
  assert.equal(slot > gridOpen && slot < gridClose, true, '时间轴槽位必须落在栅格容器内部');
  assert.equal(workbench.slice(gridOpen, gridClose).includes('lg:col-start-2'), true, '槽位应保留宽屏第 2 列定位');
});

test('栅格四种变体与 #3646 的 48/248/300 数值一致', () => {
  for (const variant of [
    'grid-cols-[48px_minmax(0,1fr)_0px]',
    'grid-cols-[48px_minmax(0,1fr)_300px]',
    'grid-cols-[248px_minmax(0,1fr)_0px]',
    'grid-cols-[248px_minmax(0,1fr)_300px]',
  ]) {
    assert.equal(workbench.includes(variant), true, `缺少栅格变体 ${variant}`);
  }
});

test('场景检查器标题显式声明字号，不再继承 15.21px', () => {
  const headings = sceneInspector.match(/<h3 className="[^"]*"/g) || [];
  assert.notEqual(headings.length, 0, '场景检查器应有 h3 标题');
  const undeclared = headings.filter(heading => !/text-\[/.test(heading));
  assert.deepEqual(undeclared, [], '所有 h3 都必须显式声明 text-[Npx] 字号');
});

test('圆角统一走 token，不再硬编码 50%', () => {
  assert.equal(/border-radius:\s*50%/.test(controlsCss), false, 'controls.css 不应再有硬编码 50% 圆角');
  assert.equal(/border-radius:\s*50%/.test(layoutCss), false, 'director-layout.css 不应再有硬编码 50% 圆角');
  const tokenRadii = controlsCss.match(/border-radius:var\(--r-full\)/g) || [];
  // 四处：开关底座、开关滑块、webkit 滑杆 thumb、moz 滑杆 thumb（后三处原为硬编码 50%）。
  assert.equal(tokenRadii.length, 4, '开关与滑杆的圆形圆角都应使用 var(--r-full)');
});

test('天空色值输入框不再露出原生边框', () => {
  assert.equal(sceneInspector.includes('border-0 bg-transparent font-mono'), true, '天空色值输入框需要 border-0');
});

test('测量变体默认关闭，且不改动原 8 条断言的顺序', () => {
  assert.equal(runner.includes("const MEASURE = process.env.DIRECTOR_MEASURE === '1';"), true, '测量应由 DIRECTOR_MEASURE=1 显式开启');
  const base = runner.match(/const baseExpected = \[([^\]]+)\];/);
  assert.notEqual(base, null, 'runner 应有 baseExpected 常量');
  const names = base[1].split(',').map(item => item.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(names, [
    'normal-project-entry', 'portrait-selected', 'managed-media-decoded', 'saved-scene',
    'play-seek', 'decoded-motion', 'scene-reopened', 'aspect-reopened',
  ]);
  // 断言组合：宽屏断言紧跟入口断言，窄屏断言在末尾（切视口会重排，不能插在功能步骤中间）；
  // MEASURE 为假时逐字回落 baseExpected。
  assert.match(runner,
    /const expected = MEASURE\s*\?\s*\[baseExpected\[0\], 'layout-thresholds', \.\.\.baseExpected\.slice\(1\), 'layout-narrow-thresholds'\]\s*:\s*baseExpected;/,
    '测量断言必须紧跟入口断言插入、窄屏断言在末尾，关闭时逐字回落原列表');
});

test('阈值常量与测量锚点覆盖 #3646 §五 的全部数值', () => {
  for (const literal of [
    'topbarHeight: 48', 'leftDockWidth: 248', 'rightDockWidth: 300', 'sequencerHeight: 236',
    'fontSizes: [11, 12, 13, 15]', 'radii: [4, 6, 8, 10, 12, 999]',
  ]) {
    assert.equal(runner.includes(literal), true, `阈值常量缺少 ${literal}`);
  }
  for (const anchor of [
    '[data-director-topbar="true"]', '[data-director-left-dock="true"]', '[data-director-right-dock="true"]',
    '.director-sequencer', '[data-director-property-inspector="true"]',
  ]) {
    assert.equal(runner.includes(anchor), true, `测量缺少锚点 ${anchor}`);
  }
  assert.equal(runner.includes('button[aria-label="动画时间轴"]'), true, '测量前需要按用户路径展开时间轴');
});

test('真机证据：时间轴是栅格直接子项，且与中列同宽同左边界', () => {
  const evidence = JSON.parse(readFileSync(join(repoRoot, 'docs/evidence/director-layout-3682/layout-thresholds.json'), 'utf8'));
  const measured = evidence.measured;
  assert.deepEqual(evidence.failures, [], '证据里的逐项判定必须为空');
  assert.equal(measured.sequencerPlacement.parent.startsWith('div.grid'), true, '时间轴槽位的父节点必须是栅格容器');
  assert.equal(measured.sequencerPlacement.gridColumn, '2', '时间轴应落在第 2 列');
  assert.equal(measured.sequencerPlacement.gridRow, '2', '时间轴应落在第 2 行');
  assert.equal(measured.sequencerWidth, measured.middleColumnWidth, '时间轴宽度必须等于中列宽度');
  assert.equal(measured.offsets.sequencer, measured.offsets.middleColumn, '时间轴左边界必须与中列对齐');
  assert.equal(measured.gridTemplateColumns, `248px ${measured.middleColumnWidth}px 300px`, '栅格列必须为 248 / 中列 / 300');
});

test('真机证据：外观三集合都落在 #3646 允许集合内', () => {
  const evidence = JSON.parse(readFileSync(join(repoRoot, 'docs/evidence/director-layout-3682/layout-thresholds.json'), 'utf8'));
  const measured = evidence.measured;
  const allowedRadii = evidence.thresholds.radii.map(value => `${value}px`);
  const badRadii = measured.radii.filter(sample => !allowedRadii.includes(sample.value));
  const badFonts = measured.fontSizes.filter(sample => !evidence.thresholds.fontSizes.includes(sample.value));
  const badBorders = measured.borderColors.filter(sample => sample.value !== measured.aliasBorder);
  assert.deepEqual(badFonts, [], '字号必须 ⊆ {11,12,13,15}');
  assert.deepEqual(badRadii, [], '圆角必须 ⊆ {4,6,8,10,12,999}px');
  assert.deepEqual(badBorders, [], '可见边框色必须只有 --dsw-alias-border');
  assert.equal(measured.topbarHeight, 48, '顶栏高度必须是 48');
  assert.equal(measured.leftDockWidth, 248, '左栏宽度必须是 248');
  assert.equal(measured.rightDockWidth, 300, '右栏宽度必须是 300');
  assert.equal(measured.sequencerHeight, 236, '时间轴高度必须是 236');
});

test('窄屏断点：第 1 行保底 + 可滚动 + 右栏收紧（#3689）', () => {
  assert.equal(workbench.includes('max-lg:grid-rows-[minmax(180px,1fr)_auto]'), true, 'max-lg 第 1 行必须有 180px 保底');
  assert.equal(workbench.includes('max-lg:overflow-y-auto'), true, 'max-lg 放不下时栅格必须可滚动');
  assert.equal(workbench.includes('max-lg:overflow-x-hidden'), true, '滚动容器不应带出横向滚动条');
  assert.equal(workbench.includes('max-lg:max-h-[30vh]'), true, 'max-lg 右栏上限应收紧到 30vh');
  assert.equal(/\.director-sequencer \{[^}]*max-height: 60vh;/s.test(layoutCss), true, '宽屏时间轴 max-height 应在 CSS 里');
  // 收窄必须同时带高度条件：否则「窄而高」的窗口会被永久限制在 236px。
  assert.equal(/@media \(max-width: 1023px\) and \(max-height: 620px\) \{[^}]*\.director-sequencer \{[^}]*max-height: min\(236px, 30vh\);/s.test(layoutCss), true,
    '窄屏收窄必须同时限定视口高度');
  const sequencerSource = readFileSync(join(here, '..', 'src/director/vendor/components/director-sequencer.tsx'), 'utf8');
  assert.equal(sequencerSource.includes('maxHeight: "60vh"'), false, '内联 maxHeight 会压过断点，必须移除');
});

test('真机证据：窄屏四档（含窄而高反例）都保底、不重叠、溢出必可滚动（#3689）', () => {
  const evidence = JSON.parse(readFileSync(join(repoRoot, 'docs/evidence/director-narrow-3689/after-narrow-thresholds.json'), 'utf8'));
  assert.deepEqual(evidence.failures, [], '窄屏证据里的逐项判定必须为空');
  assert.deepEqual(evidence.sizes.map(item => [item.viewport.width, item.viewport.height, item.viewport.kind]), [
    [900, 560, 'short'], [900, 480, 'short'], [900, 400, 'short'], [900, 1400, 'tall'],
  ]);
  for (const size of evidence.sizes) {
    const measured = size.measured;
    const where = `${size.viewport.width}x${size.viewport.height}`;
    assert.equal(measured.middleColumn.height >= evidence.narrowThresholds.middleMinHeight, true, `${where}: 中列必须保底`);
    assert.equal(measured.middleColumn.width > 0, true, `${where}: 中列不能退化为 0 宽`);
    assert.equal(measured.sequencer.height >= evidence.narrowThresholds.sequencerMinHeight, true, `${where}: 时间轴不低于下限`);
    assert.equal(measured.sequencer.height <= evidence.narrowThresholds.sequencerMaxHeight, true, `${where}: 时间轴不高于上限`);
    assert.equal(measured.rightDock.bottom <= measured.sequencer.top + 1, true, `${where}: 右栏与时间轴不得重叠`);
    // 与运行时同一口径：允许溢出，但溢出时必须可滚动。
    if (measured.grid.scrollHeight > measured.grid.clientHeight + 1) {
      assert.equal(['auto', 'scroll'].includes(measured.grid.overflowY), true, `${where}: 溢出时必须可滚动`);
    }
    if (size.viewport.kind === 'tall') {
      assert.equal(measured.sequencerMaxHeight > evidence.narrowThresholds.sequencerMaxHeight, true, `${where}: 窄而高的窗口不能被收窄上限误伤`);
    }
  }
});

test('窄面板按容器宽度决策，画布列保底 140px（#3702）', () => {
  // 漂移锁：容器查询与画布列下限必须还在 CSS 里；真守卫是下面的真机事实断言。
  assert.match(layoutCss, /@container director-workbench \(max-width: 520px\)/, '必须有窄面板容器查询');
  assert.match(layoutCss, /minmax\(140px, 1fr\)/, '画布列必须有 140px 下限');
  const evidence = JSON.parse(readFileSync(join(repoRoot, 'docs/evidence/director-panel-width-3702/after-panel-width.json'), 'utf8'));
  assert.deepEqual(evidence.failures, [], '面板宽度证据里的逐项判定必须为空');
  assert.equal(evidence.sizes.every(size => size.measured.containerType === 'inline-size'), true, 'workbench 必须真的是容器查询上下文');
  assert.equal(evidence.sizes.every(size => size.measured.gridIsDirectChild === true), true, '栅格必须是 workbench 的直接子元素');
  for (const size of evidence.sizes) {
    const where = `${size.viewport.width}x${size.viewport.height}`;
    assert.equal(size.measured.panelWidth <= evidence.narrowThresholds.containerQueryMaxWidth, true, `${where}: 该档必须落在容器查询区间内`);
    assert.equal(size.measured.middleColumn.width >= evidence.narrowThresholds.canvasMinWidth, true, `${where}: 画布列必须无条件保底（不做自我门控）`);
  }
});

test('真机证据：宽窗口 + 窄面板由容器查询接管，折叠态保留轨道（#3702）', () => {
  const evidence = JSON.parse(readFileSync(join(repoRoot, 'docs/evidence/director-panel-width-3702/after-panel-width.json'), 'utf8'));
  const forced = evidence.wideWindowNarrowPanel.measured;
  assert.deepEqual(evidence.wideWindowNarrowPanel.failures, [], '宽窗口窄面板证据里的逐项判定必须为空');
  assert.equal(forced.windowWidth > 1024, true, '窗口必须是宽屏（视口媒体查询处于宽屏态）');
  assert.equal(forced.panelWidth <= evidence.narrowThresholds.containerQueryMaxWidth, true, '面板必须窄到容器查询区间');
  assert.equal(forced.containerType, 'inline-size');
  assert.equal(forced.canvasWidth >= evidence.narrowThresholds.canvasMinWidth, true, '宽窗口窄面板下画布列仍须保底');
  assert.equal(forced.sequencerRow, '3', '时间轴必须被容器规则堆叠到第 3 行');
  assert.equal(forced.rightDockColumn, '1 / -1', '右栏必须被容器规则改成整行');
  assert.equal(evidence.collapsed.measured.collapsed, 'true');
  assert.equal(evidence.collapsed.measured.leftDockWidth <= 56, true, '折叠后左栏应保留 48px 轨道');
  assert.equal(evidence.collapsed.measured.canvasWidth >= evidence.narrowThresholds.canvasMinWidth, true, '折叠后画布列仍须可用');
  const wide = JSON.parse(readFileSync(join(repoRoot, 'docs/evidence/director-panel-width-3702/after-wide-thresholds.json'), 'utf8'));
  assert.equal(wide.measured.leftDockWidth, 248, '宽屏左栏必须仍是 248');
  assert.equal(wide.measured.rightDockWidth, 300, '宽屏右栏必须仍是 300');
  assert.equal(wide.measured.sequencerHeight, 236, '宽屏时间轴必须仍是 236');
});
