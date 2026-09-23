/** Opt-in full-app Ego regression. Import is inert; never discovered by node --test.
 * In ego-browser nodejs, import this module and call runNativeLinkPopover({
 *   taskSpace, helperPath: <absolute private-app-env.mjs>, pnpmBinDir, nodeBinDir,
 *   allowRegistry: true, evidenceDir: <absolute task-owned evidence directory>
 * }). No build, official/profile patch, model send, or private editor access.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const inside = file => file.startsWith(root + path.sep);
const selectors = {
  card: '[data-composer-card]', anchor: '[data-omx-composer-anchor]',
  video: '[data-composer-chip="omnimux-video-link"]',
  product: '[data-composer-chip="omnimux-product-link"]',
};

export async function runNativeLinkPopover(options) {
  assert.equal(typeof options.taskSpace, 'function', 'Ego taskSpace required');
  assert.ok(path.isAbsolute(options.helperPath) && inside(options.helperPath));
  assert.ok(path.isAbsolute(options.evidenceDir) && inside(options.evidenceDir));
  const helper = await import(pathToFileURL(options.helperPath).href);
  assert.equal(path.resolve(helper.taskRoot), root, 'helper must own this worktree');
  const report = { startedAt: new Date().toISOString(), status: 'RUNNING', cases: [],
    notCovered: [
      'multi-column and cross-session routing: requires observed UI in new candidate',
      'bare ID / non-http(s) scheme / multiple links: only one malformed value is exercised',
      'double-click inserts once, submit-once, undo/copy recovery: not exercised in this run',
      'IME candidate selection: synthetic composition events are not real OS IME evidence',
      'theme switching: media emulation is not application theme-setting verification',
    ], cleanup: {} };
  await fs.mkdir(options.evidenceDir, { recursive: true });
  const persist = () => fs.writeFile(path.join(options.evidenceDir, 'result.json'), JSON.stringify(report, null, 2));
  const task = await options.taskSpace('Issue2593 native link regression');
  report.spaceId = task.spaceId;
  let run, page;
  const deadline = Date.now() + 18 * 60 * 1000;
  const popoverStartTime = Date.now();
  const step = async (name, body) => {
    assert.ok(Date.now() < deadline, 'cooperative 18-minute budget exceeded');
    const item = { name, status: 'RUNNING' }; report.cases.push(item);
    try { item.evidence = await body(); item.status = 'PASS'; }
    catch (error) { item.status = 'FAIL'; item.error = String(error.stack); throw error; }
    finally { await persist(); }
  };
  const snapshot = async name => fs.writeFile(path.join(options.evidenceDir, name + '.txt'), await page.snapshot());
  // All UI targets must be present in current public DOM before use; no private state.
  const clickText = async (text, containerSelector) => {
    await page.waitForFunction(({ text, sel }) => {
      const scope = sel ? document.querySelector(sel) : document;
      return scope && [...scope.querySelectorAll('button,[role=button],label,span')]
        .some(e => e.textContent.trim() === text && e.getBoundingClientRect().width > 0);
    }, { text, sel: containerSelector }, { timeout: 90000 });
    await snapshot('before-' + (text.replace(/[^\p{L}\p{N}]+/gu, '_') || 'label'));
    await page.click(`text=${JSON.stringify(text)}`);
  };
  const state = () => page.evaluate(s => {
    const cards = [...document.querySelectorAll(s.card)];
    return cards.map(card => ({ anchor: card.querySelectorAll(s.anchor).length,
      video: card.querySelectorAll(s.video).length, product: card.querySelectorAll(s.product).length,
      videoHTML: [...card.querySelectorAll(s.video)].map(e => e.outerHTML),
      productHTML: [...card.querySelectorAll(s.product)].map(e => e.outerHTML),
      text: card.querySelector('[contenteditable=true]')?.textContent,
      focused: !!card.querySelector('[contenteditable=true]') && (card.querySelector('[contenteditable=true]') === document.activeElement || card.querySelector('[contenteditable=true]').contains(document.activeElement)),
      rect: card.getBoundingClientRect().toJSON(),
      entries: [...card.querySelectorAll('button')].map(e => e.textContent.trim()).filter(t => /^(视频链接|商品链接|Video link|Product link|Video|Product)$/.test(t)),
    }));
  }, selectors);
  const oneCard = async () => { const cards = await state(); assert.equal(cards.length, 1); return cards[0]; };
  const open = async kind => {
    const targets = kind === 'video' ? ['视频链接', 'Video link', 'Video'] : ['商品链接', 'Product link', 'Product'];
    let openedText = null;
    for (const t of targets) {
      const exists = await page.evaluate(text => [...document.querySelectorAll('button,[role=button],span')].some(e => e.textContent.trim() === text && e.getBoundingClientRect().width > 0), t);
      if (exists) { openedText = t; break; }
    }
    assert.ok(openedText, `must observe entry button for ${kind}`);
    await clickText(openedText, '[data-composer-card]');
    await page.waitForSelector('[role=dialog] input[type=text]', { state: 'visible', timeout: 10000 });
    const info = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map(d => ({
      text: d.innerText, rect: d.getBoundingClientRect().toJSON(),
      fields: [...d.querySelectorAll('input[type=text]')].map(i => ({ label: i.getAttribute('aria-label'), placeholder: i.placeholder })),
      buttons: [...d.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled }))
    })));
    assert.equal(info.length, 1); assert.equal(info[0].fields.length, 1);
    assert.ok(info[0].rect.width > 0 && info[0].rect.height > 0);
    assert.ok(info[0].buttons.some(b => b.text === '添加' || b.text === 'Add'), 'observed add control required');
    const placeholder = info[0].fields[0].placeholder;
    assert.ok(
      kind === 'video'
        ? (placeholder === '粘贴视频链接' || placeholder === 'Paste video link')
        : (placeholder === '粘贴商品页面链接' || placeholder === 'Paste product page link'),
      `placeholder copy must match specification for ${kind}, observed: ${placeholder}`,
    );
    const dialogTitle = info[0].text;
    assert.ok(
      kind === 'video'
        ? (dialogTitle.includes('添加视频链接') || dialogTitle.includes('Add video link'))
        : (dialogTitle.includes('添加商品链接') || dialogTitle.includes('Add product link')),
      `dialog title copy must match specification for ${kind}`,
    );
    return info[0];
  };
  const fill = value => page.fill('[role=dialog] input[type=text]', value);
  const add = async (kind, value, count) => {
    const dialog = await open(kind); await fill(value);
    const addBtn = dialog.buttons.find(b => b.text === '添加' || b.text === 'Add')?.text || '添加';
    await clickText(addBtn, '[role=dialog]');
    await page.waitForFunction(({selector, count}) => document.querySelectorAll(selector).length === count,
      { selector: selectors[kind], count }, { timeout: 10000 });
    await page.waitForSelector('[role=dialog] input[type=text]', { state: 'hidden', timeout: 10000 });
    const card = await oneCard(); assert.equal(card.anchor, 1, 'attachment slot must remain mounted');
    assert.equal(card.entries.length, 2, 'both entry chips must remain visible');
    assert.equal(card[kind], count); assert.ok(card.focused, 'focus must return to owning composer card');
    return { dialog, card };
  };
  try {
    run = await helper.startPrivateApp({ pnpmBinDir: options.pnpmBinDir,
      nodeBinDir: options.nodeBinDir, allowRegistry: options.allowRegistry === true });
    report.installation = run.installation; report.runtime = run.runtime;
    page = task.page('p1');
    await page.cdp('Runtime.enable'); await page.cdp('Debugger.enable');
    await page.goto(run.env.loginUrl);
    await step('observed onboarding without sending', async () => {
      await snapshot('onboarding'); await clickText('Local agent'); await clickText('Claude Code');
      await clickText('Continue');
      await page.waitForSelector('button[aria-label="Add workspace"]', { state: 'visible' });
      await page.click('button[aria-label="Add workspace"]');
      await page.waitForFunction(() => document.body.innerText.includes('Replicate viral video'), null, { timeout: 90000 });
      await clickText('Replicate viral video');
      await page.waitForSelector(selectors.anchor, { state: 'attached', timeout: 15000 });
      const card = await oneCard(); assert.equal(card.anchor, 1);
      assert.equal(card.entries.length, 2); return card;
    });
    await step('executed bundle equals installed original bytes', async () => {
      const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name)
        .filter(url => url.includes('/plugins/') && url.includes('omnimux/client.js')));
      assert.equal(resources.length, 1);
      const bytes = Buffer.from(await (await fetch(resources[0])).arrayBuffer());
      const original = await fs.readFile(run.installation.files.find(f => f.path === 'omnimux/lib/client.js').installedRealpath);
      const events = await page.events();
      const executed = events.find(e => e.method === 'Debugger.scriptParsed' && e.params.url === resources[0]);
      assert.ok(executed, 'actual executed script identity required');
      assert.equal(executed.params.hash, hash(bytes)); assert.ok(bytes.indexOf(original) >= 0);
      return { url: resources[0], sha256: hash(bytes), bytes: bytes.length, installedSha256: hash(original),
        installedBytes: original.length, embeddedOffset: bytes.indexOf(original), unchanged: run.assertArtifactsUnchanged() };
    });
    await step('custom body and real keyboard selection before append', async () => {
      await page.fill('[data-composer-card] [contenteditable=true]', '自定义正文：保留开头和末尾。');
      await page.press('[data-composer-card] [contenteditable=true]', 'Home');
      await page.press('[data-composer-card] [contenteditable=true]', 'Shift+End');
      const selected = await page.evaluate(() => window.getSelection()?.toString());
      assert.ok(selected?.length > 0, 'actual keyboard selection required');
      return { selected, card: await oneCard() };
    });
    const before = await oneCard();
    await step('empty invalid and Escape cancel preserve draft', async () => {
      const dialog = await open('video'); assert.ok(dialog.buttons.find(b => b.text === '添加' || b.text === 'Add').disabled);
      await fill('not-a-url');
      const addBtn = dialog.buttons.find(b => b.text === '添加' || b.text === 'Add')?.text || '添加';
      await clickText(addBtn, '[role=dialog]');
      await page.waitForSelector('[role=dialog] [role=alert]', { state: 'visible' });
      assert.equal(await page.evaluate(() => document.querySelector('[role=dialog] input[type=text]').value), 'not-a-url');
      await page.press('[role=dialog] input[type=text]', 'Escape');
      await page.waitForSelector('[role=dialog] input[type=text]', { state: 'hidden' });
      const after = await oneCard();
      assert.equal(after.text, before.text);
      assert.equal(after.video, 0);
      assert.ok(after.focused, 'Escape cancellation must best-effort refocus the owning composer editor');
      return after;
    });
    const url = 'https://example.com/video?id=2593';
    await step('video insertion keeps entire entry row', async () => {
      await page.click('[data-composer-card] [contenteditable=true]');
      await page.press('[data-composer-card] [contenteditable=true]', 'Home');
      await page.press('[data-composer-card] [contenteditable=true]', 'Shift+End');
      assert.ok((await page.evaluate(() => window.getSelection()?.toString())).includes('自定义正文'));
      return add('video', url, 1);
    });
    await step('same normalized video URL remains one reference', () => add('video', '  https://EXAMPLE.COM:443/video?id=2593  ', 1));
    await step('same URL across video and product creates separate kinds', () => add('product', url, 1));
    await step('product normalized duplicate preserves one', () => add('product', ' https://EXAMPLE.COM:443/video?id=2593 ', 1));
    await step('custom body preserved and appended refs follow body', async () => {
      const card = await oneCard(); assert.ok(card.text.startsWith('自定义正文：保留开头和末尾。'));
      assert.ok(card.text.indexOf('参考视频') > card.text.indexOf('末尾。'));
      await page.screenshot({ path: path.join(options.evidenceDir, 'wide-two-kinds.png') }); return card;
    });
    await step('Enter adds reference without bubbling into composer', async () => {
      await open('video'); await fill('https://example.com/enter');
      await page.evaluate(() => {
        window.__qaEnterBubble = 0;
        document.addEventListener('keydown', e => { if(e.key === 'Enter') window.__qaEnterBubble++; });
      });
      await page.press('[role=dialog] input[type=text]', 'Enter');
      await page.waitForFunction(() => document.querySelectorAll('[data-composer-chip="omnimux-video-link"]').length === 2, null, { timeout: 10000 });
      const card = await oneCard(); assert.equal(card.video, 2); assert.equal(card.product, 1);
      assert.ok(card.text.includes('自定义正文：保留开头和末尾。')); assert.ok(card.focused);
      const bubbled = await page.evaluate(() => window.__qaEnterBubble); assert.equal(bubbled, 0);
      return { card, bubbled, snapshot: await page.snapshot() };
    });
    await step('close button cancels without changing draft', async () => {
      const before = await oneCard(); await open('video'); await fill('https://example.com/close-cancel');
      const label = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')]
        .map(b => b.getAttribute('aria-label')).find(v => v && /关闭|close/i.test(v)));
      assert.ok(label, 'public close-button label must be observed');
      await page.click('[role=dialog] button[aria-label=' + JSON.stringify(label) + ']');
      await page.waitForSelector('[role=dialog] input[type=text]', { state: 'hidden' });
      const after = await oneCard();
      assert.equal(after.text, before.text);
      assert.ok(after.focused, 'close button cancellation must best-effort refocus the owning composer editor');
      return { label, after };
    });
    await step('outside click cancels while preserving body and refs', async () => {
      const before = await oneCard(); await open('product'); await fill('https://example.com/cancel');
      await page.click('[data-composer-card] [contenteditable=true]');
      await page.waitForSelector('[role=dialog] input[type=text]', { state: 'hidden' });
      const after = await oneCard(); assert.equal(after.text, before.text); return after;
    });
    await step('shortcut switch and retract preserve references', async () => {
      const old = await oneCard(); await clickText('Break down viral video');
      const switched = await oneCard(); assert.equal(switched.video, 2); assert.equal(switched.product, 1);
      await clickText('Break down viral video'); const retracted = await oneCard();
      assert.equal(retracted.video, 2); assert.equal(retracted.product, 1);
      assert.equal(retracted.text, old.text);
      assert.deepEqual(retracted.videoHTML, old.videoHTML); assert.deepEqual(retracted.productHTML, old.productHTML);
      return { old, switched, retracted };
    });
    await step('narrow viewport dialog remains inside viewport', async () => {
      await page.cdp('Emulation.setDeviceMetricsOverride', { width: 480, height: 850, deviceScaleFactor: 1, mobile: false });
      try {
        await clickText('Replicate viral video'); const dialog = await open('video');
        assert.ok(dialog.rect.x >= 12 && dialog.rect.right <= 468);
        await page.screenshot({ path: path.join(options.evidenceDir, 'narrow.png') });
        await page.press('[role=dialog] input[type=text]', 'Escape'); return dialog;
      } finally { await page.cdp('Emulation.clearDeviceMetricsOverride'); }
    });
    await step('public console has no attachment slot crash', async () => {
      const events = await page.events();
      const errors = events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error' && (e.params.timestamp ? e.params.timestamp * 1000 >= popoverStartTime : true));
      report.consoleErrors = errors;
      assert.equal(errors.length, 0, `console error requires triage, never silently ignored: ${JSON.stringify(errors)}`);
      return { count: errors.length };
    });
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 929, deviceScaleFactor: 1, mobile: false });
    await page.waitForFunction(() => document.querySelector('[data-composer-card]').getBoundingClientRect().width > 700, null, { timeout: 10000 });
    await page.screenshot({ path: path.join(options.evidenceDir, 'final.png') });
    await page.click('button[aria-label="Settings"]');
    await snapshot('settings-observed');
    report.settingsPublicDOM = await page.evaluate(() => [...document.querySelectorAll('button,[role=tab],[role=radio],select')].map(e => ({ text: e.textContent.trim(), label: e.getAttribute('aria-label'), role: e.getAttribute('role') })));
    await page.screenshot({ path: path.join(options.evidenceDir, 'settings-observed.png') });
    report.status = 'PARTIAL'; // Explicit uncovered matrix prevents a broad acceptance claim.
    report.artifactsUnchanged = run.assertArtifactsUnchanged();
  } catch (error) {
    report.status = 'FAIL'; report.error = String(error.stack);
    if (page) {
      try { report.failureSnapshot = await page.snapshot(); await page.screenshot({ path: path.join(options.evidenceDir, 'failure.png') }); } catch {}
      try { report.failureEvents = await page.events(); } catch {}
    }
  } finally {
    try { if (run) { await run.env.cleanup(); report.cleanup.environment = true; } }
    finally { await task.finish({ keep: [] }); report.cleanup.taskSpace = true; report.finishedAt = new Date().toISOString(); await persist(); }
  }
  if (report.status === 'FAIL') throw new Error('Native link full-app regression failed; see ' + path.join(options.evidenceDir, 'result.json'));
  return report;
}
