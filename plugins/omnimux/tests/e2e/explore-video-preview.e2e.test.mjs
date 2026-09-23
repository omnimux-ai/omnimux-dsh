import assert from 'node:assert/strict';

/**
 * Full-app ego regression grounded in verify-qa-round2.md.
 * Caller owns authenticated private app, TaskSpace and environment cleanup.
 * Starts with closed workbench/detail panels; supports observed zh/en labels.
 * Original Creatify media only; this does not establish R2 delivery.
 */
export async function runExploreVideoPreview({ page, task, locale = 'zh' }) {
  const results = [];
  let phase = 'navigate all';
  let aborted = false;
  const labels = locale === 'zh'
    ? { all: '全部', cinematic: '视效大片', workspace: '选择工作区', shelf: '王牌短视频应用 列表', more: '加载更多', static: '梦幻草地', video: '三维萌系动画', close: '关闭' }
    : { all: 'All', cinematic: 'Cinematic VFX', workspace: 'Choose workspace', shelf: 'Featured Video Apps 列表', more: 'Load more', static: 'Dreamy Meadow', video: '3D Cute Animation', close: 'Close' };
  const workspace = `button[aria-label="${labels.workspace}"]`;
  const app = `[aria-label="${labels.shelf}"] [data-template-id="app-creatify-app-demo"]`;
  const check = async (name, fn) => {
    try { await fn(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: String(error) }); }
  };
  try {
    await page.click(`loc=role:tab[name="${labels.all}"]`);
    await page.hover(workspace);
    await check('initial cards have no video source', async () => {
      assert.equal(await page.evaluate(() => document.querySelectorAll('video[src]').length), 0);
    });
    await check('hover decodes muted inline loop video with positive geometry', async () => {
      await page.hover(app);
      await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1, undefined, { timeout: 15000 });
      const state = await page.evaluate(() => { const v = document.querySelector('video'); const r = v.getBoundingClientRect(); return { muted: v.muted, loop: v.loop, inline: v.playsInline, paused: v.paused, width: r.width, height: r.height }; });
      assert.ok(state.muted && state.loop && state.inline && !state.paused && state.width > 0 && state.height > 0);
    });
    await check('pointer leave pauses detached video', async () => {
      await page.evaluate(() => { window.__exploreQaVideo = document.querySelector('video'); });
      await page.hover(workspace);
      assert.deepEqual(await page.evaluate(() => ({ paused: window.__exploreQaVideo.paused, attached: window.__exploreQaVideo.isConnected })), { paused: true, attached: false });
    });
    await check('keyboard focus starts preview and blur releases it', async () => {
      await page.focus(app);
      await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1, undefined, { timeout: 15000 });
      await page.focus(workspace);
      assert.equal(await page.evaluate(() => document.querySelectorAll('video').length), 0);
    });
    phase = 'navigate cinematic';
    await page.click(`loc=role:tab[name="${labels.cinematic}"]`);
    phase = 'load observed samples';
    const hasSample = () => page.evaluate(label => !!document.querySelector(`[aria-label="${label}"]`), labels.static);
    // Real wheel input can trigger the observed lazy loader. Never blindly retry
    // a click whose target moved after a batch was added.
    for (let scroll = 0; scroll < 8 && !(await hasSample()); scroll++) {
      const point = await page.evaluate(() => { const r = document.querySelector('[data-template-id]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: Math.min(innerHeight - 150, Math.max(200, r.y + 100)) }; });
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(0, 700);
    }
    if (!(await hasSample())) {
      const button = await page.evaluate(label => {
        const b = document.querySelector(`button[aria-label="${label}"]`);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        return r.width > 0 && r.height > 0 && y > 0 && y < innerHeight && b.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
      }, labels.more);
      assert.ok(button, 'load button must be visible after real scrolling');
      await page.mouse.click(button.x, button.y, { label: '加载下一批模板' });
    }
    await page.waitForFunction(label => !!document.querySelector(`[aria-label="${label}"]`), labels.static, { timeout: 10000 });
    await check('mislabelled PNG stays static in card and detail', async () => {
      await page.hover(`loc=role:button[name="${labels.static}"]`);
      assert.equal(await page.evaluate(label => document.querySelector(`[aria-label="${label}"]`).querySelectorAll('video').length, labels.static), 0);
      await page.click(`loc=role:button[name="${labels.static}"]`);
      assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"]').querySelectorAll('video').length), 0);
      await page.click(`button[aria-label="${labels.close}"]`);
    });
    await check('keyboard detail has controls and native play pause works', async () => {
      const card = `loc=role:button[name="${labels.video}"]`;
      await page.focus(card);
      await page.press(card, 'Enter');
      const state = await page.evaluate(() => { const v = document.querySelector('[role="dialog"] video'); return { controls: v.controls, preload: v.preload, paused: v.paused, autoplay: v.autoplay }; });
      assert.deepEqual(state, { controls: true, preload: 'none', paused: true, autoplay: false });
      await page.press('[role="dialog"] video', 'Space');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] video')?.currentTime > 0.1, undefined, { timeout: 15000 });
      await page.press('[role="dialog"] video', 'Space');
      assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"] video').paused), true);
      await page.click(`button[aria-label="${labels.close}"]`);
    });
  } catch (error) {
    aborted = true;
    results.push({ name: phase, pass: false, error: String(error) });
  } finally {
    try { await page.evaluate(() => { delete window.__exploreQaVideo; }); }
    catch (error) { results.push({ name: 'cleanup retained video reference', pass: false, error: String(error) }); }
  }
  return { results, aborted, passed: results.filter(x => x.pass).length, failed: results.filter(x => !x.pass).length, taskSpaceId: task.spaceId };
}
