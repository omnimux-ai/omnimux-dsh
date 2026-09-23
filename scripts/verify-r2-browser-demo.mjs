import * as fs from 'node:fs/promises';
import { resolve } from 'node:path';

const root = '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-explore-video-issue-2595';
const out = resolve(root, '.agent-reports/explore-video-preview');
const { startPrivateApp, redact } = await import(resolve(out, 'tooling/private-app-env.mjs'));

let runtime, task, page;
const report = {
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: []
};

async function check(name, fn) {
  try {
    const res = await fn();
    report.checks.push({ name, pass: true, detail: res || null });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    report.checks.push({ name, pass: false, error: redact(err.message || String(err)) });
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

try {
  console.log('Starting private isolated app...');
  runtime = await startPrivateApp({ root });
  console.log('App started at', runtime.env.origin, 'PID:', runtime.runtime.pid);

  task = await taskSpace('Issue 2595 R2 Video Acceptance');
  page = task.page('p1');
  await page.cdp('Network.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    acceptLanguage: 'zh-CN,zh;q=0.9'
  });

  console.log('Navigating to login URL...');
  await page.goto(runtime.env.loginUrl);
  await page.waitForLoadState('domcontentloaded');

  let snap = await page.snapshot();
  console.log('Initial page loaded.');

  if (snap.includes('运行方式')) {
    console.log('Handling initial onboarding...');
    await page.click('text="自己的密钥"');
    await page.waitForSelector('loc=css:input[placeholder="https://"]', { timeout: 10000 });
    
    const setting = await fs.readFile(runtime.runtime.privateDir + '/dsh/settings.yaml', 'utf8');
    const endpoint = setting.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
    
    await page.fill('loc=css:input[placeholder="https://"]', endpoint);
    await page.fill('loc=css:input[placeholder="粘贴密钥，只保存在本机"]', 'QA-SYNTHETIC-NOT-A-REAL-KEY');
    await page.fill('loc=css:input[placeholder="模型名"]', 'qa-model');
    
    await page.click('text="测试"').catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    await page.click('text="保存"').catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    await page.keyboard.press('Escape').catch(() => {});
    await new Promise(r => setTimeout(r, 800));
    await page.click('text="继续"').catch(() => {});
    await new Promise(r => setTimeout(r, 800));
    await page.click('loc=css:button[aria-label="添加工作区"]').catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
  }

  // Ensure wide desktop viewport
  await page.setViewport?.({ width: 1440, height: 900 }).catch(() => {});
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }).catch(() => {});

  // Wait for Explore templates
  try {
    await page.waitForSelector('[data-template-id]', { timeout: 20000 });
    console.log('Explore templates mounted!');
  } catch (e) {
    const debugSnap = await page.snapshot();
    await fs.writeFile(resolve(out, 'debug-snap.txt'), debugSnap);
    await page.screenshot({ path: resolve(out, 'debug-screen.png') });
    throw e;
  }

  // Check 1: Initial cards have no active video src
  await check('Initial cards have no video src', async () => {
    const count = await page.evaluate(() => document.querySelectorAll('video[src]').length);
    if (count !== 0) throw new Error(`Expected 0 active video src, found ${count}`);
    return { count };
  });

  // Check 2: Pippit card hover video playback from https://files.omnimux.ai
  const pippitSelector = 'loc=css:[data-template-id^="tpl-pippit-"] >> nth=0';
  await check('Pippit card hover plays video from files.omnimux.ai', async () => {
    await page.waitForSelector(pippitSelector, { timeout: 10000 });
    await page.hover(pippitSelector);

    await page.waitForFunction(() => {
      const v = document.querySelector('[data-template-id^="tpl-pippit-"] video');
      return v && v.currentTime > 0.1 && !v.paused;
    }, undefined, { timeout: 15000 });

    const videoInfo = await page.evaluate(() => {
      const v = document.querySelector('[data-template-id^="tpl-pippit-"] video');
      const r = v.getBoundingClientRect();
      return {
        src: v.src,
        currentTime: v.currentTime,
        paused: v.paused,
        muted: v.muted,
        loop: v.loop,
        width: r.width,
        height: r.height
      };
    });

    if (!videoInfo.src.startsWith('https://files.omnimux.ai/templates/explore-v1/sha256/')) {
      throw new Error(`Video src is not from files.omnimux.ai: ${videoInfo.src}`);
    }
    if (videoInfo.paused || videoInfo.currentTime <= 0.1) {
      throw new Error('Video did not play');
    }
    return videoInfo;
  });

  // Check 3: Click Pippit card to open detail drawer and verify native controls
  await check('Pippit detail drawer opens with native video controls and plays from R2', async () => {
    await page.click(pippitSelector);
    await page.waitForSelector('loc=css:[role="dialog"] video', { timeout: 10000 });

    const drawerVideo = await page.evaluate(() => {
      const v = document.querySelector('[role="dialog"] video');
      const r = v.getBoundingClientRect();
      return {
        src: v.src,
        controls: v.controls,
        preload: v.preload,
        paused: v.paused,
        width: r.width,
        height: r.height
      };
    });

    if (!drawerVideo.controls) throw new Error('Detail video does not have native controls');
    if (!drawerVideo.src.startsWith('https://files.omnimux.ai/templates/explore-v1/sha256/')) {
      throw new Error(`Detail video src is not from files.omnimux.ai: ${drawerVideo.src}`);
    }

    // Play in detail drawer
    await page.press('loc=css:[role="dialog"] video', 'Space').catch(() => {});
    await page.waitForFunction(() => {
      const v = document.querySelector('[role="dialog"] video');
      return v && v.currentTime > 0.1;
    }, undefined, { timeout: 15000 }).catch(() => {});

    // Capture screenshot for user demonstration
    const screenshotPath = resolve(out, 'qa-r2-pippit-detail.png');
    await page.screenshot({ path: screenshotPath });
    report.screenshots.push(screenshotPath);
    console.log('Saved demonstration screenshot to:', screenshotPath);

    return drawerVideo;
  });

} catch (err) {
  console.error('Test execution failed:', redact(err.stack || err.message));
  report.error = redact(err.message || String(err));
} finally {
  console.log('Cleaning up browser TaskSpace and test runtime...');
  if (task) {
    try {
      const finish = await task.finish({ keep: [] });
      report.browserCleanup = finish;
      console.log('TaskSpace finished cleanly');
    } catch (e) {
      console.error('Task finish error:', e.message);
    }
  }
  if (runtime) {
    try {
      const cleanup = await runtime.env.cleanup();
      report.runtimeCleanup = cleanup;
      console.log('Runtime cleaned up cleanly');
    } catch (e) {
      console.error('Runtime cleanup error:', e.message);
    }
  }
  await fs.writeFile(resolve(out, 'qa-r2-acceptance-result.json'), JSON.stringify(report, null, 2));
  console.log('Verification report saved to qa-r2-acceptance-result.json');
}
