import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startFixture } from './generation-feedback-server.mjs';
import { installSlotProbe, assertSilentSlot, assertTransition } from './inplace-slot-probe.mjs';

/** Harness self-check, not full viewer acceptance. Invoke only through ego-browser nodejs. */
export async function runGenerationFeedbackBrowser(taskSpace, evidenceDir, spaceId = 47, options = {}) {
  if (typeof spaceId === 'object' && spaceId !== null) {
    options = spaceId;
    spaceId = 47;
  }
  await mkdir(evidenceDir, { recursive: true });
  const report = { status: 'HARNESS_INCOMPLETE', formalQA: false, checks: [], errors: [] };
  let fixture, task;
  const save = (name, value) => writeFile(resolve(evidenceDir, name), JSON.stringify(value, null, 2));
  try {
    task = await taskSpace(spaceId);
    report.ego = { spaceId: task.spaceId, page: 'p1', ownership: task.ownership };
    const page = task.page('p1');
    fixture = await startFixture(options); report.manifest = fixture.manifest;
    await save('result.json', report);
    for (const ratio of ['9:16', '16:9', '1:1']) {
      await page.goto(`${fixture.manifest.url}?mode=slot&ratio=${encodeURIComponent(ratio)}`);
      await page.waitForFunction(() => window.qaBoot?.mounted || window.qaBoot?.errors.length, undefined, { timeout: 15000 });
      assert.deepEqual(await page.evaluate(() => window.qaBoot.errors), []);
      report.environment = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, zoom: visualViewport.scale, theme: document.documentElement.dataset.theme }));
      await page.evaluate(installSlotProbe, { selector: '[data-qa-slot-host] .omx-media-slot', durationMs: 2200 });
      await page.evaluate(() => window.qaSlot.set({ status: 'running', media: { type: 'image', url: window.qaSlot.image } }));
      await page.waitForFunction(() => window.qaSlotProbe.frames.some((f) => f.slots[0]?.state === 'running'));
      const running = await page.evaluate(() => window.qaSlotProbe.frames.at(-1).slots[0]);
      assertSilentSlot(running);
      await page.screenshot({ path: resolve(evidenceDir, `${ratio.replace(':', '-')}-running.png`) });
      await page.evaluate(() => window.qaSlot.set({ status: 'success' }));
      await page.waitForFunction(() => window.qaSlotProbe.done, undefined, { timeout: 6000 });
      const trace = await page.evaluate(() => ({ frames: window.qaSlotProbe.frames, events: window.qaSlotProbe.events }));
      await save(`${ratio.replace(':', '-')}-frames.json`, trace);
      await page.screenshot({ path: resolve(evidenceDir, `${ratio.replace(':', '-')}-success.png`) });
      try { report.checks.push({ ratio, transition: assertTransition(trace, ratio), result: 'SELF_CHECK_OK' }); }
      catch (error) { report.errors.push({ ratio, message: String(error) }); throw error; }
      for (const status of ['failure', 'cancelled', 'unresolved']) {
        await page.evaluate((status) => window.qaSlot.set({ status }), status);
        await page.waitForFunction(() => document.querySelector('.omx-media-slot img')?.naturalWidth > 0);
        assert.equal(await page.evaluate(() => document.querySelector('.omx-media-slot').textContent.trim()), '');
        assert.equal(await page.evaluate(() => Boolean(document.querySelector('.omx-media-slot__shimmer-wrap'))), false);
        await page.evaluate(() => window.qaSlot.set({ media: null }));
        await page.waitForFunction(() => !document.querySelector('.omx-media-slot'));
        report.checks.push({ ratio, status, verifiedPartialRetainedAndEmptyRemoved: true });
        await page.evaluate(() => window.qaSlot.set({ status: 'success', media: { type: 'image', url: window.qaSlot.image } }));
        await page.waitForFunction(() => document.querySelector('.omx-media-slot img')?.naturalWidth > 0);
      }
    }
    report.status = report.errors.length ? 'HARNESS_OBSERVATIONS_REQUIRE_REVIEW' : 'HARNESS_SELF_CHECK_OK';
    // Never finish a space from finally: a takeover or driver error must leave it intact.
    report.browserCleanup = 'PRESERVED_EXISTING_SPACE_NO_FINISH';
  } catch (error) {
    report.errors.push({ message: error.stack || String(error) });
    report.browserCleanup = 'NOT_ATTEMPTED_AFTER_ERROR_OR_TAKEOVER';
  }
  finally {
    try { if (fixture) report.serverCleanup = await fixture.close(); }
    catch (error) { report.errors.push({ cleanup: String(error) }); }
    if (report.errors.length) report.status = 'HARNESS_INCOMPLETE';
    if (report.serverCleanup?.changedSources.length) report.status = 'SOURCE_CHANGED_RECAPTURE_REQUIRED';
    report.ok = report.status === 'HARNESS_SELF_CHECK_OK';
    if (!report.ok) process.exitCode = 1;
    await save('result.json', report);
  }
  return report;
}
