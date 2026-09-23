#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { startComposerInlineEnvironment, taskRoot, workspaceTitle, redact } from './composer-inline-bootstrap.mjs';

// This function runs in ego's Node runtime, not Playwright or the page.
async function browserSuite({ loginUrl, evidence, workspaceTitle }, redact) {
  const fs = await import('node:fs/promises');
  const syncFs = await import('node:fs');
  const assert = (await import('node:assert/strict')).default;
  let task;
  let page;
  const results = [];
  const record = (name, details, passed = true) => {
    const sanitize = value => typeof value === 'string' ? redact(value) : Array.isArray(value) ? value.map(sanitize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(token|access_token|refresh_token|api_key|authorization|cookie|set-cookie)$/i.test(key) ? 'REDACTED' : sanitize(item)])) : value;
    const item = { name, passed, details: sanitize(details ?? null) };
    syncFs.appendFileSync(`${evidence}/observations.jsonl`, JSON.stringify(item) + '\n');
    results.push(item);
  };
  const settle = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
  const visible = selector => page.evaluate(selector => [...document.querySelectorAll(selector)].some(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0), selector);
  const resize = async width => {
    await page.evaluate(width => {
      const column = document.querySelector('[class*="centerCol"]');
      if (!column) throw new Error('Observed center column missing');
      for (const [key, value] of Object.entries({ 'min-width': '0', width: `${width}px`, 'max-width': `${width}px`, flex: `0 0 ${width}px` })) column.style.setProperty(key, value, 'important');
      window.dispatchEvent(new Event('resize'));
    }, width);
    await settle();
  };
  try {
    task = await taskSpace('composer inline reproducible E2E');
    await fs.writeFile(`${evidence}/space.json`, JSON.stringify({ spaceId: task.spaceId }));
    page = task.page('p1');
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.goto(loginUrl);
    const mode = await page.fetch('/omnimux/runtime/mode', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'key' }) });
    assert.equal(mode.status, 200, 'Fresh UI runtime selection must succeed');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-composer-card]') || [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Continue') || document.querySelector('[aria-label="Choose workspace"]'), undefined, { timeout: 30000 });
    await fs.writeFile(`${evidence}/onboarding.txt`, redact(await page.snapshot()));
    if (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Continue'))) await page.click('loc=role:button[name="Continue"]');
    if (!(await visible('[data-composer-card]'))) {
      await page.waitForSelector('[aria-label="Choose workspace"]', { state: 'visible', timeout: 20000 });
      await page.click('[aria-label="Choose workspace"]');
      await fs.writeFile(`${evidence}/workspace-menu.txt`, redact(await page.snapshot()));
      // Do not invoke native folder selection: the seeded Host workspace must be offered.
      await page.click(`text="${workspaceTitle}"`);
    }
    await page.waitForSelector('[data-omx-quick-shortcut="clone"]', { state: 'visible', timeout: 30000 });
    const crypto = await import('node:crypto');
    const installed = JSON.parse(await fs.readFile(`${evidence}/process.json`, 'utf8'));
    const bundle = await fs.readFile(`${installed.root}/plugins/omnimux/lib/client.js`, 'utf8');
    const loadedUrl = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name).find(url => url.startsWith(location.origin + '/plugins/') && url.includes('omnimux/client.js')));
    assert.ok(loadedUrl, 'Observed loaded plugin script required');
    const response = await page.fetch(loadedUrl);
    const runtimeProof = { url: loadedUrl, status: response.status, bundleHash: crypto.createHash('sha256').update(bundle).digest('hex'), responseHash: crypto.createHash('sha256').update(response.body).digest('hex'), exactBundleContained: response.body.includes(bundle) };
    await fs.writeFile(`${evidence}/runtime-proof.json`, JSON.stringify(runtimeProof, null, 2));
    assert.equal(response.status, 200);
    assert.equal(runtimeProof.bundleHash, installed.clientHash);
    assert.equal(runtimeProof.exactBundleContained, true);
    record('loaded-bundle-identity', runtimeProof);
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: 700, height: 850, deviceScaleFactor: 1, mobile: false });
    await page.click('[data-omx-quick-shortcut="clone"]');
    await page.waitForSelector('#paramSummaryTriggerBtn', { state: 'visible' });
    await settle();
    await page.click('#paramSummaryTriggerBtn');
    await page.waitForSelector('.omx-params-panel', { state: 'visible' });
    await page.focus('#paramSummaryTriggerBtn');
    const focusTrace = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      focusTrace.push(await page.evaluate(() => document.activeElement.textContent));
    }
    assert.equal(focusTrace.at(-1), '9:16');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.querySelector('.omx-ratio-card[aria-pressed="true"]').textContent), '9:16');
    record('ratio-keyboard', focusTrace);
    await page.focus('input[type="range"]');
    const narrow = await page.evaluate(() => {
      const panel = document.querySelector('.omx-params-panel'), rect = panel.getBoundingClientRect();
      return { viewport: [innerWidth, innerHeight], width: rect.width, bottom: rect.bottom, cardTop: document.querySelector('[data-composer-card]').getBoundingClientRect().top, overflow: getComputedStyle(panel).overflowY, scroll: panel.scrollTop, horizontalOverflow: panel.scrollWidth > panel.clientWidth, rangeBottom: document.querySelector('input[type="range"]').getBoundingClientRect().bottom };
    });
    assert.deepEqual(narrow.viewport, [700, 850]);
    assert.equal(narrow.width, 318);
    assert.equal(narrow.overflow, 'auto');
    assert.equal(narrow.horizontalOverflow, false);
    assert.ok(narrow.scroll > 0 && narrow.rangeBottom < narrow.bottom && narrow.bottom <= narrow.cardTop);
    record('narrow-scroll-no-overlap', narrow);
    await page.screenshot({ path: `${evidence}/narrow-menu.png` });
    await page.keyboard.press('Escape');
    await page.click('[data-omx-quick-shortcut="clone"]');
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await resize(952);
    const initial = await page.evaluate(() => {
      const c = document.querySelector('[data-composer-card]');
      return { width: c.getBoundingClientRect().width, style: c.getAttribute('style') || '', density: c.getAttribute('data-omnimux-inline-density') };
    });
    const savedWidth = await page.evaluate(() => localStorage.getItem('dsh.conversation.contentWidth'));
    for (const id of ['clone', 'breakdown', 'selling', 'reverse']) {
      await page.click(`[data-omx-quick-shortcut="${id}"]`);
      const expected = id === 'clone' || id === 'selling';
      await page.waitForFunction(({ id, expected }) => document.querySelector(`[data-omx-quick-shortcut="${id}"]`)?.getAttribute('aria-pressed') === 'true' && Boolean(document.querySelector('[data-composer-card] [data-omx-quick-shortcut-controls]')) === expected, { id, expected }, { timeout: 10000 });
      const state = await page.evaluate(() => ({ count: document.querySelectorAll('[data-omnimux-quick-shortcuts] button[data-omx-quick-shortcut]').length, outside: !document.querySelector('[data-composer-card] [data-omnimux-quick-shortcuts]'), controls: document.querySelectorAll('[data-omx-quick-shortcut-controls]').length }));
      assert.equal(state.count, 4); assert.equal(state.outside, true); assert.equal(state.controls, expected ? 1 : 0);
      record(`shortcut-${id}`, state);
    }
    await page.click('[data-omx-quick-shortcut="clone"]');
    await page.waitForSelector('#paramSummaryTriggerBtn', { state: 'visible' });
    await page.click('#paramSummaryTriggerBtn');
    await page.waitForSelector('[role="dialog"][aria-label="模型参数配置"]', { state: 'visible' });
    await page.click('loc=role:button[name="1080p"]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-label="模型参数配置"]') && document.activeElement?.id === 'paramSummaryTriggerBtn');
    record('parameters-escape-focus', { resolution: '1080p' });
    await page.click('#modelCascadeTriggerBtn');
    await page.waitForSelector('[role="dialog"][aria-label="模型级联选择"]', { state: 'visible' });
    await settle();
    const popup = await page.evaluate(() => {
      const rect = document.querySelector('[role="dialog"][aria-label="模型级联选择"]').getBoundingClientRect();
      return { ...rect.toJSON(), viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(popup.width > 0 && popup.height > 0 && popup.left >= 0 && popup.top >= 0 && popup.right <= popup.viewportWidth && popup.bottom <= popup.viewportHeight, 'Top composer model dialog must stay in viewport');
    record('model-popup-viewport', popup);
    await page.screenshot({ path: `${evidence}/model-popup.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-label="模型级联选择"]') && document.activeElement?.id === 'modelCascadeTriggerBtn');
    const textModelSelector = '[data-composer-card] button[aria-label^="Select model, current"]';
    const textModel = await page.evaluate(selector => { const b = document.querySelector(selector); return { width: b.getBoundingClientRect().width, label: b.getAttribute('aria-label') }; }, textModelSelector);
    assert.equal(textModel.width, 28);
    await page.click(textModelSelector);
    await fs.writeFile(`${evidence}/text-model-menu.txt`, redact(await page.snapshot()));
    await page.waitForSelector('[role="menu"]', { state: 'visible' });
    record('text-model-icon-menu', textModel);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="menu"]')].some(e => e.getBoundingClientRect().width > 0));

    for (const width of [320, 460, 560, 720, 952]) {
      await resize(width);
      const geometry = await page.evaluate(() => {
        const card = document.querySelector('[data-composer-card]');
        const bounds = card.getBoundingClientRect();
        const buttons = [...card.querySelectorAll('[class*="tools"] button,[class*="trailing"] button')].filter(e => e.offsetWidth > 0 && e.offsetHeight > 0).map(e => {
          const rect = e.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return { label: e.getAttribute('aria-label'), ...rect.toJSON(), unoccluded: hit === e || e.contains(hit) };
        });
        const send = card.querySelector('button[aria-label="Send message"]');
        const model = card.querySelector('#modelCascadeTriggerBtn');
        const params = card.querySelector('#paramSummaryTriggerBtn');
        return { column: document.querySelector('[class*="centerCol"]').offsetWidth, card: bounds.toJSON(), scrollWidth: card.scrollWidth, density: card.dataset.omnimuxInlineDensity, buttons, send: send?.getBoundingClientRect().toJSON(), model: model?.getBoundingClientRect().toJSON(), params: params?.getBoundingClientRect().toJSON(), summary: params?.textContent };
      });
      assert.equal(geometry.column, width);
      assert.ok(geometry.buttons.length >= 5, 'All principal toolbar controls must mount');
      assert.ok(geometry.buttons.every(b => b.left >= geometry.card.left - 1 && b.right <= geometry.card.right + 1 && b.unoccluded), 'Visible controls must fit and be unobstructed');
      assert.ok(geometry.scrollWidth <= geometry.card.width + 1, 'Composer must not horizontally overflow');
      for (const target of ['send', 'model', 'params']) assert.ok(geometry[target]?.width > 0 && geometry[target]?.height > 0, `${target} has positive geometry`);
      const centers = geometry.buttons.map(b => b.top + b.height / 2);
      assert.ok(Math.max(...centers) - Math.min(...centers) <= 3, 'Bottom toolbar must remain a single row');
      assert.ok(geometry.summary.toLowerCase().includes('1080p'), 'Resize must preserve parameter');
      record(`width-${width}`, geometry);
      await page.screenshot({ path: `${evidence}/width-${width}.png` });
    }
    const labelFixture = await page.evaluate(() => {
      const label = document.querySelector('#modelCascadeTriggerBtn .omx-model-name-display');
      const button = label.closest('button');
      const original = { text: label.textContent, title: button.title, aria: button.getAttribute('aria-label') };
      const text = '超长中文视频生成模型名称 Long English Video Generation Model Label For Layout';
      label.textContent = text; button.title = text; button.setAttribute('aria-label', `模型：${text}`);
      window.dispatchEvent(new Event('resize'));
      return original;
    });
    await resize(952);
    const longLabel = await page.evaluate(() => {
      const c = document.querySelector('[data-composer-card]'); const b = c.getBoundingClientRect();
      const label = c.querySelector('#modelCascadeTriggerBtn .omx-model-name-display');
      const buttons = [...c.querySelectorAll('[class*="tools"] button,[class*="trailing"] button')].filter(e => e.offsetWidth).map(e => e.getBoundingClientRect().toJSON());
      return { card: b.toJSON(), scroll: c.scrollWidth, density: c.dataset.omnimuxInlineDensity, text: label.textContent, title: label.closest('button').title, labelWidth: label.getBoundingClientRect().width, buttons };
    });
    assert.ok(longLabel.text.includes('超长中文') && longLabel.text.includes('Long English') && longLabel.title === longLabel.text);
    assert.ok(longLabel.scroll <= longLabel.card.width + 1 && longLabel.buttons.every(b => b.left >= longLabel.card.left - 1 && b.right <= longLabel.card.right + 1));
    record('long-bilingual-label', longLabel);
    await page.screenshot({ path: `${evidence}/long-label.png` });
    await page.evaluate(original => {
      const label = document.querySelector('#modelCascadeTriggerBtn .omx-model-name-display'); const button = label.closest('button');
      label.textContent = original.text; button.title = original.title; button.setAttribute('aria-label', original.aria);
      window.dispatchEvent(new Event('resize'));
    }, labelFixture);
    await settle();
    const idleMutations = await page.evaluate(() => new Promise(resolve => {
      let count = 0, frames = 0;
      const observer = new MutationObserver(records => { count += records.length; });
      observer.observe(document.querySelector('[data-composer-card]'), { attributes: true });
      const sample = () => { if (++frames < 30) requestAnimationFrame(sample); else { observer.disconnect(); resolve({ count, frames }); } };
      requestAnimationFrame(sample);
    }));
    assert.equal(idleMutations.count, 0, 'Idle composer must not repeatedly mutate attributes');
    record('idle-attribute-stability', idleMutations);
    assert.equal(await page.evaluate(() => localStorage.getItem('dsh.conversation.contentWidth')), savedWidth);
    record('saved-width-unchanged', { savedWidth });
    await page.click('[data-omx-quick-shortcut="clone"]');
    await page.waitForFunction(() => !document.querySelector('[data-omx-quick-shortcut-controls]') && !document.querySelector('[data-composer-card]')?.hasAttribute('data-omnimux-inline-density'));
    await settle();
    const restored = await page.evaluate(() => { const c = document.querySelector('[data-composer-card]'); return { width: c.getBoundingClientRect().width, style: c.getAttribute('style') || '', density: c.getAttribute('data-omnimux-inline-density') }; });
    assert.equal(restored.style, initial.style); assert.equal(restored.density, initial.density); assert.ok(Math.abs(restored.width - initial.width) <= 1);
    record('cancel-restores', { initial, restored });
    await page.screenshot({ path: `${evidence}/cancel-restored.png` });
    // Controlled original-card widths exercise G0/G1/G2 without changing saved preferences.
    for (const [phase, base] of [['G0', 850], ['G1', 500]]) {
      await page.evaluate(base => { const c = document.querySelector('[data-composer-card]'); c.style.setProperty('width', `${base}px`, 'important'); c.style.setProperty('max-width', `${base}px`, 'important'); }, base);
      await settle();
      const baseline = await page.evaluate(() => document.querySelector('[data-composer-card]').getBoundingClientRect().width);
      assert.equal(baseline, base);
      await page.click('[data-omx-quick-shortcut="clone"]');
      await page.waitForSelector('#modelCascadeTriggerBtn', { state: 'visible' });
      await settle();
      const active = await page.evaluate(() => { const c = document.querySelector('[data-composer-card]'); const r = c.getBoundingClientRect(); const s = c.closest('[data-composer-seat]').getBoundingClientRect(); return { width: r.width, center: r.left + r.width / 2, seatCenter: s.left + s.width / 2, density: c.dataset.omnimuxInlineDensity }; });
      assert.ok(Math.abs(active.center - active.seatCenter) <= 1, `${phase} must remain centered in available seat`);
      assert.equal(active.density, 'full', `${phase} must retain full labels while content fits`);
      if (phase === 'G0') assert.equal(active.width, baseline, 'G0 must not shrink or unnecessarily grow original card');
      else assert.ok(active.width > baseline && active.width < longLabel.card.width, 'G1 must grow before reaching available boundary');
      record(`expand-first-${phase}`, { fixture: 'original card CSS width, not saved preference', baseline, active });
      await page.screenshot({ path: `${evidence}/${phase}.png` });
      if (phase === 'G1') {
        await page.evaluate(() => { document.querySelector('#modelCascadeTriggerBtn .omx-model-name-display').textContent = '超长中文 Long English Model '.repeat(12); window.dispatchEvent(new Event('resize')); });
        await settle();
        const boundary = await page.evaluate(() => { const c = document.querySelector('[data-composer-card]'); return { width: c.getBoundingClientRect().width, scroll: c.scrollWidth, density: c.dataset.omnimuxInlineDensity }; });
        assert.ok(Math.abs(boundary.width - longLabel.card.width) <= 1, 'G2 must reach measured available boundary before compacting');
        assert.equal(boundary.density, 'short'); assert.ok(boundary.scroll <= boundary.width + 1);
        record('expand-first-G2', boundary);
        await page.screenshot({ path: `${evidence}/G2.png` });
      }
      await page.click('[data-omx-quick-shortcut="clone"]');
      await page.waitForFunction(() => !document.querySelector('[data-omx-quick-shortcut-controls]'));
      await settle();
      assert.equal(await page.evaluate(() => document.querySelector('[data-composer-card]').getBoundingClientRect().width), baseline);
    }
    await page.evaluate(style => document.querySelector('[data-composer-card]').setAttribute('style', style), initial.style);
    await fs.writeFile(`${evidence}/normal-completion.json`, JSON.stringify({ completed: true }));
  } catch (error) {
    record('failure', { name: error.name, message: redact(String(error.message || error)) }, false);
    if (page) {
      await fs.writeFile(`${evidence}/failure.txt`, redact(await page.snapshot())).catch(() => {});
      await page.screenshot({ path: `${evidence}/failure.png` }).catch(() => {});
    }
    throw error;
  } finally {
    try {
      await fs.writeFile(`${evidence}/assertions.json`, JSON.stringify(results, null, 2));
    } finally {
      if (task) {
        const receipt = await task.finish({ keep: [] });
        await fs.writeFile(`${evidence}/browser-cleanup.json`, JSON.stringify(receipt));
      }
    }
  }
}

fs.mkdirSync(join(taskRoot, '.workbuddy/evidence'), { recursive: true });
const evidence = fs.mkdtempSync(join(taskRoot, '.workbuddy/evidence/composer-inline-e2e-'));
let environment;
let failure;
const candidatePaths = () => [...new Set([
  ...execFileSync('git', ['ls-files', '-m', '-o', '--exclude-standard', '--', 'plugins', 'scripts', 'specs/composer-inline-controls.spec.md'], { cwd: taskRoot, encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  ...execFileSync('git', ['diff', '--name-only', '5b64e389f0c467a9a0aa27cfa50ffff2070e8bf7', '--', 'plugins', 'scripts', 'specs/composer-inline-controls.spec.md'], { cwd: taskRoot, encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  'plugins/omnimux/lib/client.js', 'plugins/omnimux-market/lib/client.js',
])].sort();
const fingerprint = () => Object.fromEntries(candidatePaths().map(path => [path, fs.existsSync(join(taskRoot, path)) ? createHash('sha256').update(fs.readFileSync(join(taskRoot, path))).digest('hex') : null]));
const sourceBefore = fingerprint();
fs.writeFileSync(join(evidence, 'source-before.json'), JSON.stringify(sourceBefore, null, 2));
try {
  const browserPreflight = spawnSync('ego-browser', ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (browserPreflight.error || browserPreflight.status !== 0) throw new Error('Composer QA requires ego-browser on PATH');
  environment = await startComposerInlineEnvironment({ evidence });
  const code = `const redact = ${redact.toString()}; const runSuite = ${browserSuite.toString()}; await runSuite(${JSON.stringify({ loginUrl: environment.loginUrl, evidence, workspaceTitle })}, redact);`;
  const result = spawnSync('ego-browser', ['nodejs'], { input: code, encoding: 'utf8', timeout: 180000, env: { PATH: process.env.PATH, HOME: process.env.HOME }, maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(join(evidence, 'browser.log'), redact(`${result.stdout || ''}\n${result.stderr || ''}`));
  if (result.error || result.status !== 0) throw new Error(`Ego suite failed (${result.status}): ${result.error?.code || 'see browser.log'}`);
  const assertions = JSON.parse(fs.readFileSync(join(evidence, 'assertions.json'), 'utf8'));
  const expected = ['loaded-bundle-identity', 'ratio-keyboard', 'narrow-scroll-no-overlap', ...['clone', 'breakdown', 'selling', 'reverse'].map(id => `shortcut-${id}`), 'parameters-escape-focus', 'model-popup-viewport', 'text-model-icon-menu', ...[320, 460, 560, 720, 952].map(width => `width-${width}`), 'long-bilingual-label', 'idle-attribute-stability', 'saved-width-unchanged', 'cancel-restores', 'expand-first-G0', 'expand-first-G1', 'expand-first-G2'];
  if (assertions.length !== expected.length || assertions.some(item => item.passed !== true) || expected.some(name => assertions.filter(item => item.name === name).length !== 1)) throw new Error('Incomplete assertion manifest');
  const cleanup = JSON.parse(fs.readFileSync(join(evidence, 'browser-cleanup.json'), 'utf8'));
  if (cleanup.closedSpace !== true || cleanup.keptManagedLabels?.length !== 0) throw new Error('Browser cleanup not confirmed');
  if (JSON.parse(fs.readFileSync(join(evidence, 'normal-completion.json'), 'utf8')).completed !== true) throw new Error('Normal suite completion not confirmed');
  const proof = JSON.parse(fs.readFileSync(join(evidence, 'runtime-proof.json'), 'utf8'));
  if (proof.status !== 200 || proof.exactBundleContained !== true) throw new Error('Loaded bundle identity not confirmed');
  const processProof = JSON.parse(fs.readFileSync(join(evidence, 'process.json')));
  if (processProof.clientHash !== sourceBefore['plugins/omnimux/lib/client.js'] || proof.bundleHash !== processProof.clientHash) throw new Error('Runtime candidate hashes differ');
  const artifacts = ['narrow-menu.png', 'model-popup.png', ...[320, 460, 560, 720, 952].map(width => `width-${width}.png`), 'long-label.png', 'cancel-restored.png', 'G0.png', 'G1.png', 'G2.png', 'onboarding.txt', 'text-model-menu.txt'];
  for (const name of artifacts) {
    const path = join(evidence, name);
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Missing evidence artifact: ${name}`);
    if (name.endsWith('.png') && !fs.readFileSync(path).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`Invalid PNG: ${name}`);
  }
} catch (error) {
  failure = error;
} finally {
  // A CLI timeout can prevent its finally from running. Close only this run's recorded space.
  if (fs.existsSync(join(evidence, 'space.json')) && !fs.existsSync(join(evidence, 'browser-cleanup.json'))) {
    const { spaceId } = JSON.parse(fs.readFileSync(join(evidence, 'space.json'), 'utf8'));
    const recovery = spawnSync('ego-browser', ['nodejs'], { input: `const task = await taskSpace(${JSON.stringify(spaceId)}); await task.finish({keep: []});`, encoding: 'utf8', timeout: 30000, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    fs.writeFileSync(join(evidence, 'browser-cleanup.json'), JSON.stringify({ spaceId, closed: recovery.status === 0, recovery: true }));
    if (recovery.status !== 0) failure ||= new Error('Browser cleanup recovery failed');
  }
  try {
    if (environment) {
      const cleanup = await environment.cleanup();
      const proof = JSON.parse(fs.readFileSync(join(evidence, 'process.json'), 'utf8'));
      let alive = false;
      try { process.kill(proof.pid, 0); alive = true; } catch (error) { if (error.code !== 'ESRCH') throw error; }
      const listener = spawnSync('/usr/sbin/lsof', ['-nP', `-iTCP:${new URL(environment.origin).port}`, '-sTCP:LISTEN']);
      const directoryExists = fs.existsSync(join(proof.workspacePath, '../..'));
      fs.writeFileSync(join(evidence, 'environment-cleanup.json'), JSON.stringify({ ...cleanup, alive, directoryExists, listenerPresent: listener.status === 0, lsofStatus: listener.status }));
      if (cleanup.cleaned !== true || alive || directoryExists || listener.status !== 1) throw new Error('Private environment cleanup not confirmed');
    }
  } catch (error) { failure ||= error; }
  try {
    const sourceAfter = fingerprint();
    fs.writeFileSync(join(evidence, 'source-after.json'), JSON.stringify(sourceAfter, null, 2));
    const changed = [...new Set([...Object.keys(sourceBefore), ...Object.keys(sourceAfter)])].filter(path => sourceBefore[path] !== sourceAfter[path]);
    fs.writeFileSync(join(evidence, 'source-drift.json'), JSON.stringify({ changed, unchanged: changed.length === 0 }));
    if (changed.length) throw new Error('Candidate source or bundle drifted during verification');
    const observationsPath = join(evidence, 'observations.jsonl');
    if (fs.existsSync(observationsPath)) {
      const partial = [];
      const malformedLines = [];
      for (const [index, line] of fs.readFileSync(observationsPath, 'utf8').split('\n').entries()) {
        if (!line.trim()) continue;
        try { partial.push(JSON.parse(line)); } catch { malformedLines.push(index + 1); }
      }
      fs.writeFileSync(join(evidence, 'partial-results.json'), JSON.stringify(partial, null, 2));
      if (malformedLines.length) throw new Error(`Observation journal contains incomplete lines: ${malformedLines.join(',')}`);
    }
  } catch (error) { failure ||= error; }
  fs.writeFileSync(join(evidence, 'result.json'), JSON.stringify({ passed: !failure, error: failure ? redact(failure.message) : null, evidence, realModelRequest: false, sentMessage: false }, null, 2));
}
console.log(JSON.stringify({ passed: !failure, evidence }));
if (failure) { console.error(redact(failure.message)); process.exitCode = 1; }
