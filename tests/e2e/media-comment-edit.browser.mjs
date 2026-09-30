// Executed by ego-browser nodejs with url and out supplied by the isolated runner.
const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs/promises');
const task = await taskSpace('评论改图回归');
const page = task.page('p1');
await fs.mkdir(out, { recursive: true });
try {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('.omx-channel-name-display')?.textContent === '标准版');
  const before = await page.snapshot();
  assert.equal(before.includes('添加评论'), true);
  await page.click('text="添加评论"');
  const geometry = await page.evaluate(() => {
    const img = document.querySelector('.omx-media-result img'), r = img.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, naturalWidth: img.naturalWidth };
  });
  assert.equal(geometry.naturalWidth, 640);
  assert.equal(geometry.width > 0 && geometry.height > 0, true);
  await page.mouse.click(geometry.x + geometry.width * 0.45, geometry.y + geometry.height * 0.35, { label: '在原图添加评论' });
  await page.fill('input[placeholder="添加评论..."]', '把背景换成蓝绿色，保持主体不变');
  await page.click('button[title="提交评论 (Enter)"]');
  await page.waitForSelector('.omx-slot-badge-mark');
  const attached = await page.evaluate(() => {
    const card = document.querySelector('.omx-slot-card'), r = card.getBoundingClientRect();
    return { badge: card.textContent.trim(), image: card.querySelector('img').getAttribute('src'), prompt: document.querySelector('.omx-mv-prompt-textarea').value, enabled: !document.querySelector('button[aria-label="立即直连生成"]').disabled, width: r.width, height: r.height };
  });
  assert.equal(attached.badge, '标记 1');
  assert.equal(attached.image, '/original.png');
  assert.equal(attached.prompt, '标记 1：把背景换成蓝绿色，保持主体不变');
  assert.equal(attached.enabled, true);
  assert.equal(attached.width > 0 && attached.height > 0, true);
  await page.screenshot({ path: out + '/comment-slot.png' });
  await page.click('button[aria-label="立即直连生成"]');
  await page.waitForSelector('.omx-mv-generating-overlay', { state: 'visible' });
  await page.screenshot({ path: out + '/generating.png' });
  await page.waitForFunction(() => document.querySelector('.omx-media-result img')?.src.endsWith('/result.png') && document.querySelector('.omx-media-result img')?.naturalWidth > 0, undefined, { timeout: 10000 });
  const result = await page.evaluate(() => {
    const store = window[Symbol.for('omnimux.mediaViewer.store')].getSnapshot();
    const active = store.mediaList.find((item) => item.id === store.activeId);
    const img = document.querySelector('.omx-media-result img');
    return { id: active.id, status: active.status, url: active.url, imgUrl: img.getAttribute('src'), naturalWidth: img.naturalWidth, isGenerating: store.isGenerating };
  });
  assert.equal(result.status, 'completed');
  assert.notEqual(result.id, 'original-2847');
  assert.equal(result.url, '/result.png');
  assert.equal(result.imgUrl, '/result.png');
  assert.equal(result.naturalWidth, 640);
  assert.equal(result.isGenerating, false);
  const positive = JSON.parse((await page.fetch('/evidence')).body);
  assert.equal(positive.requests.length, 1);
  const request = positive.requests[0];
  assert.equal(request.channel, 'standard');
  assert.equal(request.operation, 'image_edit');
  assert.equal(request.references.length, 1);
  assert.equal(request.references[0].pathOrUrl, '/original.png');
  assert.equal(request.annotations.length, 1);
  assert.equal(Math.abs(request.annotations[0].normalized_x - 0.45) < 0.003, true);
  assert.equal(Math.abs(request.annotations[0].normalized_y - 0.35) < 0.003, true);
  assert.equal(request.prompt.includes('[区域重绘 标记1:'), true);
  await page.screenshot({ path: out + '/result-simulated.png' });
  await page.click('button[aria-label="模型：GPT Image 2.5 · 标准版"]');
  await page.click('.omx-version-row:has-text("旗舰版")');
  await page.fill('.omx-mv-prompt-textarea', '测试手选旗舰版错误提示');
  await page.fetch('/fail-next');
  await page.click('button[aria-label="立即直连生成"]');
  await page.waitForFunction(() => document.getElementById('notice').textContent === '测试失败原因：参考图片不可读取', undefined, { timeout: 10000 });
  const negative = JSON.parse((await page.fetch('/evidence')).body);
  assert.equal(negative.requests.length, 2);
  assert.equal(negative.requests[1].channel, 'pro');
  await page.screenshot({ path: out + '/error-detail.png' });
  await fs.writeFile(out + '/browser-result.json', JSON.stringify({ pass: true, mode: 'offline-simulated', notLiveGeneration: true, spaceId: task.spaceId, attached, result, positive, negative }, null, 2));
} finally {
  await task.finish({ keep: [] });
  await fs.writeFile(out + '/browser-cleanup.json', JSON.stringify({ spaceId: task.spaceId, closed: true }));
}
