import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
function imagePng(red,green,blue) {
 const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]);const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(body));return Buffer.concat([size,body,sum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(64,0);header.writeUInt32BE(64,4);header[8]=8;header[9]=2;
 const rows=Buffer.alloc(64*(1+64*3));for(let y=0;y<64;y++)for(let x=0;x<64;x++){const p=y*193+1+x*3;rows[p]=red;rows[p+1]=green;rows[p+2]=blue;}
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppQaRunner } from '../../../../scripts/worktree-app-qa.mjs';
import { driveAssetBrowser } from './asset-subject-import.ego.mjs';
import { createTestEnvironmentStarter } from '../../../../scripts/test-env-bootstrap.mjs';
import { privateStarterFs, redact } from '../../../../scripts/composer-inline-bootstrap.mjs';
import { installPrivatePluginPackages } from '../../../../test-support/private-plugin-installation.mjs';
process.env.PATH = '/opt/homebrew/bin:' + process.env.PATH;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const repository = resolve(root, '../..');
const base = join(root, '.workbuddy/qa-journeys/issue-3307-artifacts');
fs.mkdirSync(base, {recursive:true});
const evidence = join(base, randomUUID()); fs.mkdirSync(evidence);
const executable = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
const cli = '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js';
const sidebar = join(repository,'node_modules/.pnpm/dsh-better-sidebar@0.18.0_3339db82735af35f2ce8950b7c70af92/node_modules/dsh-better-sidebar');
let proof;
const starterIo = new Proxy(privateStarterFs(), {get(target,key) {
  if(key === 'mkdtempSync') return () => fs.mkdtempSync(join(base,'private-'));
  return target[key];
}});
const start = createTestEnvironmentStarter({fs:starterIo,repositoryRoot:repository,startupTimeoutMs:180000,
 readCredential(){throw new Error('No real credentials allowed');},
 spawn(exe,args,options){
  try {
   const home=options.env.DSH_HOME;
   for (const [name,files] of Object.entries({omnimux:['lib/client.js'],'omnimux-workflow':['dist/index.js','lib/client.js','lib/canvas.js'],'omnimux-assets':['lib/client.js']})) for (const file of files) fs.accessSync(join(root,'plugins',name,file));
   const settingsPath=join(home,'settings.yaml');
   const settings=JSON.parse(fs.readFileSync(settingsPath,'utf8')); settings.locale={preference:'zh'};
   fs.writeFileSync(settingsPath,JSON.stringify(settings));
   const installed=installPrivatePluginPackages({root,repository,home,executable,cli,evidence,
    packageNames:['omnimux','omnimux-workflow','omnimux-assets',sidebar],
    requiredLayers:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','omnimux','omnimux-workflow','omnimux-assets'],
    entryFiles:{omnimux:['lib/client.js'],'omnimux-workflow':['dist/index.js','lib/client.js','lib/canvas.js'],'omnimux-assets':['src/index.js','lib/client.js']},options});
   const workspaceId=randomUUID(),workspacePath=join(options.env.HOME,'issue-3307-project'); fs.mkdirSync(workspacePath);
   const timestamp=new Date().toISOString(); fs.mkdirSync(join(home,'storages'),{recursive:true});
   fs.writeFileSync(join(home,'storages/workspace.json'),JSON.stringify({unit:{name:'workspace',version:2},global:{initialized:true,workspaceIds:[workspaceId],archivedSessionIds:[]},tables:{workspaces:{[workspaceId]:{path:workspacePath,title:'主体点击 · 合成验收',sessionIds:[],createdAt:timestamp,updatedAt:timestamp}}}}));
   const files=['subject-a.png','subject-b.png'].map((name,index)=>{const path=join(workspacePath,name);fs.writeFileSync(path,index===0?imagePng(170,75,65):imagePng(65,120,170));return path;});
   proof={root,privateHome:home,workspaceId,workspacePath,files,installed:installed.installed,layers:installed.manifest.dsh.profile.bundles,credentialsRead:0};
   fs.writeFileSync(join(evidence,'installed-proof.json'),JSON.stringify({proof,wholePackages:installed.wholePackages},null,2));
   const child=spawn(exe,args,{...options,env:installed.runtimeEnv});proof.pid=child.pid;
   let output=''; for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output=(output+bytes).slice(-120000);});
   child.once('exit',(code,signal)=>fs.writeFileSync(join(evidence,'runtime-exit.json'),JSON.stringify({code,signal,output:redact(output)},null,2)));
   fs.writeFileSync(join(evidence,'process.json'),JSON.stringify(proof,null,2)); return child;
  }catch(error){fs.writeFileSync(join(evidence,'prepare-failure.json'),JSON.stringify({message:redact(error.message),stack:redact(error.stack)},null,2));throw error;}
 }});
const mapPath=path=>String(path).endsWith('/docs/evidence/worktree-app-qa-report.json')?join(evidence,'summary.json'):String(path).endsWith('/docs/evidence')?evidence:path;
const runnerIo=new Proxy(fs,{get(target,key){if(['mkdirSync','writeFileSync'].includes(key))return(path,...args)=>target[key](mapPath(path),...args);return target[key];}});
// Preserve the existing complete-app browser driver and its task worktree evidence path.
const run=createAppQaRunner({io:runnerIo,driveBrowser:driveAssetBrowser,startEnv:async()=>{
 const env=await start({root,mode:'ui'});process.env.ISSUE3307_PROOF=join(evidence,'process.json');
 env.summary = { ...env.summary, evidenceLevel:'task-private-complete-app', taskPluginsInstalled:true, taskPluginsCount:3, seededDataDomains:['task-synthetic-assets'], realModelRequest:false };
 return env;
}});
// Keep the existing runner path inside this task's allowed evidence folder with a local IO path mapping.
const report=await run({root,repo:repository,mode:'ui',journey:'plugins/omnimux-workflow/tests/e2e/asset-subject-import.journey.mjs'});
fs.writeFileSync(join(evidence,'result.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({evidence,pass:report.pass,errors:report.errors,failed:report.assertions.filter(a=>!a.pass).map(a=>a.name),cleanup:report.cleanup}));
process.exitCode=report.pass?0:1;
