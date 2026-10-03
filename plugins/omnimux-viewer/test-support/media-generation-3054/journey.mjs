import assert from 'node:assert/strict';

/** Targets are selected only after this invocation's snapshot and DOM observation. */
export async function verifyJourney(api, { diagnoseRefresh = false, refreshScenario = 'image-refresh' } = {}) {
  const { page, report } = api;
  const wait = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 15000 });
  async function click(name) {
    await api.snapshot(`before-${name}`);
    const buttons = await page.evaluate(() => [...document.querySelectorAll('button,[role="tab"]')].map(node => ({
      name: node.getAttribute('aria-label') || node.textContent.trim(), title: node.title, role: node.getAttribute('role') || 'button',
      visible: node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0,
    })));
    assert.ok(buttons.some(row => row.visible && row.name === name), `unobserved control ${name}: ${JSON.stringify(buttons)}`);
    await page.click(`loc=role:${buttons.find(row => row.visible && row.name === name).role}[name='${name}']`);
  }
  async function fill(value) {
    await api.snapshot('before-prompt');
    const fields = await page.evaluate(() => [...document.querySelectorAll('textarea')].map(node => ({ placeholder: node.placeholder, width: node.getBoundingClientRect().width })));
    assert.equal(fields.filter(row => row.width > 0).length, 1);
    await page.fill(`textarea[placeholder=${JSON.stringify(fields.find(row => row.width > 0).placeholder)}]`, value);
  }
  async function item(prompt, status) {
    await wait(({ prompt, status }) => window.qa?.getState()?.mediaList.some(row => row.prompt === prompt && row.status === status), { prompt, status });
    return page.evaluate(prompt => window.qa.getState().mediaList.find(row => row.prompt === prompt), prompt);
  }
  async function decoded(prompt) {
    await item(prompt, 'completed');
    await api.snapshot('image-completed');
    await wait(prompt => [...document.querySelectorAll('img')].some(img => img.alt === prompt && img.naturalWidth > 0 && img.getBoundingClientRect().width > 0), prompt);
    return page.evaluate(prompt => {
      const img = [...document.querySelectorAll('img')].filter(img => img.alt === prompt && img.getBoundingClientRect().width > 0).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
      const rect = img.getBoundingClientRect();
      return { src: img.src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, width: rect.width, height: rect.height };
    }, prompt);
  }
  async function upload() {
    await click('添加图片');
    await api.snapshot('reference-picker');
    const inputs = await page.evaluate(() => [...document.querySelectorAll('input[type="file"]')].map(node => ({ accept: node.accept, parent: node.parentElement.className })));
    assert.ok(inputs.length > 0);
    // Production picker has a distinct parent; use the observed parent rather than a guessed index.
    const unique = inputs.find(row => row.parent.includes('popover') && inputs.filter(other => other.parent === row.parent).length === 1);
    assert.ok(unique);
    await page.setInputFiles(`.${unique.parent.split(' ').join('.')} input[type="file"]`, api.imagePath);
    await wait(() => !document.querySelector('[role="dialog"][aria-label="选择参考素材"]'));
  }
  await wait(() => document.body.innerText.includes('离线图片验证'));
  assert.deepEqual(await page.evaluate(() => window.qa.getState().mediaList), [], 'fixture origin must start without persisted tasks');
  const geometry = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('textarea,button')].filter(node => node.getAttribute('aria-label') === '立即直连生成' || node.tagName === 'TEXTAREA');
    return nodes.map(node => { const rect = node.getBoundingClientRect(); return { tag: node.tagName, width: rect.width, height: rect.height }; });
  });
  assert.equal(geometry.length, 2); assert.ok(geometry.every(row => row.width > 0 && row.height > 0));
  report.checks.push({ name: 'production-mount-positive-geometry', geometry });

  const retryPrompt = '蓝色山峰恢复验证';
  await api.control('image-retry'); await fill(retryPrompt); await click('立即直连生成');
  const failed = await item(retryPrompt, 'failed');
  assert.equal(failed.recoverable, true); assert.ok(failed.taskRef);
  await api.screenshot('image-collect-transient');
  await click('重试');
  const recovered = await item(retryPrompt, 'completed');
  assert.deepEqual(recovered.taskRef, failed.taskRef); assert.equal(recovered.requestKey, failed.requestKey);
  const image = await decoded(retryPrompt);
  assert.ok(image.src.includes('/omnimux-workflow/api/local-file?path='));
  const retryRequests = (await api.state()).requests.filter(row => row.scenario === 'image-retry');
  assert.equal(retryRequests.filter(row => row.body.wait === false).length, 1);
  assert.equal(retryRequests.find(row => row.body.wait === false).response.mode, 'submitted');
  assert.equal(retryRequests.filter(row => row.body.wait === true).length, 2);
  assert.equal(retryRequests.find(row => row.response?.status === 503).response.code, 'omnimux-collect-transient');
  assert.ok(retryRequests.filter(row => row.body.wait).every(row => row.body.taskRef === failed.taskRef && row.body.requestKey === failed.requestKey));
  report.checks.push({ name: 'direct-image-original-task-retry', image, requests: retryRequests });
  await api.screenshot('image-retry-decoded');

  const refreshPrompt = '参考图刷新收取验证';
  await api.control(refreshScenario); await click('参考'); await upload(); await fill(refreshPrompt); await click('立即直连生成');
  await wait(prompt => window.qa?.getState()?.mediaList.some(row => row.prompt === prompt && row.taskRef && row.status === 'generating'), refreshPrompt);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('omnimux:media-viewer:store:v1')));
  const before = persisted.mediaList.find(row => row.prompt === refreshPrompt);
  assert.equal(before.request.model, 'qa-image-3054'); assert.equal(before.request.channel, 'qa-channel'); assert.equal(before.request.operation, 'multi_reference');
  assert.equal(before.requestReplayable, false); assert.ok(before.request.references.length > 0);
  assert.ok(!JSON.stringify(before.request.references).includes('data:'));
  await api.screenshot('image-submitted-before-refresh');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await wait(() => window.qaBoot?.mounted && Boolean(window.qa));
  let after;
  if (diagnoseRefresh) {
    await wait(prompt => window.qa.getState().mediaList.some(row => row.prompt === prompt && ['failed', 'generating'].includes(row.status)), refreshPrompt);
    after = await page.evaluate(prompt => window.qa.getState().mediaList.find(row => row.prompt === prompt), refreshPrompt);
    report.checks.push({ name: 'refresh-auto-resume-diagnostic', outcome: after.status === 'failed' ? 'FAIL' : 'PASS', failure: after.failure, trace: await page.evaluate(() => window.qa.getTrace()) });
    if (after.status === 'failed') { await api.screenshot('refresh-auto-resume-failed'); await click('重试'); after = await item(refreshPrompt, 'generating'); }
  } else after = await item(refreshPrompt, 'generating');
  assert.deepEqual(after.taskRef, before.taskRef); assert.equal(after.requestKey, before.requestKey);
  await api.snapshot('refresh-original-task');
  await api.control(refreshScenario, true);
  const refreshImage = await decoded(refreshPrompt);
  const refreshRequests = (await api.state()).requests.filter(row => row.scenario === refreshScenario);
  assert.equal(refreshRequests.filter(row => row.body.wait === false).length, 1);
  assert.ok(refreshRequests.filter(row => row.body.wait).length >= 2);
  assert.ok(refreshRequests.filter(row => row.body.wait).every(row => row.body.taskRef === before.taskRef && row.body.model === 'qa-image-3054' && row.body.channel === 'qa-channel'));
  report.checks.push({ name: 'inline-reference-persisted-original-task-refresh', before, after, image: refreshImage, requests: refreshRequests });
  await api.screenshot('image-refresh-decoded');

  await api.control('video-success'); await click('视频'); await fill('短视频播放验证'); await click('立即直连生成');
  await item('短视频播放验证', 'completed'); await api.snapshot('video-completed');
  const videos = await page.evaluate(() => [...document.querySelectorAll('video')].map(node => ({ controls: node.controls, parent: node.parentElement.className })));
  assert.equal(videos.filter(row => row.controls).length, 1);
  await wait(() => [...document.querySelectorAll('video')].find(video => video.controls)?.readyState >= 2);
  await page.evaluate(async () => { const video = [...document.querySelectorAll('video')].find(video => video.controls); video.muted = true; await video.play(); });
  await wait(() => [...document.querySelectorAll('video')].find(video => video.controls)?.currentTime > 0);
  const video = await page.evaluate(() => {
    const video = [...document.querySelectorAll('video')].find(video => video.controls); const rect = video.getBoundingClientRect();
    return { currentTime: video.currentTime, duration: video.duration, videoWidth: video.videoWidth, videoHeight: video.videoHeight, width: rect.width, height: rect.height, src: video.src };
  });
  assert.ok(video.duration > 0 && video.videoWidth > 0 && video.width > 0 && video.height > 0);
  report.checks.push({ name: 'real-video-metadata-playback', video }); await api.screenshot('video-playing');

  await api.control('file-reader-failure'); await click('图像'); await click('参考'); await upload(); await fill('文件读取失败草稿保留');
  const countBeforeReader = (await api.state()).requests.length;
  await page.evaluate(() => { window.originalReader3054 = window.FileReader; window.FileReader = class { readAsDataURL() { queueMicrotask(() => this.onerror?.(new Error('synthetic FileReader failure'))); } }; });
  await click('立即直连生成'); await item('文件读取失败草稿保留', 'failed');
  const readerDraft = await page.evaluate(() => ({ prompt: document.querySelector('textarea').value, text: document.body.innerText, slots: [...document.querySelectorAll('img')].filter(img => img.src.startsWith('blob:')).length }));
  assert.equal((await api.state()).requests.length, countBeforeReader); assert.equal(readerDraft.prompt, '文件读取失败草稿保留'); assert.ok(readerDraft.text.includes('本地图片读取失败')); assert.ok(readerDraft.slots > 0);
  await page.evaluate(() => { window.FileReader = window.originalReader3054; });
  report.checks.push({ name: 'file-reader-failure-zero-post-draft-retained', draft: readerDraft }); await api.screenshot('file-reader-failure-draft');

  await api.snapshot('before-reference-hover');
  const localImages = await page.evaluate(() => [...document.querySelectorAll('img')].filter(img => img.src.startsWith('blob:')).map(img => ({ src: img.src, parent: img.parentElement.className })));
  assert.equal(localImages.length, 1);
  await page.hover(`img[src=${JSON.stringify(localImages[0].src)}]`, { label: '显示参考素材移除按钮' });
  await wait(() => { const button = document.querySelector('button[aria-label="移除"]'); return button && button.getBoundingClientRect().width > 0; });
  await click('移除'); await api.control('local-asset-failure'); await click('添加图片'); await api.snapshot('broken-local-asset-picker');
  await wait(() => [...document.querySelectorAll('[role="dialog"] [role="button"]')].some(node => node.getAttribute('aria-label') === '读取失败参考图'));
  const cards = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button,[role="dialog"] [role="button"]')].map(node => ({ title: node.title, label: node.getAttribute('aria-label'), text: node.textContent.trim(), tag: node.tagName.toLowerCase() })));
  const assetCard = cards.find(row => row.title === '读取失败参考图' || row.label === '读取失败参考图' || row.text === '读取失败参考图');
  assert.ok(assetCard, JSON.stringify(cards));
  if (assetCard.title) await page.click(`${assetCard.tag}[title=${JSON.stringify(assetCard.title)}]`);
  else await page.click(`loc=role:button[name='读取失败参考图']`);
  await wait(() => !document.querySelector('[role="dialog"][aria-label="选择参考素材"]'));
  await fill('本地素材失败草稿保留');
  const countBeforeLocal = (await api.state()).requests.length;
  await click('立即直连生成'); await item('本地素材失败草稿保留', 'failed');
  const localDraft = await page.evaluate(() => ({ prompt: document.querySelector('textarea').value, text: document.body.innerText, slots: [...document.querySelectorAll('img')].filter(img => img.src.includes('/omnimux/assets/library/preview') && img.getBoundingClientRect().width > 0).length }));
  assert.equal((await api.state()).requests.length, countBeforeLocal); assert.equal(localDraft.prompt, '本地素材失败草稿保留'); assert.ok(localDraft.text.includes('读取失败')); assert.ok(localDraft.slots > 0);
  report.checks.push({ name: 'local-asset-failure-zero-post-draft-retained', draft: localDraft }); await api.screenshot('local-asset-failure-draft');
  const state = await api.state(); assert.ok(state.byteRequests.some(row => row.path.endsWith('.png') && row.status === 200)); assert.ok(state.byteRequests.some(row => row.path.endsWith('.mp4') && row.status === 200));
  report.checks.push({ name: 'production-local-file-real-bytes', requests: state.byteRequests });
}
