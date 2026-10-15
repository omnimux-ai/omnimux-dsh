import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = ['omnimux-workflow', 'omnimux-automation', 'omnimux'];
const expected = ['normal-project-entry', 'portrait-selected', 'managed-media-decoded', 'saved-scene', 'play-seek', 'decoded-motion', 'scene-reopened', 'aspect-reopened'];
const browserEnv = () => ({ HOME: process.env.HOME, PATH: process.env.PATH });
const save = (directory, name, value) => fs.writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n');
const read = (directory, name) => JSON.parse(fs.readFileSync(join(directory, name), 'utf8'));

/** Only this program receives the in-memory login capability, through stdin. */
async function browserJourney({ loginUrl, evidence, origin }) {
  const fs = await import('node:fs/promises');
  const assert = (await import('node:assert/strict')).default;
  const write = (name, value) => fs.writeFile(`${evidence}/${name}`, JSON.stringify(value, null, 2));
  const results = [];
  const record = (name, detail) => results.push({ name, passed: true, detail });
  let task, page, phase = 'space', failure;
  const visible = selector => page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
  const publicScene = async path => {
    const response = await page.fetch(path, { timeout: 10000 });
    assert.equal(response.status, 200, 'public scene GET must succeed');
    const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    assert.ok(body.document?.scene, 'public scene document required');
    return body.document;
  };
  try {
    task = await taskSpace(`3289 formal portrait ${evidence.split('/').at(-1)}`);
    await write('space.json', { spaceId: task.spaceId });
    page = task.page('p1');
    phase = 'normal-project-entry';
    await page.goto(loginUrl);
    await visible('button[aria-label="Projects"]');
    await page.click('button[aria-label="Projects"]');
    await visible('text="New Project"'); await page.click('text="New Project"');
    await page.fill('input[placeholder="Project name"]', 'Director Portrait QA');
    await page.click('loc=css:.omnimux-workflow-dialog-footer button >> nth=1');
    await visible('.wf-canvas-toolbar'); await page.click('button[aria-label="Fullscreen"]');
    await page.click('loc=css:.wf-canvas-toolbar button >> nth=0');
    await page.click('text="3D Director"'); await page.click('text="打开导演台"');
    await visible('.wf-director-root');
    record(phase, { normalUI: true });
    phase = 'portrait-selected';
    await page.click('button[aria-label="添加角色"]');
    await page.click('button[aria-label="标准女性"]'); await page.click('text="跳过引导"');
    await page.click('button[aria-label="选择画幅比例"]'); await page.click('button[aria-label="9:16"]');
    assert.equal(await page.evaluate(() => document.querySelector('button[aria-label="9:16"]')?.getAttribute('aria-pressed')), 'true');
    record(phase, { aspectRatio: '9:16' });
    await page.click('button[aria-label="机位视角"]'); await page.click('text="镜头高级参数"');
    await page.click('loc=css:.wf-director-root button:text-is("固定")');
    await page.click('loc=css:.director-menu button:text-is("推进")');
    await page.click('text="按运镜生成轨迹"'); await page.click('text="导出白膜视频"');
    phase = 'managed-media-decoded';
    await page.waitForFunction(() => {
      const video = document.querySelector('.wf-canvas-editor video');
      return video && Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0;
    }, undefined, { timeout: 45000 });
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
    phase = 'saved-scene';
    await page.click('button[aria-label="关闭导演台"]');
    await page.waitForSelector('.wf-director-root', { state: 'hidden', timeout: 30000 });
    const saved = await publicScene(scenePath);
    assert.ok(saved.revision > 0); assert.equal(saved.scene.aspectRatio, '9:16');
    assert.equal(saved.scene.objects.filter(item => item.actorPreset === 'standard_female').length, 1);
    const shot = saved.scene.shots.find(item => item.id === saved.scene.activeShotId);
    assert.equal(shot.duration, 5); assert.equal(shot.fps, 30); assert.equal(shot.cameraMove, 'push_in');
    const camera = saved.scene.cameras.find(item => item.id === shot.cameraId);
    assert.ok(camera?.keyframes?.length >= 2 || camera?.motionPath, 'saved camera trajectory required');
    await write('saved-scene.json', saved); record(phase, { revision: saved.revision, sceneId: saved.scene.id });
    phase = 'play-seek';
    await page.evaluate(async () => { const video = document.querySelector('.wf-canvas-editor video'); video.muted = true; await video.play(); });
    await page.waitForFunction(() => document.querySelector('.wf-canvas-editor video')?.currentTime > 0.5, undefined, { timeout: 10000 });
    await page.evaluate(() => { const video = document.querySelector('.wf-canvas-editor video'); video.pause(); video.currentTime = 2.5; });
    await page.waitForFunction(() => { const video = document.querySelector('.wf-canvas-editor video'); return video && !video.seeking && Math.abs(video.currentTime - 2.5) < 0.1 && video.readyState >= 2; }, undefined, { timeout: 10000 });
    const playback = await page.evaluate(() => { const video = document.querySelector('.wf-canvas-editor video'); return { currentTime: video.currentTime, duration: video.duration, readyState: video.readyState, error: video.error?.code ?? null }; });
    assert.equal(playback.error, null); assert.ok(playback.readyState >= 2); assert.ok(Math.abs(playback.currentTime - 2.5) < 0.1);
    await page.screenshot({ path: `${evidence}/playback.png` }); record(phase, playback);
    phase = 'decoded-motion';
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
    phase = 'scene-reopened';
    await page.click('text="打开导演台"'); await visible('.wf-director-root');
    await page.click('button[aria-label="添加角色"]');
    await visible('loc=css:[data-director-workbench] [role="note"]');
    const actorName = saved.scene.objects.find(item => item.actorPreset === 'standard_female').name;
    await page.waitForFunction(name => [...document.querySelectorAll('[data-director-scene-row]')].some(row => row.getAttribute('data-director-row-label') === name), actorName, { timeout: 30000 });
    const reopened = await publicScene(scenePath);
    assert.equal(reopened.scene.id, saved.scene.id); assert.ok(reopened.revision >= saved.revision);
    assert.deepEqual(reopened.scene.objects, saved.scene.objects);
    assert.deepEqual(reopened.scene.cameras, saved.scene.cameras);
    assert.deepEqual(reopened.scene.shots, saved.scene.shots); assert.equal(reopened.scene.aspectRatio, '9:16');
    await write('reopened-scene.json', reopened); record(phase, { sceneId: reopened.scene.id, revision: reopened.revision });
    phase = 'aspect-reopened';
    await page.click('button[aria-label="选择画幅比例"]');
    assert.equal(await page.evaluate(() => document.querySelector('button[aria-label="9:16"]')?.getAttribute('aria-pressed')), 'true');
    await page.screenshot({ path: `${evidence}/reopened.png` }); record(phase, { aspectRatio: '9:16' });
    await write('completion.json', { completed: true });
  } catch (error) {
    failure = new Error(`Director acceptance failed at ${phase}; see retained assertions`);
    const assertion = error.code === 'ERR_ASSERTION' ? String(error.message).replaceAll(loginUrl, '[redacted-login-url]').replace(/([?&]token=)[^&\s"'<>]+/gi, '$1REDACTED').slice(0, 1000) : undefined;
    results.push({ name: phase, passed: false, error: { name: error.name, code: error.code, assertion } });
    if (page) await page.screenshot({ path: `${evidence}/failure.png` }).catch(() => {});
  } finally {
    try { await write('assertions.json', results); }
    finally { if (task) await write('browser-cleanup.json', await task.finish({ keep: [] })); }
  }
  if (failure) throw failure;
}

function runBrowser(executable, input, timeoutMs) {
  return new Promise(resolveResult => {
    const child = spawn(executable, ['nodejs'], { env: browserEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let settled = false, timedOut = false;
    let output = '';
    const diagnostics = () => output.split('\n').flatMap(line => {
      try { const item = JSON.parse(line); return item.directorDiagnostic === true ? [item] : []; }
      catch { return /(?:SyntaxError|ReferenceError|TypeError|Error:)/.test(line) ? [{ message: line.replace(/https?:\/\/[^\s"'<>]+/g, '[redacted-url]').replace(/token[^\s"']*/gi, '[redacted]').slice(0, 500) }] : []; }
    });
    child.stdout.on('data', bytes => { output += bytes.toString(); });
    child.stderr.on('data', bytes => { output += bytes.toString(); });
    const done = result => { if (!settled) { settled = true; clearTimeout(timer); clearTimeout(killTimer); resolveResult(result); } };
    let killTimer;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); }, timeoutMs);
    // Raw output can contain the login capability in a transport error; never retain it.
    child.stdout.resume(); child.stderr.resume(); child.stdin.on('error', () => {});
    child.once('error', error => done({ exitCode: null, code: error.code || 'spawn-error', timedOut }));
    child.once('close', (exitCode, signal) => done({ exitCode, signal, timedOut, diagnostics: diagnostics() }));
    child.stdin.end(input);
  });
}

function independentDecode(evidence) {
  const executable = process.env.DIRECTOR_FFMPEG;
  if (!executable) { save(evidence, 'independent-decode.json', { status: 'not-run', reason: 'DIRECTOR_FFMPEG not configured; parent must supplement independent decoding' }); return; }
  assert.ok(executable.startsWith('/'), 'DIRECTOR_FFMPEG must be an explicit absolute executable');
  fs.accessSync(executable, fs.constants.X_OK);
  const invoke = args => {
    const result = spawnSync(executable, ['-v', 'error', '-nostdin', ...args], { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
    assert.ok(!result.error, 'independent decode process budget'); assert.equal(result.status, 0, 'independent decode must succeed');
    return result.stdout;
  };
  invoke(['-i', join(evidence, 'composition.png'), '-f', 'null', '-']);
  invoke(['-i', join(evidence, 'reference.webm'), '-f', 'null', '-']);
  const output = invoke(['-i', join(evidence, 'reference.webm'), '-vf', 'fps=1', '-frames:v', '5', '-f', 'framemd5', '-']);
  const frames = output.split('\n').filter(line => line.trim() && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
  assert.ok(frames.length >= 4, 'independent decoder must emit full-duration samples');
  assert.ok(new Set([frames[0], frames[Math.floor(frames.length / 2)], frames.at(-1)]).size === 3, 'independent first/middle/end must differ');
  save(evidence, 'independent-decode.json', { status: 'passed', frames, pngDecoded: true, entireVideoDecoded: true });
}

test('normal installed app preserves portrait director scene and exports playable moving media', { timeout: 900000 }, async t => {
  if (process.env.DIRECTOR_REAL_UI !== '1') {
    t.skip('PRECONDITION_MISSING: set DIRECTOR_REAL_UI=1 for installed full-app Ego acceptance; no complete acceptance PASS'); return;
  }
  const { startTestEnvironment, diagnoseWorktreeRoot } = await import('./test-env-bootstrap.mjs');
  assert.equal(diagnoseWorktreeRoot(root, fs, dirname(dirname(root))).ok, true, 'task worktree required');
  const executable = process.env.DIRECTOR_EGO_BROWSER || 'ego-browser';
  const preflight = spawnSync(executable, ['--version'], { env: browserEnv(), encoding: 'utf8', timeout: 10000 });
  assert.ok(!preflight.error && preflight.status === 0, 'PRECONDITION_MISSING: Ego executable unavailable');
  fs.mkdirSync(join(root, '.agent-reports/beeftv-director'), { recursive: true });
  const evidence = fs.mkdtempSync(join(root, '.agent-reports/beeftv-director/formal-acceptance-'));
  t.diagnostic(`Evidence: ${evidence}`);
  let app, failure;
  try {
    app = await startTestEnvironment({ root, mode: 'ui', assembly: 'full', taskPackages: packages });
    save(evidence, 'runtime.json', app.summary);
    assert.equal(app.summary.assembly, 'full'); assert.equal(app.summary.evidenceLevel, 'full');
    assert.equal(app.summary.taskPluginsInstalled, true); assert.equal(app.summary.taskPluginsCount, 3);
    assert.equal(app.summary.installation?.method, 'packaged-plugin-add'); assert.equal(app.summary.installation?.exitCode, 0);
    for (const name of packages) assert.ok(app.summary.installedIdentities.some(item => item.name === name && item.equalsWorktree === true), `installed candidate identity: ${name}`);
    const result = await runBrowser(executable, `${browserJourney.toString()}\ntry { await browserJourney(${JSON.stringify({ loginUrl: app.loginUrl, evidence, origin: app.origin })}); } catch (error) { console.log(JSON.stringify({ directorDiagnostic: true, name: error.name, message: String(error.message).replace(/([?&]token=)[^&\\s\"'<>]+/gi, '$1REDACTED') })); throw Error('director-browser-verification-failed'); }`, 240000);
    save(evidence, 'browser-process.json', result);
    assert.equal(result.timedOut, false, 'browser await budget exceeded'); assert.equal(result.exitCode, 0, 'browser journey process failed');
    const assertions = read(evidence, 'assertions.json');
    assert.deepEqual(assertions.map(item => item.name), expected); assert.ok(assertions.every(item => item.passed === true));
    assert.equal(read(evidence, 'completion.json').completed, true);
    const cleanup = read(evidence, 'browser-cleanup.json');
    assert.equal(cleanup.closedSpace, true); assert.deepEqual(cleanup.keptManagedLabels, []);
    const artifacts = [];
    for (const name of ['composition.png', 'reference.webm', 'playback.png', 'reopened.png']) {
      const bytes = fs.readFileSync(join(evidence, name)); assert.ok(bytes.length > 1024, `actual artifact: ${name}`);
      const signature = name.endsWith('.png') ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) : Buffer.from([26, 69, 223, 163]);
      assert.ok(bytes.subarray(0, signature.length).equals(signature), `actual format: ${name}`);
      artifacts.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    save(evidence, 'artifacts.json', artifacts); independentDecode(evidence);
  } catch (error) { failure = error; }
  finally {
    // If the CLI was interrupted, resume only its recorded space and close it.
    try {
      if (fs.existsSync(join(evidence, 'space.json')) && !fs.existsSync(join(evidence, 'browser-cleanup.json'))) {
        const { spaceId } = read(evidence, 'space.json'); assert.ok(Number.isSafeInteger(spaceId));
        const recovery = await runBrowser(executable, `const fs=await import('node:fs/promises');const task=await taskSpace(${spaceId});const receipt=await task.finish({keep:[]});await fs.writeFile(${JSON.stringify(join(evidence, 'browser-cleanup.json'))},JSON.stringify(receipt));`, 30000);
        assert.equal(recovery.exitCode, 0, 'recorded browser space cleanup failed');
      }
      if (fs.existsSync(join(evidence, 'space.json'))) assert.equal(read(evidence, 'browser-cleanup.json').closedSpace, true);
    } catch (error) { failure ||= error; }
    try {
      if (app) { const cleanup = await app.cleanup(); save(evidence, 'cleanup.json', cleanup); assert.equal(cleanup.cleaned, true); }
    } catch (error) { failure ||= error; }
    const independent = fs.existsSync(join(evidence, 'independent-decode.json')) ? read(evidence, 'independent-decode.json').status : 'not-run';
    save(evidence, 'result.json', { passed: !failure, acceptanceScope: 'normal-ui-portrait-save-reopen-moving-media', completeMigrationAcceptance: false, independentDecode: independent, failure: failure ? { name: failure.name, code: failure.code || 'ACCEPTANCE_FAILED' } : null, realModelRequest: false, independentDecodeRequiredForFullMediaProof: true });
  }
  if (failure) throw failure;
});
