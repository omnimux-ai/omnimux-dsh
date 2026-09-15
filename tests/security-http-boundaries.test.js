import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyVideoStreamGrant } from '../plugins/omnimux-video-preview/src/stream-capability.js'
import { Readable } from 'node:stream'
import { requestRejection as hubGuard } from '../plugins/omnimux/src/host/request-authorization.js'
import { requestRejection as clipGuard } from '../plugins/omnimux-clip/src/http/request-authorization.js'
import { requestRejection as videoGuard } from '../plugins/omnimux-video-preview/src/request-authorization.js'
import { registerTextCompleteRoutes } from '../plugins/omnimux/src/text/http.js'
import { registerWorkbenchHttpRoutes } from '../plugins/omnimux/src/workbench/http-routes.js'
import { registerAuthRoutes } from '../plugins/omnimux/src/auth/http-routes.js'
import { registerClipRoutes } from '../plugins/omnimux-clip/src/http/routes.js'
import { apply as mountVideo } from '../plugins/omnimux-video-preview/src/index.js'
let fixtureHome
let fixtureVideo
let previousHome
before(() => {
  previousHome = process.env.DSH_HOME
  fixtureHome = mkdtempSync(join(tmpdir(), 'security-http-'))
  process.env.DSH_HOME = fixtureHome
  fixtureVideo = join(fixtureHome, 'selected.mp4')
  writeFileSync(fixtureVideo, Buffer.from('synthetic media fixture'))
})
after(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  if (fixtureHome) rmSync(fixtureHome, { recursive: true, force: true })
})
const authorized = () => ({ requestRejection: () => undefined })
const headers = { host: 'localhost:8123', origin: 'http://localhost:8123', 'sec-fetch-site': 'same-origin' }
function request(method = 'POST', extra = {}, body = {}) {
  return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method, headers: { ...headers, ...extra }, url: '/' })
}
function response() { return { status: 0, headers: {}, body: '', writeHead(status, headers) { this.status = status; this.headers = headers || {} }, end(body = '') { this.body = body; this.done?.() } } }
for (const guard of [hubGuard, clipGuard, videoGuard]) {
  test(`${guard === hubGuard ? 'hub' : guard === clipGuard ? 'clip' : 'video'} rejects hostile origins and requires authorization`, () => {
    for (const extra of [{origin:'https://evil.example'}, {origin:'null'}, {origin:'http://localhost:8124'}, {origin:'http://127.0.0.1:8123'}, {origin:'http://localhost:8123/path'}, {'sec-fetch-site':'cross-site'}, {'sec-fetch-site':'same-site'}]) assert.equal(guard(request('POST', extra), authorized), 403)
    assert.equal(guard(request(), authorized), undefined)
    assert.equal(guard({ method:'POST', headers:{} }, authorized), undefined)
    assert.equal(guard(request(), undefined), 503)
    assert.equal(guard(request(), () => ({requestRejection: () => 401})), 401)
    assert.equal(guard(request(), () => { throw Error('unavailable') }), 503)
    assert.equal(guard(request('POST', { origin:'http://localhost:80', host:'localhost' }), authorized), undefined)
  })
}
function fixtures(getConnection, touched) {
 const routes=[]; const server={register:r=>{routes.push(r);return()=>{}}}
 registerTextCompleteRoutes(server,{getConnection,textComplete:{execute:async()=>{touched.push('text');return 'hello'}}})
 registerWorkbenchHttpRoutes(server,{getConnection,mailbox:{updateViewport:()=>{touched.push('viewport');return{ok:true}},handleRpcAck:()=>{touched.push('ack');return{ok:true}}}})
 registerAuthRoutes(server,{dispatch:async()=>{touched.push('auth');return{status:200,body:{ok:true}}}},{getConnection})
 registerClipRoutes(server,{dispatch:async()=>{touched.push('clip');return{status:200,body:{ok:true}}}},{getConnection})
 mountVideo({get:name=>name==='webServer'?server:name==='connection'?getConnection?.():undefined})
 return routes.filter(r=>!r.path.endsWith('/stream'))
}
test('every protected route denies hostile browser traffic before side effects including prefixes and preflight',async()=>{
 const touched=[]
 for (const route of fixtures(authorized,touched)) {
  if(route.path.endsWith('/status')||route.path.endsWith('/capabilities')) continue
  for(const method of ['POST','OPTIONS']) {
   const req=request(method,{origin:'https://evil.example','sec-fetch-site':'cross-site'},{prompt:'spend',filePath:'/tmp/never-write.json',shots:[{speech:'hello'}]});req.url=route.path+'/suffix'
   const res=response();await route.handler(req,res);assert.ok([403,405].includes(res.status),`${route.path} ${method}: ${res.status}`);assert.equal(res.headers['Access-Control-Allow-Origin'],undefined)
  }
 }
 assert.deepEqual(touched,[])
})
test('authorized same-origin routes preserve successful dispatch; missing authorization never dispatches',async()=>{
 for(const getConnection of [authorized,undefined,()=>({requestRejection:()=>401})]) {
  const touched=[]
  for(const route of fixtures(getConnection,touched)) {
   if(route.path.endsWith('/status')||route.path.endsWith('/capabilities')||route.path.endsWith('/translate')) continue
   const req=request('POST',{}, route.path.endsWith('/authorize') ? {path:fixtureVideo} : {prompt:'hello'});req.url=route.path
   const res=response();await route.handler(req,res);assert.equal(res.status,getConnection===authorized?200:getConnection?401:503,route.path)
   if (getConnection === authorized && route.path.endsWith('/authorize')) {
    const { streamUrl } = JSON.parse(res.body)
    const grant = verifyVideoStreamGrant(new URL(streamUrl, 'http://localhost:8123'))
    assert.equal(grant?.path, realpathSync(fixtureVideo))
   }
  }
  assert.equal(touched.length>0,getConnection===authorized)
 }
})
test('clip GET enumeration is protected and legitimate reads remain available',async()=>{
 for(const getConnection of [authorized,undefined]) {
  const touched=[];const route=fixtures(getConnection,touched).find(r=>r.path==='/omnimux-clip/api');const res=response();await route.handler(request('GET'),res);assert.equal(res.status,getConnection?200:503)
 }
})
test('translation route preserves nonpersistent same-origin translation and rejects unavailable authorization',async()=>{
 for(const getConnection of [authorized,undefined]) {
  const route=fixtures(getConnection,[]).find(r=>r.path.endsWith('/translate'))
  const req=request('POST',{}, {targetLang:'en',shots:[{id:'shot1',speech:'hello'}]});req.url=route.path
  const res=response();const ended=new Promise(resolve=>{res.done=resolve});await route.handler(req,res);await ended
  assert.equal(res.status,getConnection?200:503)
  if(getConnection) assert.equal(JSON.parse(res.body).success,true)
 }
})
test('unauthorized text requests cannot reach the credential fallback',async()=>{
 let attempts=0;let handler
 registerTextCompleteRoutes({register:route=>{handler=route.handler;return()=>{}}},{getConnection:authorized,credentials:{get:()=>{attempts++;throw Error('no model access')}}})
 const res=response();await handler(request('POST',{origin:'null'},{userMessage:'spend',systemPrompt:'alternate alias'}),res)
 assert.equal(res.status,403);assert.equal(attempts,0)
})
