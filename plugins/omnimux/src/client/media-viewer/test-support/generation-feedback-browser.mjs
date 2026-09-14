import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startFixture } from './generation-feedback-server.mjs';
import { assertPng } from '../../../../../../scripts/worktree-web-qa.mjs';

/** Runs only inside ego-browser nodejs; never launches an alternative browser. */
export async function runGenerationFeedbackBrowser(taskSpace, evidenceDir) {
  await mkdir(evidenceDir, { recursive: true });
  const report = { status: 'FAIL', checks: [], screenshots: [], closed: false, server: null };
  let fixture;
  let task;
  let page;
  let failure;
  const save = () => writeFile(resolve(evidenceDir, 'result.json'), JSON.stringify(report, null, 2));
  try {
    fixture = await startFixture();
    report.manifest = fixture.manifest;
    await save();
    task = await taskSpace('1759 formal generation feedback E2E');
    report.spaceId = task.spaceId;
    page = task.page('p1');
    await page.goto(fixture.manifest.url);
    await page.waitForFunction(() => window.qaBoot?.mounted || window.qaBoot?.errors.length, undefined, { timeout: 15000 });
    const boot = await page.evaluate(() => window.qaBoot);
    assert.deepEqual(boot.errors, [], 'production viewer must mount without errors');
    assert.equal(boot.mounted, true);
    report.snapshot = await page.snapshot();
    const observed = await page.evaluate(() => [...document.querySelectorAll('aside button')].map((button) => button.textContent.trim()));
    async function click(name) {
      assert.ok(observed.includes(name), `unobserved transport control: ${name}`);
      await page.click(`loc=role:button[name='${name}']`);
    }
    async function card(id, status) {
      await page.waitForFunction(({ id, status }) => {
        const node = document.querySelector(`[data-generation-request="${id}"]`);
        return node?.dataset.generationStatus === status && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      }, { id, status }, { timeout: 10000 });
      const value = await page.evaluate((id) => {
        const node = document.querySelector(`[data-generation-request="${id}"]`);
        const rect = node.getBoundingClientRect();
        return { id, status: node.dataset.generationStatus, text: node.textContent, width: rect.width, height: rect.height };
      }, id);
      assert.equal(value.status, status);
      assert.ok(value.text.trim() && value.width > 0 && value.height > 0);
      report.checks.push(value);
    }
    async function screenshot(name) {
      const path = resolve(evidenceDir, `${name}.png`);
      await page.screenshot({ path });
      report.screenshots.push({ path, ...assertPng(await readFile(path)) });
    }
    await click('提交生成');
    await card('request-1', 'pending');
    await screenshot('pending');
    await click('接纳请求');
    await click('开始执行');
    await card('request-1', 'running');
    await click('返回图片');
    await click('结束回合');
    await card('request-1', 'running');
    await click('最终映射');
    await card('request-1', 'success');
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-generation-request="request-1"] img[alt="生成结果"]');
      return image?.complete && image.naturalWidth > 0 && image.getBoundingClientRect().width > 0;
    }, undefined, { timeout: 10000 });
    await screenshot('success');

    await click('提交生成'); await click('接纳请求'); await click('开始执行');
    await click('返回失败'); await click('最终映射'); await click('结束回合');
    await card('request-2', 'failure');
    await click('提交生成'); await click('接纳请求'); await click('开始执行');
    await click('重建绑定'); await click('最终映射'); await click('取消回合');
    await card('request-3', 'cancelled');
    await click('提交生成'); await click('接纳请求'); await click('开始执行');
    await click('晚到结果'); await click('最终映射'); await click('结束回合');
    await card('request-4', 'running');
    await click('补齐调用'); await card('request-4', 'success');
    await click('提交生成'); await click('接纳请求'); await click('开始执行');
    await click('返回图片'); await click('结束回合'); await click('多请求映射');
    await card('request-5', 'unresolved');
    await screenshot('terminal');
    await click('普通提问'); await click('停止文字');
    const negative = await page.evaluate(() => ({
      tasks: window.qa.getState().generationTasks.map((row) => row.requestId),
      cards: [...document.querySelectorAll('main [data-generation-request]')].map((node) => node.dataset.generationRequest),
    }));
    assert.deepEqual(negative.tasks, ['request-1', 'request-2', 'request-3', 'request-4', 'request-5']);
    assert.deepEqual(negative.cards, negative.tasks);
    report.checks.push({ negativeNoTask: true });
    await click('切换会话');
    await page.waitForFunction(() => document.querySelectorAll('main [data-generation-request]').length === 0);
    await click('提交生成'); await card('request-8', 'pending');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('main [data-generation-request]')].map((node) => node.dataset.generationRequest)), ['request-8']);
    await click('切换会话');
    await page.waitForFunction(() => document.querySelectorAll('main [data-generation-request]').length === 5);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('main [data-generation-request]')].map((node) => node.dataset.generationRequest)), negative.cards);
    report.checks.push({ sessionIsolation: true });
    report.errors = await page.evaluate(() => window.qaBoot.errors);
    assert.deepEqual(report.errors, []);
    assert.equal(report.checks.length, 12);
    await click('提交生成'); await click('接纳请求'); await click('开始执行');
    await click('返回视频'); await click('结束回合'); await click('最终映射');
    await card('request-9', 'success');
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-generation-request="request-9"] video');
      return video?.readyState >= 2 && video.videoWidth > 0 && video.duration > 0;
    });
    const before = await page.evaluate(async () => {
      const video = document.querySelector('[data-generation-request="request-9"] video');
      video.muted = true;
      const before = video.currentTime;
      await video.play();
      return before;
    });
    await page.waitForFunction((before) => document.querySelector('[data-generation-request="request-9"] video').currentTime > before, before);
    report.checks.push({ videoPlayback: await page.evaluate(() => {
      const video = document.querySelector('[data-generation-request="request-9"] video');
      const rect = video.getBoundingClientRect();
      return { currentTime: video.currentTime, duration: video.duration, videoWidth: video.videoWidth, controls: video.controls, width: rect.width, height: rect.height };
    }) });
    await screenshot('video-playing');
    await click('提交生成'); await click('接纳请求'); await click('开始执行');
    await click('返回不可读视频'); await click('最终映射'); await click('结束回合');
    await card('request-10', 'success');
    await page.waitForFunction(() => document.querySelector('[data-generation-request="request-10"] [role="alert"]')?.textContent.includes('结果预览未能加载'));
    report.checks.push({ unreadableVideoAlert: true });
    await screenshot('video-unreadable');
    await click('提交生成'); await click('接纳请求'); await click('开始执行');
    await click('返回附件图'); await click('最终映射'); await click('结束回合');
    await card('request-11', 'success');
    await page.waitForFunction(() => document.querySelector('[data-generation-request="request-11"] img')?.naturalWidth > 0);
    report.checks.push({ attachmentImageLoaded: true });
    await screenshot('attachment-image');
    await click('提交生成'); await click('接纳请求'); await click('开始执行');
    await click('返回图片'); await click('最终映射'); await click('取消回合');
    await card('request-12', 'cancelled');
    await page.waitForFunction(() => {
      const card = document.querySelector('[data-generation-request="request-12"]');
      return card?.textContent.includes('已返回部分结果') && card.querySelector('img')?.naturalWidth > 0;
    });
    report.checks.push({ partialCancelRetainsImage: true });
    await screenshot('partial-cancel');
    assert.equal(report.checks.length, 20);
    assert.deepEqual(await page.evaluate(() => window.qaBoot.errors), []);
  } catch (error) {
    failure = error;
    report.error = error.stack || String(error);
    if (page) {
      try { report.diagnostics = await page.evaluate(() => ({ boot: window.qaBoot, log: window.qa?.log })); }
      catch (diagnosticError) { report.diagnosticError = String(diagnosticError); }
    }
  } finally {
    // Both cleanup actions live in this same ego invocation, including assertion failures.
    try {
      if (task) { await task.finish({ keep: [] }); report.closed = true; }
    } catch (error) { report.closeError = String(error); failure ||= error; }
    finally {
      try {
        if (fixture) {
          report.server = await fixture.close();
          assert.deepEqual(report.server.changedSources, [], 'sources changed during browser execution');
        }
      } catch (error) { report.serverCloseError = String(error); failure ||= error; }
      report.status = failure ? 'FAIL' : 'PASS_SCOPED';
      report.endedAt = new Date().toISOString();
      await save();
    }
  }
  if (failure) throw failure;
  assert.equal(report.closed, true);
  assert.equal(report.server?.closed, true);
  return report;
}
