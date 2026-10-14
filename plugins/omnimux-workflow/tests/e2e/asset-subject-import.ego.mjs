import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';

export async function driveAssetBrowser({ origin, cookie, evidenceDir, journey }) {
  const config = { origin, cookie, evidenceDir, journey, proof: process.env.ISSUE3307_PROOF };
  const code = `
const fs = await import('node:fs');
const config = ${JSON.stringify(config)};
const task = await taskSpace('资产主体点击修复3307');
try {
 const page = task.page('p1');
 await page.cdp('Network.enable');
 await page.cdp('Page.enable');
 const receipt = await page.cdp('Network.setCookie', {name:config.cookie.name,value:config.cookie.value,url:config.origin+'/',path:'/',secure:false,sameSite:'Lax'});
 if(receipt.success === false) throw new Error('Private browser login failed');
 await page.goto(config.origin);
 await page.waitForFunction(() => document.querySelector('[data-dsh-omnimux-workflow-entry]'), undefined, {timeout:30000});
 process.env.ISSUE3307_PROOF=config.proof;
 const {default:journey} = await import(config.journey);
 const result = await journey({send:(method,params)=>page.cdp(method,params),sleep:ms=>new Promise(r=>setTimeout(r,ms)),evidenceDir:config.evidenceDir,io:fs});
 await page.screenshot({path:config.evidenceDir+'/ego-final.png'});
 fs.writeFileSync(config.evidenceDir+'/ego-result.json', JSON.stringify({assertions:[{name:'private-complete-app-ready',pass:true},...result.assertions],spaceId:task.spaceId},null,2));
} finally {
 const closed = await task.finish({keep:[]});
 fs.writeFileSync(config.evidenceDir+'/ego-cleanup.json', JSON.stringify({closed:true,receipt:closed??null}));
}
`;
  const child = spawn('ego-browser', ['nodejs'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ISSUE3307_BROWSER_CONFIG: JSON.stringify(config) },
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; });
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.stdin.end(code);
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  if (exit !== 0) throw new Error('Asset browser execution failed: ' + stderr.slice(-1600));
  const result = JSON.parse(fs.readFileSync(join(evidenceDir, 'ego-result.json'), 'utf8'));
  const cleanup = JSON.parse(fs.readFileSync(join(evidenceDir, 'ego-cleanup.json'), 'utf8'));
  return { assertions: [...result.assertions, { name: 'browser-space-closed', pass: cleanup.receipt?.closedSpace === true }], screenshot: { path: join(evidenceDir, 'ego-final.png') } };
}
