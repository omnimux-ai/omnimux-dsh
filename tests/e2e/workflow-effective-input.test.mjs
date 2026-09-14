import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)), root=resolve(here,'../..');
const outputBase=process.env.WORKFLOW_E2E_OUTPUT || resolve(here,'workflow-effective-input-evidence');
test('production effective input panel to gateway capture', {timeout:180000}, async()=>{
 await mkdir(outputBase,{recursive:true}); const output=await mkdtemp(resolve(outputBase,'run-'));
 const server=spawn(process.execPath,[resolve(here,'workflow-effective-input-server.mjs')],{cwd:root,env:{...process.env,WORKFLOW_E2E_OUTPUT:output},stdio:['ignore','pipe','pipe']});
 let log='',url;const report={output,status:'running',browserClosed:false,serverClosed:false};
 server.stdout.on('data',b=>{log+=b;});server.stderr.on('data',b=>{log+=b;});
 try {
  url=await new Promise((res,rej)=>{const timer=setTimeout(()=>rej(Error('Fixture startup timeout')),30000);server.once('exit',code=>{clearTimeout(timer);rej(Error('Fixture exited '+code));});server.stdout.on('data',()=>{const match=log.match(/"url":"(http:\/\/127\.0\.0\.1:\d+)"/);if(match){clearTimeout(timer);res(match[1]);}});});
  report.url=url;
  const script=`const out=${JSON.stringify(output)},url=${JSON.stringify(url)};\n`+await readFile(resolve(here,'workflow-effective-input-browser.mjs'),'utf8');
  const ego=spawn('ego-browser',['nodejs'],{cwd:root,stdio:['pipe','pipe','pipe']});let browserLog='';
  ego.stdout.on('data',b=>browserLog+=b);ego.stderr.on('data',b=>browserLog+=b);ego.stdin.end(script);
  const timer=setTimeout(()=>ego.kill('SIGTERM'),125000);const [code]=await once(ego,'exit');clearTimeout(timer);
  await writeFile(resolve(output,'browser.log'),browserLog);report.browserExit=code;
  try{report.browserClosed=JSON.parse(await readFile(resolve(output,'browser-cleanup.json'),'utf8')).closed;}catch{}
  assert.equal(code,0,browserLog);assert.equal(report.browserClosed,true);report.status='passed';
 }catch(error){report.status='failed';report.error=error.stack;throw error;}finally{
  if(server.exitCode===null){server.kill('SIGTERM');let timer;try{await Promise.race([once(server,'exit'),new Promise((_,reject)=>{timer=setTimeout(()=>{server.kill('SIGKILL');reject(Error('Server cleanup timeout'));},5000);})]);}finally{clearTimeout(timer);}}
  report.serverClosed=server.exitCode!==null;
  if(url){try{await fetch(url,{signal:AbortSignal.timeout(1000)});report.serverClosed=false;}catch{}}
  await writeFile(resolve(output,'server.log'),log);await writeFile(resolve(output,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));assert(report.serverClosed,'Fixture port still open');
 }
});
