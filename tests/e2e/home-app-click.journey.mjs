import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { copyOriginalMetrics, withRestoredMetrics, lifecycleBlockReason } from './home-app-click.contracts.mjs';

// Locators verified in qa-verify.md on the complete packaged application.
const A = 'app-creatify-chasing-product';
const B = 'app-creatify-ugc-selfie';
const card = id => `[aria-label="Featured Video Apps 列表"] [data-template-id="${id}"]`;
const draft = 'QA2591 formal conversation draft';
export async function runHomeAppJourney(page, out, { originalMetricsOverride } = {}) {
  const originalMetrics = copyOriginalMetrics(originalMetricsOverride);
  await fs.mkdir(out, { recursive: true });
  const results = [];
  async function check(id, fn, blockedReason) {
    let failure;
    if (blockedReason) results.push({ id, status: 'blocked', error: blockedReason });
    else {
      try { await fn(); results.push({ id, status: 'pass' }); }
      catch (error) { failure = error; results.push({ id, status: 'fail', error: error.message }); }
      try { await page.screenshot({ path: `${out}/${id}.png` }); }
      catch (error) {
        const result = results.at(-1);
        result.status = 'fail';
        result.screenshotError = error.message;
      }
    }
    await fs.writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
    return failure;
  }
  async function observe(id, title) {
    await page.waitForFunction(t => {
      const e = document.querySelector('.omx-apptab-root');
      const r = e?.getBoundingClientRect();
      return e?.textContent.includes(t) && r.width > 0 && r.height > 0 && r.x >= 0 && r.right <= innerWidth + 1;
    }, title, { timeout: 12000 });
    const state = await page.evaluate(() => {
      const roots = [...document.querySelectorAll('.omx-apptab-root')];
      return { roots: roots.map(e => {
        let n=e; const ancestors=[];
        while(n) { const s=getComputedStyle(n); ancestors.push({tag:n.tagName, display:s.display, visibility:s.visibility, opacity:s.opacity, hidden:n.hidden,inert:n.inert}); n=n.parentElement; }
        const r=e.getBoundingClientRect(); const input=e.querySelector('input');const ir=input?.getBoundingClientRect();
        const hit=ir&&document.elementFromPoint(ir.x+ir.width/2,ir.y+ir.height/2);
        return {text:e.textContent,rect:r.toJSON(),ancestors,inputHit:!!input&&(hit===input||input.contains(hit)),values:[...e.querySelectorAll('input')].map(i=>i.value)};
      }),draft:document.querySelector('[contenteditable=true]')?.textContent,bottom:window.__omnimuxBetterSidebar?.getSnapshot().state.bottomSplits };
    });
    await fs.writeFile(`${out}/${id}.json`, JSON.stringify(state,null,2));
    assert.equal(state.roots.length,1);
    assert.ok(state.roots[0].text.includes(title));
    assert.ok(state.roots[0].inputHit,'form input must receive pointer');
    assert.ok(state.roots[0].ancestors.every(a=>a.display!=='none'&&a.visibility==='visible'&&Number(a.opacity)>0&&!a.hidden&&!a.inert));
    assert.equal(state.draft,draft,'conversation draft unchanged');
    assert.deepEqual(state.bottom.tabs,[],'no hidden bottom app');
  }
  async function home() {
    await page.click('button[aria-label="Collapse right sidebar"]');
    await page.waitForSelector(card(A),{state:'visible'});
  }
  async function open(id, button=false) {
    if(button){await page.hover(card(id));await page.waitForFunction(s=>{const e=document.querySelector(s+' button');const r=e?.getBoundingClientRect();const h=r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e&&(h===e||e.contains(h));},card(id),{timeout:10000});}
    await page.click(card(id)+(button?' button':''));
  }
  await page.waitForSelector(card(A),{state:'visible',timeout:15000});
  await page.fill('[contenteditable=true]',draft);
  await check('01-button',async()=>{await open(A,true);await observe('01-button','巨型商品');});
  await check('02-repeat',async()=>{await home();await open(A);await observe('02-repeat','巨型商品');await home();await open(A);await observe('02-repeat-final','巨型商品');});
  await check('03-mounted-a-b-a',async()=>{await home();await open(B);await observe('03-mounted-b','海外达人');await home();await open(A);await observe('03-mounted-a','巨型商品');});
  await check('04-close-reopen-body',async()=>{await page.click('button[aria-label="Close"]');await page.waitForFunction(()=>!document.querySelector('.omx-apptab-root'));await open(A);await observe('04-close-reopen-body','巨型商品');});
  const resizeError = await check('05-resize', () => withRestoredMetrics(page, originalMetrics, async () => {
    for (const width of [1100,1440]) {
      await page.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await observe(`05-resize-${width}`,'巨型商品');
    }
  }));
  const blockedReason = lifecycleBlockReason(resizeError);
  await check('06-real-provider-restart',async()=>{
    const changed=await page.evaluate(async()=>{const c=window.__omnimuxWorkflow.sessions.rootCtx;const old=c.get('betterSidebar');const e=Object.values(c.get('loader').store).find(e=>e.options.name==='dsh-better-sidebar');await e.fiber.restart();await e.fiber;return old!==c.get('betterSidebar');});assert.ok(changed);
    await page.click('button[aria-label="Close"]');await open(A,true);await observe('06-real-provider-restart','巨型商品');
  }, blockedReason);
  await check('07-provider-unavailable',async()=>{
    await page.click('button[aria-label="Close"]');await page.evaluate(async()=>{const c=window.__omnimuxWorkflow.sessions.rootCtx;const e=Object.values(c.get('loader').store).find(e=>e.options.name==='dsh-better-sidebar');await e.update({disabled:true});});await open(A);
    await page.waitForSelector('[role=alert]',{state:'visible'});
    const state=await page.evaluate(()=>({alert:document.querySelector('[role=alert]')?.textContent,roots:document.querySelectorAll('.omx-apptab-root').length,draft:document.querySelector('[contenteditable=true]')?.textContent,provider:!!window.__omnimuxBetterSidebar}));await fs.writeFile(`${out}/07-provider-unavailable.json`,JSON.stringify(state,null,2));assert.equal(state.roots,0);assert.equal(state.provider,false);assert.equal(state.draft,draft);assert.ok(state.alert);
  }, blockedReason);
  return results;
}
