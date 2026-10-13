import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,cpSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const root=fileURLToPath(new URL('../',import.meta.url))
test('角色包离开工作区仍可通过正式分发核验',t=>{
 const fixture=mkdtempSync(join(tmpdir(),'avatar-pack-3294-'));t.after(()=>rmSync(fixture,{recursive:true,force:true}))
 const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'))
 writeFileSync(join(fixture,'package.json'),JSON.stringify(pkg))
 for(const path of ['lib/capability-core.js','src/motion.js','data/creation-options.json']){mkdirSync(join(fixture,path,'..'),{recursive:true});cpSync(join(root,path),join(fixture,path))}
 const result=spawnSync('corepack',['pnpm','--config.ignore-scripts=true','pack','--dry-run','--json'],{cwd:fixture,encoding:'utf8'})
 assert.equal(result.status,0,result.stderr||result.stdout)
 const body=JSON.parse(result.stdout);const files=(Array.isArray(body)?body.flatMap(row=>row.files):body.files).map(row=>typeof row==='string'?row:row.path)
 assert.equal(files.includes('lib/capability-core.js'),true)
 assert.doesNotMatch(JSON.stringify(pkg),/workspace:/)
})
