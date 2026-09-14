// Motion observer only. The importing owner controls space lifetime.
export async function observeMotion(page, labels, save) {
 await page.evaluate(() => {
  const panel=document.querySelector('[data-sidebar-right-panel]'),frames=[],clicks=[]
  let active=true
  const sample=()=>{const r=panel.getBoundingClientRect(),l=document.querySelector('.dshDesktopSidebarSurface').getBoundingClientRect();return{t:performance.now(),x:r.x,width:r.width,right:r.right,left:l.right,animations:panel.getAnimations().filter(a=>a.transitionProperty==='width').map(a=>({state:a.playState,progress:a.effect.getComputedTiming().progress})),mode:panel.getAttribute('data-sidebar-right-panel')}}
  const click=e=>{const b=e.target.closest('button[data-sidebar-right-mode]');if(b)clicks.push({...sample(),trusted:e.isTrusted,label:b.getAttribute('aria-label')})}
  document.addEventListener('click',click,true)
  window.__sidebarMotion={frames,clicks,panel,stop:()=>{active=false;document.removeEventListener('click',click,true)}}
  function tick(){frames.push(sample());if(active)requestAnimationFrame(tick)}tick()
 })
 let primary,failed=false
 try {
  for(let i=0;i<labels.length;i++) {
   if(i)await page.waitForFunction(()=>window.__sidebarMotion.frames.at(-1)?.animations.some(a=>a.state==='running'&&a.progress>.12&&a.progress<.85),{timeout:2000})
   await page.click('button[aria-label="'+labels[i]+'"]')
  }
  await page.evaluate(()=>new Promise((resolve,reject)=>{const q=window.__sidebarMotion,start=q.clicks[0]?.t??performance.now();let stable=null,last=null;function poll(){const r=q.panel.getBoundingClientRect(),key=r.x+':'+r.width,now=performance.now();if(!q.panel.getAnimations().some(a=>a.playState==='running')&&key===last)stable??=now;else stable=null;last=key;if(stable&&now-stable>=500)return resolve();if(now-start>2000)return reject(Error('motion did not settle within 2s'));requestAnimationFrame(poll)}poll()}))
 } catch(e){failed=true;primary=e instanceof Error?e:new Error(String(e))}
 try {
  const data=await page.evaluate(()=>{const q=window.__sidebarMotion;q.stop();return{frames:q.frames,clicks:q.clicks,samePanel:q.panel===document.querySelector('[data-sidebar-right-panel]')}})
  await save(data)
 } catch(e){if(failed)primary.secondaryErrors=[e?.message??String(e)];else{failed=true;primary=e}}
 if(failed)throw primary
}
