import { test } from 'node:test'
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync,symlinkSync,chmodSync,realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join,dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { validateRecoveryState, RECOVERY, replaceBytes } from './recover-media-build-3288.mjs'
import { decideBashCommand } from './guard-worktree.mjs'
test('合成Git仓库仅恢复指定生成物并拒绝回执路径外跳',t=>{
 const base=mkdtempSync(join(tmpdir(),'scoped-recovery-'))
 t.after(()=>rmSync(base,{recursive:true,force:true}))
 const source=fileURLToPath(new URL('../',import.meta.url))
 const expected=readFileSync(join(source,RECOVERY.path))
 const before=Buffer.from(expected.toString().replaceAll('// ../../../../node_modules/','// ../../node_modules/').replace('Symbol.dispose ??= /* @__PURE__ */ Symbol','Symbol.dispose ??= Symbol').replace('= /* @__PURE__ */ Symbol.for("mediabunny loaded")','= Symbol.for("mediabunny loaded")'))
 assert.equal(createHash('sha256').update(before).digest('hex'),RECOVERY.before)
 for(const scenario of ['restore','receipt-link','mode','retry']){
  const root=join(base,scenario);mkdirSync(join(root,'scripts'),{recursive:true});mkdirSync(dirname(join(root,RECOVERY.path)),{recursive:true})
  cpSync(join(source,'scripts/recover-media-build-3288.mjs'),join(root,'scripts/recover-media-build-3288.mjs'))
  writeFileSync(join(root,RECOVERY.path),expected)
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
  git('init','-b','main');git('add','.');git('-c','user.name=Recovery','-c','user.email=recovery@example.invalid','commit','-m','fixture');git('update-ref','refs/remotes/origin/main','HEAD')
  const backup=join(root,'.agent-backups',RECOVERY.backup);mkdirSync(backup,{recursive:true})
  const payload=join(backup,'payload.zip');const current=join(root,RECOVERY.path);writeFileSync(current,before)
  const zip=spawnSync('python3',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w");z.write(sys.argv[2],sys.argv[3]);z.close()',payload,current,RECOVERY.path]);assert.equal(zip.status,0)
  writeFileSync(join(backup,'manifest.json'),JSON.stringify({id:RECOVERY.backup,project_root:realpathSync(root),state:'ready',payload_sha256:createHash('sha256').update(readFileSync(payload)).digest('hex'),entries:[{path:RECOVERY.path,sha256:RECOVERY.before,size:before.length,mode:420}]}))
  mkdirSync(join(root,'.agent-reports'))
  if(scenario==='receipt-link'){const outside=join(base,'outside');mkdirSync(outside);symlinkSync(outside,join(root,'.agent-reports/influencer-avatar-sync'))}
  if(scenario==='mode')chmodSync(current,0o600)
  if(scenario==='retry'){mkdirSync(join(root,'.agent-reports/influencer-avatar-sync'));const receipt=join(root,'.agent-reports/influencer-avatar-sync/media-recovery-3288.json');writeFileSync(receipt,JSON.stringify({state:'rolled-back',head:git('rev-parse','HEAD'),path:RECOVERY.path,before:RECOVERY.before,after:RECOVERY.after,backup:RECOVERY.backup}),{mode:0o600})}
  const result=spawnSync(process.execPath,['scripts/recover-media-build-3288.mjs','--apply'],{cwd:root,encoding:'utf8'})
  if(scenario==='restore'||scenario==='retry'){assert.equal(result.status,0,result.stderr);assert.deepEqual(readFileSync(current),expected);assert.equal(JSON.parse(readFileSync(join(root,'.agent-reports/influencer-avatar-sync/media-recovery-3288.json'))).state,'restored')}
  else{assert.notEqual(result.status,0);assert.deepEqual(readFileSync(current),before)}
 }
})
test('目标写入中断恢复原字节且报告回滚失败',()=>{
 const original=Buffer.from('before');const expected=Buffer.from('after-new')
 let data=Buffer.from(original);let failed=false
 const io={ftruncateSync(_fd,size){const next=Buffer.alloc(size);data.copy(next);data=next},writeSync(_fd,bytes,offset,length,position){if(!failed){failed=true;throw new Error('write interrupted')}bytes.copy(data,position,offset,offset+length);return length},fsyncSync(){}}
 assert.throws(()=>replaceBytes(1,original,expected,io),error=>error.recoveryState==='rolled-back')
 assert.deepEqual(data,original)
 assert.throws(()=>replaceBytes(1,original,expected,{...io,writeSync(){throw new Error('disk unavailable')}}),error=>error.recoveryState==='rollback-failed')
})
const valid=()=>({branch:'main',primary:true,head:'merged',upstream:'merged',dirty:[RECOVERY.path],staged:[],before:RECOVERY.before,after:RECOVERY.after,backup:RECOVERY.backup,regular:true,owned:true})
test('限定恢复只接受当前精确单文件及已保存原字节',()=>{
 assert.equal(validateRecoveryState(valid()),true)
 for(const patch of [{branch:'feature'},{primary:false},{head:'ahead'},{dirty:[RECOVERY.path,'other']},{staged:[RECOVERY.path]},{before:'unknown'},{after:'different'},{backup:'missing'},{regular:false},{owned:false}])assert.throws(()=>validateRecoveryState({...valid(),...patch}))
})
test('恢复入口只接受唯一精确命令，不接受路径参数或串联',()=>{
 const exact=decideBashCommand({command:'node scripts/recover-media-build-3288.mjs --apply',cwd:'/tmp'})
 assert.equal(exact.decision,'deny')
 for(const command of ['node scripts/recover-media-build-3288.mjs --apply other','node scripts/recover-media-build-3288.mjs --apply; git restore .','node /tmp/recover-media-build-3288.mjs --apply'])assert.equal(decideBashCommand({command,cwd:process.cwd()}).decision,'deny')
})
