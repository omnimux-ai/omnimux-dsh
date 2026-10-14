import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import png from 'pngjs'
import { createMediaInspector } from './inspect.js'

test('本地素材检查无需凭据、提供方请求或系统视频工具，真实识别PNG', async t => {
  const dir=await mkdtemp(join(tmpdir(),'media-inspect-'))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const file=join(dir,'bytes')
  await writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC','base64'))
  const result=await createMediaInspector().inspect({path:file,type:'image'})
  assert.equal(result.width,1)
  assert.equal(result.height,1)
  assert.equal(result.mime,'image/png')
  assert.equal(result.sizeBytes>0,true)
  await assert.rejects(createMediaInspector().inspect({path:'https://example.test/media',type:'image'}))
  await assert.rejects(createMediaInspector().inspect({path:file,type:'video'}))
  const huge=png.PNG.sync.write({width:6500,height:6500,data:Buffer.alloc(6500*6500*4,255)})
  await writeFile(file,huge)
  await assert.rejects(createMediaInspector().inspect({path:file,type:'image'}),/pixel limit/i)
  await writeFile(file,huge.subarray(0,40))
  await assert.rejects(createMediaInspector().inspect({path:file,type:'image'}))
})
