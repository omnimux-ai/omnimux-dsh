import test from 'node:test';
import assert from 'node:assert/strict';
import { bindDirectorServices, clearDirectorServices, captureUserScope, assertUserScope, persistAsset, resolveImageUrl, uploadImage } from './services.ts';
function setup(epoch=1, overrides={}) {
 const identity={userId:'user',projectId:'project',nodeId:'node',sceneId:'scene',epoch};
 const props={identity,scene:{id:'scene'},revision:1,assets:[],imageNodes:[],onChange(){},onClose(){},adapters:{
  resolveResource:async value=>`/managed/${value}`,resolveBuiltInResource:value=>`/omnimux-workflow/director-assets/${value.split('/').at(-1)}`,
  importImage:async()=>({storageKey:'artifacts/a.png',url:'artifacts/a.png',mimeType:'image/png',bytes:20,width:10,height:10}),
  persistAsset:async()=>({assetId:'asset',created:true,confirmed:true}),...overrides}};
 bindDirectorServices(props,{},new AbortController()); return props;
}
test('same project returning after another session does not accept a late image',async t=>{
 t.after(clearDirectorServices); let resolve;
 setup(1,{importImage:()=>new Promise(done=>{resolve=done;})});
 const upload=uploadImage(new Blob(['image']));
 setup(2); setup(3);
 resolve({storageKey:'artifacts/a.png',url:'artifacts/a.png',mimeType:'image/png',bytes:20,width:10,height:10});
 await assert.rejects(upload,{name:'AbortError'});
});
test('asset persistence without an explicit confirmed receipt rejects',async t=>{
 t.after(clearDirectorServices); setup(1,{persistAsset:async()=>({assetId:'asset',created:true,confirmed:false})});
 await assert.rejects(persistAsset({kind:'image',title:'image',tags:[],data:{}},captureUserScope()),/未持久化/);
});
test('built-in model resolves via packaged route and disposed identities fail',async t=>{
 t.after(clearDirectorServices); setup();
 assert.equal(await resolveImageUrl('director/models/quaternius-standard-male.glb'),'/omnimux-workflow/director-assets/quaternius-standard-male.glb');
 const identity=captureUserScope(); clearDirectorServices(); assert.throws(()=>assertUserScope(identity),{name:'AbortError'});
});
