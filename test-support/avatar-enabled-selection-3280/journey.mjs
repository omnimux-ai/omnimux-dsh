import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { redact } from '../../scripts/composer-inline-bootstrap.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function avatarJourney({ page, evidenceDir, envRpc, root, record = () => {} }) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  await page.goto(envRpc.originalLoginUrl);
  const actualHub = await page.fetch('/omnimux/model-catalog');
  assert.equal(actualHub.status, 200);
  fs.writeFileSync(join(evidenceDir, 'actual-unproxied-hub-catalog.json'), JSON.stringify({
    source: 'originalHost',
    status: actualHub.status,
    sha256: hash(typeof actualHub.body === 'string' ? actualHub.body : JSON.stringify(actualHub.body)),
    body: actualHub.body,
  }, null, 2));

  await page.goto(envRpc.loginUrl);
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Choose workspace"]') || document.querySelector('[data-omnimux-avatar-entry]') || [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Continue'),
    undefined,
    { timeout: 30000 },
  );

  if (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Continue'))) {
    await page.click('loc=role:button[name="Continue"]');
  }

  if (await page.evaluate(() => Boolean(document.querySelector('[aria-label="Choose workspace"]')))) {
    await page.click('[aria-label="Choose workspace"]');
    await page.click('text="QA Media"');
  }

  await page.waitForSelector('[data-omnimux-avatar-entry]', { state: 'visible', timeout: 30000 });
  await page.click('[data-omnimux-avatar-entry]');

  if (!(await page.evaluate(() => Boolean(document.querySelector('.omx-avatar-page'))))) {
    const canExpand = await page.evaluate(() => [...document.querySelectorAll('button')].some(e => e.getAttribute('aria-label') === '展开侧边栏'));
    if (canExpand) await page.click('loc=role:button[name="展开侧边栏"]');
    await page.waitForSelector('.omx-avatar-page', { state: 'visible', timeout: 15000 });
  }

  await page.waitForSelector('.omx-avatar-page', { state: 'visible', timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelector('.omx-avatar-modelbtn-val')?.textContent.includes('验收可用渠道') && document.querySelectorAll('.omx-avatar-opt--gender').length > 0,
    undefined,
    { timeout: 20000 },
  );

  await page.waitForFunction(
    () => {
      const p = document.querySelector('[data-dsh-panel]');
      return p && p.getBoundingClientRect().x < 1000 && p.getBoundingClientRect().x > 280;
    },
    undefined,
    { timeout: 10000 },
  );

  const panelBox = await page.evaluate(() => {
    const p = document.querySelector('[data-dsh-panel]');
    const grip = p?.firstElementChild;
    const b = grip?.getBoundingClientRect();
    return b ? { x: b.x, y: b.y, width: b.width, height: b.height, className: grip.className } : null;
  });
  assert.ok(panelBox?.width > 0 && panelBox.width < 20, 'Original native width grip must be identified');

  await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + Math.min(200, panelBox.height / 2));
  await page.mouse.down();
  for (let x = panelBox.x - 30; x > 285; x -= 30) {
    await page.mouse.move(x, panelBox.y + Math.min(200, panelBox.height / 2));
  }
  await page.mouse.move(285, panelBox.y + Math.min(200, panelBox.height / 2));
  await page.mouse.up();

  await page.waitForFunction(
    () => document.querySelector('[data-dsh-panel]').getBoundingClientRect().width > 900,
    undefined,
    { timeout: 10000 },
  );

  const jsonRequest = async path => {
    const response = await page.fetch(path);
    assert.equal(response.status, 200);
    return typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  };

  const libraryBefore = fs.readFileSync(envRpc.libraryFile);
  fs.writeFileSync(join(evidenceDir, 'library-before.json'), libraryBefore);
  const avatarsBefore = await jsonRequest('/api/omnimux/avatar/avatars');
  const tasksBefore = await jsonRequest('/api/omnimux/avatar/tasks?avatarId=' + envRpc.avatarId);

  const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(url => url.startsWith(location.origin + '/plugins/') && /omnimux(?:-avatar)?\/client\.js/.test(url)));
  assert.ok(loaded.some(url => url.includes('omnimux-avatar/client.js')), 'Observed actual registered avatar bundle required');

  for (const url of loaded) {
    const response = await page.fetch(url);
    assert.equal(response.status, 200);
    assert.equal(typeof response.body, 'string');
    for (const name of ['omnimux-avatar', 'omnimux']) {
      const bytes = fs.readFileSync(join(root, 'plugins', name, 'lib/client.js'), 'utf8');
      assert.ok(response.body.includes(bytes), 'Loaded concatenated response must contain exact task bundle: ' + name);
    }
  }

  // Scene A verification
  await page.click('.omx-avatar-opt--gender >> nth=0');
  await page.waitForFunction(() => document.querySelector('.omx-avatar-cta')?.disabled === false, undefined, { timeout: 10000 });
  const selected = () => page.evaluate(() => ({
    options: [...document.querySelectorAll('.omx-avatar-builder button[aria-pressed="true"]')].map(e => ({ text: e.textContent.trim(), html: e.outerHTML })),
    summary: document.querySelector('.omx-avatar-modelbtn-val')?.textContent,
  }));
  const sceneA = await selected();
  await page.screenshot({ path: join(evidenceDir, 'enabled-channel-selected.png') });

  await page.click('.omx-avatar-cta');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('合成验收：未调用供应商'), undefined, { timeout: 10000 });

  await envRpc.refreshState();
  assert.equal(envRpc.submissions.length, 1);
  assert.equal(envRpc.submissions[0].body.group, 'enabled-wire-3280');
  assert.deepEqual(await selected(), sceneA);

  // Scene B verification: all channels disabled
  await envRpc.setScene('B');
  await page.reload();
  await page.waitForSelector('[data-omnimux-avatar-entry]', { state: 'visible', timeout: 30000 });
  await page.click('[data-omnimux-avatar-entry]');
  await page.waitForSelector('.omx-avatar-opt--gender', { state: 'visible', timeout: 20000 });
  await page.click('.omx-avatar-opt--gender >> nth=0');

  assert.equal(await page.evaluate(() => document.querySelector('.omx-avatar-cta').disabled), true);
  const sceneB = await selected();

  // Test editing option while disabled
  await page.click('.omx-avatar-opt--gender >> nth=1');
  const sceneBEdited = await selected();
  assert.ok(sceneBEdited.options.some(e => e.text === '男性'));
  assert.ok(!sceneBEdited.options.some(e => e.text === '女性'));
  assert.deepEqual(
    sceneBEdited.options.filter(e => !['女性', '男性'].includes(e.text)),
    sceneB.options.filter(e => !['女性', '男性'].includes(e.text)),
  );
  assert.equal(await page.evaluate(() => document.querySelector('.omx-avatar-cta').disabled), true);

  await page.screenshot({ path: join(evidenceDir, 'all-disabled-still-editable.png') });

  await envRpc.refreshState();
  assert.equal(envRpc.submissions.filter(e => e.scene === 'B').length, 0);
  assert.equal(envRpc.blocked.length, 0);

  const avatarsAfter = await jsonRequest('/api/omnimux/avatar/avatars');
  const tasksAfter = await jsonRequest('/api/omnimux/avatar/tasks?avatarId=' + envRpc.avatarId);
  assert.deepEqual(avatarsAfter, avatarsBefore);
  assert.deepEqual(tasksAfter, tasksBefore);

  const libraryAfter = fs.readFileSync(envRpc.libraryFile);
  assert.ok(libraryAfter.equals(libraryBefore));
  fs.writeFileSync(join(evidenceDir, 'library-after.json'), libraryAfter);
  fs.writeFileSync(join(evidenceDir, 'library-byte-proof.json'), JSON.stringify({
    bytes: libraryBefore.length,
    before: hash(libraryBefore),
    after: hash(libraryAfter),
    exact: true,
  }, null, 2));

  return { sceneA, sceneB, sceneBEdited, submissions: envRpc.submissions };
}
