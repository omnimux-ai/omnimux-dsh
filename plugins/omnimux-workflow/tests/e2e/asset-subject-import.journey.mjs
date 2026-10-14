import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
export default async function journey({send,sleep,evidenceDir,io}) {
 const proof=JSON.parse(fs.readFileSync(process.env.ISSUE3307_PROOF,'utf8'));
 const assertions=[];
 await send('Runtime.evaluate',{expression:`window.__assetRequests=[];const originalFetch=window.fetch;window.fetch=async(...args)=>{const response=await originalFetch(...args);if(String(args[0]).includes('/assets/instantiate'))window.__assetRequests.push({url:String(args[0]),status:response.status,body:await response.clone().text()});return response;};`});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const poll=async(expression,timeout=30000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const result=await evaluate(expression);if(result)return result;await sleep(300);}throw new Error('Timed out: '+expression);};
 const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});io.writeFileSync(join(evidenceDir,name+'.png'),Buffer.from(r.data,'base64'));};
 const observe=async name=>{const state=await evaluate(`JSON.stringify({url:location.href,text:document.body.innerText,buttons:[...document.querySelectorAll('button')].map(e=>({text:e.textContent,title:e.title,aria:e.getAttribute('aria-label')}))})`);io.writeFileSync(join(evidenceDir,name+'.json'),state);return JSON.parse(state);};
 const click=async selector=>{const point=await evaluate(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.getBoundingClientRect().width>0);if(els.length!==1)throw new Error('click selector matches '+els.length);els[0].click();return {x:0,y:0};})()`);};
 const clickText=async(text)=>{const point=await evaluate(`(()=>{const els=[...document.querySelectorAll('button,a,[role="button"]')].filter(e=>(e.textContent||'').trim()===${JSON.stringify(text)}&&e.getBoundingClientRect().width>0);if(els.length!==1)throw new Error('text click '+${JSON.stringify(text)}+' matches '+els.length);els[0].click();return {x:0,y:0};})()`);};
 const request=(path,method='GET',body)=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'content-type':'application/json'},body:${body===undefined?'undefined':JSON.stringify(JSON.stringify(body))}});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify({status:r.status,j}));return j;})()`);
 try {
  await observe('journey-start');
  const name='主体点击3307 · 两图合成验收';
  const library=await request('/omnimux/assets/library','POST',{name,type:'character',tags:['合成验收'],files:proof.files.map((real_path,i)=>({real_path,original_name:`subject-${i}.png`}))});
  assert.equal(library.asset.files.length,2);assert.ok(library.asset.files.every(f=>fs.realpathSync(f.real_path).startsWith(proof.privateHome+'/')));
  const wsid='ws_subject_click_3307';
  const created=await request('/omnimux-workflow/api/workspaces','POST',{id:wsid,name:'主体点击 · 两图验收'});
  await request('/omnimux-workflow/api/workspaces/'+wsid,'PUT',{expectedVersion:created.workspace.version,nodes:[],edges:[]});
  // Prefer the current native session's canvas action if exposed; its visible labels are retained before deciding fallback.
  const state=await observe('native-entry-candidates');
  const nativeCanvas=state.buttons.find(b=>b.aria==='打开创作画布');
  let bound=false;
  let nativeReady=false;
  if(nativeCanvas){await clickText(nativeCanvas.text.trim());try{await poll('Boolean(document.querySelector(".react-flow"))',10000);nativeReady=true;}catch(error){await observe('native-entry-not-ready');}}
  if(nativeReady) throw new Error('Native unbound canvas opened; observed canvas identity must be resolved before save verification (no false use of synthetic workspace id)');
  else {
   bound=true;
   const sessionId=await evaluate(`window.__omnimuxWorkflow.sessions.create({workspaceId:${JSON.stringify(proof.workspaceId)}})`);
   const project=await request('/omnimux-workflow/api/projects','POST',{title:'主体点击 · 两图验收',projectRoot:proof.workspacePath,sessionId,canvasWorkspaceIds:[wsid]});
   await click('[data-dsh-omnimux-workflow-entry]');
   await poll(`document.body.innerText.includes('主体点击 · 两图验收')`);
   await click('button[aria-label="主体点击 · 两图验收"]');
   await poll(`Boolean(document.querySelector('button[aria-label="打开创作页 主体点击 · 两图验收"]'))`);
   await click('button[aria-label="打开创作页 主体点击 · 两图验收"]');
   io.writeFileSync(join(evidenceDir,'bound-fallback.json'),JSON.stringify({projectId:project.project.id,reason:'No native canvas button visible in observed full application session',serverUnboundCoverage:'Parent independent server tests; not browser-proven here'}));
  }
  await poll('Boolean(document.querySelector(".react-flow"))');
  await observe('canvas-entry');
  const canvasProof=proof.installed.find(item=>item.name==='omnimux-workflow'&&item.file==='lib/canvas.js');
  const loadedHash=await evaluate(`(async()=>{const script=[...document.scripts].find(s=>s.src.includes('/omnimux-workflow/canvas.js'));if(!script)throw new Error('Actual canvas script missing');const bytes=await (await fetch(script.src)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');})()`);
  assert.equal(loadedHash,canvasProof.sha256);assertions.push({name:'loaded-canvas-equals-worktree-build',pass:true,detail:{sha256:loadedHash}});
  assert.equal(await evaluate('document.querySelectorAll(".react-flow__node").length'),0);
  await capture('before-click-empty');
  const toolbar=await observe('toolbar');
  const assets=toolbar.buttons.find(b=>b.title==='素材'||b.text?.trim()==='素材'||/素材/.test(b.title||''));assert.ok(assets,'Native assets toolbar missing');
  await click('button[title="项目资产"]');
  await poll('Boolean(document.querySelector(".wf-assets-drawer-root"))');
  await click('.wf-assets-drawer-root .wf-segmented-tab-compact:nth-child(2)');
  await poll('Boolean(document.querySelector(".wf-subject-hero-card-compact"))');
  await click('.wf-subject-hero-card-compact');
  await poll('Boolean(document.querySelector(".wf-subject-card-compact"))');
  const cardSelector='.wf-subject-card-compact';
  await observe('subject-cards');
  const cards=await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(cardSelector)})).map(e=>({text:e.textContent,img:!!e.querySelector('img'),ready:!!e.querySelector('img')?.naturalWidth}))`);
  assert.equal(cards.filter(c=>c.text.includes(name)).length,1);assert.ok(cards.find(c=>c.text.includes(name)).ready);
  await capture('two-image-subject-card');
  // Only the one synthetic card is present in this strictly private asset library.
  await click(cardSelector);
  await poll('document.querySelectorAll(".react-flow__node").length===2');
  await capture('after-single-click-two-images');
  assertions.push({name:'single-click-adds-two-native-nodes',pass:true,detail:{boundFallback:bound,assetId:library.asset.id}});
  const saved=await poll(`(async()=>{const r=await fetch('/omnimux-workflow/api/workspaces/${wsid}');const j=await r.json();return j.workspace?.nodes?.length===2?j:false;})()`);
  io.writeFileSync(join(evidenceDir,'saved-workspace.json'),JSON.stringify(saved,null,2));
  await send('Page.reload');
  await poll('document.querySelectorAll(".react-flow__node").length===2');
  await poll('Array.from(document.querySelectorAll(".react-flow__node img")).filter(i=>i.naturalWidth>0).length>=2');
  await capture('refreshed-two-images');
  assertions.push({name:'saved-refreshed-two-decoded-images',pass:true});
  await observe('final-state');
 }catch(error){io.writeFileSync(join(evidenceDir,'instantiate-responses.json'),JSON.stringify(await evaluate('window.__assetRequests'),null,2));io.writeFileSync(join(evidenceDir,'failure-api.json'),JSON.stringify(await evaluate(`(async()=>{const paths=['/omnimux-workflow/api/workspaces/ws_subject_click_3307','/omnimux-workflow/api/workspaces/ws_subject_click_3307/assets'];return await Promise.all(paths.map(async path=>({path,status:(await fetch(path)).status,body:await (await fetch(path)).text()})));})()`),null,2));await capture('failure-state');await observe('failure-state');assertions.push({name:'subject-click-journey',pass:false,detail:error.message});}
 return {assertions};
}
