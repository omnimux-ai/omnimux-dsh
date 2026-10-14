import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const b=await build({entryPoints:[new URL('./libraryService.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {createLibraryServiceClient}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
test('library service resolves lazily and forwards reads and writes without HTTP',async()=>{
 let service;const client=createLibraryServiceClient(()=>service);
 await assert.rejects(client.fetchLibraryDetail('a'),/资产库暂不可用/);
 const detail={id:'a',files:[{real_path:'/task/hero.png'}]};let saved;
 service={getAsset:id=>id==='a'?detail:null,saveTypedAsset:async input=>{saved=input;return {asset:detail};}};
 assert.equal(await client.fetchLibraryDetail('a'),detail);assert.equal(await client.fetchLibraryDetail('missing'),null);
 const input={name:'角色',files:[{real_path:'/task/hero.png'}]};assert.equal(await client.promoteToLibrary(input),detail);assert.equal(saved,input);
});
