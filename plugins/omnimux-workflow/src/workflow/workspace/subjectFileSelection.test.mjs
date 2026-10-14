import {test} from 'node:test';
import assert from 'node:assert/strict';
import{mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';import{join}from'node:path';
import{createProjectAssetsStore}from'./ProjectAssetsStore.ts';
test('selecting one file copies only that file and invalid selections never copy all',async()=>{
 const root=mkdtempSync(join(tmpdir(),'subject-select-'));const ws='ws_pick';const workspacesDir=join(root,'workspaces');
 mkdirSync(join(workspacesDir,ws),{recursive:true});writeFileSync(join(workspacesDir,ws,'canvas.json'),'{}');mkdirSync(join(root,'.omnimux'),{recursive:true});
 const files=['a','b'].map(id=>{const path=join(root,id+'.png');writeFileSync(path,id);return{id,real_path:path,visible:true};});
 const directory=join(root,'directory');mkdirSync(directory);files.push({id:'dir',real_path:directory},{id:'hidden',real_path:files[0].real_path,visible:false});
 const store=createProjectAssetsStore({workspacesDir,resolveProjectRoot:()=>({path:root}),fetchLibraryDetail:async()=>({files})});
 try{const doc=await store.instantiate(ws,{globalSubjectId:'subject',fileIds:['b'],expectedRev:0});assert.equal(doc.items.length,1);assert.equal(doc.items[0].name,'b.png');
 for(const fileIds of [[],['missing'],['b','missing'],['dir'],['hidden']]){await assert.rejects(store.instantiate(ws,{globalSubjectId:'subject',fileIds,expectedRev:1}));assert.equal(store.get(ws).items.length,1);}
 }finally{rmSync(root,{recursive:true,force:true});}
});
