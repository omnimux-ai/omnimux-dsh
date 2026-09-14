import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { catalog, fixture } from './workflow-effective-input-fixtures.mjs';
const sourceDir = dirname(fileURLToPath(import.meta.url));
const here = process.env.WORKFLOW_E2E_OUTPUT || sourceDir;
const root = resolve(sourceDir,'../..');
const plugin = resolve(root,'plugins/omnimux-workflow');
const require = createRequire(import.meta.url);
const pluginRequire = createRequire(resolve(plugin,'package.json'));
const common = {absWorkingDir:plugin,bundle:true,write:false,logLevel:'info',nodePaths:[resolve(plugin,'node_modules'),resolve(root,'node_modules/.pnpm/node_modules'),resolve(root,'node_modules')]};
let browserCode, capture, identity;
async function rebuild() {
  const browser = await build({...common,entryPoints:[resolve(sourceDir,'workflow-effective-input-entry.tsx')],jsx:'automatic',platform:'browser',format:'iife',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"development"'},plugins:[{
    name:'isolate-preferences-persistence',setup(b){
      b.onResolve({filter:/^react(?:-dom)?(?:\/.*)?$/},args=>({path:pluginRequire.resolve(args.path)}));
      b.onResolve({filter:/generationPreferencesStore(?:\.ts)?$/},()=>({path:'preferences',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import {create} from 'zustand'; export const useGenerationPreferencesStore=create(()=>({lastModelByType:{}})); export const loadGenerationPreferences=async()=>{}; export const rememberGenerationModel=async(type,model)=>useGenerationPreferencesStore.setState(s=>({lastModelByType:{...s.lastModelByType,[type]:model}}));`,loader:'js',resolveDir:plugin}));
    },
  }]});
  const backend = await build({...common,entryPoints:[resolve(sourceDir,'workflow-effective-input-capture.ts')],platform:'node',format:'cjs',packages:'external'});
  const backendFile=resolve(here,'panel-capture-built.cjs');
  await writeFile(backendFile,backend.outputFiles[0].text);
  delete require.cache[backendFile];
  const nextCapture=require(backendFile).capture;
  browserCode=browser.outputFiles[0].text; capture=nextCapture;
  identity={builtAt:new Date().toISOString(),sha256:createHash('sha256').update(browserCode).digest('hex'),backendSha256:createHash('sha256').update(backend.outputFiles[0].text).digest('hex'),root};
  await writeFile(resolve(here,'panel-browser-built.js'),browserCode);
  await writeFile(resolve(here,'panel-build.json'),JSON.stringify(identity,null,2));
  console.log(JSON.stringify({build:identity}));
  return identity;
}
try { await rebuild(); } catch(error) {
  if(process.argv.includes('--build-only')) throw error;
  identity={buildFailed:true,message:error.message,root};
  browserCode=`document.getElementById('root').textContent=${JSON.stringify('当前生产源码构建失败；修复后 POST /rebuild 并刷新。')};`;
  console.error('Fixture remains available for rebuild after source repair.');
}
if(process.argv.includes('--build-only')) process.exit(0);
let origin;
const captures=[];
const svg=label=>`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${label==='a'?'#acc9e8':'#ebcca8'}"/><text x="140" y="100" font-size="32">${label}</text></svg>`;
const wav=Buffer.alloc(44+16000); wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
const server=createServer(async(req,res)=>{
  const send=(status,body,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(body):body);};
  try {
    if(req.headers.origin && req.headers.origin!==origin) return send(403,{error:'Origin rejected'});
    if(req.headers.host!==new URL(origin).host) return send(403,{error:'Host rejected'});
    const url=new URL(req.url,origin);
    if(req.method==='GET'&&url.pathname==='/') {
      res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'self'; font-src 'self' data:");
      return send(200,'<!doctype html><html lang="zh"><meta charset="utf-8"><title>1760 真实面板离线验证</title><body><div id="root" class="wf-canvas-root" style="min-height:100vh"></div><script src="/errors.js"></script><script src="/panel.js"></script></body></html>','text/html; charset=utf-8');
    }
    if(req.method==='GET'&&url.pathname==='/errors.js') return send(200,"window.__errors=[];const captureError=event=>{const message=String(event.error?.stack||event.reason?.stack||event.message||event.reason);window.__errors.push(message);const p=document.createElement('pre');p.textContent=message;document.body.append(p);};const errorEvents=['error','unhandledrejection'];const cleanupErrors=()=>{for(const name of errorEvents)window.removeEventListener(name,captureError);window.removeEventListener('pagehide',cleanupErrors);};for(const name of errorEvents)window.addEventListener(name,captureError);window.addEventListener('pagehide',cleanupErrors);",'application/javascript');
    if(req.method==='GET'&&url.pathname==='/panel.js') return send(200,browserCode,'application/javascript');
    if(req.method==='GET'&&url.pathname==='/identity') return send(200,{...identity,origin,pid:process.pid});
    if(req.method==='GET'&&url.pathname==='/catalog') return send(200,catalog);
    if(req.method==='GET'&&url.pathname==='/fixture') return send(200,fixture(url.searchParams.get('scene')||'text',origin));
    if(req.method==='GET'&&url.pathname==='/captures') return send(200,captures);
    if(req.method==='GET'&&/^\/media\/[ab]\.svg$/.test(url.pathname)) return send(200,svg(url.pathname.includes('/a.')?'a':'b'),'image/svg+xml');
    if(req.method==='GET'&&url.pathname==='/media/silence.wav') return send(200,wav,'audio/wav');
    if(req.method==='POST'&&url.pathname==='/rebuild') return send(200,await rebuild());
    if(req.method==='POST'&&url.pathname==='/capture') {
      let body=''; for await(const chunk of req) {body+=chunk;if(body.length>4_000_000) throw Error('Graph too large');}
      const input=JSON.parse(body);
      // Graphs may contain local synthetic URLs only; no file paths or network forwarding.
      const inspect=value=>{if(Array.isArray(value))value.forEach(inspect);else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(['path','realPath','relativePath'].includes(key)&&item)throw Error('Filesystem sources prohibited');inspect(item);}else if(typeof value==='string'&&/^https?:\/\//.test(value)&&new URL(value).origin!==origin)throw Error('External URLs prohibited');};
      inspect(input);
      const result={...(await capture(input,origin,here)),identity};captures.push(result);
      await writeFile(resolve(here,'panel-captures.json'),JSON.stringify(captures,null,2));
      return send(200,result);
    }
    return send(404,{error:'No fixture route'});
  }catch(error){return send(500,{error:error.message});}
});
server.listen(0,'127.0.0.1',()=>{origin=`http://127.0.0.1:${server.address().port}`;console.log(JSON.stringify({url:origin,pid:process.pid}));});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)));
