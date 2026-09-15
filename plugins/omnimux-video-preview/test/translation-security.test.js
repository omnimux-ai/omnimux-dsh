import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { translateBreakdownShots } from '../src/translate.js'
test('translation persists real breakdown artifacts and refuses unrelated JSON or symlinks before model execution',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'translation-security-'));let calls=0
 const ctx={get:()=>({execute:async()=>{calls++;return '{"translations":{"shot1":"hello"}}'}})}
 const params={ctx,targetLang:'en',shots:[{id:'shot1',speech:'你好'}]}
 try {
  for(const ext of ['json','vbreakdown']) {
   const filePath=join(dir,`valid.${ext}`);writeFileSync(filePath,JSON.stringify({is_video_breakdown:true,shots:params.shots}))
   assert.equal((await translateBreakdownShots({...params,filePath})).success,true)
   assert.equal(JSON.parse(readFileSync(filePath)).translations.en.shot1,'hello')
  }
  const target=join(dir,'settings.json');writeFileSync(target,'{"important":true}')
  await assert.rejects(translateBreakdownShots({...params,filePath:target}),/Not a video breakdown/)
  const link=join(dir,'link.json');symlinkSync(join(dir,'valid.json'),link)
  await assert.rejects(translateBreakdownShots({...params,filePath:link}))
  assert.equal(calls,2);assert.equal(readFileSync(target,'utf8'),'{"important":true}')
  assert.equal((await translateBreakdownShots({...params,filePath:''})).success,true)
 } finally {rmSync(dir,{recursive:true,force:true})}
})
test('legacy analysis without a marker retains translation and caching',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'legacy-translation-'))
 try {
  const filePath=join(dir,'legacy.video-analysis.json');const shots=[{id:'shot_1',speech:'你好'}]
  writeFileSync(filePath,JSON.stringify({shots,structure:[]}))
  const result=await translateBreakdownShots({filePath,shots,targetLang:'en',ctx:{get:()=>({execute:async()=>'{"translations":{"shot_1":"hello"}}'})}})
  assert.equal(result.success,true);assert.equal(JSON.parse(readFileSync(filePath)).translations.en.shot_1,'hello')
  writeFileSync(filePath,JSON.stringify({shots:['not a shot'],structure:[]}))
  await assert.rejects(translateBreakdownShots({filePath,shots,targetLang:'en'}),/Not a video breakdown/)
 } finally {rmSync(dir,{recursive:true,force:true})}
})
