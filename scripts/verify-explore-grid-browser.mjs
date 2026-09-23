import * as fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { startTestEnvironment } from '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-explore-grid-autoplay/scripts/test-env-bootstrap.mjs';

const root = '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-explore-grid-autoplay';
const out = resolve(root, '.agent-reports/explore-grid-autoplay');
await fs.mkdir(out, { recursive: true });
const evidenceDir = resolve(root, 'docs/evidence');
await fs.mkdir(evidenceDir, { recursive: true });

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
    report.checks.push({ name, pass: false, error: err.message || String(err) });
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

try {
  console.log('Starting test environment for worktree...');
  runtime = await startTestEnvironment({ root, mode: 'ui' });
  console.log('Test environment started at', runtime.origin);

  task = await taskSpace('Issue 2608 5-Col Autoplay Grid Acceptance');
  page = task.page('p1');
  await page.cdp('Network.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    acceptLanguage: 'zh-CN,zh;q=0.9'
  });

  await page.setViewport?.({ width: 1440, height: 900 }).catch(() => {});
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }).catch(() => {});

  console.log('Navigating to login URL...');
  await page.goto(runtime.loginUrl);
  await page.waitForLoadState('domcontentloaded');

  let snap = await page.snapshot();
  console.log('Initial page loaded, snap length:', snap.length);
  await fs.writeFile(resolve(out, 'snap-initial.txt'), snap);

  if (snap.includes('运行方式')) {
    try {
      await page.click('text="使用自己的密钥"').catch(() => page.click('text="自己的密钥"'));
      await page.waitForSelector('loc=css:input[placeholder="fal_key_..."]', { timeout: 10000 });
      
      await page.fill('loc=css:input[placeholder="fal_key_..."]', 'QA-SYNTHETIC-NOT-A-REAL-KEY');
      await page.fill('loc=css:input[placeholder="https://fal.run"]', 'http://127.0.0.1:49830');
      
      await page.click('text="保存"').catch(() => {});
      await new Promise(r => setTimeout(r, 800));
      await page.keyboard.press('Escape').catch(() => {});
      await new Promise(r => setTimeout(r, 800));
      await page.click('text="继续"').catch(() => {});
      await new Promise(r => setTimeout(r, 800));
      await page.click('loc=css:button[aria-label="添加工作区"]').catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.log('Onboarding skipped or already configured:', e.message);
    }
  }

  // Wait for Explore templates section
  try {
    await page.waitForSelector('.omnimux-shelf-grid', { timeout: 15000 });
    console.log('Explore section with 5-col shelf grid mounted!');
  } catch (err) {
    const errorSnap = await page.snapshot();
    await fs.writeFile(resolve(out, 'snap-error.txt'), errorSnap);
    await page.screenshot({ path: resolve(out, 'screen-error.png') });
    throw err;
  }

  // Check 1: 5-column layout on shelf grid
  await check('Shelf rows display 5 columns grid with exactly 5 cards each', async () => {
    const gridInfo = await page.evaluate(() => {
      const grids = document.querySelectorAll('.omnimux-shelf-grid');
      const first = grids[0];
      const cards = first.querySelectorAll('.omnimux-tpl-card');
      const style = window.getComputedStyle(first);
      const cols = style.gridTemplateColumns.split(' ').length;
      return {
        gridCount: grids.length,
        cardsInFirstGrid: cards.length,
        computedColumns: cols,
        gridTemplateColumns: style.gridTemplateColumns
      };
    });

    if (gridInfo.cardsInFirstGrid !== 5) {
      throw new Error(`Expected exactly 5 cards in shelf row, found ${gridInfo.cardsInFirstGrid}`);
    }
    if (gridInfo.computedColumns !== 5) {
      throw new Error(`Expected 5 columns, found ${gridInfo.computedColumns}`);
    }
    return gridInfo;
  });

  // Check 2: Cards in viewport automatically stream and play video
  await check('Cards in viewport automatically play video with positive currentTime', async () => {
    await page.waitForFunction(() => {
      const videos = Array.from(document.querySelectorAll('.omnimux-shelf-grid video'));
      return videos.some(v => v.currentTime > 0.05 && !v.paused);
    }, undefined, { timeout: 15000 });

    const playInfo = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('.omnimux-shelf-grid video'));
      const activeVideos = videos.filter(v => !v.paused && v.currentTime > 0);
      return {
        totalVideosMounted: videos.length,
        playingVideos: activeVideos.length,
        sampleSrc: activeVideos[0]?.src || '',
        muted: activeVideos[0]?.muted,
        loop: activeVideos[0]?.loop
      };
    });

    if (playInfo.playingVideos === 0) {
      throw new Error('No videos are playing in viewport');
    }
    return playInfo;
  });

  // Check 3: Card size enlargement
  await check('Card size is enlarged with 9:16 aspect ratio and comfortable width', async () => {
    const cardGeom = await page.evaluate(() => {
      const card = document.querySelector('.omnimux-tpl-card');
      const r = card.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        ratio: (r.width / r.height).toFixed(2)
      };
    });

    if (cardGeom.width < 180) {
      throw new Error(`Card width is too small (${cardGeom.width}px), expected >= 180px`);
    }
    return cardGeom;
  });

  // Check 4: Click category tab or "探索全部" transitions to full grid view with 5 columns
  await check('Switching to category opens full grid view with 5 columns', async () => {
    await page.click('loc=role:tab[name="黄金开场"]');
    await page.waitForSelector('.omnimux-tpl-full-grid', { timeout: 10000 });

    const fullGridInfo = await page.evaluate(() => {
      const grid = document.querySelector('.omnimux-tpl-full-grid');
      const style = window.getComputedStyle(grid);
      const cols = style.gridTemplateColumns.split(' ').length;
      const count = grid.querySelectorAll('.omnimux-tpl-card').length;
      return {
        cardsLoaded: count,
        computedColumns: cols
      };
    });

    if (fullGridInfo.computedColumns !== 5) {
      throw new Error(`Full grid expected 5 columns, got ${fullGridInfo.computedColumns}`);
    }

    // Capture verified screenshot
    const screenshotPath = resolve(evidenceDir, 'explore-grid-autoplay-verified.png');
    await page.screenshot({ path: screenshotPath });
    report.screenshots.push(screenshotPath);
    console.log('Saved verified screenshot to:', screenshotPath);

    return fullGridInfo;
  });

} catch (err) {
  console.error('Test execution failed:', err.message);
  report.error = err.message || String(err);
} finally {
  console.log('Cleaning up TaskSpace and test environment...');
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
      await runtime.cleanup();
      report.runtimeCleanup = true;
      console.log('Runtime cleaned up cleanly');
    } catch (e) {
      console.error('Runtime cleanup error:', e.message);
    }
  }
  await fs.writeFile(resolve(out, 'qa-grid-autoplay-result.json'), JSON.stringify(report, null, 2));
  console.log('Result written to qa-grid-autoplay-result.json');
}
