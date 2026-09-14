// Run through ego-browser nodejs with const qaUrl and evidenceDir supplied by launcher.
// Requires the task-private packaged shell profile and persisted explicit QA user turn.
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const task = await taskSpace('Issue1761 native sidebar acceptance');
const page = task.page('p1');
const records = [];
const expand = '[data-sidebar-right-expand]';
const toggle = '[data-sidebar-right-toggle]';
const full = '[data-sidebar-right-mode="fullscreen"]';
const split = '[data-sidebar-right-mode="push"]';
async function click(selector) {
  const hit = await page.evaluate(selector => {
    const es = [...document.querySelectorAll(selector)].filter(e => {
      const r=e.getBoundingClientRect(),c=getComputedStyle(e);
      return r.width>0&&r.height>0&&c.visibility==='visible'&&r.right>0&&r.left<innerWidth;
    });
    if(es.length!==1)return {count:es.length};
    const e=es[0],r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    return {count:1,x,y,hit:e.contains(document.elementFromPoint(x,y))};
  }, selector);
  records.push({action:selector,hit,at:Date.now()});
  assert.equal(hit.count,1,`unique visible control ${selector}`);
  assert.equal(hit.hit,true,`hit-tested control ${selector}`);
  records.push({receipt:await page.click(selector),at:Date.now()});
}
async function state() {
  return page.evaluate(() => {
    function box(s){const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {rect:r.toJSON(),visible:c.display!=='none'&&c.visibility==='visible'&&Number(c.opacity)>0&&r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight,mode:e.getAttribute('data-sidebar-right-panel'),open:e.getAttribute('data-sidebar-right-open'),hidden:e.getAttribute('aria-hidden'),grid:c.gridTemplateColumns};}
    const tabs=[...document.querySelectorAll('[data-dockkit-tab]')];
    const files=tabs.find(e=>e.textContent.trim()==='Files');
    const r=files?.getBoundingClientRect();
    return {at:Date.now(),viewport:innerWidth,frame:box('.dshDesktopFrame'),left:box('.dshDesktopSidebarSurface'),chat:box('.dshDesktopConversationSurface'),track:box('.dshDesktopRightbarSurface'),panel:box('[data-sidebar-right-panel]'),composer:box('.dshDesktopConversationSurface [role="textbox"], .dshDesktopConversationSurface textarea, .dshDesktopConversationSurface [contenteditable="true"]'),filesVisible:!!r&&r.width>0&&r.left>=0&&r.right<=innerWidth+1,content:document.querySelector('[data-sidebar-right-panel]')?.textContent,chatText:document.querySelector('.dshDesktopConversationSurface')?.textContent,folded:document.querySelector('.dshDesktopFrame')?.hasAttribute('data-sidebar-collapsed')};
  });
}
async function expectState(label, mode, rail, open=true) {
  let previous='', stable=0,last;
  for(let i=0;i<60;i++) {
    last=await state(); records.push({label,sample:i,...last});
    const {panel,chat,left,track,frame}=last;
    const geometry=[panel,chat,left,track].map(e=>e&&Object.values(e.rect).map(Math.round));
    const signature=JSON.stringify(geometry);
    stable=signature===previous?stable+1:0; previous=signature;
    const railOk=left.visible&&Math.abs(left.rect.width-rail)<2;
    const closedOk=(!panel||panel.hidden==='true')&&track.rect.width<1&&chat.visible&&Math.abs(chat.rect.width+rail-frame.rect.width)<2&&last.composer?.visible&&!!last.chatText?.includes('QA 测试种子：侧栏切换验收。此文本仅用于隔离测试；未请求模型生成。');
    const openOk=panel?.open==='true'&&panel.mode===mode&&panel.visible&&panel.rect.left>=rail-2&&panel.rect.right<=last.viewport+2&&last.filesVisible&&!!last.content?.includes('/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-sidebar-toggle-issue-1761')&&!!last.content?.includes('AGENTS.md')&&(mode==='fullscreen'?Math.abs(panel.rect.width+rail-frame.rect.width)<2:track.rect.width>100&&chat.visible&&Math.abs(chat.rect.right-panel.rect.left)<2&&Math.abs(track.rect.left-panel.rect.left)<2&&Math.abs(track.rect.width-panel.rect.width)<2&&Math.abs(track.rect.width+chat.rect.width+rail-frame.rect.width)<2);
    if(stable>=3&&railOk&&(open?openOk:closedOk)){records.push({passed:label,...last});return last;}
    await page.evaluate(()=>new Promise(r=>setTimeout(r,100)));
  }
  assert.fail(`Expected ${label}: ${JSON.stringify(last)}`);
}
try {
  await page.goto(qaUrl);
  await page.waitForSelector(expand,{timeout:15000});
  const identity=await page.evaluate(async()=>{const entry=window.__DSH_BOOT__.entries.find(x=>x.id==='omnimux');const text=await(await fetch(entry.url)).text();return {entry,bytes:text.length,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join(''),origin:location.origin};});
  records.push({identity});
  let s=await state();const rail=s.left.rect.width;
  await expectState('initial','push',rail,false);
  records.push({legacyPreflight:await page.evaluate(()=>({snapshot:window.__omnimuxWorkbench?.getSnapshot(),cluster:!!document.querySelector('[data-dsh-toggle-cluster], [class*="toggleCluster"]')}))});
  await click('button[aria-label="收起侧边栏"]');
  await expectState('cold-folded-before-open','push',56,false);
  await click(expand);await expectState('cold-first-open','push',56);
  await click(toggle);await expectState('cold-first-close','push',56,false);
  await click('button[aria-label="打开侧边栏"]');
  await expectState('cold-left-restored','push',rail,false);
  for(let cycle=0;cycle<3;cycle++){
    await click(expand);await expectState(`push-${cycle}`,'push',rail);
    await click(toggle);await expectState(`push-close-${cycle}`,'push',rail,false);
  }
  await click(expand);await expectState('push-before-full','push',rail);
  await click(full);await expectState('full','fullscreen',rail);
  for(let cycle=0;cycle<3;cycle++){
    await click(toggle);await expectState(`full-close-${cycle}`,'fullscreen',rail,false);
    await click(expand);await expectState(`full-reopen-${cycle}`,'fullscreen',rail);
  }
  await page.screenshot({path:evidenceDir+'/formal-full.png'});
  await click(split);await expectState('exit-full','push',rail);
  await click('button[aria-label="收起侧边栏"]');
  await expectState('folded-split','push',56);
  await click(full);await expectState('folded-full','fullscreen',56);
  await click(toggle);await expectState('folded-close','fullscreen',56,false);
  await click(expand);await expectState('folded-reopen','fullscreen',56);
  await click(split);await expectState('folded-exit','push',56);
  await page.screenshot({path:evidenceDir+'/formal-folded.png'});
  await page.reload();
  records.push({afterReload:await page.snapshot()});
  await page.waitForSelector(expand,{timeout:15000});
  s=await state(); records.push({reload:s});
  // Reload mounts the closed conversation first; native panel mounts on demand.
  assert.equal(s.folded,false,'native shell reload starts with default expanded rail');
  await click(expand);await expectState('reload-reopen','push',280);
  await click(toggle);await expectState('reload-right-close','push',280,false);
  await click(expand);await expectState('reload-right-reopen','push',280);
  await click(toggle);await expectState('before-narrow','push',280,false);
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:640,height:800,deviceScaleFactor:1,mobile:false});
  await click(expand);await expectState('narrow-auto-full','fullscreen',56);
  await click(toggle);await expectState('narrow-full-close','fullscreen',56,false);
  await click(expand);await expectState('narrow-full-reopen','fullscreen',56);
  await click(split);await expectState('narrow-exit','push',56,false);
  await page.screenshot({path:evidenceDir+'/formal-narrow.png'});
  records.push({result:'passed'});
} catch(error) {records.push({error:String(error)});throw error;} finally {
  try { writeFileSync(evidenceDir+'/formal-native.json',JSON.stringify(records,null,2)); }
  finally { await task.finish({keep:[]}); }
}
