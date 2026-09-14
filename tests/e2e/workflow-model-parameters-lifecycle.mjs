// Lifecycle helper for ad-hoc ego Verify, not a formal browser test.
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
export async function withPanel(taskSpace,work) {
 const root=new URL('../../',import.meta.url).pathname.replace(/\/$/,''),out=root+'/tmp/model-parameters-1785/run-'+Date.now();await mkdir(out,{recursive:true});
 let server,task,url,log='';const report={out,source:{head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'})}};
 try{server=spawn('/Users/x/.nvm/versions/node/v25.8.0/bin/node',[root+'/tests/e2e/workflow-model-parameters-server.mjs'],{cwd:root,env:{...process.env,WORKFLOW_E2E_OUTPUT:out},stdio:['ignore','pipe','pipe']});
 url=await new Promise((res,rej)=>{const t=setTimeout(()=>rej(Error('startup timeout')),30000);server.stderr.on('data',b=>log+=b);server.stdout.on('data',b=>{log+=b;const m=log.match(/"url":"([^"]+)"/);if(m){clearTimeout(t);res(m[1]);}});server.once('exit',c=>{clearTimeout(t);rej(Error('server exit '+c));});});
 report.identity=await fetch(url+'/identity').then(r=>r.json());task=await taskSpace('1785 production Verify');report.spaceId=task.spaceId;const page=task.page('p1');await page.goto(url);await page.waitForFunction(()=>window.__parameters&&document.querySelector('section'));await work({page,out,report,url});
 }catch(e){report.error=String(e.stack||e);if(task){try{const page=task.page('p1');report.failureDom=await page.snapshot();report.failureState=await page.evaluate(()=>({graph:window.__parameters?.snapshot(),errors:window.__errors}));await page.screenshot({path:out+'/failure.png'});}catch(captureError){report.failureCaptureError=String(captureError);}}}finally{try{if(task)report.finish=await task.finish({keep:[]});}catch(e){report.finishError=String(e);}finally{if(server&&server.exitCode===null){let timer;const done=once(server,'exit');server.kill('SIGTERM');await Promise.race([done,new Promise(r=>{timer=setTimeout(()=>{server.kill('SIGKILL');r();},5000);})]);clearTimeout(timer);}report.serverClosed=!!server&&(server.exitCode!==null||server.signalCode!==null);if(url){try{await fetch(url,{signal:AbortSignal.timeout(1000)});report.serverClosed=false;}catch{}}await writeFile(out+'/server.log',log);await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}}
 return report;
}
