import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync, truncateSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createVideoAuthorizationHandler } from '../src/authorize-stream.js'
import { handleVideoStream } from '../src/stream.js'
import { refreshBreakdownMedia } from '../src/refresh-breakdown-media.js'
test('authenticated exact-origin selection admits streaming beyond the sidebar 500 MiB limit', async () => {
 const dir=mkdtempSync(join(tmpdir(),'video-selection-'));const old=process.env.DSH_HOME;process.env.DSH_HOME=join(dir,'home')
 const authorize=createVideoAuthorizationHandler(()=>({requestRejection:(req)=>req.headers.authorization==='Bearer synthetic'?undefined:401}))
 const server=createServer((req,res)=>req.url==='/authorize'?authorize(req,res):handleVideoStream(req,res))
 try {
  const path=join(dir,'large.mp4');writeFileSync(path,Buffer.from('0000ftypisom0000'));truncateSync(path,501*1024*1024)
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`
  const request=(headers)=>fetch(origin+'/authorize',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({path})})
  assert.equal((await request({Origin:origin})).status,401)
  assert.equal((await request({Origin:'https://evil.invalid',Authorization:'Bearer synthetic'})).status,403)
  assert.equal((await request({Origin:origin,'Sec-Fetch-Site':'cross-site',Authorization:'Bearer synthetic'})).status,403)
  const accepted=await request({Origin:origin,Authorization:'Bearer synthetic'});assert.equal(accepted.status,200)
  const {streamUrl}=await accepted.json();const range=await fetch(origin+streamUrl,{headers:{Range:'bytes=0-15'}})
  assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 0-15/${501*1024*1024}`);assert.equal((await range.arrayBuffer()).byteLength,16)
  assert.equal((await fetch(origin+streamUrl,{method:'HEAD'})).headers.get('content-length'),String(501*1024*1024))
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(old===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=old;rmSync(dir,{recursive:true,force:true})}
})
test('explicit legacy refresh preserves FLV WMV and non-ftyp QuickTime plus markerless analyses',()=>{
 const dir=mkdtempSync(join(tmpdir(),'legacy-containers-'));const old=process.env.DSH_HOME;process.env.DSH_HOME=join(dir,'home')
 try {
  const flv=Buffer.from('464c5601050000000900000000','hex')
  const wmv=Buffer.from('3026b2758e66cf11a6d900aa0062ce6c0000000000000000','hex')
  const mov=Buffer.from('0000000877696465000000086d646174','hex')
  for(const [ext,bytes] of [['flv',flv],['wmv',wmv],['mov',mov]]) {
   const path=join(dir,`video.${ext}`),doc=join(dir,`saved-${ext}.json`);writeFileSync(path,bytes)
   const source={shots:[{id:'shot',speech:'keep'}],structure:[],video:{stream_url:`/omnimux/video-preview/stream?path=${encodeURIComponent(path)}`},translations:{en:{shot:'kept'}}};writeFileSync(doc,JSON.stringify(source))
   assert.equal(refreshBreakdownMedia(doc,[path]).refreshed,1);const updated=JSON.parse(readFileSync(doc));assert.deepEqual(updated.translations,source.translations);assert.match(updated.video.stream_url,/\?grant=/)
  }
  const fake=join(dir,'fake.mov'),doc=join(dir,'fake.json');writeFileSync(fake,'not a QuickTime file');writeFileSync(doc,JSON.stringify({shots:[],structure:[],video:{stream_url:`/omnimux/video-preview/stream?path=${encodeURIComponent(fake)}`}}));assert.throws(()=>refreshBreakdownMedia(doc,[fake]),/supported media/)
 }finally{if(old===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=old;rmSync(dir,{recursive:true,force:true})}
})
