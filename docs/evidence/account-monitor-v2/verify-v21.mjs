// 账号监控 v2.1 · 分平台卡片与瀑布流验收（规格 §9.6 V1–V22）
// 用法：node verify-v21.mjs —— 截图 14–20 写到本目录，结果写 results-v21.json
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pagePath = resolve(here, '../../docs/prototypes/account-monitor-v2-prototype.html')
const source = readFileSync(pagePath, 'utf8')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9334
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'amv21-'))}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws; let seq = 0; const pending = new Map()
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const t = list.find((x) => x.type === 'page')
      if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); break }
    } catch { /* starting */ }
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
  if (r.result?.exceptionDetails) throw new Error(`${expr.slice(0, 120)}\n${r.result.exceptionDetails.exception?.description}`)
  return r.result?.result?.value
}
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(here, `${name}.png`), Buffer.from(r.result.data, 'base64'))
}
const viewport = async (w, h = 1000) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false })
  await sleep(350)
}
const click = (sel) => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('missing '+${JSON.stringify(sel)}); el.click(); return true})()`)
const hoverEl = async (sel) => {
  const b = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y })
  await sleep(250)
}
const unhover = async () => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }); await sleep(250) }
const key = async (k) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k })
}

const CONTRAST_LIB = `
  const parse=s=>{const m=s.match(/[\\d.]+/g).map(Number); return {r:m[0],g:m[1],b:m[2],a:m.length>3?m[3]:1}};
  const lum=c=>{const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
  const blend=(fg,bg)=>({r:fg.r*fg.a+bg.r*(1-fg.a), g:fg.g*fg.a+bg.g*(1-fg.a), b:fg.b*fg.a+bg.b*(1-fg.a), a:1});
  const bgOf=el=>{const stack=[]; for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor); if(c.a>0) stack.push(c); if(c.a>=1) break} let out={r:255,g:255,b:255,a:1}; for(let i=stack.length-1;i>=0;i--) out=blend(stack[i],out); return out};
  const ratio=(a,b)=>{const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
  const textRatio=el=>{const bg=bgOf(el); const fg=blend(parse(getComputedStyle(el).color),bg); return Math.round(ratio(fg,bg)*10)/10};
`
// 截图像素采样：返回卡片媒体中心点的相对亮度
async function mediaCenterLum(id) {
  const r = await ev(`(()=>{const m=document.querySelector('#feedMasonry .card[data-id="${id}"] .card-media'); const b=m.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}})()`)
  const shotRes = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x - 2, y: r.y - 2, width: 4, height: 4, scale: 1 } })
  return ev(`(async()=>{const img=new Image(); img.src='data:image/png;base64,${shotRes.result.data}'; await img.decode(); const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const x=c.getContext('2d'); x.drawImage(img,0,0); const d=x.getImageData(0,0,c.width,c.height).data; let R=0,G=0,B=0,n=0; for(let i=0;i<d.length;i+=4){R+=d[i];G+=d[i+1];B+=d[i+2];n++} const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; return Math.round((0.2126*f(R/n)+0.7152*f(G/n)+0.0722*f(B/n))*1000)/1000})()`)
}

// 真实合成底色：从截图采样胶囊内边距处的像素作为背景，文字颜色叠加其上后计算对比度
async function pillPixelRatio(id) {
  const r = await ev(`(()=>{const p=document.querySelector('#feedMasonry .card[data-id="${id}"] .vpill'); const b=p.getBoundingClientRect(); const t=p.querySelector('span:last-child')||p; return {x:b.x+3, y:b.y+b.height/2, color:getComputedStyle(t).color}})()`)
  const res = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x - 1, y: r.y - 1, width: 2, height: 2, scale: 1 } })
  return ev(`(async()=>{const img=new Image(); img.src='data:image/png;base64,${res.result.data}'; await img.decode(); const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const x=c.getContext('2d'); x.drawImage(img,0,0); const d=x.getImageData(0,0,1,1).data;
    const bg={r:d[0],g:d[1],b:d[2]}; const m='${r.color}'.match(/[\\d.]+/g).map(Number); const a=m.length>3?m[3]:1; const fg={r:m[0]*a+bg.r*(1-a), g:m[1]*a+bg.g*(1-a), b:m[2]*a+bg.b*(1-a)};
    const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; const L=c=>0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); const x1=L(fg), y1=L(bg);
    return {r:Math.round((Math.max(x1,y1)+0.05)/(Math.min(x1,y1)+0.05)*10)/10, bg:[d[0],d[1],d[2]].join(','), fg:'${r.color}'}})()`)
}

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

// 独立复算：按 DOM 顺序重新模拟「放入最短列、同高取最左」，与页面实际坐标逐张对比
const PLACEMENT = `(()=>{
  const feed=document.getElementById('feedMasonry'); const cards=[...feed.querySelectorAll('.card')];
  const W=feed.clientWidth; const n=Math.max(2,Math.min(6,Math.floor((W+16)/236))); const colW=(W-16*(n-1))/n;
  const bottoms=new Array(n).fill(0); const bad=[];
  for(const c of cards){
    let k=0; for(let i=1;i<n;i++){ if(bottoms[i] < bottoms[k]-0.5) k=i }
    const left=parseFloat(c.style.left), top=parseFloat(c.style.top);
    if(Math.abs(left-k*(colW+16))>1 || Math.abs(top-bottoms[k])>1) bad.push(c.dataset.id+'@col'+(k+1));
    bottoms[k]=top+c.offsetHeight+16;
  }
  return {n, colW:Math.round(colW*10)/10, W, bad, ids:cards.map(c=>c.dataset.id), widths:[...new Set(cards.map(c=>Math.round(c.getBoundingClientRect().width)))]}
})()`
const FIRST_ROW = `[...document.querySelectorAll('#feedMasonry .card')].filter(c=>parseFloat(c.style.top)<1).sort((a,b)=>parseFloat(a.style.left)-parseFloat(b.style.left)).map(c=>c.dataset.id)`
const POSITIONS = `JSON.stringify([...document.querySelectorAll('#feedMasonry .card')].map(c=>[c.dataset.id,c.style.left,c.style.top,c.offsetHeight]))`
const VISIBLE_TEXT = (id) => `(()=>{const c=document.querySelector('#feedMasonry .card[data-id="${id}"]'); const out=[];
  const walk=n=>{ for(const ch of n.childNodes){ if(ch.nodeType===3){ const t=ch.textContent.trim(); if(!t) continue; const el=ch.parentElement; let vis=true; for(let e=el;e&&e!==c.parentElement;e=e.parentElement){ const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.05){vis=false;break} } if(vis) out.push(t) } else if(ch.nodeType===1) walk(ch) } };
  walk(c); return out })()`

try {
  await connect()
  await send('Page.enable'); await send('Runtime.enable')
  await viewport(1440)
  await send('Page.navigate', { url: 'file://' + pagePath })
  await sleep(900)

  // V1 静态：无 CSS columns / dense
  check('V1 未使用 CSS columns / grid dense', !/column-count|columns\s*:\s*\d|grid-auto-flow\s*:\s*dense/.test(source))

  // V2/V3/V4 默认排序
  let p = await ev(PLACEMENT)
  check('V3 默认排序：每张卡都放进当时最短列（独立复算）', p.bad.length === 0, `${p.n} 列，列宽 ${p.colW}，偏差 ${p.bad.join(',') || '无'}`)
  check('V2 默认 5 列首行 #1 #2 #3 #11 #4', JSON.stringify(await ev(FIRST_ROW)) === JSON.stringify(['1', '2', '3', '11', '4']), (await ev(FIRST_ROW)).join(' '))
  check('V4 DOM 顺序 = 综合推荐顺序', p.ids.join(',') === '1,2,3,11,4,5,6,12,7,8,9,10', p.ids.join(','))
  check('V5 列宽等分且 ≥ 220px', p.widths.length === 1 && p.widths[0] >= 220, p.widths.join('/'))
  await shot('14-masonry-dark-5col')

  // V8 媒体比例 / V9 截断 / V10 高度 / V11 胶囊位置
  const geo = await ev(`[...document.querySelectorAll('#feedMasonry .card')].map(c=>{const m=c.querySelector('.card-media'); const r=m?m.getBoundingClientRect():null; const pill=c.querySelector('.vpill'); const pr=pill?pill.getBoundingClientRect():null; const cr=c.getBoundingClientRect();
    const body=c.querySelector('.card-text-body, .card-title'); return {id:c.dataset.id,type:c.dataset.type,ratio:r?Math.round(r.width/r.height*100)/100:null,h:Math.round(cr.height),
    pillRight:pr?Math.round(cr.right-pr.right):null, pillTop:pr?Math.round(pr.top-cr.top):null, clamp:body?getComputedStyle(body).webkitLineClamp:null, overflow:body?body.scrollHeight>body.clientHeight+1:null}})`)
  const byId = Object.fromEntries(geo.map((g) => [g.id, g]))
  const ratioOk = geo.every((g) => ({ 'short-video': 0.56, 'long-video': 1.78, 'text-media': 1.78 }[g.type] ? Math.abs(g.ratio - { 'short-video': 0.56, 'long-video': 1.78, 'text-media': 1.78 }[g.type]) < 0.03 : true))
    && Math.abs(byId['3'].ratio - 0.8) < 0.03 && Math.abs(byId['10'].ratio - 0.8) < 0.03 && Math.abs(byId['7'].ratio - 1) < 0.03
  check('V8 媒体比例 9:16 / 16:9 / 4:5 / 1:1', ratioOk, geo.map((g) => `#${g.id}:${g.ratio ?? '—'}`).join(' '))
  const clampWant = { 'short-video': '1', 'long-video': '2', image: '1', text: '8', 'text-media': '3' }
  check('V9 截断行数按类型 1/2/1/8/3', geo.every((g) => g.clamp === clampWant[g.type]), geo.map((g) => `#${g.id}:${g.clamp}`).join(' '))
  const at220 = await ev(`(async()=>{const area=document.getElementById('feedArea'); area.style.width='1164px'; await new Promise(r=>setTimeout(r,150));
    const out=[...document.querySelectorAll('#feedMasonry .card')].map(c=>{const b=c.querySelector('.card-text-body, .card-title'); return {id:c.dataset.id,type:c.dataset.type,w:Math.round(c.getBoundingClientRect().width),h:c.offsetHeight,overflow:b.scrollHeight>b.clientHeight+1}});
    area.style.width=''; await new Promise(r=>setTimeout(r,150)); return out})()`)
  const a220 = Object.fromEntries(at220.map((g) => [g.id, g]))
  check('V9 列宽 220px 下 #11 长推文被截断、#12 完整', a220['11'].w === 220 && a220['11'].overflow === true && a220['12'].overflow === false, `列宽 ${a220['11'].w}`)
  check('V10 列宽 220px 下所有卡 ≥144px；text ≤ 230、text-media ≤ 250', at220.every((g) => g.h >= 144) && at220.filter((g) => g.type === 'text').every((g) => g.h <= 230) && at220.filter((g) => g.type === 'text-media').every((g) => g.h <= 250),
    at220.map((g) => `#${g.id}:${g.h}`).join(' '))
  check('V11 胶囊在卡片右上角', geo.filter((g) => g.pillRight !== null).every((g) => g.pillRight <= 16 && g.pillTop <= 16), geo.filter((g) => g.pillRight !== null).map((g) => `#${g.id}:${g.pillRight},${g.pillTop}`).join(' '))

  // V12 默认态极简：逐卡可见文本只允许胶囊 + 标题/正文
  const leaks = []
  for (const g of geo) {
    const vis = await ev(VISIBLE_TEXT(g.id))
    const own = await ev(`document.querySelector('#feedMasonry .card[data-id="${g.id}"] .card-text-body, #feedMasonry .card[data-id="${g.id}"] .card-title').textContent.trim()`)
    const extra = vis.filter((t) => t !== own && !/^(爆款|飙升|观察|均速) [\d.]+k?\/h$|^该号 [\d.]+x$/.test(t))
    if (extra.length) leaks.push(`#${g.id}:${extra.join('|')}`)
  }
  check('V12 默认态只显示媒体 + 胶囊 + 标题/正文', leaks.length === 0, leaks.join('  ') || '无泄漏')
  check('V15 全页无「该号爆款 · 高于中位」，「该号 4.2x」保留', !(await ev(`document.body.innerText.includes('该号爆款')`)) && (await ev(`document.body.innerText.includes('该号 4.2x')`)))

  // V13/V14 已处理样式
  const done = await ev(`[...document.querySelectorAll('#feedMasonry .card')].map(c=>{const cs=getComputedStyle(c); const m=c.querySelector('.card-media'); const b=c.querySelector('.card-text-body, .card-title'); const pill=c.querySelector('.vpill');
    return {id:c.dataset.id, done:c.classList.contains('is-done'), op:cs.opacity, filter:m?getComputedStyle(m).filter:null, color:getComputedStyle(b).color, pillBg:getComputedStyle(pill).backgroundColor, pillColor:getComputedStyle(pill).color, shadow:cs.boxShadow}})`)
  const doneIds = done.filter((d) => d.done).map((d) => d.id).sort((a, b) => a - b)
  check('V14 有状态卡为 #2 #4 #6 #9 #12', doneIds.join(',') === '2,4,6,9,12', doneIds.join(','))
  check('V14 所有卡 opacity = 1（禁止整卡变暗）', done.every((d) => d.op === '1'))
  const mediaOp = await ev(`Object.fromEntries([...document.querySelectorAll('#feedMasonry .card .card-media')].map(m=>[m.closest('.card').dataset.id, getComputedStyle(m).opacity]))`)
  check('V14 已处理卡媒体 filter = grayscale(1) 且 opacity = 0.45；无状态卡无变化', done.filter((d) => d.done && d.filter !== null).every((d) => d.filter === 'grayscale(1)' && mediaOp[d.id] === '0.45') && done.filter((d) => !d.done && d.filter !== null).every((d) => d.filter === 'none' && mediaOp[d.id] === '1'),
    done.filter((d) => d.filter !== null).map((d) => `#${d.id}:${d.filter}/${mediaOp[d.id]}`).join(' '))
  const secondary = await ev(`(()=>{const s=document.createElement('span'); s.style.color='var(--dsw-alias-label-secondary, rgba(255,255,255,.72))'; document.body.appendChild(s); const c=getComputedStyle(s).color; s.remove(); return c})()`)
  check('V14 已处理卡正文颜色 = label-secondary', done.filter((d) => d.done).every((d) => d.color === secondary), secondary)
  const hot = done.find((d) => d.id === '2')
  check('V13 已处理的爆款卡 #2 胶囊无彩色、卡片无发光', !/(2\d\d|1[5-9]\d), ?[0-9]{1,2}, ?[0-9]{1,2}/.test(hot.pillBg) && (hot.shadow === 'none' || !/rgba?\((2[0-9]{2}), ?[4-9][0-9]/.test(hot.shadow)), `${hot.pillBg} / ${hot.shadow.slice(0, 40)}`)
  const lumDark = { 2: await mediaCenterLum(2), 9: await mediaCenterLum(9), 1: await mediaCenterLum(1) }
  check('V14 暗色主题已处理媒体非纯黑（#2/#9 中心亮度 > 0.005）', lumDark[2] > 0.005 && lumDark[9] > 0.005, JSON.stringify(lumDark))
  await shot('18-processed-dim')

  // V16/V17/V18 悬停
  await hoverEl('#feedMasonry .card[data-id="11"]')
  const ov11 = await ev(`(()=>{const c=document.querySelector('#feedMasonry .card[data-id="11"]'); const o=c.querySelector('.card-overlay'); return {txt:o.innerText, op:getComputedStyle(o).opacity, bg:getComputedStyle(o).backgroundColor, pillVis:getComputedStyle(c.querySelector('.vpill')).visibility}})()`)
  check('V16 文本卡悬停层：作者行 + 指标 + 操作 + 立即复刻', ov11.op === '1' && /Higgsfield AI/.test(ov11.txt) && /可参考/.test(ov11.txt) && /浏览 4\.1万/.test(ov11.txt) && /立即复刻/.test(ov11.txt), ov11.txt.replace(/\n/g, ' | '))
  check('V21 文本卡悬停层为不透明底', !/rgba\(.*, 0(\.\d+)?\)$/.test(ov11.bg) || /, 1\)$/.test(ov11.bg), ov11.bg)
  const fade = await ev(`(()=>{const o=document.querySelector('#feedMasonry .card[data-id="11"] .card-overlay'); const b=getComputedStyle(o,'::before'); const cs=getComputedStyle(o); return {h:b.height, bg:b.backgroundImage, pe:b.pointerEvents, bt:cs.borderTopWidth, rtl:cs.borderTopLeftRadius}})()`)
  check('V21 悬停层上沿 20px 渐隐带、无顶边描边、无顶部圆角', fade.h === '20px' && /linear-gradient/.test(fade.bg) && fade.pe === 'none' && fade.bt === '0px' && fade.rtl === '0px', JSON.stringify(fade))
  await shot('17-text-card-hover')
  await hoverEl('#feedMasonry .card[data-id="2"]')
  const ov2 = await ev(`(()=>{const c=document.querySelector('#feedMasonry .card[data-id="2"]'); const m=c.querySelector('.card-media'); return {txt:c.querySelector('.card-overlay').innerText, filter:getComputedStyle(m).filter, op:getComputedStyle(m).opacity, pill:getComputedStyle(c.querySelector('.vpill')).backgroundColor}})()`)
  check('V17 视频卡指标前缀为「播放」', /播放 41\.2万/.test(ov2.txt))
  check('V18 有状态卡第四位显示状态文字、无「标为已处理」', /已互动 · 09:12/.test(ov2.txt) && !/标为已处理/.test(ov2.txt))
  await sleep(250)
  const ov2b = await ev(`(()=>{const m=document.querySelector('#feedMasonry .card[data-id="2"] .card-media'); return {filter:getComputedStyle(m).filter, op:getComputedStyle(m).opacity}})()`)
  check('V14 悬停时已处理样式恢复（filter none、opacity 1、胶囊彩色）', ov2b.filter === 'none' && ov2b.op === '1' && /240, 69, 58/.test(ov2.pill), `${ov2b.filter} / ${ov2b.op} / pill ${ov2.pill}`)
  await unhover()

  // V7 悬停 / 标为已处理不移动卡片
  const before = await ev(POSITIONS)
  await hoverEl('#feedMasonry .card[data-id="1"]')
  await ev(`document.querySelector('#feedMasonry .card[data-id="1"] [data-act="markDone"]').click()`)
  await sleep(250)
  const toast = await ev(`document.getElementById('toastMsg').innerText`)
  await unhover()
  const after = await ev(POSITIONS)
  check('V7 悬停与标为已处理后所有卡片位置不变', before === after)
  check('V18 标为已处理 → 已处理样式 + Toast', (await ev(`document.querySelector('#feedMasonry .card[data-id="1"]').classList.contains('is-done')`)) && toast === '已标记为已处理', toast)

  // V2 增速最快
  await click('#demoReset'); await sleep(300)
  await click('#sortTrigger'); await sleep(150)
  await click('#sortPop [data-sort="velocity"]'); await sleep(350)
  p = await ev(PLACEMENT)
  check('V2 增速最快首行 #2 #1 #10 #9 #3', JSON.stringify(await ev(FIRST_ROW)) === JSON.stringify(['2', '1', '10', '9', '3']), (await ev(FIRST_ROW)).join(' '))
  check('V3 增速最快排序后仍是最短列放置', p.bad.length === 0, p.bad.join(',') || '无偏差')
  await shot('16-sort-velocity')

  // V3 筛选 / 搜索后重排
  await click('#demoReset'); await sleep(300)
  await ev(`(()=>{const b=[...document.querySelectorAll('#perfGroup [data-perf]')].find(n=>n.textContent.trim()==='急速飙升'); b.click()})()`)
  await sleep(300)
  p = await ev(PLACEMENT)
  check('V3 表现筛选后重排仍满足最短列', p.bad.length === 0 && p.ids.length === 4, `${p.ids.join(',')} 偏差 ${p.bad.join(',') || '无'}`)
  await click('#demoReset'); await sleep(300)

  // V5 列数断点（按 Feed 容器宽度）
  const cols = []
  for (const vw of [1440, 1280, 1100, 900, 700]) {
    await viewport(vw)
    const r = await ev(PLACEMENT)
    const want = Math.max(2, Math.min(6, Math.floor((r.W + 16) / 236)))
    cols.push({ vw, W: r.W, n: r.n, want, colW: r.colW, bad: r.bad.length })
  }
  check('V5 各宽度列数符合公式、列宽 ≥220、放置正确', cols.every((c) => c.n === c.want && c.colW >= 220 && c.bad === 0), cols.map((c) => `vw${c.vw}→W${c.W}:${c.n}列/${c.colW}`).join('  '))
  // 精确边界：直接设置 Feed 容器宽度
  const edge = await ev(`(async()=>{const area=document.getElementById('feedArea'); const out=[]; for(const w of [1164,1163,928,927]){ area.style.width=w+'px'; await new Promise(r=>setTimeout(r,120)); out.push([w, document.getElementById('feedMasonry').clientWidth, Math.max(...[...document.querySelectorAll('#feedMasonry .card')].map(c=>+c.dataset.col))]) } area.style.width=''; await new Promise(r=>setTimeout(r,120)); return out})()`)
  check('V5 边界 1164→5 / 1163→4 / 928→4 / 927→3', JSON.stringify(edge.map((e) => e[2])) === '[5,4,4,3]', edge.map((e) => `${e[0]}:${e[2]}列`).join(' '))
  await viewport(1100)
  await shot('15-masonry-4col')
  await viewport(1440)

  // V6 间距
  const gaps = await ev(`(()=>{const cs=[...document.querySelectorAll('#feedMasonry .card')]; const byCol={}; cs.forEach(c=>(byCol[c.dataset.col]??=[]).push(c)); const v=[]; Object.values(byCol).forEach(a=>{a.sort((x,y)=>parseFloat(x.style.top)-parseFloat(y.style.top)); for(let i=1;i<a.length;i++) v.push(Math.round(parseFloat(a[i].style.top)-parseFloat(a[i-1].style.top)-a[i-1].offsetHeight))}); const l=[...new Set(cs.map(c=>parseFloat(c.style.left)))].sort((a,b)=>a-b); const w=parseFloat(cs[0].style.width); const h=[]; for(let i=1;i<l.length;i++) h.push(Math.round(l[i]-l[i-1]-w)); return {v:[...new Set(v)],h:[...new Set(h)], radius:getComputedStyle(cs[0]).borderTopLeftRadius, tm:getComputedStyle(document.querySelector('.card[data-type="text-media"] .card-media')).borderTopLeftRadius}})()`)
  check('V6 横纵间距 16px、卡圆角 12px、内嵌媒体 8px', gaps.v.join() === '16' && gaps.h.join() === '16' && gaps.radius === '12px' && gaps.tm === '8px', JSON.stringify(gaps))

  // V19 数据
  await click('#accountTrigger'); await sleep(200)
  const accTxt = await ev(`document.getElementById('accountPop').innerText`)
  check('V19 Higgsfield AI / Runway 显示 2 个作品', /Higgsfield AI[\s\S]{0,60}2 个作品/.test(accTxt) && /Runway[\s\S]{0,60}2 个作品/.test(accTxt))
  await key('Escape'); await sleep(150)
  check('V19 共 12 张卡', (await ev(`document.querySelectorAll('#feedMasonry .card').length`)) === 12)

  // V20 详情
  await click('#feedMasonry .card[data-id="11"] .card-text-body'); await sleep(300)
  const d11 = await ev(`(()=>{const m=document.getElementById('detailModal'); const b=m.querySelector('.detail-body'); return {cover:!!m.querySelector('.detail-cover'), pillRow:!!m.querySelector('.detail-pill-row'), full:b?b.scrollHeight<=b.clientHeight+1 && b.innerText.length>=130:false, dur:!!m.querySelector('.duration-badge')}})()`)
  check('V20 纯文本详情：无封面带、胶囊在正文上方、正文全文', !d11.cover && d11.pillRow && d11.full && !d11.dur, JSON.stringify(d11))
  const fields = await ev(`(()=>{const m=document.getElementById('detailModal'); const rows=[...m.querySelectorAll('*')].filter(e=>/^(博主|平台)$/.test(e.textContent.trim()) && e.children.length===0); return rows.map(l=>{const row=l.parentElement; return {label:l.textContent.trim(), svg:row.querySelectorAll('svg').length, avatar:row.querySelectorAll('[class*=avatar]').length, text:row.innerText.replace(/\\s+/g,' ').trim()}})})()`)
  check('V20 D3 博主/平台只显示文字（无头像、无平台图标）', fields.length === 2 && fields.every((f) => f.svg === 0 && f.avatar === 0), JSON.stringify(fields))
  await shot('19-detail-text')
  await key('Escape'); await sleep(200)
  await click('#feedMasonry .card[data-id="4"] .card-text-body'); await sleep(300)
  const d4 = await ev(`(()=>{const c=document.querySelector('#detailModal .detail-cover'); const r=c.getBoundingClientRect(); return {ratio:Math.round(r.width/r.height*100)/100, dur:!!c.querySelector('.duration-badge')}})()`)
  check('V20 带媒体推文详情：封面带 16:9、有时长', Math.abs(d4.ratio - 1.78) < 0.03 && d4.dur, JSON.stringify(d4))
  await key('Escape'); await sleep(200)

  // V21 亮色主题 + 对比度
  await click('#demoTheme'); await sleep(350)
  const contrast = await ev(`(()=>{
    const parse=s=>{const m=s.match(/[\\d.]+/g).map(Number); return {r:m[0],g:m[1],b:m[2],a:m.length>3?m[3]:1}};
    const lum=c=>{const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
    const blend=(fg,bg)=>({r:fg.r*fg.a+bg.r*(1-fg.a), g:fg.g*fg.a+bg.g*(1-fg.a), b:fg.b*fg.a+bg.b*(1-fg.a), a:1});
    const bgOf=el=>{const stack=[]; for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor); if(c.a>0) stack.push(c); if(c.a>=1) break} let out={r:255,g:255,b:255,a:1}; for(let i=stack.length-1;i>=0;i--) out=blend(stack[i],out); return out};
    const ratio=(a,b)=>{const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
    return [...document.querySelectorAll('#feedMasonry .card')].filter(c=>c.dataset.type==='text'||c.dataset.type==='text-media').map(c=>{const b=c.querySelector('.card-text-body'); const bg=bgOf(b); const fg=blend(parse(getComputedStyle(b).color),bg); return {id:c.dataset.id, done:c.classList.contains('is-done'), r:Math.round(ratio(fg,bg)*10)/10}})
  })()`)
  check('V21 亮色主题文本卡正文对比度 ≥ 4.5（含已处理卡）', contrast.every((c) => c.r >= 4.5), contrast.map((c) => `#${c.id}${c.done ? '(已处理)' : ''}:${c.r}`).join(' '))
  const pillR = await ev(`(()=>{${CONTRAST_LIB} return [...document.querySelectorAll('#feedMasonry .card .vpill.on-surface')].filter(p=>!/(^| )(hot|rising)( |$)/.test(p.className) || p.closest('.card').classList.contains('is-done')).map(p=>({id:p.closest('.card').dataset.id, r:textRatio(p.querySelector('span:last-child')||p)}))})()`)
  check('V21 亮色主题文本卡中性胶囊文字对比度 ≥ 4.5', pillR.length > 0 && pillR.every((p) => p.r >= 4.5), pillR.map((p) => `#${p.id}:${p.r}`).join(' '))
  const lumLight = { 2: await mediaCenterLum(2), 9: await mediaCenterLum(9) }
  check('V14 亮色主题已处理媒体中心亮度 ≥ 0.15（不呈黑块）', lumLight[2] >= 0.15 && lumLight[9] >= 0.15, JSON.stringify(lumLight))
  const donePillR = {}
  for (const id of ['2', '4', '6', '9', '12']) donePillR[id] = await pillPixelRatio(id)
  check('V14 亮色主题已处理卡胶囊文字对比度 ≥ 4.5（截图像素合成底色）', Object.values(donePillR).every((p) => p.r >= 4.5), Object.entries(donePillR).map(([k, v]) => `#${k}:${v.r}(bg ${v.bg} / fg ${v.fg})`).join('  '))
  await shot('20-masonry-light')
  await hoverEl('#feedMasonry .card[data-id="11"]')
  await shot('17b-text-card-hover-light')
  await unhover()
  await click('#demoTheme'); await sleep(250)
  // 暗色主题胶囊与已处理胶囊对比度
  const darkPill = await ev(`(()=>{${CONTRAST_LIB} return [...document.querySelectorAll('#feedMasonry .card.is-done .vpill, #feedMasonry .card .vpill.on-surface.watch, #feedMasonry .card .vpill.on-surface.average, #feedMasonry .card .vpill.on-surface.relative')].map(p=>({id:p.closest('.card').dataset.id, r:textRatio(p.querySelector('span:last-child')||p)}))})()`)
  check('V14/V21 暗色主题中性与已处理胶囊文字对比度 ≥ 4.5', darkPill.every((p) => p.r >= 4.5), darkPill.map((p) => `#${p.id}:${p.r}`).join(' '))

  // V22 字典外文本：卡片区可见与悬停文本的集合不得出现新标签
  const allCardText = await ev(`[...document.querySelectorAll('#feedMasonry .card')].map(c=>c.innerText).join('\\n')`)
  check('V22 无类型标签 / 播放图标文字', !/(视频|推文|图文)(\\s|$)/.test(allCardText.replace(/AI 视效|视效运镜|短视频/g, '')) && !/▶|►/.test(allCardText))
} catch (err) {
  check('脚本执行', false, String(err.message || err))
} finally {
  const fail = results.filter((r) => !r.ok).length
  writeFileSync(join(here, 'results-v21.json'), JSON.stringify({ total: results.length, fail, results }, null, 2))
  console.log(`\nTOTAL ${results.length}  FAIL ${fail}`)
  chrome.kill()
  process.exit(fail ? 1 : 0)
}
