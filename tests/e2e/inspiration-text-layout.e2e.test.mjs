import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startFixture } from './inspiration-text-layout.fixture.mjs'

// Run with node --test. Requires ego-browser and installed real UI-kit dependencies.
test('真实预览：桌面及窄屏全宽正文、完整记录、滚动复制与关闭', {timeout:120000}, async()=>{
  const dir=resolve(import.meta.dirname,'../../.agent-reports/inspiration-text-layout/e2e', `${Date.now()}-${process.pid}`)
  await mkdir(dir,{recursive:true})
  const fixture=await startFixture()
  try {
  await writeFile(resolve(dir,'identity.json'),JSON.stringify({...fixture.identity,url:fixture.url},null,2))
  const script=`
const fs=await import('node:fs/promises'); const assert=(await import('node:assert/strict')).default;
const dir=${JSON.stringify(dir)};const task=await taskSpace('1758 正式排版回归');const p=task.page('p1');const report={spaceId:task.spaceId,views:[]};const save=()=>fs.writeFile(dir+'/result.json',JSON.stringify(report,null,2));
await fs.writeFile(dir+'/owned-space.json',JSON.stringify({spaceId:task.spaceId}));await save();
try {
for(const width of [1440,390]) {
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await p.goto(${JSON.stringify(fixture.url)});await p.waitForSelector('button[aria-label="关闭"]');
 const snapshot=await p.snapshot();report.snapshot=snapshot;await save();
 if(width===390){const match=snapshot.match(/tab \\[ref=(\\d+)\\]\\n\\s+text "内容解构"/);assert.ok(match,'真实快照需包含内容解构tab');await p.click('@'+match[1]);}
 const metrics=await p.evaluate(()=>{const d=document.querySelector('.omnimux-inspiration-doc-analysis');return{root:document.querySelector('.omnimux-inspiration-modal-container').getBoundingClientRect().toJSON(),panels:[...document.querySelectorAll('.omnimux-inspiration-modal-panel')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getBoundingClientRect().toJSON()),doc:d.getBoundingClientRect().toJSON(),records:d.querySelectorAll('.omnimux-inspiration-doc-record').length,text:d.textContent,rows:[...d.querySelectorAll('.omnimux-inspiration-doc-labeled-row')].map(e=>({r:e.getBoundingClientRect().toJSON(),l:e.children[0].getBoundingClientRect().toJSON(),d:e.children[1].getBoundingClientRect().toJSON()})),overflow:[...d.querySelectorAll('*')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+1).map(e=>e.className)}});
 report.views.push({width,metrics});await save();assert.ok(metrics.root.width>0&&metrics.root.x>=0&&metrics.root.right<=width+1);assert.equal(metrics.panels.length,width===1440?3:1);for(const panel of metrics.panels){assert.ok(panel.width>0&&panel.height>0&&panel.x>=metrics.root.x-1&&panel.right<=metrics.root.right+1)}assert.ok(metrics.doc.width>0&&metrics.doc.height>0);assert.equal(metrics.records,2);assert.equal(metrics.overflow.length,0);assert.ok(metrics.rows.length>=8);for(const row of metrics.rows){assert.ok(row.d.width>0&&row.d.height>0);assert.ok(row.d.top>=row.l.bottom);assert.ok(Math.abs(row.d.x-row.r.x)<1);assert.ok(Math.abs(row.d.width-row.r.width)<1)}for(const value of ['FIRST-END','LAST-END','A|B','https://example.com/reference'])assert.ok(metrics.text.includes(value));assert.ok(!metrics.text.includes('| --- |'));
 await p.screenshot({path:dir+'/'+width+'-top.png'});
 const box=await p.evaluate(()=>{const e=document.querySelector('.omnimux-inspiration-modal-deconstruction-body');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,before:e.scrollTop,max:e.scrollHeight-e.clientHeight}});await p.mouse.move(box.x,box.y);await p.mouse.wheel(0,900,{label:'滚动完整分镜记录'});const after=await p.evaluate(()=>document.querySelector('.omnimux-inspiration-modal-deconstruction-body').scrollTop);report.views.at(-1).scroll={before:box.before,after,max:box.max};await save();if(box.max>0)assert.ok(after>box.before,'wheel must move scrollTop');await p.screenshot({path:dir+'/'+width+'-scrolled.png'});
 await p.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text}}});const h=[...document.querySelectorAll('h2,h3,h4')].find(e=>e.textContent.trim()==='内容解构');h.parentElement.parentElement.querySelector('button').setAttribute('data-qa-copy','yes')});await p.click('[data-qa-copy="yes"]');const copy=await p.evaluate(()=>({value:window.__copied,raw:window.__qaFixture.analysis}));report.views.at(-1).copy=copy;await save();assert.equal(copy.value,'## 测试章节\\n'+copy.raw);
 await p.click('button[aria-label="关闭"]');await p.waitForSelector('text="重新打开测试素材"');report.views.at(-1).closed=true;await save();
}
report.pass=true;
}catch(e){report.error=String(e)}finally{try{await task.finish({keep:[]});report.finished=true}catch(e){report.finishError=String(e);report.pass=false}await save()}
assert.equal(report.pass,true,report.error||report.finishError);
`
    const result=await new Promise((done,reject)=>{
      const child=spawn('ego-browser',['nodejs'],{stdio:['pipe','pipe','pipe']})
      let out = ''
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, 90000)
      child.stdout.on('data', data => { out += data })
      child.stderr.on('data', data => { out += data })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', code => {
        clearTimeout(timer)
        done({ code, out: timedOut ? `Browser process timed out and was killed.\n${out}` : out })
      })
      child.stdin.end(script)
    })
    await writeFile(resolve(dir,'ego.log'),result.out)
    assert.equal(result.code,0,result.out)
    const report=JSON.parse(await readFile(resolve(dir,'result.json'),'utf8'))
    assert.equal(report.pass,true);assert.equal(report.finished,true);assert.equal(report.views.length,2)
  } finally {
    await fixture.close()
    let saved
    try { saved = JSON.parse(await readFile(resolve(dir, 'result.json'), 'utf8')) } catch {}
    let owned
    try { owned = JSON.parse(await readFile(resolve(dir, 'owned-space.json'), 'utf8')) } catch {}
    let browserCleanup = saved?.finished ? 'finished-in-task' : 'no-recorded-space'
    if (!saved?.finished && Number.isSafeInteger(owned?.spaceId)) {
      const recoveryScript = `
const fs = await import('node:fs/promises');
const result = { spaceId: ${owned.spaceId} };
try {
  const spaces = await listTaskSpaces();
  const owned = spaces.find(space => space.id === result.spaceId);
  if (!owned) result.absent = true;
  else {
    if (owned.ownership !== 'agent') throw new Error('Recorded space is no longer agent-owned');
    const task = await taskSpace(result.spaceId);
    await task.finish({ keep: [] });
    result.finished = true;
  }
} catch (error) { result.error = String(error); }
await fs.writeFile(${JSON.stringify(resolve(dir, 'browser-cleanup.json'))}, JSON.stringify(result, null, 2));
`
      browserCleanup = await new Promise(done => {
        const child = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'ignore', 'pipe'] })
        let error = ''
        const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
        child.stderr.on('data', data => { error += data })
        child.on('error', failure => { clearTimeout(timer); done({ error: String(failure) }) })
        child.on('close', code => { clearTimeout(timer); done({ code, error }) })
        child.stdin.end(recoveryScript)
      })
    }
    await writeFile(resolve(dir, 'cleanup.json'), JSON.stringify({ serverClosed: true, url: fixture.url, browserCleanup }))
  }
})
