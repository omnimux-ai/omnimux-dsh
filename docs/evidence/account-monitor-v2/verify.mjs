// 账号监控 v2 原型 · 浏览器验收脚本（本机 Chrome 无头 + 原生 CDP，零依赖）
// 用法：node verify.mjs  —— 截图写到本目录，断言结果打印到 stdout
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const page = resolve(here, '../../docs/prototypes/account-monitor-v2-prototype.html')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9333
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'amv2-'))}`, '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws; let seq = 0; const pending = new Map()
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const target = list.find((t) => t.type === 'page')
      if (target) { ws = new WebSocket(target.webSocketDebuggerUrl); break }
    } catch { /* not up yet */ }
    await sleep(200)
  }
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  })
}
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(`${expr}\n${JSON.stringify(r.result.exceptionDetails.exception?.description)}`)
  return r.result?.result?.value
}
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(here, `${name}.png`), Buffer.from(r.result.data, 'base64'))
}
const click = (sel) => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('missing '+${JSON.stringify(sel)}); el.click(); return true})()`)
const clickText = (sel, text) => ev(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(sel)})].find(n=>n.textContent.trim()===${JSON.stringify(text)}); if(!el) throw new Error('missing text '+${JSON.stringify(text)}); el.click(); return true})()`)
const text = (sel) => ev(`(document.querySelector(${JSON.stringify(sel)})?.innerText||'').trim()`)
const hover = async (sel) => {
  const box = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
}
const key = async (k) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k })
}
const typeInto = async (sel, value) => {
  await ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); el.focus(); el.value=''; el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await send('Input.insertText', { text: value })
}

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

try {
  await connect()
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: 'file://' + page })
  await sleep(800)

  // 01 主态
  const tabs = await ev(`[...document.querySelectorAll('#tabRow [data-tab]')].map(n=>n.textContent.trim())`)
  check('三 Tab 文案与顺序', JSON.stringify(tabs) === JSON.stringify(['爆款趋势', '灵感库', '账号监控']), tabs.join('/'))
  check('监控池状态条', (await text('#poolSummary')) === '监控池 8 个账号 · 正常 5 · 冷却 2 · 待重导入 1', await text('#poolSummary'))
  check('额度', (await text('#poolQuota')) === '今日剩余刷新额度 6/8')
  check('新鲜度', (await text('#poolFresh')) === '数据更新于 3 分钟前')
  check('10 张卡', (await ev(`document.querySelectorAll('#feedArea .card').length`)) === 10)
  check('筛选行单行', (await ev(`(()=>{const r=document.getElementById('filterRow'); const ys=[...r.children].map(c=>Math.round(c.getBoundingClientRect().top)); return getComputedStyle(r).flexWrap==='nowrap' && Math.max(...ys)-Math.min(...ys)<8})()`)))
  const pills = await ev(`[...document.querySelectorAll('#feedArea .card')].map(c=>{const p=c.querySelector('[class*=pill]'); return p? p.textContent.trim():''})`)
  check('增速胶囊文案', ['爆款 23k/h', '飙升 1.2k/h', '观察 320/h', '均速 1.8k/h', '该号 4.2x'].every((s) => pills.includes(s)), pills.join(' | '))
  const relColor = await ev(`(()=>{const p=[...document.querySelectorAll('#feedArea [class*=pill]')].find(n=>n.textContent.trim()==='该号 4.2x'); const cs=getComputedStyle(p); return cs.backgroundColor+' / '+cs.color})()`)
  check('「该号 4.2x」为中性色', !/(255, ?1[0-9]{2}, ?[0-9]{1,2}\))|(245, ?158)|(251, ?146)|(249, ?115)/.test(relColor), relColor)
  const bodyText = await ev(`document.body.innerText`)
  check('全页无 Emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(bodyText))
  check('无「全部平台/全部账号」违规词', !/全部平台|全部账号/.test(bodyText))
  const chips = await ev(`[...document.querySelectorAll('#feedArea .card .card-bottom')].map(b=>b.innerText)`)
  check('处理状态常驻底部信息条', chips.filter(t=>/已互动 · 09:12|已复刻/.test(t)).length >= 3, chips.filter(t=>/已互动|已复刻/.test(t)).length + ' 张')
  await shot('01-main-dark')

  // 02 卡片 hover 操作栏
  await hover('#feedArea .card')
  await sleep(300)
  const acts = await ev(`[...document.querySelectorAll('#feedArea .card')[0].querySelectorAll('[data-act]')].map(b=>b.textContent.trim())`)
  check('卡片操作栏四项', ['原帖直达', 'AI 拆解', '标为已处理', '立即复刻'].every((s) => acts.includes(s)), acts.join('/'))
  await shot('02-card-hover-actions')
  await hover('#feedArea .card:nth-child(2)'); await sleep(300)
  await shot('02b-card-hover-state')
  await hover('#feedArea .card')
  await sleep(200)
  await ev(`document.querySelectorAll('#feedArea .card')[0].querySelector('[data-act=markDone]').click()`)
  await sleep(200)
  check('标为已处理 → Toast', (await text('#toastMsg')) === '已标记为已处理')
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })

  // 03 表现档 + 平台筛选
  await clickText('#perfGroup [data-perf]', '超强爆款')
  await sleep(150)
  check('超强爆款 → 3 卡', (await ev(`document.querySelectorAll('#feedArea .card').length`)) === 3)
  await shot('03-filter-hot')
  await clickText('#perfGroup [data-perf]', '全部')

  // 04 账号筛选 Popover
  await click('#accountTrigger'); await sleep(200)
  const pop = await text('#accountPop')
  check('D1 三态健康', pop.includes('正常') && pop.includes('冷却中 · 42 分钟后恢复') && pop.includes('需要重新导入'))
  check('D1 待重导入原因行常驻', pop.includes('该 YouTube 频道尚未验证身份，请改用 channel/UC… 链接重新导入'))
  await shot('04-account-popover-health')
  await ev(`(()=>{const p=document.getElementById('accountPop'); const sc=[p,...p.querySelectorAll('*')].find(n=>n.scrollHeight>n.clientHeight+4); if(sc) sc.scrollTop=sc.scrollHeight})()`)
  await sleep(200)
  await shot('04b-account-popover-reimport')
  await key('Escape'); await sleep(150)
  check('Esc 关闭 Popover', !(await ev(`getComputedStyle(document.getElementById('accountPop')).display!=='none' && document.getElementById('accountPop').classList.contains('open')`)))

  // 05 搜索空 → E3
  await typeInto('#searchInput', 'zzz'); await sleep(500)
  const e3 = await text('#feedArea')
  check('E3 筛选空态', e3.includes('当前筛选下没有内容') && e3.includes('全选平台') && e3.includes('取消表现筛选') && e3.includes('导入账号'))
  await shot('05-empty-filtered')
  await typeInto('#searchInput', ''); await sleep(500)

  // 06 详情弹窗
  await click('#feedArea .card .card-cover'); await sleep(300)
  const det = await text('#detailModal')
  check('D3 详情含口径说明', det.includes('作品详情') && /基于 .+ 与 .+ 两次采样/.test(det))
  const btns = await ev(`[...document.querySelectorAll('#detailModal button')].filter(b=>b.textContent.trim()).map(b=>b.textContent.trim()+':'+(b.className.includes('primary')?'P':'S'))`)
  check('D3 无右上角关闭图标', (await ev(`document.querySelectorAll('#detailModal .modal-x').length`)) === 0)
  check('D3 封面无平台角标', (await ev(`document.querySelectorAll('#detailModal .platform-badge').length`)) === 0)
  check('D3 指标行不复用卡片 overlay 样式', (await ev(`document.querySelectorAll('#detailModal .overlay-metrics').length`)) === 0)
  check('D3 立即复刻为主按钮且在最右', btns.slice(-1)[0] === '立即复刻:P' && !btns.includes('关闭:P'), btns.join(' | '))
  await shot('06-detail-modal')
  await key('Escape'); await sleep(200)

  // 07 刷新 → 冷却
  await click('#refreshBtn'); await sleep(250)
  check('刷新扣额度', (await text('#poolQuota')) === '今日剩余刷新额度 5/8', await text('#poolQuota'))
  check('新鲜度最小 1 分钟', (await text('#poolFresh')) === '数据更新于 1 分钟前', await text('#poolFresh'))
  await click('#refreshBtn'); await sleep(250)
  check('二次刷新 → 冷却原因', (await text('#reasonBody')).includes('刷新过于频繁，10 分钟后可再次刷新。'))
  check('D4 无字典外标题', (await ev(`document.getElementById('reasonPop').innerText.trim()`)) === '刷新过于频繁，10 分钟后可再次刷新。')
  await shot('07-refresh-cooldown')
  await key('Escape'); await sleep(150)

  // 08 深度探针确认
  await click('#demoReset'); await sleep(250)
  await click('#demoProbe'); await sleep(250)
  check('T2 确认三要素', (await text('#probeBody')) === '本次消耗 3 次额度 · 今日剩余 6 次 · 预计 2 分钟', await text('#probeBody'))
  await shot('08-probe-confirm')
  await click('#probeCancel'); await sleep(150)

  // 09 额度归零 → 置灰可点
  await click('#demoQuota'); await sleep(200)
  check('额度归零显示 0/8', (await text('#poolQuota')) === '今日剩余刷新额度 0/8')
  await click('#refreshBtn'); await sleep(250)
  check('额度耗尽原因', (await text('#reasonBody')).includes('今日额度已用完'))
  await shot('09-quota-exhausted')
  await key('Escape'); await click('#demoReset'); await sleep(250)
  await click('#demoStopped'); await sleep(200)
  await click('#refreshBtn'); await sleep(250)
  check('账号停止原因', (await text('#reasonBody')) === '该账号自动刷新已停止，请在账号筛选中处理。', await text('#reasonBody'))
  await shot('09b-refresh-stopped')
  await key('Escape'); await click('#demoReset'); await sleep(250)

  // 10 导入弹窗
  await click('#importShellBtn'); await sleep(250)
  const imp = await text('#importBackdrop')
  check('D2 两个必备行', imp.includes('支持 TikTok、Instagram、YouTube、X 的账号主页链接') && imp.includes('YouTube 频道请使用 https://www.youtube.com/channel/UC… 形式的链接'))
  await typeInto('#importInput', 'https://facebook.com/x'); await sleep(400)
  check('非白名单报错', (await text('#importBackdrop')).includes('无法识别的链接，请粘贴账号主页链接'))
  check('报错时 YouTube 提示行仍可见', (await ev(`(()=>{const h=document.getElementById('importHint'); return getComputedStyle(h).display!=='none' && h.innerText.includes('YouTube 频道请使用')})()`)))
  check('D2 无右上角关闭图标', (await ev(`document.querySelectorAll('#importBackdrop .modal-x, #importX').length`)) === 0)
  await shot('10a-import-error')
  await typeInto('#importInput', 'https://www.tiktok.com/@new_creator'); await sleep(400)
  check('账号识别回显', (await text('#importBackdrop')).includes('将导入账号 @new_creator（TikTok）'))
  await shot('10b-import-echo')
  await click('#importSubmit'); await sleep(300)
  check('导入成功 Toast', (await text('#toastMsg')) === '已添加监控账号 @new_creator，首次采集约需 1 分钟', await text('#toastMsg'))
  check('监控池 +1', (await text('#poolSummary')).startsWith('监控池 9 个账号'), await text('#poolSummary'))

  // 11 空态 E1 / E2
  await click('#demoReset'); await sleep(200)
  await click('#demoEmpty'); await sleep(250)
  const e1 = await text('#feedArea')
  check('E1 时间承诺 + 分流出口', e1.includes('约 1 分钟后') && e1.includes('去逛逛爆款趋势'))
  check('E1 不渲染筛选行与状态条', (await ev(`getComputedStyle(document.getElementById('filterRow')).display==='none' && getComputedStyle(document.getElementById('poolBar')).display==='none'`)))
  await shot('11-empty-no-accounts')
  await click('#demoEmpty'); await click('#demoFetching'); await sleep(250)
  const e2 = await text('#feedArea')
  check('E2 首采中', e2.includes('正在为你抓取内容') && e2.includes('去逛逛爆款趋势'))
  await shot('12-empty-fetching')
  await clickText('#feedArea button, #feedArea a', '去逛逛爆款趋势'); await sleep(200)
  check('分流出口切到爆款趋势', (await ev(`document.querySelector('#tabRow [data-tab=trend]').getAttribute('aria-selected')==='true' || document.querySelector('#tabRow [data-tab=trend]').classList.contains('active') || document.querySelector('#tabRow [data-tab=trend]').classList.contains('is-active')`)))

  // 13 亮色主题
  await click('#demoReset'); await sleep(200)
  await clickText('#tabRow [data-tab]', '账号监控'); await sleep(150)
  await click('#demoTheme'); await sleep(250)
  await shot('13-main-light')
} catch (err) {
  check('脚本执行', false, String(err.message || err))
} finally {
  const fail = results.filter((r) => !r.ok).length
  writeFileSync(join(here, 'results.json'), JSON.stringify({ total: results.length, fail, results }, null, 2))
  console.log(`\nTOTAL ${results.length}  FAIL ${fail}`)
  chrome.kill()
  process.exit(fail ? 1 : 0)
}
