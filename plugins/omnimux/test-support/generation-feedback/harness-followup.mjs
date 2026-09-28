import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startFixture } from './generation-feedback-server.mjs';
import { installSlotProbe, assertTransition } from './inplace-slot-probe.mjs';

// Explicit space supplied by the caller; never reclaim user-owned spaces.
export async function runFollowup(taskSpace, spaceId, evidenceDir, options = {}) {
  if (spaceId !== 47) throw new Error('Only current TaskSpace 47/p1 is authorized');
  await mkdir(evidenceDir, { recursive: true });
  const save = (name, value) => writeFile(resolve(evidenceDir, name), JSON.stringify(value, null, 2));
  const report = { formalQA: false, status: 'INCOMPLETE', checks: [] };
  let fixture;
  try {
    const task = await taskSpace(spaceId);
    report.ego = { spaceId: task.spaceId, page: 'p1', ownership: task.ownership };
    const page = task.page('p1');
    fixture = await startFixture(options);
    report.manifest = fixture.manifest;
    await save('result.json', report);
    await page.goto(fixture.manifest.url);
    await page.waitForFunction(() => window.qaBoot?.mounted || window.qaBoot?.errors.length, undefined, { timeout: 15000 });
    report.fullViewer = { snapshot: await page.snapshot(), boot: await page.evaluate(() => window.qaBoot) };
    await save('full-viewer.json', report.fullViewer);
    await page.screenshot({ path: resolve(evidenceDir, 'full-viewer.png') });
    if (report.fullViewer.boot.errors.length) throw new Error('Full viewer boot errors; see full-viewer.json');
    // Full production viewer + bridge: submission/receipt seam, not direct slot props.
    report.integration = [];
    for (const mediaType of ['image', 'video']) {
      await page.goto(fixture.manifest.url);
      await page.waitForFunction(() => window.qaBoot?.mounted || window.qaBoot?.errors.length);
      await page.evaluate((type) => window.qa.submit(type === 'video' ? '生成一段视频' : '生成一张图片'), mediaType);
      await page.waitForFunction(() => document.querySelector('main .omx-media-slot[data-state="pending"]'));
      await page.evaluate(installSlotProbe, { selector: 'main .omx-media-slot', durationMs: 2200 });
      await page.evaluate(() => { window.qa.action('接纳请求'); window.qa.action('开始执行'); window.qa.action('最终映射'); });
      await page.waitForFunction(() => window.qaSlotProbe.frames.some(f => f.slots[0]?.state === 'running'));
      await page.screenshot({ path: resolve(evidenceDir, `integration-${mediaType}-running.png`) });
      await page.evaluate((type) => { window.qa.action(type === 'video' ? '返回视频' : '返回图片'); window.qa.action('结束回合'); }, mediaType);
      await page.waitForFunction(() => window.qaSlotProbe.done, undefined, { timeout: 6000 });
      const trace = await page.evaluate(() => ({ frames: window.qaSlotProbe.frames, events: window.qaSlotProbe.events,
        state: window.qa.getState(), transport: window.qa.log, errors: window.qaBoot.errors }));
      await save(`integration-${mediaType}.json`, trace);
      await page.screenshot({ path: resolve(evidenceDir, `integration-${mediaType}-result.png`) });
      if (trace.errors.length) throw new Error(JSON.stringify(trace.errors));
      try { report.integration.push({ mediaType, result: assertTransition(trace, '1:1') }); }
      catch (error) { report.integration.push({ mediaType, observation: error.stack }); throw error; }
    }
    for (const mediaType of ['image', 'video']) {
      for (const ratio of ['9:16', '16:9', '1:1']) {
        const key = `${mediaType}-${ratio.replace(':', '-')}`;
        await page.goto(`${fixture.manifest.url}?mode=slot&ratio=${encodeURIComponent(ratio)}`);
        await page.waitForFunction(() => window.qaBoot?.mounted || window.qaBoot?.errors.length);
        const boot = await page.evaluate(() => window.qaBoot);
        if (boot.errors.length) throw new Error(JSON.stringify(boot.errors));
        await page.evaluate(installSlotProbe, { selector: '[data-qa-slot-host] .omx-media-slot', durationMs: 1800 });
        await page.evaluate((type) => window.qaSlot.set({ status: 'running', media: { type, url: window.qaSlot[type] } }), mediaType);
        await page.waitForFunction(() => window.qaSlotProbe.frames.some(f => f.slots[0]?.state === 'running'));
        await page.evaluate(() => window.qaSlot.set({ status: 'success' }));
        await page.waitForFunction(() => window.qaSlotProbe.done, undefined, { timeout: 6000 });
        const trace = await page.evaluate(() => ({ frames: window.qaSlotProbe.frames, events: window.qaSlotProbe.events,
          errors: window.qaBoot.errors, environment: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, theme: document.documentElement.dataset.theme } }));
        await save(`${key}.json`, trace);
        await page.screenshot({ path: resolve(evidenceDir, `${key}.png`) });
        try { report.checks.push({ key, result: assertTransition(trace, ratio) }); }
        catch (error) { report.checks.push({ key, observation: error.stack }); throw error; }
      }
    }
    const observations = [...report.checks, ...report.integration].some(item => item.observation);
    report.status = observations ? 'HARNESS_OBSERVATIONS_REQUIRE_REVIEW' : 'EXECUTABLE_SELF_CHECK_ONLY';
    report.browserCleanup = 'PRESERVED_EXISTING_SPACE_NO_FINISH';
  } catch (error) {
    // Browser ownership/operation errors are a hard stop: no retry, takeover or finish.
    report.error = error.stack || String(error);
    report.browserCleanup = 'NOT_ATTEMPTED_AFTER_ERROR';
  } finally {
    try { if (fixture) report.serverCleanup = await fixture.close(); }
    catch (error) { report.cleanupError = error.stack || String(error); }
    if (report.error || report.cleanupError) report.status = 'HARNESS_INCOMPLETE';
    if (report.serverCleanup?.changedSources.length) report.status = 'SOURCE_CHANGED_RECAPTURE_REQUIRED';
    report.ok = report.status === 'EXECUTABLE_SELF_CHECK_ONLY';
    if (!report.ok) process.exitCode = 1;
    await save('result.json', report);
  }
  return report;
}
