// Executed by ego-browser nodejs; URL/output are prepended by the test runner.
const fs=await import('node:fs/promises');
const assert=(await import('node:assert/strict')).default;
const task=await taskSpace('1760 formal '+out);
console.log('SPACE_ID='+task.spaceId);
const p=task.page('p1'), results=[];
async function save(name){
 const record=await p.evaluate(()=>({state:window.__panel.snapshot(),capture:window.__panel.lastCapture||null,dom:document.querySelector('section').innerText,errors:window.__errors}));
 record.snapshot=await p.snapshot();
 record.geometry=await p.evaluate(()=>{const r=document.querySelector('section').getBoundingClientRect();return {width:r.width,height:r.height};});
 assert(record.geometry.width>0&&record.geometry.height>0);assert.deepEqual(record.errors,[]);
 await p.screenshot({path:out+'/'+name+'.png'});await fs.writeFile(out+'/'+name+'.json',JSON.stringify(record,null,2));results.push(name);return record;
}
async function load(scene){await p.goto(url+'/?scene='+scene);await p.waitForFunction(()=>window.__panel&&document.querySelector('button[aria-label="生成"]'));}
async function generate(){await p.evaluate(()=>window.__panel.lastCapture=null);await p.click('button[aria-label="生成"]');await p.waitForFunction(()=>window.__panel.lastCapture);return await p.evaluate(()=>window.__panel.lastCapture);}
async function blocked(name){
 await p.waitForFunction(()=>document.querySelector('button[aria-label="生成"]').getAttribute('aria-disabled')==='true');
 await p.waitForFunction(()=>!window.__panel.capturePending);
 await p.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
 const startedBefore=await p.evaluate(()=>window.__panel.captureStarted||0);
 const before=await p.evaluate(()=>fetch('/captures').then(r=>r.json()).then(a=>a.length));
 const b=await p.evaluate(()=>{const r=document.querySelector('button[aria-label="生成"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
 await p.mouse.click(b.x,b.y);
 // A bounded quiet window is supplementary; the synchronous bridge start counter
 // detects slow submissions before the server completion ledger can observe them.
 await p.evaluate(()=>new Promise(resolve=>setTimeout(resolve,350)));
 await p.waitForFunction(()=>!window.__panel.capturePending);
 const startedAfter=await p.evaluate(()=>window.__panel.captureStarted||0);
 const after=await p.evaluate(()=>fetch('/captures').then(r=>r.json()).then(a=>a.length));
 assert.equal(startedAfter,startedBefore);assert.equal(after,before);await save(name);
 await fs.writeFile(out+'/'+name+'-guard.json',JSON.stringify({before,after,startedBefore,startedAfter,quietWindowMs:350,submitDelta:after-before,physicalClick:b},null,2));
}
try{
 for(const scene of ['text-empty','empty-first-image','empty-first-audio','empty-first-video','no-text-operation','optional-invalid']){
  await load(scene);
  const cards=await p.evaluate(()=>[...document.querySelectorAll('[data-testid="wf-text-inputs"] [data-source-node-id]')].map(e=>({width:getComputedStyle(e).width,height:getComputedStyle(e).height})));
  const captured=await generate();assert.equal(captured.requests.length,1);const request=captured.requests[0];
  if(scene==='text-empty'){assert.deepEqual(cards,[{width:'44px',height:'44px'}]);assert.equal(request.prompt,'1dog');}
  if(scene==='empty-first-image'){assert.equal(request.references.length,1);assert(request.references[0].pathOrUrl.endsWith('/a.svg'));}
  if(scene==='empty-first-audio')assert.equal(request.references.length,1);
  if(['empty-first-video','no-text-operation'].includes(scene)){assert.equal(cards.length,0);assert(!request.prompt);assert.equal(request.references.length,1);}
  if(scene==='empty-first-video'){assert.equal(request.references[0].type,'video');await p.waitForFunction(()=>document.querySelector('section video')?.videoWidth>0);}
  if(scene==='optional-invalid'){assert.equal(request.references?.length||0,0);assert.match(await p.evaluate(()=>document.querySelector('section').innerText),/未使用|不可用/);}
  await save(scene);
 }
 await load('required-frame');await blocked('required-frame');
 await load('text-empty');await p.evaluate(()=>window.__panel.patch('正文甲',{generatedContent:''}));await p.waitForFunction(()=>!document.querySelector('[data-testid="wf-text-inputs"] [data-source-node-id]'));await save('dynamic-empty');
 await p.evaluate(()=>window.__panel.patch('正文甲',{generatedContent:'恢复新正文'}));await p.waitForFunction(()=>document.querySelector('[data-testid="wf-text-inputs"]')?.textContent.includes('恢复新正文'));assert.equal((await generate()).requests[0].prompt,'恢复新正文');await save('dynamic-restored');
 await p.evaluate(()=>window.__panel.patch('正文甲',{generatedContent:'长正文全文预览。'.repeat(50)}));await p.waitForFunction(()=>document.querySelector('[data-testid="wf-text-inputs"]')?.textContent.includes('长正文'));await p.click('[data-testid="wf-text-inputs"] [role="button"]');await p.waitForFunction(()=>document.querySelector('.wf-slot-hover-preview'));assert.deepEqual(await p.evaluate(()=>{const s=getComputedStyle(document.querySelector('[data-testid="wf-text-inputs"] [role="button"]'));return [s.width,s.height];}),['44px','44px']);await save('long-preview');await p.keyboard.press('Escape');
 await load('single-frame-params');
 assert((await p.evaluate(()=>document.querySelector('section').innerText)).includes('参数“duration”不支持值 10'));
 await blocked('single-frame-invalid-duration');
 await p.click('button[aria-label="16:9 1080P 10s"]');
 const durationMenu=await p.snapshot();assert(durationMenu.includes('时长'));
 assert.equal(await p.evaluate(()=>document.querySelectorAll('[role="radiogroup"][aria-label="时长"] [role="radio"]').length),1);
 await p.click('[role="radiogroup"][aria-label="时长"] [role="radio"]');await p.keyboard.press('Escape');
 const validDuration=await generate();assert.equal(validDuration.requests.length,1);assert.equal(validDuration.requests[0].duration,5);assert.equal(validDuration.requests[0].operation,'first_frame');assert.equal(validDuration.requests[0].prompt,'1dog');assert.equal(validDuration.requests[0].references.length,1);assert(validDuration.requests[0].references[0].pathOrUrl.endsWith('/a.svg'));await save('single-frame-valid-duration');
 for(const type of ['text','image','video','audio']){
  await load(type);assert((await p.evaluate(()=>document.querySelector('section').innerText)).includes('1dog'));
  const r=await generate();assert.equal(r.requests.length,1);assert.equal(r.requests[0].prompt,'1dog');assert.equal(r.requests[0].references?.length||0,0);await save(type);
 }
 await load('ordered');await p.evaluate(()=>{const s=window.__panel.snapshot();window.__panel.setEdges([...s.edges,{...s.edges[0],id:'duplicate'}]);document.querySelector('section').style.width='320px';});
 await p.fill('loc=role:textbox[name="补充要求（可选）"]','缩短到30秒');let r=await generate();
 assert.equal(r.requests[0].prompt,'来源 1：\n乙段\n\n来源 2：\n甲段\n\n补充要求：\n缩短到30秒');await save('ordered-narrow');
 await p.evaluate(()=>window.__panel.patch('正文甲',{generatedContent:'',content:'OLD'}));r=await generate();assert.equal(r.requests[0].prompt,'来源 1：\n乙段\n\n补充要求：\n缩短到30秒');await save('empty-text-omitted');
 await p.evaluate(()=>window.__panel.setEdges([]));await p.waitForFunction(()=>!document.querySelector('section').innerText.includes('等待上游'));r=await generate();assert.equal(r.requests[0].prompt,'缩短到30秒');await save('disconnected');
 await load('mixed');r=await generate();assert.equal(r.requests[0].references.length,1);assert(r.requests[0].references[0].pathOrUrl.endsWith('/a.svg'));await save('mixed');
 await p.evaluate(()=>{const a={sourceNodeId:'图片甲',edgeId:'edge-1',outputId:location.origin+'/media/a.svg',pinned:true};window.__panel.patch('target',{slotBindings:{images:[a,{...a}]}});});r=await generate();assert.equal(r.requests[0].references.length,1);await save('duplicate-occupant');
 await p.evaluate(()=>window.__panel.patch('target',{slotBindings:{removed:[{sourceNodeId:'图片甲',edgeId:'edge-1',outputId:location.origin+'/media/a.svg',pinned:true}]}}));r=await generate();assert.equal(r.requests.length,1);assert(r.requests[0].references[0].pathOrUrl.endsWith('/b.svg'));await save('obsolete-slot-auto-filled');
 await load('frames');await p.click('button[aria-label="对调首尾帧"]');r=await generate();assert.deepEqual(r.requests[0].references.map(x=>[x.role,x.pathOrUrl.slice(-5)]),[['first_frame','b.svg'],['last_frame','a.svg']]);await save('swap');
 await load('frames');await p.click('button[aria-label="first_last_frame 16:9 1080P 5s"]');await p.click('loc=role:radio[name="first_frame"]');await p.keyboard.press('Escape');r=await generate();assert.equal(r.requests[0].operation,'first_frame');assert.equal(r.requests[0].references.length,1);await save('first-frame');
 await p.click('button[aria-label="first_frame 16:9 1080P 5s"]');await p.click('loc=role:radio[name="video_multi_ref"]');await p.keyboard.press('Escape');r=await generate();assert.equal(r.requests[0].operation,'video_multi_ref');assert.equal(r.requests[0].references.length,2);assert(r.requests[0].references.every(x=>x.role==='reference'));await save('multi-ref');
 await p.evaluate(()=>window.__panel.setEdges([]));await blocked('explicit-disconnected');assert.equal(await p.evaluate(()=>window.__panel.snapshot().nodes.find(n=>n.id==='target').data.params.operation),'video_multi_ref');
 await load('music');await p.hover('loc=role:button[name="音频甲"]');await p.waitForFunction(()=>document.querySelector('audio')?.readyState>=2);
 const audio=await p.evaluate(()=>{const a=document.querySelector('audio'),r=a.getBoundingClientRect();return {ready:a.readyState,duration:a.duration,controls:a.controls,width:r.width,height:r.height};});assert.equal(audio.duration,1);assert(audio.controls&&audio.width>0&&audio.height>0);await save('audio-hover');
 r=await generate();assert.equal(r.requests[0].references.length,1);assert.equal(r.requests[0].references[0].type,'audio');await save('music-submit');
 await fs.writeFile(out+'/browser-result.json',JSON.stringify({status:'passed',results,audio},null,2));
}finally{await task.finish({keep:[]});await fs.writeFile(out+'/browser-cleanup.json',JSON.stringify({spaceId:task.spaceId,closed:true}));}
