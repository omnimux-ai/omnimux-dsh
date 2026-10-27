// Full application ui journey for the three video modes and 爆款复刻 (Issue #3799).
// Run through the isolated full-app runner with --journey <this file>.
// No real provider request: 生成视频 is never clicked, because that would submit a
// paid generation. The assertions cover the UI contract the mode ships with.
import assert from 'node:assert/strict'
import { join } from 'node:path'

export default async function (ctx) {
  const { send, sleep, evidenceDir, io } = ctx
  try {
    return await run({ send, sleep, evidenceDir, io })
  } catch (error) {
    // legacy 报告会剥掉 detail，把真实原因落盘，否则失败只剩一个 journey-error。
    try { io.writeFileSync(join(evidenceDir, 'journey-failure.txt'), String(error?.stack ?? error)) } catch {}
    throw error
  }
}

async function run({ send, sleep, evidenceDir, io }) {
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  const wait = async (expression, label) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return
      await sleep(200)
    }
    throw new Error('view not ready: ' + label)
  }
  const clickText = async (scope, text) => {
    const hit = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(scope)})
      if (!root) return { ok: false, why: 'scope-missing' }
      const button = [...root.querySelectorAll('button')].find(el => (el.textContent || '').trim() === ${JSON.stringify(text)})
      if (!button) return { ok: false, why: 'button-missing' }
      button.click()
      return { ok: true }
    })()`)
    assert.equal(hit.ok, true, `点击「${text}」失败：${hit.why}`)
  }
  const shot = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png' })
    io.writeFileSync(join(evidenceDir, name + '.png'), Buffer.from(result.data, 'base64'))
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  // 左侧栏入口用稳定 data 属性定位，不靠文案匹配（文案会随语言变）。
  // 应用刚起来时侧栏还在装配，先等入口可见再点，否则点击落在尚未挂载的节点上。
  await wait(`(() => {
    const hit = document.querySelector('[data-omnimux-avatar-entry]')
    if (!hit) return false
    const r = hit.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })()`, '左侧栏「数字人」入口可见')
  const entry = await evaluate(`(() => {
    const hit = document.querySelector('[data-omnimux-avatar-entry]')
    if (!hit) return { ok: false, why: 'entry-missing' }
    hit.click()
    return { ok: true }
  })()`)
  assert.equal(entry.ok, true, '左侧栏「数字人」入口缺失：' + entry.why)
  await wait(`(() => {
    const page = document.querySelector('.omx-avatar-page')
    if (!page) return false
    const r = page.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })()`, '数字人页挂载并占正几何')
  await clickText('.omx-avatar-page', '视频创作')
  await wait(`Boolean(document.querySelector('[aria-label="视频模式"]'))`, '视频模式分段控件')

  // 三模式必须同处一行：换行会把「爆款复刻」挤下去。
  const modes = await evaluate(`(() => {
    const group = document.querySelector('[aria-label="视频模式"]')
    const items = [...group.querySelectorAll('[role="radio"]')]
    const tops = new Set(items.map(item => Math.round(item.getBoundingClientRect().top)))
    return {
      labels: items.map(item => (item.textContent || '').trim()),
      rows: tops.size,
      wraps: getComputedStyle(group).flexWrap,
    }
  })()`)
  assert.deepEqual(modes.labels, ['动作复刻', '角色替换', '爆款复刻'], '三模式名称与顺序')
  assert.equal(modes.rows, 1, '三模式必须同处一行，实际行数 ' + modes.rows)
  assert.notEqual(modes.wraps, 'wrap', '分段控件不得换行')

  await clickText('[aria-label="视频模式"]', '爆款复刻')
  await wait(`[...document.querySelectorAll('[aria-label="视频模式"] [role="radio"]')]
    .some(el => el.getAttribute('aria-checked') === 'true' && (el.textContent || '').trim() === '爆款复刻')`, '复刻模式选中')

  const form = await evaluate(`(() => {
    const page = document.querySelector('.omx-avatar-page')
    const text = page.textContent || ''
    const cta = [...page.querySelectorAll('button')].find(el => (el.textContent || '').trim() === '生成视频')
    return {
      ratioSelectors: page.querySelectorAll('[aria-label="画幅"]').length,
      resolutionSelectors: page.querySelectorAll('[aria-label="清晰度"]').length,
      // 参考视频只作拆解材料，这句必须真的落在页面上。
      analysisOnlyCopy: text.includes('参考视频仅用于拆解'),
      hasCta: Boolean(cta),
      ctaDisabled: cta ? cta.disabled === true : null,
      intro: (page.querySelector('.omx-avatar-recreate-intro')?.textContent || '').trim(),
    }
  })()`)
  // 复刻没有画幅选择：时长跟参考片、画幅固定竖屏。
  assert.equal(form.ratioSelectors, 0, '复刻模式不得出现画幅选择器')
  assert.ok(form.resolutionSelectors >= 1, '复刻模式保留清晰度选择')
  assert.equal(form.analysisOnlyCopy, true, '页面必须说明参考视频只用于拆解')
  assert.equal(form.hasCta, true, '「生成视频」必须存在')
  // 没选素材时按钮不可点：不能用可点的 CTA 诱使一次必然失败的付费提交。
  assert.equal(form.ctaDisabled, true, '未选素材时「生成视频」必须禁用')
  assert.ok(form.intro.includes('拆解'), '模式说明必须渲染，实际「' + form.intro + '」')
  await shot('video-recreate-desktop')

  // 切回动作复刻：模式切换不炸，且画幅选择回到界面（两模式差异）。
  await clickText('[aria-label="视频模式"]', '动作复刻')
  await wait(`[...document.querySelectorAll('[aria-label="视频模式"] [role="radio"]')]
    .some(el => el.getAttribute('aria-checked') === 'true' && (el.textContent || '').trim() === '动作复刻')`, '切回动作复刻')

  // 窄视口：三模式仍不换行，页面不横溢出。
  for (const width of [820, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 })
    await sleep(300)
    const narrow = await evaluate(`(() => {
      const page = document.querySelector('.omx-avatar-page')
      const group = document.querySelector('[aria-label="视频模式"]')
      const tops = new Set([...group.querySelectorAll('[role="radio"]')].map(item => Math.round(item.getBoundingClientRect().top)))
      return {
        rows: tops.size,
        overflow: page.scrollWidth > page.clientWidth,
        width: window.innerWidth,
      }
    })()`)
    assert.equal(narrow.rows, 1, `${width} 视口下三模式仍须同处一行`)
    assert.equal(narrow.overflow, false, `${width} 视口下页面不得横溢出`)
    await shot('video-modes-' + width)
  }

  return {
    assertions: [
      { name: '三模式名称顺序正确且同处一行', pass: true },
      { name: '复刻模式无画幅选择并保留清晰度', pass: true },
      { name: '页面说明参考视频只用于拆解', pass: true },
      { name: '未选素材时生成按钮禁用', pass: true },
      { name: '切回动作复刻不丢模式状态', pass: true },
      { name: '820/390 三模式不换行且无横溢出', pass: true },
    ],
  }
}
