import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ stdin: { contents: "export { instantiateSubjectToProject } from './drawerMenuHandlers.ts'", resolveDir: new URL('.', import.meta.url).pathname }, bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{name:'quiet-toast',setup(b) { b.onResolve({filter:/ui$/},()=>({path:'ui',namespace:'stub'})); b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:"export const toast = {success(){},error(){},warning(){}}"})); }}] });
const { instantiateSubjectToProject } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
test('subject click forwards only newly copied project files to canvas insertion', async () => {
  const assets = [{id:'new',type:'image',workspaceId:'ws_a',relative_path:'subjects/a/hero.png'}];
  let received;
  await instantiateSubjectToProject({id:'a',name:'角色'}, { async instantiateSubject(id, parentId, onAssets) { onAssets?.(assets); return true; } }, {isCurrent:()=>true}, {}, files => { received = files; });
  assert.deepEqual(received, assets);
});
test('late response after workspace change never inserts files', async () => {
  let called = false;
  await instantiateSubjectToProject({id:'a',name:'角色'}, {async instantiateSubject(){return true;}}, {isCurrent:()=>false}, {}, ()=>{called=true;});
  assert.equal(called,false);
});
