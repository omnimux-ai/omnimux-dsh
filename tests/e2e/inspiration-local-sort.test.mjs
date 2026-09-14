import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'esbuild'
import { PNG } from 'pngjs'
import { createLocalStore } from '../../plugins/omnimux-inspiration/src/local-store.js'
const root = fileURLToPath(new URL('../../', import.meta.url))

// Production roles observed during real-browser verification; no UI-kit shim.
function browserScript(url, evidence) {
  return `
const {writeFile}=await import('node:fs/promises');
const assert=(await import('node:assert/strict')).default;
const report={pass:false,steps:[],cleanup:false}; let task;
try {
 task=await taskSpace(${JSON.stringify(`Local sort ${evidence}`)}); report.spaceId=task.spaceId;
 await writeFile(${JSON.stringify(join(evidence, 'owned-space.json'))},JSON.stringify({spaceId:task.spaceId,name:task.name}));
 const page=task.page('p1'); await page.goto(${JSON.stringify(url)});
 report.initialSnapshot=await page.snapshot();
 async function state(name,sort,firstTitle) {
  await page.waitForFunction(({sort,firstTitle})=>{
   const value=document.querySelector('button[aria-label="排序"]')?.textContent.trim();
   const first=document.querySelector('#root [role="button"]')?.textContent||'';
   return value===sort&&(!firstTitle||first.includes(firstTitle));
  },{sort,firstTitle},{timeout:10000});
  const value=await page.evaluate(()=>({sort:document.querySelector('button[aria-label="排序"]').textContent.trim(),tab:document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,cards:[...document.querySelectorAll('#root [role="button"]')].map(el=>({text:el.textContent,box:el.getBoundingClientRect().toJSON()})),box:document.querySelector('#root').getBoundingClientRect().toJSON()}));
  const expectedTab = name.startsWith('local-') || name === 'fresh-local' ? '本地' : name.startsWith('public-') ? '云端' : '全部';
  assert.equal(value.tab,expectedTab);
  assert.equal(value.sort,sort); assert.ok(value.box.width>0&&value.box.height>0);
  if(firstTitle){
   const secondTitle=firstTitle==='最近入库，较早发布'?'较早入库，最近发布':'最近入库，较早发布';
   assert.equal(value.cards.length,2);
   assert.ok(value.cards[0].text.includes(firstTitle)); assert.ok(value.cards[1].text.includes(secondTitle));
   for(const card of value.cards) assert.ok(card.box.width>0&&card.box.height>0);
  }
  report.steps.push({name,...value});
 }
 async function tab(name){await page.click("loc=role:tab[name='"+name+"']");}
 async function sort(name){await page.click('button[aria-label="排序"]');await page.click("loc=role:menuitem[name='"+name+"']");}
 await state('all-default','热门','较早入库，最近发布');
 await tab('本地'); await state('local-default','最新','最近入库，较早发布');
 await page.screenshot({path:${JSON.stringify(join(evidence, 'local-new.png'))}});
 await sort('热门'); await state('local-hot','热门','较早入库，最近发布');
 await sort('收藏'); await state('local-fav','收藏','较早入库，最近发布');
 await tab('云端'); await state('public-default','热门');
 await sort('最新'); await state('public-manual','最新');
 await tab('全部'); await state('shared-manual','最新','最近入库，较早发布');
 await tab('本地'); await state('local-retained','收藏','较早入库，最近发布');
 await page.screenshot({path:${JSON.stringify(join(evidence, 'local-retained.png'))}});
 await page.reload(); await state('fresh-all','热门','较早入库，最近发布');
 await tab('本地'); await state('fresh-local','最新','最近入库，较早发布');
 report.pass=true;
} catch(error){report.error=String(error.stack||error);throw error;}
finally {
 try {if(task){await task.finish({keep:[]});report.cleanup=true;}}
 finally {await writeFile(${JSON.stringify(join(evidence, 'browser.json'))},JSON.stringify(report,null,2));}
}
`
}

function runEgo(script, logPath, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const child = spawn('ego-browser', ['nodejs'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    let timedOut = false
    let killTimer
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
    }, timeoutMs)
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('error', error => { clearTimeout(timer); clearTimeout(killTimer); reject(error) })
    child.on('close', async code => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      try {
        await writeFile(logPath, output)
        assert.equal(timedOut, false, `ego timed out after ${timeoutMs}ms`)
        assert.equal(code, 0, output)
        resolve()
      } catch (error) { reject(error) }
    })
    child.stdin.on('error', error => { output += String(error) })
    child.stdin.end(script)
  })
}

async function finishOwnedSpace(evidence) {
  let owned
  try { owned = JSON.parse(await readFile(join(evidence, 'owned-space.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return 'unknown-no-owned-space-receipt'; throw error }
  try {
    const browser = JSON.parse(await readFile(join(evidence, 'browser.json'), 'utf8'))
    if (browser.cleanup) return
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  // Only this run's exact ID and unique name may be recovered, never all spaces.
  await runEgo(`
const owned=${JSON.stringify(owned)};
const spaces=await listTaskSpaces();
const current=spaces.find(space=>space.spaceId===owned.spaceId||space.id===owned.spaceId);
if(current){
 if(current.name!==owned.name||current.ownership!=='agent') throw new Error('Owned-space identity/control changed; refusing cleanup');
 const task=await taskSpace(owned.spaceId);
 if(task.name!==owned.name||task.ownership!=='agent') throw new Error('Task control changed; refusing cleanup');
 await task.finish({keep:[]});
}
`, join(evidence, 'cleanup-ego.log'), 15000)
}

test('local saved-time ordering and independent manual sort in real browser', async () => {
  const parent = join(root, '.workbuddy/evidence/local-sort/e2e')
  await mkdir(parent, { recursive: true })
  const evidence = await mkdtemp(join(parent, 'run-'))
  const temporary = join(evidence, 'store')
  let server
  const requests = []
  const report = { pass: false, root, evidence, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), serverClosed: false, storeRemoved: false }
  try {
    report.sourceSha256 = {}
    for (const path of ['plugins/omnimux-inspiration/src/client/use-inspiration-feed.js', 'plugins/omnimux-inspiration/src/client/InspirationSection.jsx', 'plugins/omnimux-inspiration/src/local-store.js']) {
      report.sourceSha256[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex')
    }
    await mkdir(temporary)
    const store = createLocalStore({ paths: { dir: temporary, libraryFile: join(temporary, 'library.json'), mediaDir: join(temporary, 'media'), coversDir: join(temporary, 'media/covers'), videosDir: join(temporary, 'media/videos'), imagesDir: join(temporary, 'media/images') } })
    store.add({ id: 'saved-new', title: '最近入库，较早发布', source_url: 'https://example.com/new', source_platform: 'x', created_at: '2026-09-14T09:00:00.000Z', published_at: '2020-01-01T00:00:00.000Z', hot_score: 1 })
    store.add({ id: 'saved-old', title: '较早入库，最近发布', source_url: 'https://example.com/old', source_platform: 'x', created_at: '2026-09-01T09:00:00.000Z', published_at: '2026-09-14T00:00:00.000Z', hot_score: 99, is_favorite: true })
    assert.deepEqual(store.list({ sort: 'new' }).items.map(row => row.id), ['saved-new', 'saved-old'])
    await writeFile(join(evidence, 'store-order.json'), JSON.stringify(store.list({ sort: 'new' }), null, 2))
    const bundle = await build({
      absWorkingDir: root,
      stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {InspirationSection} from './plugins/omnimux-inspiration/src/client/InspirationSection.jsx'; import {zh} from './plugins/omnimux-inspiration/src/client/locales.js'; createRoot(document.getElementById('root')).render(React.createElement(InspirationSection,{active:true,t:k=>zh[k]||k}));`, resolveDir: root, loader: 'jsx' },
      bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false, outdir: join(evidence, 'bundle'),
      loader: { '.css': 'css', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.svg': 'text' },
    })
    const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text
    const css = bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')
    report.bundleSha256 = createHash('sha256').update(js).digest('hex')
    const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><style>body{margin:0;font-family:system-ui}#root{height:100vh}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`
    server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(js); return }
      if (url.pathname.startsWith('/omnimux/')) {
        const query = Object.fromEntries(url.searchParams)
        requests.push({ path: url.pathname, ...query })
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true, data: url.pathname === '/omnimux/inspiration/local' ? store.list(query) : { items: [], total: 0 } }))
        return
      }
      res.setHeader('Content-Type', 'text/html'); res.end(html)
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    report.url = `http://127.0.0.1:${server.address().port}/`
    report.pid = process.pid
    await runEgo(browserScript(report.url, evidence), join(evidence, 'ego.log'))
    const browser = JSON.parse(await readFile(join(evidence, 'browser.json'), 'utf8'))
    assert.equal(browser.pass, true)
    assert.equal(browser.cleanup, true)
    // All loads local+cloud with hot before the first local-tab request.
    assert.deepEqual(requests.slice(0, 5).map(row => [row.path, row.sort]), [
      ['/omnimux/inspiration/local', 'hot'], ['/omnimux/inspiration', 'hot'],
      ['/omnimux/inspiration/local', 'new'], ['/omnimux/inspiration/local', 'hot'], ['/omnimux/inspiration/local', 'fav'],
    ])
    report.screenshots = []
    for (const name of ['local-new.png', 'local-retained.png']) {
      const bytes = await readFile(join(evidence, name))
      const png = PNG.sync.read(bytes, { checkCRC: true })
      assert.ok(png.width > 0 && png.height > 0)
      report.screenshots.push({ name, width: png.width, height: png.height, bytes: bytes.length })
    }
    report.pass = true
  } catch (error) { report.error = String(error.stack || error); throw error }
  finally {
    try {
      try {
        const cleanup = await finishOwnedSpace(evidence)
        report.browserCleanupChecked = cleanup || true
      }
      finally {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
        report.serverClosed = true
      }
    } catch (error) {
      report.pass = false
      report.error = String(error.stack || error)
      throw error
    } finally {
      await rm(temporary, { recursive: true, force: true })
      report.storeRemoved = true
      await writeFile(join(evidence, 'requests.json'), JSON.stringify(requests, null, 2))
      await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
      console.log(`E2E evidence: ${evidence}`)
    }
  }
})
