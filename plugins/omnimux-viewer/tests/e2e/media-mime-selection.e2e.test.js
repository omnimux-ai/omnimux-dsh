import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { redact } from '../../../../scripts/composer-inline-bootstrap.mjs';
import { fileURLToPath } from 'node:url';
import { startPrivateConsumerEnvironment } from '../../test-support/media-mime-selection-3278/environment.mjs';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
test('#3278 full application rejects unknown reference format and preserves original inputs', { timeout: 420000 }, async () => {
  const evidence = join(root, '.workbuddy/evidence/mime-selection-3278-' + randomUUID());
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(join(evidence,'格式未知'), 'UI-only unknown-format fixture; not an upload or provider request');
  fs.writeFileSync(join(evidence,'known.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
  const files = ['specs/media-mime-selection.spec.md', 'plugins/omnimux-viewer/src/media-viewer/MediaViewerComposer.jsx', 'plugins/omnimux-viewer/src/media-viewer/media-mime-selection.test.js', 'plugins/omnimux-viewer/src/media-viewer/media-viewer-composer.test.js', 'plugins/omnimux-viewer/src/media-viewer/media-slot.js', 'plugins/omnimux-viewer/src/media-viewer/ReferencePickerPopover.jsx', 'plugins/omnimux-viewer/lib/index.js', 'plugins/omnimux-viewer/lib/client.js', 'plugins/omnimux/src/client/media-viewer/styles.js', 'plugins/omnimux/lib/client.js', 'plugins/omnimux-viewer/tests/e2e/media-mime-selection.e2e.test.js', 'plugins/omnimux-viewer/test-support/media-mime-selection-3278/environment.mjs', 'plugins/omnimux-viewer/test-support/media-mime-selection-3278/journey.mjs', 'plugins/omnimux-viewer/test-support/media-mime-selection-3278/legacy-journey.mjs'];
  const fingerprints = () => Object.fromEntries(files.map(path => [path, createHash('sha256').update(fs.readFileSync(join(root, path))).digest('hex')]));
  let environment, processProof, error;
  const result = { evidence, syntheticUiOnly: true, fullAcceptance: false, runtimeReady: false, browserInvoked: false, cleanup: null };
  try {
    const before = fingerprints();
    fs.writeFileSync(join(evidence, 'candidate-before.json'), JSON.stringify(before, null, 2) + '\n');
    ({ environment, processProof } = await startPrivateConsumerEnvironment(evidence));
    result.runtimeReady = true;
    result.origin = environment.origin;
    const code = `
      const fs = await import('node:fs');
      const { consumerJourney } = await import(${JSON.stringify('file://' + join(root, 'plugins/omnimux-viewer/test-support/media-mime-selection-3278/journey.mjs'))});
      const redact = ${redact.toString()};
      let task;
      try {
        task = await taskSpace('素材格式检查 #3278 · 隔离功能验收');
        fs.writeFileSync(${JSON.stringify(join(evidence, 'space.json'))}, JSON.stringify({ spaceId: task.spaceId, page: 'p1' }) + '\\n');
        const page = task.page('p1');
        await page.cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
        await page.goto(${JSON.stringify(environment.loginUrl)});
        const record = (name,detail) => fs.appendFileSync(${JSON.stringify(join(evidence, 'observations.jsonl'))}, JSON.stringify({name,pass:true,detail}) + '\\n');
        const observed = await consumerJourney({page,evidenceDir:${JSON.stringify(evidence)},processProof:${JSON.stringify(processProof)},record});
        fs.writeFileSync(${JSON.stringify(join(evidence, 'journey-result.json'))}, JSON.stringify(observed,null,2) + '\\n');
      } catch(cause) {
        fs.writeFileSync(${JSON.stringify(join(evidence, 'browser-failure.json'))}, JSON.stringify({message:redact(cause?.message||cause), stack:redact(cause?.stack||'')},null,2) + '\\n');
        if(task) {
          const page=task.page('p1');
          try { fs.writeFileSync(${JSON.stringify(join(evidence, 'failure-snapshot.txt'))},redact(await page.snapshot())); await page.screenshot({path:${JSON.stringify(join(evidence, 'functional-failure.png'))}}); } catch {}
        }
        throw cause;
      } finally {
        if(task) {
          const receipt=await task.finish({keep:[]});
          fs.writeFileSync(${JSON.stringify(join(evidence, 'browser-cleanup.json'))},JSON.stringify({spaceId:task.spaceId,receipt},null,2)+'\\n');
        }
      }
    `;
    result.browserInvoked = true;
    const browser = await new Promise(resolve => {
      const child = spawn('ego-browser', ['nodejs'], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdio: 'pipe' });
      const output = { status: null, stdout: '', stderr: '', error: null };
      child.stdout.on('data', bytes => { output.stdout += bytes.toString(); }); child.stderr.on('data', bytes => { output.stderr += bytes.toString(); });
      const timeout = setTimeout(() => { output.error = { code: 'BROWSER_TIMEOUT' }; child.kill('SIGTERM'); }, 180000);
      child.once('error', error => { output.error = error; clearTimeout(timeout); resolve(output); });
      child.once('exit', status => { output.status = status; clearTimeout(timeout); resolve(output); });
      child.stdin.end(code);
    });
    fs.writeFileSync(join(evidence, 'browser.log'), redact((browser.stdout || '') + '\n' + (browser.stderr || '')));
    result.browserExit = browser.status;
    if (browser.error || browser.status !== 0) throw new Error('Functional ego invocation failed: ' + (browser.error?.code || browser.status));
    const after = fingerprints();
    fs.writeFileSync(join(evidence, 'candidate-after.json'), JSON.stringify(after, null, 2) + '\n');
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Candidate source or loaded artifact changed during browser verification');
    result.candidateUnchanged = true;
    result.journey = JSON.parse(fs.readFileSync(join(evidence, 'journey-result.json'), 'utf8'));
    result.fullAcceptance = result.journey.fullAcceptance === true;
    if (!result.fullAcceptance || result.journey.assertions.some(item => item.pass !== true)) throw new Error('Fresh functional journey did not complete');
    const space = JSON.parse(fs.readFileSync(join(evidence, 'space.json'), 'utf8'));
    const browserCleanup = JSON.parse(fs.readFileSync(join(evidence, 'browser-cleanup.json'), 'utf8'));
    if (browserCleanup.spaceId !== space.spaceId || browserCleanup.receipt.spaceId !== space.spaceId || browserCleanup.receipt.closedSpace !== true || browserCleanup.receipt.keptManagedLabels.length !== 0) throw new Error('Functional task space cleanup not confirmed');
  } catch (cause) {
    error = cause;
    result.error = redact(cause?.message || cause);
  } finally {
    if (environment) {
      try {
        const cleanup = await environment.cleanup();
        let alive = false;
        try { process.kill(processProof.pid, 0); alive = true; } catch (cause) { if (cause.code !== 'ESRCH') throw cause; }
        const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:' + new URL(environment.origin).port, '-sTCP:LISTEN']);
        result.cleanup = { ...cleanup, alive, listenerPresent: listener.status === 0, listenerExit: listener.status, privateDirectoryExists: fs.existsSync(resolve(processProof.privateProfile, '../..')) };
        if (alive || listener.status !== 1 || result.cleanup.privateDirectoryExists || cleanup.cleaned !== true) throw new Error('Task-private runtime cleanup not confirmed');
      } catch (cause) { error ||= cause; result.cleanupError = redact(cause.message); }
    }
    fs.writeFileSync(join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify({ evidence, runtimeReady: result.runtimeReady, browserInvoked: result.browserInvoked, browserExit: result.browserExit, error: result.error || result.cleanupError || null, fullAcceptance: result.fullAcceptance }));
  assert.equal(error, undefined, result.error || result.cleanupError);
  assert.equal(result.runtimeReady, true); assert.equal(result.browserExit, 0); assert.equal(result.fullAcceptance, true);
  assert.equal(result.candidateUnchanged, true);
  assert.equal(result.cleanup.cleaned, true); assert.equal(result.cleanup.alive, false); assert.equal(result.cleanup.listenerPresent, false); assert.equal(result.cleanup.privateDirectoryExists, false);
  const legacyCleanup = JSON.parse(fs.readFileSync(join(evidence, 'legacy-upstream-cleanup.json'), 'utf8'));
  assert.equal(legacyCleanup.closed, true); assert.equal(legacyCleanup.requests.filter(item => item.method !== 'GET').length, 0);
  for (const origin of [processProof.fixtureOrigin, processProof.legacyUpstreamOrigin]) {
    const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:' + new URL(origin).port, '-sTCP:LISTEN']);
    assert.equal(listener.status, 1, 'Task-only fixture listener remains');
  }
});
