import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root=fileURLToPath(new URL('../../',import.meta.url))
test('媒体检查构建输出不包含解析目录，跨目录字节一致且保持许可证',t=>{
 const temporary=mkdtempSync(join(tmpdir(),'media-build-3286-'))
 t.after(()=>rmSync(temporary,{recursive:true,force:true}))
 const outputs=[]
 for(const folder of ['a','deep/b']){
  const fixture=join(temporary,folder);mkdirSync(join(fixture,'scripts'),{recursive:true})
  cpSync(join(root,'scripts/build-media-inspect.mjs'),join(fixture,'scripts/build-media-inspect.mjs'))
  cpSync(join(root,'src'),join(fixture,'src'),{recursive:true})
  symlinkSync(join(root,'node_modules'),join(fixture,'node_modules'))
  const result=spawnSync(process.execPath,['scripts/build-media-inspect.mjs'],{cwd:fixture,encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  const code=readFileSync(join(fixture,'lib/video-inspect.js'),'utf8')
  assert.doesNotMatch(code,/^\/\/.*node_modules\//m)
  assert.match(code,/Mozilla Public License/)
  assert.match(readFileSync(join(fixture,'lib/mediabunny-LICENSE.txt'),'utf8'),/Mozilla Public License Version 2\.0/)
  outputs.push(code)
 }
 assert.equal(outputs[0],outputs[1])
})
