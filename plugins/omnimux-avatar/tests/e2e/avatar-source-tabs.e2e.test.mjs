// Run through the isolated full-app runner with --journey <this file>.
import assert from 'node:assert/strict'
import { join } from 'node:path'

export default async function ({ send, sleep, evidenceDir, io }) {
  const assertions = []
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value
  await evaluate(`(() => {
    const entry = document.querySelector('[data-omnimux-avatar-entry]');
    if (!entry) throw new Error('avatar entry missing');
    entry.click();
  })()`)
  for (let n = 0; n < 30; n++) {
    if (await evaluate(`Boolean(document.querySelector('.omx-avatar-pane-head [role="radiogroup"]'))`)) break
    await sleep(300)
  }
  for (const [label, width] of [['desktop', 1280], ['narrow', 820]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await sleep(250)
    for (const source of ['历史记录', '灵感库']) {
      await evaluate(`(() => {
        const button = [...document.querySelectorAll('.omx-avatar-pane-head button')].find(el => el.textContent.trim() === ${JSON.stringify(source)});
        if (!button) throw new Error('source tab missing'); button.click();
      })()`)
      await sleep(250)
      const detail = await evaluate(`(() => {
        const head = document.querySelector('.omx-avatar-pane-head');
        const tabs = head.firstElementChild;
        const pane = head.closest('section');
        const a = head.getBoundingClientRect(), b = tabs.getBoundingClientRect();
        const selected = tabs.querySelector('[aria-checked="true"]');
        return { source: selected?.textContent.trim(), firstIsTabs: tabs.getAttribute('role') === 'radiogroup',
          modelPickerAbsent: !document.querySelector('.omx-avatar-modelbtn'),
          leftAligned: Math.abs(b.left - a.left - 16) < 2, tabsFit: b.right <= a.right,
          paneFits: pane.scrollWidth <= pane.clientWidth + 1,
          contentPresent: !!pane.querySelector('.omx-avatar-pane-body'),
          historyViewControls: !!head.querySelector('[aria-label="视图模式"]') };
      })()`)
      assert.equal(detail.source, source)
      assert.equal(detail.firstIsTabs, true)
      assert.equal(detail.modelPickerAbsent, true)
      assert.equal(detail.leftAligned, true)
      assert.equal(detail.tabsFit, true)
      assert.equal(detail.paneFits, true)
      assert.equal(detail.contentPresent, true)
      assertions.push({ name: `${label}-${source}`, pass: true, detail })
      const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      io.writeFileSync(join(evidenceDir, `avatar-${label}-${source === '历史记录' ? 'history' : 'explore'}.png`), Buffer.from(capture.data, 'base64'))
    }
  }
  return { assertions }
}
