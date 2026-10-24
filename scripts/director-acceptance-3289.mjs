#!/usr/bin/env node
/**
 * #3289 3D director acceptance runner (plain node, no node:test).
 *
 * The previous node:test harnesses were API-stale against main's task-private
 * bootstrap (`assembly`/`taskPackages`/`installedIdentities` no longer exist)
 * and were replaced by this runner. It starts the fresh task-private contract:
 *   startTestEnvironment({ root, mode: 'ui',
 *     evidenceContext: { taskId: '3289', runId: 'accept-<unique>' },
 *     candidate: { base: <origin/main sha>, head: <HEAD sha> },
 *     taskPlugins: ['omnimux-workflow', 'omnimux-automation'] })
 *
 * The bootstrap builds, packs and installs those plugins from the candidate
 * source into a task-private app, then proves the installed/loaded identity.
 * Nothing Dev-backed is used and no workaround is attempted: an exact
 * TEST_ENV_* code is recorded instead. `candidate.outputs` is deliberately
 * omitted because the evidence contract only allows summary/evidence paths as
 * outputs (build artifacts are produced in the private stage).
 *
 * Usage:
 *   DIRECTOR_EGO_BROWSER=/Users/x/.local/bin/ego-browser \
 *   DIRECTOR_FFMPEG=/Users/x/.local/bin/ffmpeg \
 *   node scripts/director-acceptance-3289.mjs
 *
 * Measurement variant (#3682): add DIRECTOR_MEASURE=1 to also assert the #3646 layout
 * thresholds (topbar 48 / docks 248+300 / sequencer 236 and middle-column width / inspector
 * scroll / font-size, radius and border-color sets) in the same real-browser run. The extra
 * assertion is `layout-thresholds`; measured values land in `layout-thresholds.json`.
 *
 * Evidence: `<root>/.agent-reports/beeftv-director/acceptance-3289-<random>/`.
 * Exit code 0 only when a completed run has read-back passing evidence.
 */
import * as fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 「添加节点」菜单里导演台条目的当前文案。#3640 把菜单文案从「3D 导演台 / 3D Director」改成
 * 「导演台 / Director」，而节点类型名仍是「3D 导演台 / 3D Director」——两者是两个事实。
 * 这里只认当前文案：菜单再改名时本 runner 应当带着期望文案明确失败，而不是静默兼容旧文案。 */
const DIRECTOR_PALETTE_LABELS = ['导演台', 'Director'];
const reportRoot = join(root, '.agent-reports/beeftv-director');
/** #3646 §五 的真实浏览器阈值。开关默认关闭：不设 DIRECTOR_MEASURE 时断言集合与行为保持原样。 */
const MEASURE = process.env.DIRECTOR_MEASURE === '1';
const LAYOUT_THRESHOLDS = {
  topbarHeight: 48,
  leftDockWidth: 248,
  rightDockWidth: 300,
  sequencerHeight: 236,
  fontSizes: [11, 12, 13, 15],
  radii: [4, 6, 8, 10, 12, 999],
};
// 窄屏四档：560 常规矮视口、480 spec 极端下限、400 保证溢出分支（可滚动）真的被走到、
// 1400 是「窄而高」反例——空间充足，时间轴上限不能被收窄。
const NARROW_VIEWPORTS = [
  { width: 900, height: 560, kind: 'short' },
  { width: 900, height: 480, kind: 'short' },
  { width: 900, height: 400, kind: 'short' },
  { width: 900, height: 1400, kind: 'tall' },
];
const NARROW_THRESHOLDS = { middleMinHeight: 180, sequencerMinHeight: 160, sequencerMaxHeight: 236 };
const baseExpected = ['normal-project-entry', 'portrait-selected', 'managed-media-decoded', 'saved-scene', 'play-seek', 'decoded-motion', 'scene-reopened', 'aspect-reopened'];
// 测量断言紧跟入口阶段记录，窄屏断言在旅程末尾（切视口会重排，放在最后不影响其它步骤）。
const expected = MEASURE
  ? [baseExpected[0], 'layout-thresholds', ...baseExpected.slice(1), 'layout-narrow-thresholds']
  : baseExpected;
const browserEnv = () => ({ HOME: process.env.HOME, PATH: process.env.PATH });
const save = (directory, name, value) => fs.writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n');
const read = (directory, name) => JSON.parse(fs.readFileSync(join(directory, name), 'utf8'));
const stamp = () => new Date().toISOString();
const log = message => process.stdout.write(`[director-acceptance] ${stamp()} ${message}\n`);

/**
 * Serialized declaration. Ego only receives the in-memory login capability,
 * never a token in evidence. Keep it fully self-contained.
 */
async function browserJourney({ loginUrl, evidence, origin, projectTitle, paletteLabels, measure, thresholds, narrowViewports, narrowThresholds }) {
  const fs = await import('node:fs/promises');
  const assert = (await import('node:assert/strict')).default;
  const redact = value => String(value).replaceAll(loginUrl, '[redacted-login-url]').replace(/([?&]token=)[^&\s"'<>]+/gi, '$1REDACTED');
  const write = (name, value) => fs.writeFile(`${evidence}/${name}`, redact(JSON.stringify(value, null, 2)));
  const results = [];
  const record = (name, detail) => results.push({ name, passed: true, detail });
  let task, page, phase = 'space', failure;
  const visible = (selector, timeout = 30000) => page.waitForSelector(selector, { state: 'visible', timeout });
  const hidden = (selector, timeout = 20000) => page.waitForSelector(selector, { state: 'hidden', timeout });
  const publicScene = async path => {
    const response = await page.fetch(path, { timeout: 10000 });
    assert.equal(response.status, 200, 'public scene GET must succeed');
    const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    assert.ok(body.document?.scene, 'public scene document required');
    return body.document;
  };
  let step = 'init';
  const act = async (name, fn) => { step = name; return fn(); };
  /** Count elements matching a selector that can receive pointer input (visible, not disabled/inert). */
  const visibleCount = selector => page.evaluate(candidate => [...document.querySelectorAll(candidate)].filter(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.pointerEvents !== 'none' && !element.disabled && !element.closest('[inert]');
  }).length, selector);
  /** Click the first candidate selector that resolves to exactly one visible element; never guesses. */
  const clickFirstActionable = async (selectors, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        let count = 0;
        try { count = await visibleCount(selector); } catch { count = 0; }
        if (count !== 1) continue;
        try { await page.click(selector, { timeout: 3000 }); return selector; } catch { /* try the next reviewed candidate */ }
      }
      await page.waitForTimeout(200);
    }
    return null;
  };
  /** Wait for one of the exact button labels to be visible, then click it. Returns the label. */
  const clickFirstLabel = async (labels, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const label of labels) {
        const count = await page.evaluate(text => [...document.querySelectorAll('button,[role="button"],[role="menuitem"]')].filter(element => {
          if ((element.textContent || '').trim() !== text) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.disabled && !element.closest('[inert]');
        }).length, label);
        if (count === 1) {
          try { await page.click(`text="${label}"`, { timeout: 3000 }); return label; } catch { /* try the next reviewed label */ }
        }
      }
      await page.waitForTimeout(200);
    }
    return null;
  };
  /** Wait until any reviewed exact label is visible (does not click). Returns the label. */
  const waitForAnyLabel = async (labels, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const label of labels) {
        const visibleNow = await page.evaluate(text => [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="note"]')].some(element => {
          if ((element.textContent || '').trim() !== text) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        }), label);
        if (visibleNow) return label;
      }
      await page.waitForTimeout(200);
    }
    return null;
  };
  /**
   * Focus one scoped button and activate it with the keyboard. Works for portal menus and
   * controls that a scrolled inspector leaves outside the viewport, without DOM .click().
   */
  const keyboardActivate = async (scope, matcher) => {
    const focused = await page.evaluate(({ scope, matcher }) => {
      const root = document.querySelector(scope);
      if (!root) return false;
      const button = [...root.querySelectorAll('button')].find(item => !item.disabled && (
        matcher.kind === 'aria' ? item.getAttribute('aria-label') === matcher.value : (item.textContent || '').trim() === matcher.value
      ));
      if (!button) return false;
      button.scrollIntoView({ block: 'center' });
      button.focus();
      return true;
    }, { scope, matcher });
    if (focused) await page.keyboard.press('Enter');
    return focused;
  };
  /** Click through the normal pointer path, falling back to focused Enter for off-viewport controls. */
  const clickOrActivate = async (selector, scope, matcher) => {
    try {
      await page.click(selector, { timeout: 3000 });
      return 'click';
    } catch {
      if (await keyboardActivate(scope, matcher)) return 'keyboard';
      throw new Error(`control not actionable: ${selector}`);
    }
  };
  /** Visible DOM inventory for an unresolved selector: never guess, retain facts. */
  async function diagnose(error) {
    const summary = { phase, step, error: { name: error?.name, code: error?.code, message: redact(error?.message || error).slice(0, 2000) } };
    if (!page) return summary;
    try { await page.screenshot({ path: `${evidence}/failure.png` }); summary.screenshot = 'failure.png'; } catch (screenshotError) { summary.screenshotError = String(screenshotError?.message || screenshotError); }
    try {
      summary.dom = await page.evaluate(() => {
        const visible = element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
        const label = element => ({ tag: element.tagName, ariaLabel: element.getAttribute('aria-label') || '', role: element.getAttribute('role') || '', text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) });
        const collect = selector => [...document.querySelectorAll(selector)].filter(visible).map(label).slice(0, 150);
        return {
          url: location.origin + location.pathname,
          title: document.title,
          directorRoot: Boolean(document.querySelector('.wf-director-root')),
          rendererReady: document.querySelector('.director-viewport-shell')?.getAttribute('data-renderer-ready') ?? null,
          propertyInspector: Boolean(document.querySelector('[data-director-property-inspector]')),
          details: [...document.querySelectorAll('[data-director-property-inspector] details')].map(item => ({ open: item.open, summary: (item.querySelector('summary')?.textContent || '').trim() })),
          buttons: collect('button'),
          summaries: collect('summary'),
          menuItems: collect('.director-menu [role="menuitem"], .director-menu button'),
        };
      });
    } catch (domError) { summary.domError = String(domError?.message || domError); }
    try { await write('failure.json', summary); } catch { /* evidence write must not mask the journey error */ }
    return summary;
  }
  try {
    task = await taskSpace(`3289 director acceptance ${Date.now()}`);
    await write('space.json', { spaceId: task.spaceId, spaceName: task.name ?? null });
    page = task.page('p1');
    step = 'open-project'; phase = 'normal-project-entry';
    await page.goto(loginUrl);
    await visible('button[aria-label="Projects"]');
    // A fresh task-private profile opens the first-run "Internal Testing Notice" modal; while it
    // is open the shell is inert and sidebar clicks cannot receive input. Acknowledge it first.
    const notice = 'button:text-is("Continue")';
    const firstRunNoticeDismissed = await page.waitForSelector(notice, { state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    if (firstRunNoticeDismissed) {
      await page.click(notice);
      await page.waitForSelector(notice, { state: 'hidden', timeout: 15000 });
    }
    const projectsControl = await clickFirstActionable(['button[aria-label="Projects"]', 'button[aria-label="项目"]'], 15000);
    if (!projectsControl) throw new Error('Projects sidebar entry not actionable');
    // The project library is localized; accept both reviewed labels and require one visible button.
    const newProjectLabel = await clickFirstLabel(['New Project', '新建项目'], 30000);
    if (!newProjectLabel) throw new Error('project library "New Project" action not found');
    const namePlaceholder = await page.evaluate(() => {
      const candidates = ['Project name', '项目名称'];
      return [...document.querySelectorAll('input')].map(input => input.getAttribute('placeholder')).find(value => candidates.includes(value)) ?? null;
    });
    if (!namePlaceholder) throw new Error('project name input placeholder not found');
    await page.fill(`input[placeholder="${namePlaceholder}"]`, projectTitle);
    await page.click('loc=css:.omnimux-workflow-dialog-footer button >> nth=1');
    await visible('.wf-canvas-toolbar');
    // In the workbench-tab layout the shell-level Fullscreen button stays hidden; the visible
    // control is the official right-panel mode button. Try the reviewed candidates in order.
    const fullscreenControl = await clickFirstActionable([
      'button[data-sidebar-right-mode="fullscreen"]',
      'button[aria-label="Fullscreen"]',
      'button[aria-label="全屏"]',
      'button[aria-label="To fullscreen"]',
    ], 15000);
    if (fullscreenControl) {
      await page.waitForFunction(() => Boolean(
        document.querySelector('[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]')
        || document.querySelector('[data-rightbar-fullscreen="true"]'),
      ), undefined, { timeout: 8000 }).catch(() => {});
    }
    await visible('.wf-canvas-toolbar');
    await page.click('loc=css:.wf-canvas-toolbar button.wf-canvas-toolbar__item--primary-add');
    const menuLabel = await waitForAnyLabel(paletteLabels, 30000);
    if (!menuLabel) throw new Error(`3D director palette entry did not appear (expected: ${paletteLabels.join(' / ')})`);
    const nodeLabel = await clickFirstLabel([menuLabel], 10000);
    if (!nodeLabel) throw new Error(`3D director palette entry not actionable (expected: ${paletteLabels.join(' / ')})`);
    await visible('text="打开导演台"'); await page.click('text="打开导演台"');
    await visible('.wf-director-root');
    await visible('.director-viewport-shell[data-renderer-ready="true"]', 45000);
    record(phase, { normalUI: true, rendererReady: true, firstRunNoticeDismissed, newProjectLabel, namePlaceholder, fullscreenControl, nodeLabel });
    if (measure) {
      step = 'measure-layout-thresholds';
      // 时间轴默认收起（store 默认 sequencerVisible=false），按用户路径点开后再量高度与宽度。
      const timelineOpen = await page.evaluate(() => Boolean(document.querySelector('.wf-director-root .director-sequencer')));
      if (!timelineOpen) {
        await clickOrActivate('loc=css:.wf-director-root button[aria-label="动画时间轴"]', '.wf-director-root', { kind: 'aria', value: '动画时间轴' });
        await visible('.wf-director-root .director-sequencer', 15000);
      }
      await page.screenshot({ path: `${evidence}/layout-thresholds.png` });
      const measured = await page.evaluate(() => {
        const root = document.querySelector('.wf-director-root');
        if (!root) return { missing: ['.wf-director-root'] };
        const round = value => Math.round(Number.parseFloat(value) * 100) / 100;
        const box = element => { const rect = element.getBoundingClientRect(); return { width: round(rect.width), height: round(rect.height) }; };
        const describe = node => {
          const cls = typeof node.className === 'string' ? node.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
          const text = [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent.trim()).join(' ').slice(0, 24);
          return `${node.tagName.toLowerCase()}${cls ? '.' + cls : ''}${text ? ` "${text}"` : ''}`;
        };
        const hasOwnText = node => [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim());
        const topbar = root.querySelector('[data-director-topbar="true"]');
        const workbench = root.querySelector('[data-director-workbench="true"]');
        const leftDock = root.querySelector('[data-director-left-dock="true"]');
        const rightDock = root.querySelector('[data-director-right-dock="true"]');
        const sequencer = root.querySelector('.director-sequencer');
        const inspector = root.querySelector('[data-director-property-inspector="true"]');
        const missing = [];
        for (const [name, element] of [['[data-director-topbar]', topbar], ['[data-director-workbench]', workbench], ['[data-director-left-dock]', leftDock], ['[data-director-right-dock]', rightDock], ['.director-sequencer', sequencer], ['[data-director-property-inspector]', inspector]]) if (!element) missing.push(name);
        if (missing.length) return { missing };
        // 栅格是 workbench 内唯一的 grid 子元素（顶栏是 flex 项），中列是既非左右栏也非时间轴槽的栅格项。
        const grid = [...workbench.children].find(node => getComputedStyle(node).display === 'grid');
        if (!grid) return { missing: ['workbench grid'] };
        const middleColumn = [...grid.children].find(node => node !== leftDock && node !== rightDock && !node.hasAttribute('data-director-sequencer-slot'));
        if (!middleColumn) return { missing: ['middle column'] };
        // 外观集合的测量范围：导演台 chrome，含视口浮动工具条（#3646 P1-6 点名的按钮/边框/圆角/字号）。
        // 只排除 3D 画布本身与瞬时提示浮层——前者是三维场景，后者只在引导期间出现、会让集合抖动。
        const chromeScope = node => !node.closest('.director-viewport-shell, .director-viewport-notice');
        const collect = () => {
          const fonts = new Map(); const radii = new Map(); const borders = new Map();
          const note = (map, value, node) => { const list = map.get(value) ?? []; if (list.length < 3) list.push(describe(node)); map.set(value, list); };
          for (const node of root.querySelectorAll('*')) {
            if (!chromeScope(node)) continue;
            const style = getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
            // 字号只看「直接含可见文字」的元素：容器继承到的 16px 不代表任何可见文本。
            if (hasOwnText(node)) note(fonts, round(style.fontSize), node);
            // 圆角保留原始计算值（如 "4px" / "50%"），百分比不能伪装成 50px。
            for (const corner of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']) {
              const value = style[corner];
              if (value && value !== '0px') note(radii, value, node);
            }
            // 只看可见边框，且按边判定：宽度为 0 的边画不出来，它的 border-color 不算边框色。
            // 与自身背景同色的边框同样画不出来（实心主按钮的 accent 描边）。
            const background = style.backgroundColor;
            const sides = [['borderTopWidth', 'borderTopColor'], ['borderRightWidth', 'borderRightColor'], ['borderBottomWidth', 'borderBottomColor'], ['borderLeftWidth', 'borderLeftColor']];
            for (const [widthProperty, colorProperty] of sides) {
              if (!(round(style[widthProperty]) > 0)) continue;
              const color = style[colorProperty];
              if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') continue;
              if (background !== 'rgba(0, 0, 0, 0)' && color === background) continue;
              note(borders, color, node);
            }
          }
          return { fonts, radii, borders };
        };
        const panelChrome = collect();
        const probe = document.createElement('span');
        probe.style.color = getComputedStyle(root).getPropertyValue('--dsw-alias-border').trim();
        root.appendChild(probe);
        const aliasBorder = getComputedStyle(probe).color;
        probe.remove();
        const asSamples = map => [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([value, samples]) => ({ value, samples }));
        const slot = sequencer.closest('[data-director-sequencer-slot="true"]');
        const left = element => round(element.getBoundingClientRect().left);
        return {
          topbarHeight: box(topbar).height,
          leftDockWidth: box(leftDock).width,
          rightDockWidth: box(rightDock).width,
          gridWidth: box(grid).width,
          middleColumnWidth: box(middleColumn).width,
          gridTemplateColumns: getComputedStyle(grid).gridTemplateColumns,
          offsets: { grid: left(grid), middleColumn: left(middleColumn), sequencer: left(sequencer), rightDock: left(rightDock) },
          workbenchChildren: [...workbench.children].map(node => ({ node: describe(node), display: getComputedStyle(node).display, width: box(node).width, left: left(node) })),
          sequencerHeight: box(sequencer).height,
          sequencerWidth: box(sequencer).width,
          sequencerPlacement: slot ? { className: slot.className, width: box(slot).width, gridColumn: getComputedStyle(slot).gridColumn, gridRow: getComputedStyle(slot).gridRow, parent: describe(slot.parentElement) } : null,
          inspector: { scrollHeight: inspector.scrollHeight, clientHeight: inspector.clientHeight, overflowY: getComputedStyle(inspector).overflowY },
          fontSizes: asSamples(panelChrome.fonts),
          radii: asSamples(panelChrome.radii),
          borderColors: asSamples(panelChrome.borders),
          aliasBorder,
        };
      });
      if (measured.missing) throw new Error(`layout-thresholds: 缺少测量锚点 ${measured.missing.join(', ')}`);
      const failures = [];
      // 固定常量要求精确命中；只有「中列 = 栅格宽 − 548」这类派生比较允许 1px 的取整误差。
      const exact = (label, actual, expectedValue) => {
        if (actual !== expectedValue) failures.push(`${label}: 实测 ${JSON.stringify(actual)} vs 期望 ${JSON.stringify(expectedValue)}`);
      };
      const near = (label, actual, expectedValue, tolerance = 1) => {
        if (typeof actual !== 'number' || Math.abs(actual - expectedValue) > tolerance) failures.push(`${label}: 实测 ${JSON.stringify(actual)} vs 期望 ${JSON.stringify(expectedValue)}`);
      };
      const middleWidth = Math.round((measured.gridWidth - thresholds.leftDockWidth - thresholds.rightDockWidth) * 100) / 100;
      exact('topbar height', measured.topbarHeight, thresholds.topbarHeight);
      exact('left dock width', measured.leftDockWidth, thresholds.leftDockWidth);
      near('middle column width', measured.middleColumnWidth, middleWidth);
      exact('right dock width', measured.rightDockWidth, thresholds.rightDockWidth);
      exact('sequencer height', measured.sequencerHeight, thresholds.sequencerHeight);
      near('sequencer width = middle column width', measured.sequencerWidth, measured.middleColumnWidth);
      const outside = (samples, allowed) => samples.filter(sample => !allowed.includes(sample.value));
      const outsideFonts = outside(measured.fontSizes, thresholds.fontSizes);
      if (outsideFonts.length) failures.push(`font sizes outside ${JSON.stringify(thresholds.fontSizes)}: ${JSON.stringify(outsideFonts)}`);
      const allowedRadii = thresholds.radii.map(value => `${value}px`);
      const outsideRadii = measured.radii.filter(sample => !allowedRadii.includes(sample.value));
      if (outsideRadii.length) failures.push(`radii outside ${JSON.stringify(allowedRadii)}: ${JSON.stringify(outsideRadii)}`);
      const outsideBorders = measured.borderColors.filter(sample => sample.value !== measured.aliasBorder);
      if (outsideBorders.length) failures.push(`border colors outside --dsw-alias-border (${measured.aliasBorder}): ${JSON.stringify(outsideBorders)}`);
      if (measured.inspector.overflowY !== 'auto') failures.push(`inspector overflow-y: ${measured.inspector.overflowY} vs auto`);
      if (measured.inspector.scrollHeight < measured.inspector.clientHeight) failures.push(`inspector scrollHeight ${measured.inspector.scrollHeight} < clientHeight ${measured.inspector.clientHeight}`);
      write('layout-thresholds.json', { thresholds, measured, failures });
      if (failures.length) throw new Error(`layout-thresholds failed: ${failures.join('; ')}`);
      record('layout-thresholds', { measured, middleWidth });
    }

    step = 'add-actor-standard-female'; phase = 'portrait-selected';
    const director = 'loc=css:.wf-director-root ';
    await clickOrActivate(director + 'button[aria-label="添加角色"]', '.wf-director-root', { kind: 'aria', value: '添加角色' });
    await visible(director + 'button[aria-label="标准女性"]'); await clickOrActivate(director + 'button[aria-label="标准女性"]', '.wf-director-root', { kind: 'aria', value: '标准女性' });
    const skipOnboarding = await clickFirstLabel(['跳过引导'], 15000);
    if (skipOnboarding) await hidden('text="跳过引导"');
    step = 'select-portrait-aspect';
    await clickOrActivate(director + 'button[aria-label="选择画幅比例"]', '.wf-director-root', { kind: 'aria', value: '选择画幅比例' });
    await visible(director + 'button[aria-label="9:16"]'); await clickOrActivate(director + 'button[aria-label="9:16"]', '.wf-director-root', { kind: 'aria', value: '9:16' });
    assert.equal(await page.evaluate(() => document.querySelector('.wf-director-root button[aria-label="9:16"]')?.getAttribute('aria-pressed')), 'true');
    record(phase, { aspectRatio: '9:16', skipOnboarding });

    // Camera inspector: the camera-properties panel lives in the right inspector and the
    // shot controls are collapsed inside a <details> summary; open it before selecting 运镜.
    step = 'open-camera-view';
    await page.keyboard.press('Escape');
    await page.waitForSelector('.director-menu', { state: 'hidden', timeout: 5000 }).catch(() => {});
    await act('click-camera-view', async () => {
      await clickOrActivate(
        'loc=css:.wf-director-root [role="group"][aria-label="导演台取景模式"] button[aria-label="机位视角"]',
        '.wf-director-root [role="group"][aria-label="导演台取景模式"]',
        { kind: 'aria', value: '机位视角' },
      );
    });
    await act('wait-property-inspector', async () => {
      await visible('[data-director-property-inspector]', 20000);
      await page.waitForFunction(() => document.querySelector('[data-director-property-inspector]')?.scrollHeight > 0, undefined, { timeout: 10000 });
    });
    await act('open-advanced-camera-details', async () => {
      await page.evaluate(() => {
        const host = document.querySelector('[data-director-property-inspector]');
        const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
        if (!details) return false;
        details.scrollIntoView({ block: 'center' });
        return true;
      }).then(found => { if (!found) throw new Error('镜头高级参数 details not found in property inspector'); });
      const open = await page.evaluate(() => {
        const host = document.querySelector('[data-director-property-inspector]');
        const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
        return Boolean(details?.open);
      });
      if (!open) {
        try { await page.click('loc=css:[data-director-property-inspector] summary:text-is("镜头高级参数")'); }
        catch {
          await page.evaluate(() => {
            const host = document.querySelector('[data-director-property-inspector]');
            const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
            if (details) details.open = true;
          });
        }
      }
      await page.waitForFunction(() => {
        const host = document.querySelector('[data-director-property-inspector]');
        const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
        return Boolean(details?.open);
      }, undefined, { timeout: 10000 });
      await page.evaluate(() => {
        const host = document.querySelector('[data-director-property-inspector]');
        const details = [...host.querySelectorAll('details')].find(item => (item.querySelector('summary')?.textContent || '').includes('镜头高级参数'));
        details?.scrollIntoView({ block: 'center' });
      });
    });
    await page.screenshot({ path: `${evidence}/camera-properties.png` });
    step = 'select-camera-move';
    await act('click-camera-move-select', async () => {
      await visible('loc=css:[data-director-property-inspector] button.director-select:text-is("固定")', 15000);
      await clickOrActivate(
        'loc=css:[data-director-property-inspector] button.director-select:text-is("固定")',
        '[data-director-property-inspector]',
        { kind: 'text', value: '固定' },
      );
    });
    await act('choose-push-in', async () => {
      await visible('.director-menu', 10000);
      // The menu is portaled and can be positioned outside the viewport in the task-private
      // workbench tab layout; focusing the item and pressing Enter is viewport-independent.
      const activated = await keyboardActivate('.director-menu', { kind: 'text', value: '推进' });
      if (!activated) throw new Error('camera move option 推进 not found');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-director-property-inspector] button.director-select')].some(item => (item.textContent || '').trim() === '推进'), undefined, { timeout: 15000 });
      await page.waitForSelector('.director-menu', { state: 'hidden', timeout: 10000 }).catch(() => {});
    });
    await act('generate-motion-trajectory', async () => {
      await visible('loc=css:[data-director-property-inspector] button:text-is("按运镜生成轨迹")', 15000);
      await clickOrActivate(
        'loc=css:[data-director-property-inspector] button:text-is("按运镜生成轨迹")',
        '[data-director-property-inspector]',
        { kind: 'text', value: '按运镜生成轨迹' },
      );
    });
    await act('wait-saved-after-trajectory', async () => {
      await page.waitForFunction(() => document.querySelector('[aria-label="导演台保存状态"]')?.textContent?.trim() === '已保存', undefined, { timeout: 30000 });
    });
    await act('export-clay-video', async () => {
      // The dock menu also renders a "导出白膜视频" menu item; scope the unique workbench
      // button to the property inspector so the label is unambiguous.
      await visible('loc=css:[data-director-property-inspector] button:text-is("导出白膜视频")', 15000);
      await clickOrActivate(
        'loc=css:[data-director-property-inspector] button:text-is("导出白膜视频")',
        '[data-director-property-inspector]',
        { kind: 'text', value: '导出白膜视频' },
      );
    });
    step = 'await-managed-media'; phase = 'managed-media-decoded';
    await page.waitForFunction(() => {
      const video = document.querySelector('.wf-canvas-editor video');
      return video && Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0;
    }, undefined, { timeout: 120000 });
    const media = await page.evaluate(() => {
      const video = document.querySelector('.wf-canvas-editor video');
      const image = [...document.querySelectorAll('.wf-canvas-editor img')].find(item => item.src.includes('/file?'));
      return { src: video.currentSrc || video.src, duration: video.duration, width: video.videoWidth, height: video.videoHeight, image: image?.currentSrc || image?.src, error: video.error?.code ?? null };
    });
    assert.equal(media.error, null); assert.ok(Math.abs(media.duration - 5) <= 0.3, 'five-second recording tolerance');
    assert.ok(Math.abs(media.width / media.height / (9 / 16) - 1) <= 0.01, 'portrait video ratio');
    assert.ok(media.image, 'composition image required');
    const videoUrl = new URL(media.src), imageUrl = new URL(media.image);
    assert.equal(videoUrl.origin, origin); assert.equal(imageUrl.origin, origin);
    const match = /^artifacts\/director\/([^/]+)\/([^/]+)\/[^/]+\.webm$/.exec(videoUrl.searchParams.get('rel') || '');
    assert.ok(match, 'managed actual WebM output required');
    const scenePath = `/omnimux-workflow/api/workspaces/${encodeURIComponent(match[1])}/director/${encodeURIComponent(match[2])}`;
    assert.equal(videoUrl.pathname, `/omnimux-workflow/api/workspaces/${encodeURIComponent(match[1])}/file`);
    assert.equal(imageUrl.pathname, videoUrl.pathname);
    assert.ok((imageUrl.searchParams.get('rel') || '').startsWith(`artifacts/director/${match[1]}/${match[2]}/`));
    const imageDecoded = await page.evaluate(async src => {
      const image = new Image(); image.src = src;
      await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('image decode budget')), 10000))]);
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, media.image);
    assert.ok(imageDecoded.width > 1 && imageDecoded.height > 1, 'real composition, not synthetic pixel');
    assert.ok(Math.abs(imageDecoded.width / imageDecoded.height / (9 / 16) - 1) <= 0.01);
    for (const [url, name] of [[media.src, 'reference.webm'], [media.image, 'composition.png']]) {
      const response = await page.fetch(url, { saveAs: `${evidence}/${name}`, timeout: 30000 });
      assert.equal(response.status, 200, 'managed media byte fetch');
    }
    await write('media.json', { ...media, imageDecoded, scenePath }); record(phase, { ...media, imageDecoded });

    step = 'close-and-verify-saved-scene'; phase = 'saved-scene';
    await clickOrActivate(director + 'button[aria-label="关闭导演台"]', '.wf-director-root', { kind: 'aria', value: '关闭导演台' });
    await page.waitForSelector('.wf-director-root', { state: 'hidden', timeout: 30000 });
    const saved = await publicScene(scenePath);
    assert.ok(saved.revision > 0); assert.equal(saved.scene.aspectRatio, '9:16');
    assert.equal(saved.scene.objects.filter(item => item.actorPreset === 'standard_female').length, 1);
    const shot = saved.scene.shots.find(item => item.id === saved.scene.activeShotId);
    assert.equal(shot.duration, 5); assert.equal(shot.fps, 30); assert.equal(shot.cameraMove, 'push_in');
    const camera = saved.scene.cameras.find(item => item.id === shot.cameraId);
    assert.ok(camera?.keyframes?.length >= 2 || camera?.motionPath, 'saved camera trajectory required');
    await write('saved-scene.json', saved); record(phase, { revision: saved.revision, sceneId: saved.scene.id });

    step = 'play-and-seek'; phase = 'play-seek';
    await page.evaluate(async () => { const video = document.querySelector('.wf-canvas-editor video'); video.muted = true; await video.play(); });
    await page.waitForFunction(() => document.querySelector('.wf-canvas-editor video')?.currentTime > 0.5, undefined, { timeout: 10000 });
    await page.evaluate(() => { const video = document.querySelector('.wf-canvas-editor video'); video.pause(); video.currentTime = 2.5; });
    await page.waitForFunction(() => { const video = document.querySelector('.wf-canvas-editor video'); return video && !video.seeking && Math.abs(video.currentTime - 2.5) < 0.1 && video.readyState >= 2; }, undefined, { timeout: 10000 });
    const playback = await page.evaluate(() => { const video = document.querySelector('.wf-canvas-editor video'); return { currentTime: video.currentTime, duration: video.duration, readyState: video.readyState, error: video.error?.code ?? null }; });
    assert.equal(playback.error, null); assert.ok(playback.readyState >= 2); assert.ok(Math.abs(playback.currentTime - 2.5) < 0.1);
    await page.screenshot({ path: `${evidence}/playback.png` }); record(phase, playback);
    step = 'decode-motion-frames'; phase = 'decoded-motion';
    const frames = [];
    for (const time of [0.1, 2.5, 4.7]) {
      await page.evaluate(time => { document.querySelector('.wf-canvas-editor video').currentTime = time; }, time);
      await page.waitForFunction(time => { const video = document.querySelector('.wf-canvas-editor video'); return video && !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.1; }, time, { timeout: 10000 });
      frames.push(await page.evaluate(async () => {
        const video = document.querySelector('.wf-canvas-editor video'), canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const digest = await crypto.subtle.digest('SHA-256', pixels);
        return { time: video.currentTime, sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') };
      }));
    }
    assert.equal(new Set(frames.map(frame => frame.sha256)).size, 3, 'decoded first/middle/end must show motion');
    await write('decoded-frames.json', frames); record(phase, frames);

    step = 'reopen-director'; phase = 'scene-reopened';
    await page.click('text="打开导演台"'); await visible('.wf-director-root');
    await visible('.director-viewport-shell[data-renderer-ready="true"]', 45000);
    await clickOrActivate(director + 'button[aria-label="添加角色"]', '.wf-director-root', { kind: 'aria', value: '添加角色' });
    await visible('loc=css:[data-director-workbench] [role="note"]').catch(() => {});
    const actorName = saved.scene.objects.find(item => item.actorPreset === 'standard_female').name;
    await page.waitForFunction(name => [...document.querySelectorAll('[data-director-scene-row]')].some(row => row.getAttribute('data-director-row-label') === name), actorName, { timeout: 30000 });
    const reopened = await publicScene(scenePath);
    assert.equal(reopened.scene.id, saved.scene.id); assert.ok(reopened.revision >= saved.revision);
    assert.deepEqual(reopened.scene.objects, saved.scene.objects);
    assert.deepEqual(reopened.scene.cameras, saved.scene.cameras);
    assert.deepEqual(reopened.scene.shots, saved.scene.shots); assert.equal(reopened.scene.aspectRatio, '9:16');
    await write('reopened-scene.json', reopened); record(phase, { sceneId: reopened.scene.id, revision: reopened.revision });

    step = 'verify-reopened-aspect'; phase = 'aspect-reopened';
    await clickOrActivate(director + 'button[aria-label="选择画幅比例"]', '.wf-director-root', { kind: 'aria', value: '选择画幅比例' });
    assert.equal(await page.evaluate(() => document.querySelector('.wf-director-root button[aria-label="9:16"]')?.getAttribute('aria-pressed')), 'true');
    await page.screenshot({ path: `${evidence}/reopened.png` }); record(phase, { aspectRatio: '9:16' });
    if (measure) {
      // 窄屏 + 矮视口：切视口会重排整屏，因此放在旅程最后，不影响前面的功能断言。
      step = 'measure-layout-narrow-thresholds';
      const narrowSizes = [];
      for (const narrowViewport of narrowViewports) {
      // ego 的 Page 没有 setViewportSize，走 CDP 的 Emulation 覆盖视口（媒体查询随之生效）。
      await page.cdp('Emulation.setDeviceMetricsOverride', { width: narrowViewport.width, height: narrowViewport.height, deviceScaleFactor: 1, mobile: false });
      await page.waitForFunction(viewport => window.innerWidth === viewport.width && window.innerHeight === viewport.height, narrowViewport, { timeout: 10000 });
      // 用 aria-pressed 判断开关状态，避免把「已展开」当成「要再点一次」而误收起；
      // 渲染慢时最多重试一次（有界，不无限点）。
      const timelineState = () => page.evaluate(() => {
        const button = document.querySelector('.wf-director-root button[aria-label="动画时间轴"]');
        return { pressed: button?.getAttribute('aria-pressed') === 'true', rendered: Boolean(document.querySelector('.wf-director-root .director-sequencer')) };
      });
      let timelineReady = await timelineState();
      for (let attempt = 0; attempt < 2 && !timelineReady.rendered; attempt += 1) {
        if (!timelineReady.pressed) {
          await clickOrActivate('loc=css:.wf-director-root button[aria-label="动画时间轴"]', '.wf-director-root', { kind: 'aria', value: '动画时间轴' });
        }
        try { await visible('.wf-director-root .director-sequencer', 8000); } catch {}
        timelineReady = await timelineState();
      }
      if (!timelineReady.rendered) throw new Error(`layout-narrow-thresholds: 无法展开时间轴（aria-pressed=${timelineReady.pressed}）`);
      const anchors = await page.evaluate(() => {
        const root = document.querySelector('.wf-director-root');
        const workbench = root?.querySelector('[data-director-workbench="true"]');
        return {
          root: Boolean(root),
          workbench: Boolean(workbench),
          grid: Boolean(workbench && [...workbench.children].some(node => getComputedStyle(node).display === 'grid')),
          leftDock: Boolean(root?.querySelector('[data-director-left-dock="true"]')),
          rightDock: Boolean(root?.querySelector('[data-director-right-dock="true"]')),
          sequencer: Boolean(root?.querySelector('.director-sequencer')),
        };
      });
      const missingAnchors = Object.entries(anchors).filter(([, present]) => !present).map(([name]) => name);
      if (missingAnchors.length) throw new Error(`layout-narrow-thresholds: 缺少测量锚点 ${missingAnchors.join(', ')}`);
      await page.screenshot({ path: `${evidence}/layout-narrow-${narrowViewport.height}.png` });
      const narrowMeasured = await page.evaluate(() => {
        const root = document.querySelector('.wf-director-root');
        const workbench = root.querySelector('[data-director-workbench="true"]');
        const grid = [...workbench.children].find(node => getComputedStyle(node).display === 'grid');
        const leftDock = root.querySelector('[data-director-left-dock="true"]');
        const rightDock = root.querySelector('[data-director-right-dock="true"]');
        const middleColumn = [...grid.children].find(node => node !== leftDock && node !== rightDock && !node.hasAttribute('data-director-sequencer-slot'));
        const sequencer = root.querySelector('.director-sequencer');
        const round = value => Math.round(Number.parseFloat(value) * 100) / 100;
        const rect = element => { const box = element.getBoundingClientRect(); return { top: round(box.top), bottom: round(box.bottom), width: round(box.width), height: round(box.height) }; };
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          topbarHeight: rect(root.querySelector('[data-director-topbar="true"]')).height,
          gridColumns: getComputedStyle(grid).gridTemplateColumns,
          gridRows: getComputedStyle(grid).gridTemplateRows,
          grid: { clientHeight: grid.clientHeight, scrollHeight: grid.scrollHeight, overflowY: getComputedStyle(grid).overflowY },
          middleColumn: rect(middleColumn),
          rightDock: rect(rightDock),
          sequencer: rect(sequencer),
          sequencerMaxHeight: round(getComputedStyle(sequencer).maxHeight),
        };
      });
      const narrowFailures = [];
      const at = message => `${narrowViewport.width}x${narrowViewport.height} ${message}`;
      if (narrowViewport.kind === 'tall') {
        // 窄而高：空间充足，时间轴上限必须保持宽屏的 60vh，不能被窄屏断点误伤。
        if (!(narrowMeasured.sequencerMaxHeight > narrowThresholds.sequencerMaxHeight)) {
          narrowFailures.push(at(`sequencer max-height: 实测 ${narrowMeasured.sequencerMaxHeight} vs 期望 > ${narrowThresholds.sequencerMaxHeight}（窄屏断点误伤了高窗口）`));
        }
      }
      if (narrowMeasured.middleColumn.height < narrowThresholds.middleMinHeight) {
        narrowFailures.push(at(`middle column height: 实测 ${narrowMeasured.middleColumn.height} vs 期望 >= ${narrowThresholds.middleMinHeight}`));
      }
      if (narrowMeasured.sequencer.height < narrowThresholds.sequencerMinHeight || narrowMeasured.sequencer.height > narrowThresholds.sequencerMaxHeight) {
        narrowFailures.push(at(`sequencer height: 实测 ${narrowMeasured.sequencer.height} vs 期望 ${narrowThresholds.sequencerMinHeight}..${narrowThresholds.sequencerMaxHeight}`));
      }
      if (narrowMeasured.rightDock.bottom > narrowMeasured.sequencer.top + 1) {
        narrowFailures.push(at(`right dock bottom ${narrowMeasured.rightDock.bottom} > sequencer top ${narrowMeasured.sequencer.top}（行重叠）`));
      }
      // 统一口径：允许溢出，但溢出时必须可滚动（不可滚动 = 被裁掉）。是否溢出本身不算失败，
      // 由证据如实记录；测试文件对同一规则做镜像断言。
      if (narrowMeasured.middleColumn.width <= 0) {
        narrowFailures.push(at(`middle column width: 实测 ${narrowMeasured.middleColumn.width}（画布退化为 0 宽）`));
      }
      const scrollable = narrowMeasured.grid.overflowY === 'auto' || narrowMeasured.grid.overflowY === 'scroll';
      if (narrowMeasured.grid.scrollHeight > narrowMeasured.grid.clientHeight + 1 && !scrollable) {
        narrowFailures.push(at(`grid 内容 ${narrowMeasured.grid.scrollHeight} > 可视 ${narrowMeasured.grid.clientHeight} 且 overflow-y=${narrowMeasured.grid.overflowY}（内容被裁且不可滚动）`));
      }
      narrowSizes.push({ viewport: narrowViewport, measured: narrowMeasured, failures: narrowFailures });
      }
      await page.cdp('Emulation.clearDeviceMetricsOverride');
      const narrowFailuresAll = narrowSizes.flatMap(item => item.failures);
      write('layout-narrow-thresholds.json', { narrowViewports, narrowThresholds, sizes: narrowSizes, failures: narrowFailuresAll });
      if (narrowFailuresAll.length) throw new Error(`layout-narrow-thresholds failed: ${narrowFailuresAll.join('; ')}`);
      record('layout-narrow-thresholds', { sizes: narrowSizes });
    }
    await write('completion.json', { completed: true });
  } catch (error) {
    const diagnosis = await diagnose(error);
    failure = new Error(`Director acceptance failed at ${phase}/${step}: ${diagnosis.error.message ?? diagnosis.error.name}`);
    results.push({ name: phase, passed: false, step, error: diagnosis.error, screenshot: diagnosis.screenshot ?? null });
  } finally {
    try { await write('assertions.json', results); }
    finally { if (task) await write('browser-cleanup.json', await task.finish({ keep: [] })); }
  }
  if (failure) throw failure;
}

function runBrowser(executable, input, timeoutMs) {
  return new Promise(resolveResult => {
    const child = spawn(executable, ['nodejs'], { env: browserEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let settled = false, timedOut = false, output = '';
    const diagnostics = () => output.split('\n').flatMap(line => {
      try { const item = JSON.parse(line); return item.directorDiagnostic === true ? [item] : []; }
      catch { return /(?:SyntaxError|ReferenceError|TypeError|Error:)/.test(line) ? [{ message: line.replace(/https?:\/\/[^\s"'<>]+/g, '[redacted-url]').replace(/token[^\s"']*/gi, '[redacted]').slice(0, 500) }] : []; }
    });
    child.stdout.on('data', bytes => { output += bytes.toString(); });
    child.stderr.on('data', bytes => { output += bytes.toString(); });
    const done = result => { if (!settled) { settled = true; clearTimeout(timer); clearTimeout(killTimer); resolveResult(result); } };
    let killTimer;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); }, timeoutMs);
    child.stdout.resume(); child.stderr.resume(); child.stdin.on('error', () => {});
    child.once('error', error => done({ exitCode: null, code: error.code || 'spawn-error', timedOut }));
    child.once('close', (exitCode, signal) => done({ exitCode, signal, timedOut, diagnostics: diagnostics() }));
    child.stdin.end(input);
  });
}

function independentDecode(evidence) {
  const executable = process.env.DIRECTOR_FFMPEG;
  if (!executable) {
    save(evidence, 'independent-decode.json', { status: 'not-run', reason: 'DIRECTOR_FFMPEG not configured; independent decoding is required for a media proof' });
    throw new Error('DIRECTOR_FFMPEG not configured');
  }
  if (!executable.startsWith('/')) throw new Error('DIRECTOR_FFMPEG must be an explicit absolute executable');
  fs.accessSync(executable, fs.constants.X_OK);
  const invoke = args => {
    const result = spawnSync(executable, ['-v', 'error', '-nostdin', ...args], { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
    if (result.error) throw new Error(`independent decode process budget: ${result.error.code}`);
    if (result.status !== 0) throw new Error(`independent decode must succeed: ${(result.stderr || '').trim().slice(0, 500)}`);
    return result.stdout;
  };
  invoke(['-i', join(evidence, 'composition.png'), '-f', 'null', '-']);
  invoke(['-i', join(evidence, 'reference.webm'), '-f', 'null', '-']);
  const output = invoke(['-i', join(evidence, 'reference.webm'), '-vf', 'fps=1', '-frames:v', '5', '-f', 'framemd5', '-']);
  const frames = output.split('\n').filter(line => line.trim() && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
  if (frames.length < 4) throw new Error('independent decoder must emit full-duration samples');
  if (new Set([frames[0], frames[Math.floor(frames.length / 2)], frames.at(-1)]).size !== 3) throw new Error('independent first/middle/end must differ');
  save(evidence, 'independent-decode.json', { status: 'passed', frames, pngDecoded: true, entireVideoDecoded: true, executable: 'DIRECTOR_FFMPEG' });
  return { status: 'passed', frames: frames.length };
}

async function main() {
  if (process.env.DIRECTOR_REAL_UI !== '1') log('hint: DIRECTOR_REAL_UI is not set, but this runner is the explicit real-UI entrypoint; continuing');
  const executable = process.env.DIRECTOR_EGO_BROWSER || 'ego-browser';
  const preflight = spawnSync(executable, ['--version'], { env: browserEnv(), encoding: 'utf8', timeout: 10000 });
  if (preflight.error || preflight.status !== 0) throw new Error('PRECONDITION_MISSING: ego executable unavailable');
  const ffmpeg = process.env.DIRECTOR_FFMPEG;
  if (!ffmpeg || !ffmpeg.startsWith('/') || !fs.existsSync(ffmpeg)) throw new Error('PRECONDITION_MISSING: DIRECTOR_FFMPEG absolute executable required');
  // The task-source preparation shells out to bare `python3` for archive inspection; the
  // archive helper mis-reads its GzipFile on Python 3.15 ("read() on write-only GzipFile"),
  // which is a local interpreter incompatibility, not a candidate defect. Prefer a 3.12+
  // interpreter below 3.15 so the reviewed helper runs unchanged.
  const pythonCandidates = ['/usr/local/bin/python3', '/opt/homebrew/bin/python3.12', '/opt/homebrew/bin/python3.13', '/opt/homebrew/bin/python3.14'];
  let python3 = null;
  for (const candidate of pythonCandidates) {
    if (!fs.existsSync(candidate)) continue;
    const version = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 10000 });
    const match = /Python (\d+)\.(\d+)/.exec(version.stdout || '');
    if (!match) continue;
    const major = Number(match[1]), minor = Number(match[2]);
    if (major === 3 && minor >= 12 && minor < 15) { python3 = { path: candidate, version: `${major}.${minor}` }; break; }
  }
  if (!python3) throw new Error('PRECONDITION_MISSING: a Python 3.12-3.14 interpreter is required by scripts/managed-tarball-archive.py');
  process.env.PATH = `${dirname(python3.path)}:${process.env.PATH}`;
  log(`using python ${python3.version} (${python3.path}) for task-source archive inspection`);
  fs.mkdirSync(reportRoot, { recursive: true });
  const evidence = fs.mkdtempSync(join(reportRoot, 'acceptance-3289-'));
  log(`evidence: ${evidence}`);
  const projectTitle = `Director Portrait QA ${Date.now()}`;
  const base = spawnSync('git', ['-C', root, 'rev-parse', 'origin/main'], { encoding: 'utf8' }).stdout.trim();
  const head = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const runId = `accept-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const runtime = { startedAt: stamp(), head, base, runId, contract: 'task-source-installed', taskPlugins: ['omnimux-workflow', 'omnimux-automation'], python: python3 };
  let app, failure, assertions, independent;
  try {
    const { startTestEnvironment } = await import('./test-env-bootstrap.mjs');
    app = await startTestEnvironment({
      root,
      mode: 'ui',
      evidenceContext: { taskId: '3289', runId },
      candidate: { base, head },
      taskPlugins: ['omnimux-workflow', 'omnimux-automation'],
    });
    runtime.summary = app.summary;
    runtime.installation = {
      taskId: app.installation?.taskId,
      runId: app.installation?.runId,
      base: app.installation?.base,
      head: app.installation?.head,
      candidateDigest: app.installation?.candidateDigest,
      inputsDigest: app.installation?.inputsDigest,
      packages: (app.installation?.packages ?? []).map(item => ({
        name: item.name,
        version: item.version,
        role: item.role ?? 'task-plugin',
        serverEntry: item.serverEntry ?? null,
        clientBundle: item.clientBundle ?? null,
        archive: item.archive ?? null,
      })),
    };
    runtime.serverLoading = app.serverLoading;
    save(evidence, 'runtime.json', runtime);
    if (app.summary?.mode !== 'ui') throw new Error('task-source runtime mode mismatch');
    if (app.summary?.evidenceLevel !== 'task-source-installed') throw new Error(`evidenceLevel mismatch: ${app.summary?.evidenceLevel}`);
    if (app.summary?.taskPluginsInstalled !== true) throw new Error('task-source runtime did not install task plugins');
    if (app.summary?.taskPluginsCount !== 3) throw new Error(`taskPluginsCount mismatch: ${app.summary?.taskPluginsCount}`);
    if (app.summary?.realModelRequest !== false) throw new Error('task-source runtime must not issue real model requests');
    log(`app ready (evidenceLevel=${app.summary.evidenceLevel}, taskPluginsCount=${app.summary.taskPluginsCount})`);

    // The journey is stringified into a separate node process, so module-scope constants must be
    // passed through the payload instead of being referenced directly.
    const input = `${browserJourney.toString()}\ntry { await browserJourney(${JSON.stringify({ loginUrl: app.loginUrl, evidence, origin: app.origin, projectTitle, paletteLabels: DIRECTOR_PALETTE_LABELS, measure: MEASURE, thresholds: LAYOUT_THRESHOLDS, narrowViewports: NARROW_VIEWPORTS, narrowThresholds: NARROW_THRESHOLDS })}); } catch (error) { console.log(JSON.stringify({ directorDiagnostic: true, name: error.name, message: String(error.message).replace(/([?&]token=)[^&\\s"'<>]+/gi, '$1REDACTED') })); throw Error('director-browser-verification-failed'); }`;
    log('starting browser journey');
    const result = await runBrowser(executable, input, 480000);
    save(evidence, 'browser-process.json', result);
    if (result.timedOut) throw new Error(`browser await budget exceeded; see ${evidence}/failure.json`);
    if (result.exitCode !== 0) throw new Error(`browser journey process failed: ${JSON.stringify(result.diagnostics).slice(0, 800)}; see ${evidence}/failure.json`);

    assertions = read(evidence, 'assertions.json');
    save(evidence, 'expected-assertions.json', { expected, actual: assertions.map(item => item.name) });
    const names = assertions.map(item => item.name);
    if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`assertion name set mismatch: ${JSON.stringify(names)}`);
    if (!assertions.every(item => item.passed === true)) throw new Error('assertion failure retained in assertions.json');
    if (read(evidence, 'completion.json').completed !== true) throw new Error('journey did not reach completion');
    const cleanup = read(evidence, 'browser-cleanup.json');
    if (cleanup.closedSpace !== true) throw new Error('ego space was not closed');
    if (JSON.stringify(cleanup.keptManagedLabels) !== '[]') throw new Error('ego space retained managed pages');

    const space = read(evidence, 'space.json');
    const spacesFile = join(evidence, 'ego-spaces.json');
    const spacesResult = await runBrowser(executable, `const fs = await import('node:fs/promises');\nconst spaces = await listTaskSpaces();\nawait fs.writeFile(${JSON.stringify(spacesFile)}, JSON.stringify({ spaces: spaces.map(space => ({ id: space.id, ownership: space.ownership })) }, null, 2));\n`, 30000);
    save(evidence, 'browser-spaces-process.json', { exitCode: spacesResult.exitCode, timedOut: spacesResult.timedOut, diagnostics: spacesResult.diagnostics });
    if (spacesResult.exitCode !== 0 || spacesResult.timedOut) throw new Error('could not list ego task spaces after the journey');
    const spaces = read(evidence, 'ego-spaces.json').spaces;
    const retained = spaces.filter(item => item.id === space.spaceId);
    save(evidence, 'browser-spaces-check.json', { spaceId: space.spaceId, retained: retained.length > 0, spaceCount: spaces.length, ownership: [...new Set(spaces.map(item => item.ownership))] });
    if (retained.length) throw new Error('ego task space is still retained after finish()');

    const artifacts = [];
    for (const name of ['composition.png', 'reference.webm', 'playback.png', 'reopened.png', 'camera-properties.png']) {
      if (name === 'camera-properties.png' && !fs.existsSync(join(evidence, name))) continue;
      const bytes = fs.readFileSync(join(evidence, name));
      if (bytes.length <= 1024) throw new Error(`artifact too small: ${name} (${bytes.length} bytes)`);
      const signature = name.endsWith('.png') ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) : Buffer.from([26, 69, 223, 163]);
      if (!bytes.subarray(0, signature.length).equals(signature)) throw new Error(`artifact format mismatch: ${name}`);
      artifacts.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    save(evidence, 'artifacts.json', artifacts);
    independent = independentDecode(evidence);
    save(evidence, 'assertions-readback.json', { names, allPassed: true, expected });
    save(evidence, 'completion.json', { ...read(evidence, 'completion.json'), evidenceReadback: true });
    const resultRecord = {
      passed: true,
      acceptanceScope: 'normal-ui-portrait-save-reopen-moving-media',
      completeMigrationAcceptance: false,
      evidenceLevel: app.summary.evidenceLevel,
      taskSourceInstalled: app.summary.evidenceLevel === 'task-source-installed',
      taskPluginsInstalled: app.summary.taskPluginsInstalled,
      taskPluginsCount: app.summary.taskPluginsCount,
      taskPlugins: runtime.taskPlugins,
      runId: runtime.runId,
      base: runtime.base,
      independentDecode: independent.status,
      assertions: names,
      realModelRequest: false,
      head: runtime.head,
      finishedAt: stamp(),
    };
    save(evidence, 'result.json', resultRecord);
    log(`PASS evidence=${evidence}`);
    log(`assertions=${names.join(',')}`);
    log(`independent-decode=${independent.status} frames=${independent.frames}`);
    process.stdout.write(`EVIDENCE_DIR=${evidence}\n`);
  } catch (error) {
    failure = error;
    log(`FAIL ${error?.code || ''} ${error?.message || error}`);
    if (fs.existsSync(evidence)) {
      save(evidence, 'result.json', {
        passed: false,
        acceptanceScope: 'normal-ui-portrait-save-reopen-moving-media',
        completeMigrationAcceptance: false,
        evidenceLevel: app?.summary?.evidenceLevel ?? null,
        taskSourceInstalled: app?.summary?.evidenceLevel === 'task-source-installed',
        contract: runtime.contract,
        taskPlugins: runtime.taskPlugins,
        failure: { name: error?.name ?? 'Error', code: error?.code ?? 'ACCEPTANCE_FAILED', rootReason: error?.rootReason ?? null, hint: error?.hint ?? null, message: String(error?.message ?? '').slice(0, 2000) },
        summary: runtime.summary ?? null,
        head: runtime.head,
        finishedAt: stamp(),
      });
    }
    process.stdout.write(`EVIDENCE_DIR=${evidence}\n`);
  } finally {
    try {
      if (app) { const cleanup = await app.cleanup(); save(evidence, 'cleanup.json', cleanup); if (cleanup.cleaned !== true) throw new Error('app cleanup failed'); }
    } catch (error) { failure ||= error; log(`cleanup-failure ${error?.message || error}`); }
  }
  if (failure) { process.exitCode = 1; return; }
  log('all evidence assertions passed');
}

main().catch(error => {
  log(`fatal ${error?.stack || error}`);
  process.exitCode = 1;
});
