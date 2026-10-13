import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,rm,mkdir,writeFile,readdir,rename,symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLibraryStore } from './library.js'

test('多视角新增产物进入原目录，不增根引用且重复追加幂等',async t=>{
 const root=await mkdtemp(join(tmpdir(),'avatar-folder-'));t.after(()=>rm(root,{recursive:true,force:true}))
 const folder=join(root,'多视角');await mkdir(folder);await writeFile(join(folder,'first.png'),'first')
 const vault=join(root,'vault')
 const library=createLibraryStore({paths:{dir:vault,libraryFile:join(vault,'library.json'),filesDir:join(vault,'data/files')}})
 const asset=await library.add({name:'角色',type:'character',files:[folder]})
 const target=asset.files[0]
 const file=join(root,'second.png');await writeFile(file,'second')
 const result=await library.appendFiles(asset.id,[file],target.id)
 assert.equal(result.files.length,1)
 assert.equal(result.files[0].id,target.id)
 const path=join(vault,target.relative_path)
 assert.deepEqual((await readdir(path)).sort(),['first.png','second.png'])
 await library.appendFiles(asset.id,[file],target.id)
 assert.deepEqual((await readdir(path)).sort(),['first.png','second.png'])
 await assert.rejects(library.appendFiles(asset.id,[file],'unknown-folder'),error=>error.code==='path-denied')
 await writeFile(file,'different')
 await assert.rejects(library.appendFiles(asset.id,[file],target.id),error=>error.code==='file-conflict')
 const assetRoot=join(vault,'data/files',asset.id)
 const displaced=join(root,'displaced')
 await rename(assetRoot,displaced);await symlink(displaced,assetRoot)
 const third=join(root,'third.png');await writeFile(third,'third')
 await assert.rejects(library.appendFiles(asset.id,[third],target.id),error=>error.code==='path-denied')
 assert.deepEqual((await readdir(join(displaced,'多视角'))).sort(),['first.png','second.png'])
})
