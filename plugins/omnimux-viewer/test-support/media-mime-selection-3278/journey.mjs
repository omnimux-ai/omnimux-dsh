import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { consumerJourney as originalJourney } from './legacy-journey.mjs';
export async function consumerJourney(options) {
  const actual = options.page;
  const page = new Proxy(actual, { get(target, key) {
    if (key === 'click') return async (selector, ...args) => {
      if (selector.includes('wf-custom-select-trigger') || selector.includes('wf-custom-select-dropdown') || selector.includes('name="检查输入"')) { await target.focus(selector); return target.press(selector, 'Enter'); }
      return target.click(selector, ...args);
    };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const observed = await originalJourney({ ...options, page });
  const { evidenceDir } = options;
  fs.writeFileSync(join(evidenceDir, 'before-viewer-navigation.txt'), await page.snapshot());
  await page.click('loc=role:button[name="新建标签页"]');
  fs.writeFileSync(join(evidenceDir, 'viewer-tab-menu.txt'), await page.snapshot());
  await page.click('text="图像生成"');
  await page.waitForSelector('.omx-media-viewer', { state: 'visible', timeout: 15000 });
  await page.click('[aria-label="大图浏览模式"]');
  await page.waitForSelector('.omx-mv-composer-root', { state: 'visible', timeout: 15000 });
  fs.writeFileSync(join(evidenceDir, 'viewer-real-page.txt'), await page.snapshot());
  const prompt = '保留角色描述和已有参考素材';
  await page.fill('.omx-mv-composer-root textarea', prompt);
  const openPicker = async () => {
    await page.click('.omx-slot-btn >> nth=0');
    await page.waitForSelector('[aria-label="选择参考素材"]', { state: 'visible', timeout: 10000 });
  };
  await openPicker();
  await page.setInputFiles('.omx-ref-picker-popover input[type="file"]', join(evidenceDir, 'known.png'));
  await page.waitForFunction(() => !document.querySelector('.omx-ref-picker-popover') && document.querySelectorAll('.omx-slot-card').length === 1, undefined, { timeout: 10000 });
  const snapshot = async () => page.evaluate(() => ({ prompt: document.querySelector('.omx-mv-composer-root textarea').value, items: [...document.querySelectorAll('.omx-slot-card')].map(e => ({ html: e.outerHTML, url: e.querySelector('img,video')?.getAttribute('src') })) }));
  await openPicker(); const before = await snapshot();
  await page.setInputFiles('.omx-ref-picker-popover input[type="file"]', join(evidenceDir, '格式未知'));
  await page.waitForFunction(() => document.querySelector('.omx-slot-notice')?.textContent === '当前素材格式不明，请换用带格式信息的文件', undefined, { timeout: 10000 });
  assert.deepEqual(await snapshot(), before);
  assert.ok(await page.evaluate(() => !!document.querySelector('.omx-ref-picker-popover')));
  const readNotice = async () => page.evaluate(() => {
    const node = document.querySelector('.omx-slot-notice'), style = getComputedStyle(node);
    const rgb = value => { const numbers = value.match(/[\d.]+/g)?.map(Number); if (!numbers || numbers.length < 3) throw Error('Unresolved real notice color: ' + value); return numbers.slice(0, 3); };
    const luminance = color => rgb(color).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const foreground = luminance(style.color), background = luminance(style.backgroundColor);
    return { text: node.textContent, color: style.color, background: style.backgroundColor, contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05), dark: document.body.hasAttribute('data-ds-dark-theme'), layer1: getComputedStyle(node).getPropertyValue('--dsw-alias-bg-layer-1').trim(), base: getComputedStyle(node).getPropertyValue('--dsw-alias-bg-base').trim() };
  });
  const lightNotice = await readNotice(); fs.writeFileSync(join(evidenceDir, 'notice-light-computed.json'), JSON.stringify(lightNotice, null, 2) + '\n');
  assert.equal(lightNotice.dark, false); assert.ok(lightNotice.contrast >= 4.5, 'Light notice contrast is unreadable');
  await page.screenshot({ path: join(evidenceDir, 'unknown-format-draft-preserved.png') });
  fs.writeFileSync(join(evidenceDir, 'unknown-format-real-page.txt'), await page.snapshot());
  await page.setInputFiles('.omx-ref-picker-popover input[type="file"]', join(evidenceDir, 'known.png'));
  await page.waitForFunction(() => !document.querySelector('.omx-ref-picker-popover') && document.querySelectorAll('.omx-slot-card').length === 2, undefined, { timeout: 10000 });
  const after = await snapshot(); assert.equal(after.prompt, before.prompt); assert.equal(after.items[0].url, before.items[0].url);
  await page.screenshot({ path: join(evidenceDir, 'known-format-reselection.png') });
  await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'), undefined, { timeout: 10000 });
  await openPicker(); const beforeDark = await snapshot();
  await page.setInputFiles('.omx-ref-picker-popover input[type="file"]', join(evidenceDir, '格式未知'));
  await page.waitForFunction(() => document.querySelector('.omx-slot-notice')?.textContent === '当前素材格式不明，请换用带格式信息的文件', undefined, { timeout: 10000 });
  assert.deepEqual(await snapshot(), beforeDark);
  const darkNotice = await readNotice(); fs.writeFileSync(join(evidenceDir, 'notice-dark-computed.json'), JSON.stringify(darkNotice, null, 2) + '\n');
  assert.equal(darkNotice.dark, true); assert.ok(darkNotice.contrast >= 4.5, 'Dark notice contrast is unreadable');
  await page.screenshot({ path: join(evidenceDir, 'unknown-format-dark.png') });
  const requests = await page.evaluate(() => window.__generationQaRequests);
  assert.deepEqual(requests.filter(e => e.method === 'POST' && (/\/direct\//.test(e.path) || /\/uploads?\b/.test(e.path) || /\/executions$/.test(e.path))), []);
  const detail = { actualRegisteredViewerPage: true, nativeFileInput: true, unknownRejected: true, draftAndFirstItemPreserved: true, knownReselectionCount: 2, zeroNewGenerationOrUpload: true, before, after };
  fs.writeFileSync(join(evidenceDir, 'mime-specific-acceptance.json'), JSON.stringify(detail, null, 2) + '\n');
  observed.assertions.push({ name: 'viewer-unknown-format-preserves-draft-and-known-reselection', pass: true, detail });
  return observed;
}
