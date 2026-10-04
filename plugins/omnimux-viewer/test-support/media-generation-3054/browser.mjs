import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startFixture } from './server.mjs';

/** One invocation owns its browser space and port-zero fixture until both finally close. */
export async function runBrowser(taskSpace, evidenceDir, journey) {
  await mkdir(evidenceDir, { recursive: true });
  const report = { status: 'FAIL', checks: [], snapshots: [], screenshots: [], closed: false, server: null };
  let fixture, task, page, failure;
  const save = () => writeFile(resolve(evidenceDir, 'result.json'), JSON.stringify(report, null, 2));
  try {
    fixture = await startFixture(evidenceDir);
    report.manifest = fixture.manifest;
    await save();
    task = await taskSpace(`3054 browser successor ${Date.now()}`);
    report.spaceId = task.spaceId;
    console.log(JSON.stringify({ spaceId: task.spaceId, url: fixture.manifest.url }));
    page = task.page('p1');
    await page.goto(fixture.manifest.url);
    assert.equal(await page.url(), fixture.manifest.url);
    await page.waitForFunction(() => window.qaBoot?.mounted || window.qaBoot?.errors.length, undefined, { timeout: 15000 });
    const boot = await page.evaluate(() => window.qaBoot);
    assert.deepEqual(boot.errors, []);
    assert.equal(boot.mounted, true);
    const snapshot = await page.snapshot();
    report.snapshots.push({ scenario: 'mounted', value: snapshot });
    console.log(snapshot);
    const api = {
      page, report, imagePath: fixture.manifest.imagePath,
      async snapshot(scenario) {
        const value = await page.snapshot(); const errors = await page.evaluate(() => window.qaBoot.errors);
        report.snapshots.push({ scenario, value, errors }); assert.deepEqual(errors, []); console.log(value); return value;
      },
      async screenshot(name) {
        const path = resolve(evidenceDir, `${name}.png`);
        await page.screenshot({ path });
        const bytes = await readFile(path);
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        const size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
        assert.ok(size.width > 0 && size.height > 0);
        report.screenshots.push({ path, ...size });
      },
      async state() { return JSON.parse((await page.fetch('/qa/state')).body); },
      async control(scenario, release = false) { await page.fetch(`/qa/control?scenario=${encodeURIComponent(scenario)}${release ? '&release=1' : ''}`); },
    };
    await journey(api);
    assert.ok(!report.checks.some(check => check.outcome === 'FAIL'), 'diagnostic journey contains a verified failed acceptance criterion');
    report.errors = await page.evaluate(() => window.qaBoot.errors);
    assert.deepEqual(report.errors, []);
  } catch (error) {
    failure = error; report.error = error.stack || String(error);
    if (page) {
      try {
        report.diagnostics = await page.evaluate(() => ({ boot: window.qaBoot, state: window.qa?.getState(), trace: window.qa?.getTrace(), url: location.href, text: document.body.innerText }));
        await page.screenshot({ path: resolve(evidenceDir, 'failure.png') });
      } catch (diagnosticError) { report.diagnosticError = String(diagnosticError); }
    }
  } finally {
    try { if (task) { report.finishReceipt = await task.finish({ keep: [] }); report.closed = true; } }
    catch (error) { report.closeError = String(error); failure ||= error; }
    finally {
      try {
        if (fixture) {
          report.server = await fixture.close();
          assert.deepEqual(report.server.changedSources, [], 'sources changed during browser execution');
        }
      } catch (error) { report.serverCloseError = String(error); failure ||= error; }
      report.status = failure ? 'FAIL' : 'PASS_SCOPED';
      report.endedAt = new Date().toISOString(); await save();
    }
  }
  if (failure) throw failure;
  return report;
}
