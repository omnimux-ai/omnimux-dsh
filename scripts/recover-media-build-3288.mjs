import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, lstatSync, realpathSync, readFileSync, mkdirSync, writeFileSync, openSync, closeSync, fstatSync, ftruncateSync, writeSync, fsyncSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One authorized recovery, not a general main-checkout write facility. */
export const RECOVERY=Object.freeze({path:'plugins/omnimux/lib/video-inspect.js',before:'0f17992b82ec8b0a9864835fc68c7c5b6eaa29a71365e4aa20ec265cfd3048a4',after:'c6b7a2235701a937cbc5d39650bab7b0526a86d6b7f8c86ed8a3d0c53dd8496b',backup:'20261013T193643Z-1d4b7ca77db4'})
export function validateRecoveryState(state){
 if(state.branch!=='main'||!state.primary||state.head!==state.upstream||state.dirty.length!==1||state.dirty[0]!==RECOVERY.path||state.staged.length||state.before!==RECOVERY.before||state.after!==RECOVERY.after||state.backup!==RECOVERY.backup||!state.regular||!state.owned)throw new Error('Scoped recovery identity mismatch; no file changed')
 return true
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export function replaceBytes(fd,before,after,io={ftruncateSync,writeSync,fsyncSync}){
 const write=bytes=>{io.ftruncateSync(fd,bytes.length);let offset=0;while(offset<bytes.length){const count=io.writeSync(fd,bytes,offset,bytes.length-offset,offset);if(count<=0)throw new Error('Incomplete recovery write');offset+=count}io.fsyncSync(fd)}
 try{write(after)}catch(error){try{write(before);error.recoveryState='rolled-back'}catch(rollback){error.recoveryState='rollback-failed';error.rollbackError=rollback.message}throw error}
}
export function recoverMediaBuild(){
 const root=realpathSync(fileURLToPath(new URL('../',import.meta.url)))
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')))
 const git=(...args)=>{const result=spawnSync('git',['-C',root,...args],{env,maxBuffer:2*1024*1024});if(result.status!==0)throw new Error('Git identity check failed');return result.stdout}
 const file=join(root,RECOVERY.path)
 const current=readFileSync(file)
 const expected=git('show','HEAD:'+RECOVERY.path)
 const script='scripts/recover-media-build-3288.mjs'
 if(!git('show','HEAD:'+script).equals(readFileSync(join(root,script))))throw new Error('Recovery entry is not the committed version')
 const dirty=git('diff','--name-only','HEAD').toString().trim().split('\n').filter(Boolean)
 const staged=git('diff','--cached','--name-only').toString().trim().split('\n').filter(Boolean)
 const info=lstatSync(file)
 validateRecoveryState({branch:git('symbolic-ref','--short','HEAD').toString().trim(),primary:lstatSync(join(root,'.git')).isDirectory(),head:git('rev-parse','HEAD').toString().trim(),upstream:git('rev-parse','origin/main').toString().trim(),dirty,staged,before:hash(current),after:hash(expected),backup:RECOVERY.backup,regular:info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&(info.mode&0o777)===420,owned:realpathSync(file)===file&&realpathSync(dirname(file))===dirname(file)})
 const archive=join(root,'.agent-backups',RECOVERY.backup,'payload.zip')
 const manifestPath=join(dirname(archive),'manifest.json')
 if(realpathSync(archive)!==archive||realpathSync(manifestPath)!==manifestPath)throw new Error('Backup path escaped')
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
 const entry=manifest.entries?.find(row=>row.path===RECOVERY.path)
 if(manifest.id!==RECOVERY.backup||manifest.project_root!==root||manifest.state!=='ready'||manifest.entries.length!==1||entry.sha256!==RECOVERY.before||entry.mode!==420||entry.size!==current.length||manifest.payload_sha256!==hash(readFileSync(archive)))throw new Error('Backup receipt mismatch')
 const verification=spawnSync('python3',['-c','import sys,zipfile,hashlib; z=zipfile.ZipFile(sys.argv[1]); assert z.namelist()==[sys.argv[2]]; b=z.read(sys.argv[2]); assert hashlib.sha256(b).hexdigest()==sys.argv[3]',archive,RECOVERY.path,RECOVERY.before],{env,encoding:'utf8'})
 if(verification.status!==0)throw new Error('Backup member verification failed')
 const reports=join(root,'.agent-reports')
 if(realpathSync(reports)!==reports||!lstatSync(reports).isDirectory())throw new Error('Receipt ancestor escaped')
 const receiptDir=join(reports,'influencer-avatar-sync')
 try{if(realpathSync(receiptDir)!==receiptDir||!lstatSync(receiptDir).isDirectory())throw new Error('Receipt directory escaped')}catch(error){if(error.code!=='ENOENT')throw error;mkdirSync(receiptDir,{mode:0o700})}
 if(realpathSync(receiptDir)!==receiptDir)throw new Error('Receipt directory escaped')
 const receipt=join(receiptDir,'media-recovery-3288.json')
 const data={task:3288,path:RECOVERY.path,head:git('rev-parse','HEAD').toString().trim(),before:RECOVERY.before,after:RECOVERY.after,backup:RECOVERY.backup,state:'prepared'}
 let receiptFd
 try{receiptFd=openSync(receipt,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)}catch(error){
  if(error.code!=='EEXIST')throw error
  receiptFd=openSync(receipt,constants.O_RDWR|constants.O_NOFOLLOW)
  const saved=JSON.parse(readFileSync(receiptFd,'utf8'))
  const stat=fstatSync(receiptFd)
  if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o777)!==0o600||saved.state!=='rolled-back'||saved.head!==data.head||saved.path!==data.path||saved.backup!==data.backup||saved.before!==data.before||saved.after!==data.after){closeSync(receiptFd);throw new Error('Existing receipt does not authorize safe retry')}
 }
 const record=value=>{const bytes=Buffer.from(JSON.stringify(value,null,2));ftruncateSync(receiptFd,bytes.length);let offset=0;while(offset<bytes.length)offset+=writeSync(receiptFd,bytes,offset,bytes.length-offset,offset);fsyncSync(receiptFd)}
 let fd
 try{
  record(data)
  fd=openSync(file,constants.O_RDWR|constants.O_NOFOLLOW)
  const opened=fstatSync(fd)
  if(opened.dev!==info.dev||opened.ino!==info.ino||!opened.isFile()||opened.nlink!==1||(opened.mode&0o777)!==420||hash(readFileSync(fd))!==RECOVERY.before)throw new Error('Target changed during validation')
  replaceBytes(fd,current,expected)
  if(hash(readFileSync(file))!==RECOVERY.after||(lstatSync(file).mode&0o777)!==420)throw new Error('Recovery verification failed')
  record({...data,state:'restored'})
 }catch(error){
  const currentHash=hash(readFileSync(file))
  const state=error.recoveryState??(currentHash===RECOVERY.after?'restored-receipt-error':currentHash===RECOVERY.before?'rolled-back':'failed')
  record({...data,state,currentHash,error:error.message,rollbackError:error.rollbackError??null});throw error
 }
 finally{if(fd!==undefined)closeSync(fd);closeSync(receiptFd)}
 return {...data,state:'restored'}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--apply')throw new Error('Only the fixed --apply invocation is supported')
 console.log(JSON.stringify(recoverMediaBuild()))
}
