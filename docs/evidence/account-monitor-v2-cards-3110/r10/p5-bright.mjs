/**
 * QA-R8 探针 P5：胶囊对比度独立像素复测。
 * 真机：headless Chrome + CDP，加载 harness demo（真实组件），
 * 逐胶囊裁图 → 写 PNG → 由 Python(PIL) 用**自有**像素法算对比度。
 * 背景取法：胶囊矩形内缩 3px 后的众数桶（= 文字实际承载的合成底色），
 * 绝不沿祖先链取 background-color（半透明胶囊那样会取错）。
 */
import { launch, dump, sleep } from '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/account-monitor-v2-cards-r8/docs/evidence/account-monitor-v2-cards-3110/r8-qa/cdp.mjs'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const PORT = 9415
const BASE = process.env.DEMO_BASE || 'http://127.0.0.1:9481/demo.html'
const OUTDIR = process.argv[2] || '/tmp/r8qa/contrast'
rmSync(OUTDIR, { recursive: true, force: true })
mkdirSync(OUTDIR, { recursive: true })

const ch = await launch(PORT, ['--force-device-scale-factor=2', '--window-size=1400,2200'])
const manifest = []
try {
  for (const theme of ['dark', 'light']) {
    const url = `${BASE}?edge=1&qa41=1&bright=1&theme=${theme}&width=1164`
    await ch.send('Page.navigate', { url })
    await sleep(1600)
    const pills = await ch.ev(`(() => {
      const nodes = [...document.querySelectorAll('.omnimux-rival-vpill')]
      return nodes.map((n, i) => {
        const r = n.getBoundingClientRect()
        const card = n.closest('.omnimux-rival-card')
        const cs = getComputedStyle(n)
        return {
          idx: i,
          cardId: card ? (card.getAttribute('data-card-id') || card.id || '') : '',
          cls: n.className,
          text: n.textContent.trim(),
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          css: { background: cs.backgroundColor, color: cs.color, borderColor: cs.borderTopColor },
          isDone: !!(card && card.classList.contains('is-done')),
        }
      })
    })()`)
    for (const p of pills) {
      if (p.rect.w < 8 || p.rect.h < 8) continue
      const shot = await ch.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: p.rect.x, y: p.rect.y, width: p.rect.w, height: p.rect.h, scale: 1 },
        captureBeyondViewport: true,
      })
      const b64 = shot.result?.data
      if (!b64) throw new Error(`screenshot empty for ${p.cls}`)
      const file = `${OUTDIR}/${theme}-${String(p.idx).padStart(2, '0')}.png`
      writeFileSync(file, Buffer.from(b64, 'base64'))
      manifest.push({ theme, file, ...p })
    }
    console.log(`${theme}: pills=${pills.length} captured=${manifest.filter((m) => m.theme === theme).length}`)
  }
  dump(`${OUTDIR}/manifest.json`, { url: BASE, dpr: 2, entries: manifest })
  console.log(`manifest entries=${manifest.length} → ${OUTDIR}/manifest.json`)
} finally { ch.close() }
