import assert from 'node:assert/strict';

const trigger = '[data-testid="wf-model-cascade-trigger"]';
const generate = 'button[aria-label="生成"]';
const brand = '[role="menuitem"][data-testid^="wf-cascade-brand-"]';
const model = '[role="menuitem"][data-testid^="wf-cascade-model-"]';
const state = page => page.evaluate(() => window.__qa.state());
const posts = value => value.requests.filter(r => r.method === 'POST');
const node = (value, id) => value.nodes.find(n => n.id === id).data;

async function navigate(page, baseURL, catalog, saved = 'wrong') {
  const url = new URL(baseURL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Use an isolated loopback fixture, never a live workspace');
  url.search = new URLSearchParams({ catalog, saved }).toString();
  await page.goto(url.href);
  await page.waitForFunction(() => window.__qa?.ready === true, undefined, { timeout: 15000 });
}

async function fitControl(page, selector) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const fits = await page.evaluate(selector => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom < innerHeight - 8 && r.left >= 0 && r.right <= innerWidth
        && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }, selector);
    if (fits) return;
    await page.click('button[title="缩小"]');
  }
  assert.fail(`Control is not visible after real zoom clicks: ${selector}`);
}

async function selectNode(page, id) {
  await page.keyboard.press('Escape');
  await page.click(`[data-id="${id}"]`);
  await page.waitForSelector(generate, { state: 'visible' });
  await fitControl(page, generate);
}

async function clickDisabledGenerate(page) {
  // Ego correctly refuses aria-disabled element clicks. Use real pointer input
  // on the identified button (not DOM.click/dispatchEvent) to exercise its guard.
  await fitControl(page, generate);
  // Canvas zoom/reposition can outlive the input receipt. Require a stable
  // rectangle and a live hit on the button across consecutive paint frames.
  await page.waitForFunction(async selector => {
    const el = document.querySelector(selector);
    if (!el) return false;
    let previous;
    for (let frame = 0; frame < 3; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (document.querySelector(selector) !== el) return false;
      const r = el.getBoundingClientRect();
      const current = [r.x, r.y, r.width, r.height];
      if (r.width <= 0 || r.height <= 0 || !el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))) return false;
      if (previous && current.some((value, index) => Math.abs(value - previous[index]) > 0.1)) return false;
      previous = current;
    }
    return true;
  }, generate, { timeout: 10000 });
  const point = await page.evaluate(selector => {
    const el = document.querySelector(selector);
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    return { x, y, hit: el.contains(document.elementFromPoint(x, y)) };
  }, generate);
  assert.equal(point.hit, true, 'Generation button must not be covered');
  await page.mouse.click(point.x, point.y);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(posts(await state(page)), [], 'Disabled generation click must produce zero POST');
}

async function menuRows(page, selector) {
  return page.evaluate(selector => [...document.querySelectorAll(selector)].map(el => {
    const r = el.getBoundingClientRect();
    return { id: el.getAttribute('data-testid'), text: el.textContent, width: r.width, height: r.height };
  }), selector);
}

async function openMenu(page) {
  await fitControl(page, trigger);
  await page.click(trigger);
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
}

async function assertMenuBoundary(page, forbidden) {
  const brands = await menuRows(page, brand);
  assert.ok(brands.length > 0, 'Menu must contain compatible brands');
  const observed = [];
  for (const row of brands) {
    assert.ok(row.width > 0 && row.height > 0, `Brand has no geometry: ${row.id}`);
    assert.doesNotMatch(`${row.id} ${row.text}`, forbidden);
    await page.hover(`[data-testid="${row.id}"]`);
    await page.waitForSelector(model, { state: 'visible' });
    const models = await menuRows(page, model);
    assert.ok(models.length > 0, `Brand has no models: ${row.id}`);
    for (const item of models) {
      assert.ok(item.width > 0 && item.height > 0, `Model has no geometry: ${item.id}`);
      assert.doesNotMatch(`${item.id} ${item.text}`, forbidden);
    }
    observed.push({ brand: row.id, models });
  }
  return observed;
}

/** Caller owns the ego Page, isolated fixture server, evidence and TaskSpace cleanup.
 * No browser/server is started here. All acceptance actions use real input; __qa
 * is read-only observation of production stores and intercepted fetch requests.
 * Import and invoke explicitly: node --test is NOT browser execution evidence.
 */
export async function runStrictModelTypeJourneys(page, baseURL) {
  const results = [];
  for (const [kind, forbidden] of [['video', /gemini|google|gpt/i], ['audio', /suno|gpt/i]]) {
    await navigate(page, baseURL, 'hub');
    const id = `n-${kind}`;
    await selectNode(page, id);
    const before = await state(page);
    assert.equal(node(before, id).params.model, 'gpt-5.5', 'Wrong saved value must survive hydration');
    assert.match(await page.evaluate(s => document.querySelector(s).textContent, trigger), /待重新选择/);
    assert.equal(await page.evaluate(s => document.querySelector(s).getAttribute('aria-disabled'), generate), 'true');
    await clickDisabledGenerate(page);
    await openMenu(page);
    const menu = await assertMenuBoundary(page, forbidden);
    const after = await state(page);
    assert.deepEqual(node(after, id).params, node(before, id).params, 'Hover must not silently replace saved configuration');
    assert.deepEqual(posts(after), [], 'Wrong selection must not submit');
    results.push({ journey: `${kind}-menu-boundary-and-wrong-preserved`, menu });
  }

  for (const kind of ['text', 'image', 'video', 'audio']) {
    await navigate(page, baseURL, 'empty');
    await selectNode(page, `n-${kind}`);
    const guard = await page.evaluate(({ trigger, generate, model }) => ({
      triggers: document.querySelectorAll(trigger).length,
      models: document.querySelectorAll(model).length,
      statuses: [...document.querySelectorAll('[role="status"]')].map(el => el.textContent),
      disabled: document.querySelector(generate).getAttribute('aria-disabled'),
    }), { trigger, generate, model });
    assert.equal(guard.triggers, 0);
    assert.equal(guard.models, 0);
    assert.ok(guard.statuses.some(text => text.includes('暂无兼容模型')));
    assert.equal(guard.disabled, 'true');
    await clickDisabledGenerate(page);
    assert.deepEqual(posts(await state(page)), [], 'Empty catalog must not submit');
    results.push({ journey: `empty-${kind}-zero-candidates-no-post`, guard });
  }

  await navigate(page, baseURL, 'normal', 'valid');
  await selectNode(page, 'n-text');
  const before = await state(page);
  await openMenu(page);
  await page.hover('[data-testid="wf-cascade-brand-google"]');
  await page.waitForSelector('[data-testid="wf-cascade-model-gemini-3.8-flash"]', { state: 'visible' });
  assert.deepEqual(node(await state(page), 'n-text').params, node(before, 'n-text').params, 'Hover must not write a selection');
  await page.click('[data-testid="wf-cascade-model-gemini-3.8-flash"]');
  await page.waitForFunction(() => window.__qa.state().nodes.find(n => n.id === 'n-text').data.params.model === 'gemini-3.8-flash');
  const selected = await state(page);
  assert.equal(node(selected, 'n-text').prompt, node(before, 'n-text').prompt);
  assert.equal(node(selected, 'n-text').materialType, 'text');
  assert.deepEqual(posts(selected), [], 'Choosing a model must not generate');
  await fitControl(page, generate);
  assert.notEqual(await page.evaluate(s => document.querySelector(s).getAttribute('aria-disabled'), generate), 'true');
  await page.click(generate);
  await page.waitForFunction(() => window.__qa.state().requests.some(r => r.method === 'POST' && r.url.endsWith('/executions')));
  const submitted = await state(page);
  const captured = posts(submitted);
  assert.equal(captured.length, 1, 'One generation click must produce exactly one POST');
  assert.ok(captured[0].url.endsWith('/workspaces/issue1783-fixture/executions'));
  assert.deepEqual(JSON.parse(captured[0].body), { mode: 'single', nodeIds: ['n-text'] });
  const sentNode = node(captured[0].graph, 'n-text');
  assert.equal(sentNode.params.model, 'gemini-3.8-flash');
  assert.equal(sentNode.params.operation, 'text_to_text');
  assert.equal(sentNode.prompt, node(before, 'n-text').prompt);
  assert.equal(sentNode.materialType, 'text');
  assert.deepEqual(submitted.errors, [], 'No uncaught browser errors');
  results.push({ journey: 'text-explicit-selection-to-intercepted-post', request: captured[0] });
  return { browserExecuted: true, liveModelExecution: false, results };
}
