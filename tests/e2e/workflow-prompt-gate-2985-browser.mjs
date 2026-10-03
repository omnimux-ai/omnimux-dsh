// Executed by ego-browser nodejs; `out` and `url` are prepended by the test runner.
// #2985: new-input generation nodes are gated by the shared kernel only.
const fs=await import('node:fs/promises');
const assert=(await import('node:assert/strict')).default;
const task=await taskSpace('2985 prompt gate '+out);
console.log('SPACE_ID='+task.spaceId);
const p=task.page('p1'), results=[];
const OPS={image:'text_to_image',video:'text_to_video',text:'chat',audio:'text_to_speech'};
const button=()=>p.evaluate(()=>{const b=document.querySelector('button[aria-label="生成"]');return {disabled:b.getAttribute('aria-disabled'),title:b.title,slotMissing:document.querySelector('section').innerText.includes('还差必需素材')};});
try{
 await p.goto(url+'/?scene=empty');
 await p.waitForFunction(()=>window.__panel&&document.querySelector('button[aria-label="生成"]'));
 for(const type of Object.keys(OPS)){
  // Composed prompt slot: local text or upstream text both satisfy it (catalog seam is the page's live object).
  await p.evaluate(({type,op})=>{
   const c=window.__panel.catalog,id='qa-gate-'+type;
   const composition=type==='audio'?{kind:'single_body',localRole:'body'}:{kind:'content_with_instruction',localRole:'instruction'};
   if(!c.models.some(m=>m.id===id)){const m={id,label:'离线'+type+'正文夹具',listed:true,parameterSchema:{},operations:[{id:op,listed:true,output:{type},
    inputs:[{slot:'prompt',type:'text',role:'prompt',source:'node_field',valueSources:['local_field','upstream_output'],composition,min:1,max:1}]}]};c[type].push(m);c.models.push(m);}
   window.__panel.hydrate({targetId:'target',edges:[],nodes:[{id:'target',type:'material',position:{x:400,y:100},
    data:{materialType:type,nodeKind:'generate',kind:'generate',label:'生成目标',prompt:'',inputBindingVersion:1,slotBindings:{},params:{model:id,operation:op}}}]});
  },{type,op:OPS[type]});
  // Empty prompt, no upstream text: disabled up front with the kernel copy.
  await p.waitForFunction(()=>document.querySelector('button[aria-label="生成"]')?.getAttribute('aria-disabled')==='true');
  const empty=await button();
  assert.equal(empty.disabled,'true');assert.equal(empty.title,'请补齐正文');assert.equal(empty.slotMissing,false);
  await p.screenshot({path:`${out}/${type}-empty.png`});
  // Local prompt only: enabled.
  await p.evaluate(()=>window.__panel.patch('target',{prompt:'1dog'}));
  await p.waitForFunction(()=>document.querySelector('button[aria-label="生成"]').getAttribute('aria-disabled')==='false');
  const typed=await button();
  assert.equal(typed.disabled,'false');assert.equal(typed.title,'生成');assert.equal(typed.slotMissing,false);
  await p.screenshot({path:`${out}/${type}-typed.png`});
  results.push({type,empty,typed});
 }
 assert.equal(results.length,4);
 await fs.writeFile(out+'/browser-result.json',JSON.stringify({status:'passed',results},null,2));
}finally{await task.finish({keep:[]});await fs.writeFile(out+'/browser-cleanup.json',JSON.stringify({spaceId:task.spaceId,closed:true}));}
