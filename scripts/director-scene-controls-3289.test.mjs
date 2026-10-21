import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = ['omnimux-workflow', 'omnimux-automation', 'omnimux'];
export const sceneJourneyRun = { evidence: null };
const expected = ['normal-project-entry', 'seven-primitives', 'scene-search', 'shift-group-member-flags', 'stage-axes-sky', 'aspects-directions', 'render-mode-gates', 'save-reopen-reload-identity'];
const browserEnv = () => ({ HOME: process.env.HOME, PATH: process.env.PATH });
const redact = value => String(value).replace(/([?&]token=)[^&\s"'<>]+/gi, '$1REDACTED');
const save = (directory, name, value) => fs.writeFileSync(join(directory, name), redact(JSON.stringify(value, null, 2)) + '\n');
const read = (directory, name) => JSON.parse(fs.readFileSync(join(directory, name), 'utf8'));

/** Serialized as a declaration; the login capability reaches Ego only through stdin. */
async function browserJourney({ loginUrl, evidence, projectTitle }) {
  const fs = await import('node:fs/promises');
  const assert = (await import('node:assert/strict')).default;
  const redact = value => String(value).replaceAll(loginUrl, '[redacted-login-url]').replace(/([?&]token=)[^&\s"'<>]+/gi, '$1REDACTED');
  const write = (name, value) => fs.writeFile(`${evidence}/${name}`, redact(JSON.stringify(value, null, 2)));
  const results = [], checks = [];
  const record = (detail) => results.push({ name: phase, passed: true, detail });
  let task, page, phase = 'normal-project-entry', failure;
  const root = '.wf-director-root ', tree = root + '[data-director-scene-tree="true"] ', dock = root + '[data-director-right-dock="true"] ';
  const geometry = [['立方体', 'box'], ['球体', 'sphere'], ['圆柱体', 'cylinder'], ['环状体', 'torus'], ['圆锥', 'cone'], ['棱锥', 'pyramid'], ['添加空对象', 'empty']];
  const visible = selector => page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
  const hidden = selector => page.waitForSelector(selector, { state: 'hidden', timeout: 20000 });
  const saved = () => page.waitForFunction(() => document.querySelector('.wf-director-root [aria-label="导演台保存状态"]')?.textContent?.trim() === '已保存', undefined, { timeout: 20000 });
  async function get(path) {
    const response = await page.fetch(path, { method: 'GET', timeout: 10000 });
    assert.equal(response.status, 200, `public GET ${path}`);
    return typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  }
  async function closeDirector() { await page.click(root + 'button[aria-label="关闭导演台"]'); await hidden('.wf-director-root'); }
  async function openDirector() { await page.click('text="打开导演台"'); await visible('.wf-director-root'); await visible('.director-viewport-shell[data-renderer-ready="true"]'); }
  const rows = () => page.evaluate(() => [...document.querySelectorAll('[data-director-scene-tree] [data-director-scene-row]')].map(e => e.getAttribute('data-director-row-label')));
  try {
    task = await taskSpace(`3289 formal scene ${projectTitle}`);
    await write('space.json', { spaceId: task.spaceId }); page = task.page('p1');
    await page.goto(loginUrl); await visible('button[aria-label="Projects"]');
    await page.click('button[aria-label="Projects"]'); await visible('text="New Project"'); await page.click('text="New Project"');
    await visible('input[placeholder="Project name"]'); await page.fill('input[placeholder="Project name"]', projectTitle);
    assert.equal(await page.evaluate(() => document.querySelector('input[placeholder="Project name"]')?.value), projectTitle);
    await page.click('loc=css:.omnimux-workflow-dialog-footer button >> nth=1');
    await visible('.wf-canvas-toolbar'); await page.click('button[aria-label="Fullscreen"]');
    await page.click('loc=css:.wf-canvas-toolbar button >> nth=0'); await visible('text="3D Director"'); await page.click('text="3D Director"');
    await visible('[data-node-type="director"]');
    const nodeId = await page.evaluate(() => document.querySelector('[data-node-type="director"]')?.closest('[data-node-id]')?.getAttribute('data-node-id'));
    assert.ok(nodeId, 'normal graph node identity required');
    await page.click('text="打开导演台"'); await visible('.wf-director-root'); await visible('text="跳过引导"');
    await page.click('text="跳过引导"'); await hidden('text="跳过引导"'); await visible('.director-viewport-shell[data-renderer-ready="true"]'); await saved();
    const matches = (await get('/omnimux-workflow/api/projects')).projects.filter(p => p.title === projectTitle);
    assert.equal(matches.length, 1, 'unique clock-and-nonce project required');
    const project = matches[0], workspaceMatches = [];
    for (const id of new Set([...(project.canvasWorkspaceIds || []), ...(project.pages || []).map(p => p.canvasWorkspaceId)].filter(Boolean))) {
      const workspace = (await get('/omnimux-workflow/api/workspaces/' + encodeURIComponent(id))).workspace;
      if (workspace.nodes?.some(n => n.id === nodeId && n.type === 'director')) workspaceMatches.push(workspace);
    }
    assert.equal(workspaceMatches.length, 1, 'DOM node must belong to one public workspace');
    const workspaceId = workspaceMatches[0].id, creationPage = project.pages?.find(p => p.canvasWorkspaceId === workspaceId);
    assert.ok(creationPage?.id && creationPage.title, 'original normal creation page required');
    const sceneURL = '/omnimux-workflow/api/workspaces/' + encodeURIComponent(workspaceId) + '/director/' + encodeURIComponent(nodeId);
    const initial = (await get(sceneURL)).document;
    assert.equal(initial.workspaceId, workspaceId); assert.equal(initial.nodeId, nodeId);
    assert.equal(initial.scene.objects.length, 0, 'fresh scene, not reused seeded objects'); assert.equal((initial.scene.groups || []).length, 0);
    const capabilities = await get(sceneURL + '/capabilities');
    assert.equal(capabilities.analyzeImage?.available, false); assert.equal(capabilities.panorama?.available, false);
    await write('identity.json', { project, workspace: workspaceMatches[0], creationPage, sceneURL, capabilities });
    record({ projectTitle, projectId: project.id, pageId: creationPage.id, workspaceId, nodeId, freshScene: true, aiStatus: 'GATED', modelsConsumed: false });

    phase = 'seven-primitives';
    await page.click(root + 'button[aria-label="添加角色"]'); await visible(root + 'button[aria-label="几何道具"]');
    await page.click(root + 'button[aria-label="几何道具"]'); await visible('[data-testid="director-geometry-submenu"]');
    for (const [label, primitive] of geometry) {
      await page.click('text="' + label + '"');
      await page.waitForFunction(l => document.querySelector('[data-director-right-dock] input')?.value === l, label, { timeout: 10000 });
      const actual = await page.evaluate(() => ({ title: document.querySelector('[data-director-right-dock] input')?.value, ready: document.querySelector('.director-viewport-shell')?.getAttribute('data-renderer-ready') }));
      assert.equal(actual.title, label); assert.equal(actual.ready, 'true'); checks.push({ check: 'geometry', label, primitive, actual });
    }
    await page.click(root + 'button[aria-label="场景"]'); await visible(tree + 'input[aria-label="搜索场景对象"]');
    const geometryRows = await rows(); for (const [label] of geometry) assert.equal(geometryRows.filter(l => l === label).length, 1);
    await saved(); const primitives = (await get(sceneURL)).document.scene.objects;
    assert.equal(primitives.length, geometry.length);
    for (const [label, primitive] of geometry) assert.equal(primitives.filter(o => o.name === label && o.primitive === primitive).length, 1, `public primitive ${primitive}`);
    await page.screenshot({ path: evidence + '/01-geometry.png' }); record({ geometry, actualRows: geometryRows });

    phase = 'scene-search';
    await page.fill(tree + 'input[aria-label="搜索场景对象"]', '圆柱体');
    await page.waitForFunction(() => { const r = [...document.querySelectorAll('[data-director-scene-tree] [data-director-scene-row]')]; return r.length === 1 && r[0].getAttribute('data-director-row-label') === '圆柱体'; }, undefined, { timeout: 10000 });
    assert.deepEqual(await rows(), ['圆柱体']); await page.fill(tree + 'input[aria-label="搜索场景对象"]', '');
    await page.waitForFunction(n => document.querySelectorAll('[data-director-scene-tree] [data-director-scene-row]').length === n, geometryRows.length, { timeout: 10000 });
    assert.deepEqual(await rows(), geometryRows); record({ target: '圆柱体', restoredRows: geometryRows });

    phase = 'shift-group-member-flags';
    await page.click(tree + '[data-director-row-label="立方体"] > button:first-child'); await visible(tree + '[data-director-row-label="立方体"][data-active="true"]');
    await page.keyboard.down('Shift');
    try { await page.click(tree + '[data-director-row-label="球体"] > button:first-child'); } finally { await page.keyboard.up('Shift'); }
    const selected = await page.evaluate(() => [...document.querySelectorAll('[data-director-scene-tree] [data-director-scene-row][data-active="true"]')].map(e => e.getAttribute('data-director-row-label')));
    assert.deepEqual([...selected].sort(), ['立方体', '球体'].sort());
    assert.ok((await page.evaluate(() => document.querySelector('[data-director-right-dock]')?.textContent))?.includes('已选中 2 个对象'));
    await page.click(tree + '[data-director-row-label="球体"]', { button: 'right' }); await visible('text="打组"');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.director-menu button')].find(e => e.textContent.trim() === '打组')?.disabled), false);
    await page.click('text="打组"');
    await page.waitForFunction(() => document.querySelector('[data-director-scene-tree] [data-director-scene-row][data-active="true"] button[aria-label$="展开/折叠"]'), undefined, { timeout: 10000 });
    const groupLabel = await page.evaluate(() => document.querySelector('[data-director-scene-tree] [data-director-scene-row][data-active="true"]')?.getAttribute('data-director-row-label'));
    assert.ok(groupLabel && !geometryRows.includes(groupLabel)); await page.screenshot({ path: evidence + '/02-group.png' });
    for (const [action, opposite, pressed] of [['锁定', '解锁', 'true'], ['解锁', '锁定', 'false'], ['隐藏', '显示', 'true'], ['显示', '隐藏', 'false']]) {
      await page.hover(tree + '[data-director-row-label="' + groupLabel + '"]'); await page.click(tree + 'button[aria-label="' + action + groupLabel + '"]');
      await visible(tree + 'button[aria-label="' + opposite + groupLabel + '"][aria-pressed="' + pressed + '"]');
      const members = await page.evaluate(() => ['立方体', '球体'].map(name => { const row = [...document.querySelectorAll('[data-director-scene-tree] [data-director-scene-row]')].find(e => e.getAttribute('data-director-row-label') === name); return { name, buttons: [...row.querySelectorAll('button[aria-label]')].map(e => ({ label: e.getAttribute('aria-label'), pressed: e.getAttribute('aria-pressed') })) }; }));
      for (const member of members) assert.ok(member.buttons.some(b => b.label === opposite + member.name && b.pressed === pressed), `member ${action}: ${member.name}`);
      await saved(); const document = (await get(sceneURL)).document, group = document.scene.groups.find(g => g.name === groupLabel);
      assert.ok(group); const publicMembers = document.scene.objects.filter(o => o.groupId === group.id);
      assert.equal(publicMembers.length, 2); assert.deepEqual(publicMembers.map(o => o.primitive).sort(), ['box', 'sphere']);
      for (const member of publicMembers) assert.equal(action === '锁定' || action === '解锁' ? Boolean(member.locked) : !member.visible, pressed === 'true', `public member ${action}`);
      checks.push({ check: 'group-member-flags', action, members, publicMembers });
    }
    await page.screenshot({ path: evidence + '/03-group-restored-flags.png' }); record({ nativeShift: true, groupLabel, members: selected, controlSelection: 'NOT_SUPPORTED' });

    phase = 'stage-axes-sky'; await closeDirector(); await openDirector(); await visible(dock + 'input[aria-label="场景平移X"]');
    const axes = [['场景平移X', 1.1], ['场景平移Y', 0.2], ['场景平移Z', -0.8], ['场景旋转X', 5], ['场景旋转Y', 15], ['场景旋转Z', -10]];
    for (const [label, value] of axes) {
      const selector = dock + 'input[aria-label="' + label + '"]'; await page.fill(selector, String(value)); await page.press(selector, 'Enter');
      const actual = await page.evaluate(l => { const e = document.querySelector('[data-director-right-dock] input[aria-label="' + l + '"]'); return { value: e?.value, committed: e?.getAttribute('aria-valuenow'), focused: document.activeElement === e }; }, label);
      assert.ok(Math.abs(Number(actual.value) - value) < 0.001); assert.ok(Math.abs(Number(actual.committed) - value) < 0.001); assert.equal(actual.focused, false);
      checks.push({ check: 'axis-enter', label, value, actual });
    }
    await page.fill(dock + 'input[aria-label="天空颜色色值"]', '405060'); await page.press(dock + 'input[aria-label="天空颜色色值"]', 'Enter');
    assert.equal(await page.evaluate(() => document.querySelector('[data-director-right-dock] input[aria-label="选择天空颜色"]')?.value), '#405060');
    await saved(); const environment = (await get(sceneURL)).document.scene;
    assert.deepEqual(environment.stageTransform.position, [1.1, 0.2, -0.8]); assert.deepEqual(environment.stageTransform.rotation, [5, 15, -10]); assert.equal(environment.background.toLowerCase(), '#405060');
    await page.screenshot({ path: evidence + '/04-scene-axes.png' }); record({ axes, background: environment.background });

    phase = 'aspects-directions'; await page.click(root + 'button[aria-label="选择画幅比例"]'); await visible(root + 'button[aria-label="21:9"]');
    const ratios = ['自适应', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], directions = ['右视', '左视', '俯视', '仰视', '正视', '背视'];
    for (const ratio of ratios) {
      await page.click(root + 'button[aria-label="' + ratio + '"]'); await visible(root + 'button[aria-label="' + ratio + '"][aria-pressed="true"]');
      const actual = await page.evaluate(() => ({ frame: document.querySelector('[data-director-aspect-frame]')?.getAttribute('data-director-aspect-frame') || null, ready: document.querySelector('.director-viewport-shell')?.getAttribute('data-renderer-ready') }));
      assert.equal(actual.frame, ratio === '自适应' ? null : ratio); assert.equal(actual.ready, 'true'); checks.push({ check: 'aspect', ratio, actual });
    }
    await page.screenshot({ path: evidence + '/05-aspect-portrait.png' });
    for (const direction of directions) {
      await page.press(root + '[aria-label="方向球"] button[aria-label="' + direction + '"]', 'Enter'); await visible(root + '[aria-label="方向球"] button[aria-label="' + direction + '"][aria-pressed="true"]');
      const actual = await page.evaluate(() => ({ axes: [...document.querySelectorAll('[aria-label="方向球"] button[aria-pressed="true"]')].map(e => e.getAttribute('aria-label')), ready: document.querySelector('.director-viewport-shell')?.getAttribute('data-renderer-ready') }));
      assert.deepEqual(actual.axes, [direction]); assert.equal(actual.ready, 'true'); checks.push({ check: 'direction-enter', direction, actual });
    }
    await page.click(root + 'button[aria-label="导演视角"]'); await visible(root + 'button[aria-label="导演视角"][aria-pressed="true"]');
    await page.screenshot({ path: evidence + '/06-directions.png' }); record({ ratios, directions, cameraVisualPass: false });

    phase = 'render-mode-gates';
    const stages = [['摆场', 'layout', ['构图预览', '彩色白膜']], ['姿态', 'pose', ['构图预览', '彩色白膜', '骨骼视图']], ['摄影机', 'camera', ['构图预览', '彩色白膜', '深度视图', '法线视图']]];
    for (const [modeLabel, mode, allowed] of stages) {
      await page.click(root + '.director-viewport-dock button[aria-label="移动"]', { button: 'right' }); await visible('text="' + modeLabel + '"'); await page.click('text="' + modeLabel + '"');
      await visible(root + '.director-viewport-dock[data-director-mode="' + mode + '"]');
      await page.click(root + '.director-viewport-dock button[aria-label="移动"]', { button: 'right' }); await visible('.director-menu');
      const actualAllowed = await page.evaluate(() => [...document.querySelectorAll('.director-menu button')].map(e => e.textContent.trim()).filter(l => ['构图预览', '彩色白膜', '骨骼视图', '深度视图', '法线视图'].includes(l)));
      assert.deepEqual(actualAllowed, allowed); await page.keyboard.press('Escape'); await hidden('.director-menu');
      for (const label of allowed) {
        await page.click(root + '.director-viewport-dock button[aria-label="移动"]', { button: 'right' }); await visible('text="' + label + '"'); await page.click('text="' + label + '"');
        await hidden('.director-menu'); await visible('.director-viewport-shell[data-renderer-ready="true"]');
        await page.click(root + '.director-viewport-dock button[aria-label="移动"]', { button: 'right' }); await visible('text="' + label + '"');
        const selected = await page.evaluate(l => [...document.querySelectorAll('.director-menu button')].find(e => e.textContent.trim() === l)?.getAttribute('aria-selected'), label);
        assert.equal(selected, 'true'); checks.push({ check: 'render-selected', mode, label, selected, visualPass: false });
        await page.keyboard.press('Escape'); await hidden('.director-menu'); await page.screenshot({ path: evidence + '/render-' + mode + '-' + allowed.indexOf(label) + '.png' });
      }
    }
    record({ stages, selectionOnly: true, threeDimensionalVisualPass: false, boneHelperVisualPass: false });

    phase = 'save-reopen-reload-identity'; await saved(); const document = (await get(sceneURL)).document;
    assert.equal(document.workspaceId, workspaceId); assert.equal(document.nodeId, nodeId); assert.ok(document.revision >= 1); assert.equal(document.scene.id, initial.scene.id);
    assert.equal(document.scene.aspectRatio, '9:16'); assert.equal(document.scene.background.toLowerCase(), '#405060');
    assert.deepEqual(document.scene.stageTransform.position, [1.1, 0.2, -0.8]); assert.deepEqual(document.scene.stageTransform.rotation, [5, 15, -10]);
    assert.equal(document.scene.objects.length, 7);
    for (const [label, primitive] of geometry) assert.equal(document.scene.objects.filter(o => o.name === label && o.primitive === primitive).length, 1);
    const finalGroup = document.scene.groups.find(g => g.name === groupLabel); assert.ok(finalGroup);
    const finalMembers = document.scene.objects.filter(o => o.groupId === finalGroup.id);
    assert.deepEqual(finalMembers.map(o => o.primitive).sort(), ['box', 'sphere']); assert.ok(finalMembers.every(o => !o.locked && o.visible));
    await write('saved-scene.json', document); await closeDirector(); await openDirector(); await page.click(root + 'button[aria-label="场景"]'); await visible(tree + '[data-director-row-label="' + groupLabel + '"]');
    for (const [label] of geometry) assert.ok((await rows()).includes(label));
    const reopened = (await get(sceneURL)).document; assert.deepEqual(reopened, document, 'full public document unchanged after close/reopen');
    await write('reopened-scene.json', reopened); await page.screenshot({ path: evidence + '/07-reopened.png' }); await closeDirector(); await page.reload();
    await visible('button[aria-label="Projects"]'); await page.click('button[aria-label="Projects"]');
    await visible('button.omnimux-folder-open[aria-label="' + projectTitle + '"]'); await page.click('button.omnimux-folder-open[aria-label="' + projectTitle + '"]'); await visible('.omnimux-project-crumb-current');
    assert.equal(await page.evaluate(() => document.querySelector('.omnimux-project-crumb-current')?.textContent?.trim()), projectTitle);
    const pageSelector = '.omnimux-page-card[title="点击打开创作页：' + creationPage.title + '"]'; await visible(pageSelector); await page.click(pageSelector); await visible('.wf-canvas-toolbar');
    if (await page.evaluate(() => { const e = document.querySelector('button[aria-label="Fullscreen"]'); return Boolean(e && e.getBoundingClientRect().width > 0); })) { await page.click('button[aria-label="Fullscreen"]'); await visible('.wf-canvas-toolbar'); }
    await visible('[data-node-type="director"]');
    assert.equal(await page.evaluate(() => document.querySelector('[data-node-type="director"]')?.closest('[data-node-id]')?.getAttribute('data-node-id')), nodeId);
    await openDirector(); await page.click(root + 'button[aria-label="场景"]'); await visible(tree + '[data-director-row-label="' + groupLabel + '"]');
    const reloadRows = await rows(); for (const [label] of geometry) assert.ok(reloadRows.includes(label));
    const reloaded = (await get(sceneURL)).document; assert.deepEqual(reloaded, document, 'full public document and revision unchanged after normal-project reload');
    const reloadedProject = (await get('/omnimux-workflow/api/projects')).projects.find(p => p.id === project.id);
    assert.equal(reloadedProject?.title, projectTitle); assert.ok(reloadedProject.pages.some(p => p.id === creationPage.id && p.canvasWorkspaceId === workspaceId));
    assert.equal(await page.evaluate(() => document.querySelector('[data-director-aspect-frame]')?.getAttribute('data-director-aspect-frame')), '9:16');
    await write('reloaded-scene.json', reloaded); await page.screenshot({ path: evidence + '/08-reload-normal-project.png' }); await write('final-snapshot.json', { snapshot: await page.snapshot() });
    record({ projectId: project.id, pageId: creationPage.id, workspaceId, nodeId, sceneId: document.scene.id, revision: document.revision, fullDocumentEqual: true, reloadRows });
    await write('completion.json', { completed: true, fullMigrationAcceptance: false, realModelRequest: false, visualAcceptance: false });
  } catch (error) {
    failure = new Error(`Scene controls failed at ${phase}; see retained diagnostics`);
    results.push({ name: phase, passed: false, error: { name: error.name, code: error.code, message: redact(error.message).slice(0, 1500), actual: error.actual, expected: error.expected } });
    if (page) await page.screenshot({ path: evidence + '/failure.png' }).catch(() => {});
  } finally {
    try { await write('assertions.json', results); await write('checks.json', checks); }
    finally { if (task) await write('browser-cleanup.json', await task.finish({ keep: [] })); }
  }
  if (failure) throw failure;
}

function runBrowser(executable, input, timeoutMs) {
  return new Promise(resolveResult => {
    const child = spawn(executable, ['nodejs'], { env: browserEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let settled = false, timedOut = false, output = '', killTimer;
    const finish = result => { if (!settled) { settled = true; clearTimeout(timer); clearTimeout(killTimer); output = ''; resolveResult(result); } };
    const consume = bytes => { output = (output + bytes.toString()).slice(-262144); };
    child.stdout.on('data', consume); child.stderr.on('data', consume); child.stdin.on('error', () => {});
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); }, timeoutMs);
    child.once('error', error => finish({ exitCode: null, code: error.code || 'spawn-error', timedOut }));
    child.once('close', (exitCode, signal) => {
      const diagnostics = output.split('\n').flatMap(line => {
        try { const item = JSON.parse(line); return item.directorDiagnostic === true ? [item] : []; }
        catch { return /(?:SyntaxError|ReferenceError|TypeError|Error:)/.test(line) ? [{ message: redact(line).replace(/https?:\/\/[^\s"'<>]+/g, '[redacted-url]').slice(0, 1000) }] : []; }
      }).slice(-30);
      finish({ exitCode, signal, timedOut, diagnostics });
    });
    // Raw transport output is discarded, never written to evidence.
    child.stdin.end(input);
  });
}

test('installed normal UI preserves scene controls through close and normal-project reload', { timeout: 900000 }, async t => {
  assert.equal(process.env.DIRECTOR_SCENE_REAL_UI, '1', 'PRECONDITION_MISSING: DIRECTOR_SCENE_REAL_UI=1 required; real UI not run, no complete acceptance PASS');
  const { startTestEnvironment, diagnoseWorktreeRoot } = await import('./test-env-bootstrap.mjs');
  assert.equal(diagnoseWorktreeRoot(root, fs, dirname(dirname(root))).ok, true, 'task worktree required');
  const executable = process.env.DIRECTOR_EGO_BROWSER || 'ego-browser';
  const preflight = spawnSync(executable, ['--version'], { env: browserEnv(), encoding: 'utf8', timeout: 10000 });
  assert.ok(!preflight.error && preflight.status === 0, 'PRECONDITION_MISSING: Ego executable unavailable');
  const directory = join(root, '.agent-reports/beeftv-director'); fs.mkdirSync(directory, { recursive: true });
  const evidence = fs.mkdtempSync(join(directory, 'formal-scene-controls-')); sceneJourneyRun.evidence = evidence; t.diagnostic(`Evidence: ${evidence}`);
  const projectTitle = `Scene Controls QA ${Date.now()} ${randomUUID().slice(0, 8)}`;
  let app, failure;
  try {
    app = await startTestEnvironment({ root, mode: 'ui', assembly: 'full', taskPackages: packages }); save(evidence, 'runtime.json', app.summary);
    assert.equal(app.summary.assembly, 'full'); assert.equal(app.summary.evidenceLevel, 'full'); assert.equal(app.summary.realModelRequest, false);
    assert.equal(app.summary.taskPluginsInstalled, true); assert.equal(app.summary.taskPluginsCount, 3);
    assert.equal(app.summary.installation?.method, 'packaged-plugin-add'); assert.equal(app.summary.installation?.exitCode, 0);
    for (const name of packages) assert.ok(app.summary.installedIdentities.some(item => item.name === name && item.equalsWorktree === true), `installed candidate identity: ${name}`);
    const input = `${browserJourney.toString()}\ntry { await browserJourney(${JSON.stringify({ loginUrl: app.loginUrl, evidence, projectTitle })}); } catch (error) { console.log(JSON.stringify({ directorDiagnostic: true, name: error.name, message: String(error.message).replace(/([?&]token=)[^&\\s\"'<>]+/gi, '$1REDACTED') })); throw Error('scene-browser-verification-failed'); }`;
    const result = await runBrowser(executable, input, 360000); save(evidence, 'browser-process.json', result);
    assert.equal(result.timedOut, false, 'browser journey budget exceeded'); assert.equal(result.exitCode, 0, 'browser journey process failed');
    const assertions = read(evidence, 'assertions.json'); assert.deepEqual(assertions.map(item => item.name), expected); assert.ok(assertions.every(item => item.passed === true));
    assert.equal(read(evidence, 'completion.json').completed, true);
    const cleanup = read(evidence, 'browser-cleanup.json'); assert.equal(cleanup.closedSpace, true); assert.deepEqual(cleanup.keptManagedLabels, []);
    assert.deepEqual(read(evidence, 'reopened-scene.json'), read(evidence, 'saved-scene.json')); assert.deepEqual(read(evidence, 'reloaded-scene.json'), read(evidence, 'saved-scene.json'));
    for (const name of ['01-geometry.png', '02-group.png', '03-group-restored-flags.png', '04-scene-axes.png', '05-aspect-portrait.png', '06-directions.png', '07-reopened.png', '08-reload-normal-project.png', 'render-layout-0.png', 'render-layout-1.png', 'render-pose-0.png', 'render-pose-1.png', 'render-pose-2.png', 'render-camera-0.png', 'render-camera-1.png', 'render-camera-2.png', 'render-camera-3.png']) {
      const bytes = fs.readFileSync(join(evidence, name)); assert.ok(bytes.length > 1024, `retained screenshot: ${name}`); assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `PNG screenshot: ${name}`);
    }
  } catch (error) { failure = error; }
  finally {
    try {
      if (fs.existsSync(join(evidence, 'space.json')) && !fs.existsSync(join(evidence, 'browser-cleanup.json'))) {
        const { spaceId } = read(evidence, 'space.json'); assert.ok(Number.isSafeInteger(spaceId));
        const recovery = await runBrowser(executable, `const fs=await import('node:fs/promises');const task=await taskSpace(${spaceId});const receipt=await task.finish({keep:[]});await fs.writeFile(${JSON.stringify(join(evidence, 'browser-cleanup.json'))},JSON.stringify(receipt));`, 30000);
        save(evidence, 'browser-recovery.json', recovery); assert.equal(recovery.timedOut, false); assert.equal(recovery.exitCode, 0, 'recorded space cleanup failed');
      }
      if (fs.existsSync(join(evidence, 'space.json'))) assert.equal(read(evidence, 'browser-cleanup.json').closedSpace, true);
    } catch (error) { failure ||= error; }
    try { if (app) { const cleanup = await app.cleanup(); save(evidence, 'cleanup.json', cleanup); assert.equal(cleanup.cleaned, true); } } catch (error) { failure ||= error; }
    save(evidence, 'result.json', { passed: !failure, states: expected, fullMigrationAcceptance: false, completeMigrationAcceptance: false, acceptanceScope: 'normal-ui-scene-controls-save-reload', realModelRequest: false, threeDimensionalVisualPass: false, failure: failure ? { name: failure.name, code: failure.code || 'ACCEPTANCE_FAILED', message: redact(failure.message).slice(0, 1500), actual: failure.actual, expected: failure.expected } : null });
  }
  if (failure) throw failure;
});
