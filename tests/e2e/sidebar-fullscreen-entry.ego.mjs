// Single top-level owner. Invoke via dynamic import from ego-browser nodejs.
import { requireConfig, runVerified } from './sidebar-run.mjs'
import { observeMotion } from './sidebar-fullscreen-motion.ego.mjs'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
export async function runEntry(taskSpace, env) {
 const {spaceId,output}=requireConfig(env)
 const task=await taskSpace(spaceId)
 let page,caseId='prepare',captureIndex=0
 const caseFailures=[]
 const required=['1440-expanded','1440-collapsed','1200-expanded','1200-collapsed','1024-expanded','1024-collapsed','reversal','reduced','reopen','content-scroll','video']
 let dirReady=false
 const capture=async error=>{
  const failures=[],prefix=output+'/failure-'+caseId+'-'+captureIndex++
  try {const data=await page.evaluate(()=>({buttons:[...document.querySelectorAll('button[data-sidebar-right-mode]')].map(b=>{const r=b.getBoundingClientRect();return{html:b.outerHTML,rect:r.toJSON(),ancestors:[...function*(e){while(e){yield e;e=e.parentElement}}(b)].map(e=>({tag:e.tagName,cls:e.className,inert:e.inert,hidden:e.hidden})),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,2000)}})}));if(dirReady)await fs.writeFile(prefix+'.json',JSON.stringify({error:String(error),...data},null,2))}catch(e){failures.push(String(e))}
  try{if(dirReady)await page.screenshot({path:prefix+'.png'})}catch(e){failures.push(String(e))}
  if(failures.length)throw Error(failures.join('; '))
 }
 const settle=()=>page.evaluate(()=>new Promise((resolve,reject)=>{let since=null,last=null;const start=performance.now();function poll(){const p=document.querySelector('[data-sidebar-right-panel]'),r=p?.getBoundingClientRect(),key=r&&r.x+':'+r.width;if(r?.width>0&&!p.getAnimations().some(a=>a.playState==='running')&&key===last)since??=performance.now();else since=null;last=key;if(since&&performance.now()-since>=500)return resolve();if(performance.now()-start>2000)return reject(Error('unstable starting geometry'));requestAnimationFrame(poll)}poll()}))
 const result=await runVerified({required,capture,cleanup:async()=>{const errors=[];try{if(page)await page.cdp('Emulation.setEmulatedMedia',{features:[]})}catch(e){errors.push(String(e))}try{await task.finish({keep:[]})}catch(e){errors.push(String(e))}if(errors.length)throw Error(errors.join('; '))},execute:async mark=>{
  page=task.page('p1')
  await fs.mkdir(output);dirReady=true
  const attempt=async(id,fn)=>{caseId=id;try{await fn();mark(id)}catch(e){caseFailures.push({id,error:String(e)});await capture(e).catch(err=>caseFailures.push({id,error:String(err)}))}}
  for(const [width,height] of [[1440,900],[1200,800],[1024,900]])for(const collapsed of [false,true]){
   const id=width+'-'+(collapsed?'collapsed':'expanded')
   await attempt(id,async()=>{
   await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
   const current=await page.evaluate(()=>document.querySelector('.dshDesktopSidebarSurface').getBoundingClientRect().width<1)
   if(current!==collapsed)await page.click('button[data-omnimux-sidebar-toggle-topbar]')
   await page.evaluate(()=>window.__omnimuxWorkbench.open({tabId:'editor',path:'specs/sidebar-fullscreen-entry.spec.md',focus:'split'}))
   await settle()
   const initial=await page.evaluate(()=>document.querySelector('[data-sidebar-right-panel]').getBoundingClientRect().toJSON()),timings=[]
   for(const label of ['Fullscreen','Exit fullscreen']){
    await observeMotion(page,[label],async data=>{
     await fs.writeFile(output+'/'+id+'-'+label.replace(' ','-')+'.json',JSON.stringify(data,null,2))
     assert.equal(data.clicks.length,1);assert.ok(data.clicks.every(e=>e.trusted));assert.ok(data.samePanel)
     const start=data.clicks[0],end=data.frames.at(-1),frames=data.frames.filter(f=>f.t>=start.t)
     assert.ok(frames.every(f=>f.x>=f.left-1&&Math.abs(f.right-width)<=1&&Math.abs(f.left-start.left)<=1))
     assert.equal(end.mode,label==='Fullscreen'?'fullscreen':'push')
     assert.ok(Math.abs(end.x-(label==='Fullscreen'?start.left:initial.x))<=1)
     assert.ok(Math.abs(end.width-(label==='Fullscreen'?width-start.left:initial.width))<=1)
     const fraction=f=>(f.x-start.x)/(end.x-start.x),a=frames.find(f=>fraction(f)>=.1),b=frames.find(f=>fraction(f)>=.9)
     assert.ok(a&&b);const gaps=frames.slice(1).map((f,i)=>f.t-frames[i].t).sort((a,b)=>a-b)
     timings.push({duration:b.t-a.t,period:gaps[Math.floor(gaps.length/2)]})
     assert.ok(new Set(frames.filter(f=>Math.abs(f.x-start.x)>1&&Math.abs(f.x-end.x)>1).map(f=>f.x)).size>=2,'two intermediate samples required')
     let backwards=0;const sign=label==='Fullscreen'?-1:1
     for(let i=1;i<frames.length;i++)backwards+=Math.max(0,-sign*(frames[i].x-frames[i-1].x))
     assert.ok(backwards<=2,'cumulative reversal exceeds 2px')
    })
    await page.screenshot({path:output+'/'+id+'-'+label.replace(' ','-')+'.png'})
   }
   assert.ok(Math.abs(timings[0].duration-timings[1].duration)<=Math.max(2*Math.max(...timings.map(t=>t.period)),.2*Math.max(...timings.map(t=>t.duration))))
   })
  }
  await attempt('reversal',async()=>{
  await page.evaluate(()=>window.__omnimuxWorkbench.open({tabId:'editor',path:'specs/sidebar-fullscreen-entry.spec.md',focus:'split'}));await settle()
  await observeMotion(page,['Fullscreen','Exit fullscreen','Fullscreen'],async data=>{
   await fs.writeFile(output+'/reversal.json',JSON.stringify(data,null,2))
   assert.equal(data.clicks.length,3);assert.ok(data.clicks.every(c=>c.trusted));assert.ok(data.samePanel)
   for(const c of data.clicks.slice(1))assert.ok(c.animations.some(a=>a.state==='running'&&a.progress>0&&a.progress<1),'reversal must land during active width animation')
  })
  })
  await attempt('reduced',async()=>{
  await page.evaluate(()=>window.__omnimuxWorkbench.open({tabId:'editor',path:'specs/sidebar-fullscreen-entry.spec.md',focus:'split'}));await settle()
  await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await page.click('button[aria-label="Fullscreen"]');await settle()
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-sidebar-right-panel]')).transitionProperty),'none')
  })
  await attempt('reopen',async()=>{
  await page.cdp('Emulation.setEmulatedMedia',{features:[]})
  await page.click('button[aria-label="Exit fullscreen"]');await settle()
  await page.click('button[data-sidebar-right-toggle]')
  await page.waitForFunction(()=>!document.querySelector('[data-sidebar-right-panel]').hasAttribute('data-sidebar-right-open'))
  await page.evaluate(()=>window.__omnimuxWorkbench.open({tabId:'editor',path:'specs/sidebar-fullscreen-entry.spec.md',focus:'split'}));await settle()
  })
  await attempt('content-scroll',async()=>{
   await page.evaluate(()=>{window.__scrollContent=document.querySelector('[class*="_editorMd"]');window.__scrollContent.scrollTop=100;window.__scrollSaved=window.__scrollContent.scrollTop;window.__navCount=performance.getEntriesByType('navigation').length})
   for(const label of ['Fullscreen','Exit fullscreen']){await page.click('button[aria-label="'+label+'"]');await settle()}
   const data=await page.evaluate(()=>({same:window.__scrollContent===document.querySelector('[class*="_editorMd"]'),connected:window.__scrollContent.isConnected,scroll:window.__scrollContent.scrollTop,before:window.__scrollSaved,navSame:window.__navCount===performance.getEntriesByType('navigation').length}))
   await fs.writeFile(output+'/content-scroll.json',JSON.stringify(data));assert.ok(data.same&&data.connected&&data.navSame);assert.equal(data.scroll,data.before)
  })
  await attempt('video',async()=>{throw Error('BLOCKED: complete playable recording must be supplied by a verified native recording capability; sparse frames do not satisfy this case')})
 }})
 result.caseFailures=caseFailures
 if(dirReady)await fs.writeFile(output+'/result.json',JSON.stringify(result,null,2))
 else console.error(JSON.stringify(result))
 return result
}
