// #1785 local Verify support; no provider network or user profiles.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCatalog } from './workflow-model-parameters-fixtures.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),plugin=resolve(root,'plugins/omnimux-workflow');
const out=resolve(process.env.WORKFLOW_E2E_OUTPUT||resolve(root,'tmp/model-parameters-1785/support'));
if(!out.startsWith(resolve(root,'tmp/model-parameters-1785')+'/'))throw Error('Task output boundary');
await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url),pr=createRequire(resolve(plugin,'package.json'));
const catalog=createCatalog();
const common={absWorkingDir:plugin,bundle:true,write:false,logLevel:'warning',nodePaths:[resolve(plugin,'node_modules'),resolve(root,'node_modules/.pnpm/node_modules'),resolve(root,'node_modules')]};
const browser=await build({...common,entryPoints:[resolve(here,'workflow-model-parameters-entry.tsx')],jsx:'automatic',platform:'browser',format:'iife',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-preferences',setup(b){b.onResolve({filter:/^react(?:-dom)?(?:\/.*)?$/},a=>({path:pr.resolve(a.path)}));b.onResolve({filter:/generationPreferencesStore(?:\.ts)?$/},()=>({path:'preferences',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:"import {create} from 'zustand';export const useGenerationPreferencesStore=create(()=>({lastModelByType:{}}));export const loadGenerationPreferences=async()=>{};export const rememberGenerationModel=async()=>{};",loader:'js',resolveDir:plugin}));}}]});
const backend=await build({...common,entryPoints:[resolve(here,'workflow-effective-input-capture.ts')],platform:'node',format:'cjs',packages:'external',plugins:[{name:'task-catalog',setup(b){b.onResolve({filter:/workflow-effective-input-fixtures\.mjs$/},()=>({path:'catalog',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export const catalog='+JSON.stringify(catalog),loader:'js'}));}}]});
const persistence=await build({...common,entryPoints:[resolve(here,'workflow-model-parameters-persistence.ts')],platform:'node',format:'cjs'});
await writeFile(resolve(out,'capture.cjs'),backend.outputFiles[0].text);await writeFile(resolve(out,'persistence.cjs'),persistence.outputFiles[0].text);
const {capture}=require(resolve(out,'capture.cjs')),{serialize}=require(resolve(out,'persistence.cjs'));
const code=browser.outputFiles[0].text,identity={root,pid:process.pid,builtAt:new Date().toISOString(),sha256:createHash('sha256').update(code).digest('hex')};
await writeFile(resolve(out,'bundle.js'),code);const captures=[];let origin;
const inspect=v=>{if(Array.isArray(v))v.forEach(inspect);else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(['path','realPath','relativePath'].includes(k)&&x)throw Error('File sources prohibited');inspect(x);}else if(typeof v==='string'&&/^https?:/.test(v)&&new URL(v).origin!==origin)throw Error('External URL prohibited');};
const server=createServer(async(req,res)=>{const send=(status,body,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(body):body);};try{
if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin))return send(403,{error:'Origin rejected'});
const path=new URL(req.url,origin).pathname;
if(req.method==='GET'&&path==='/'){res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:");return send(200,'<!doctype html><html lang="zh"><meta charset="utf-8"><title>1785 真实面板验证</title><div id="root" class="wf-canvas-root"></div><script src="/boot.js"></script><script src="/panel.js"></script></html>','text/html');}
if(req.method==='GET'&&path==='/boot.js')return send(200,'window.__catalog='+JSON.stringify(catalog)+';window.__errors=[];window.onerror=function(e){window.__errors.push(String(e));};','application/javascript');
if(req.method==='GET'&&path==='/panel.js')return send(200,code,'application/javascript');
if(req.method==='GET'&&path==='/identity')return send(200,{...identity,origin});
if(req.method==='GET'&&path==='/captures')return send(200,captures);
if(req.method==='GET'&&path==='/saved')return send(200,JSON.parse(await readFile(resolve(out,'saved.json'),'utf8')));
if(req.method==='GET'&&path==='/media/a.svg')return send(200,'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="lightblue"/></svg>','image/svg+xml');
if(req.method==='POST'&&['/save','/capture'].includes(path)){let body='';for await(const b of req){body+=b;if(body.length>4000000)throw Error('Too large');}const graph=JSON.parse(body);inspect(graph);if(path==='/save'){const saved=serialize(graph);await writeFile(resolve(out,'saved.json'),JSON.stringify(saved,null,2));return send(200,saved);}const result=await capture(graph,origin,out);captures.push(result);await writeFile(resolve(out,'captures.json'),JSON.stringify(captures,null,2));return send(200,result);}
return send(404,{error:'Unknown route'});
}catch(e){send(500,{error:e.message});}});
server.listen(0,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;console.log(JSON.stringify({url:origin,pid:process.pid}));});
for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>server.close(()=>process.exit(0)));
