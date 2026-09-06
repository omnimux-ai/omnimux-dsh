import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CANVAS_GENERATION_POLICY, projectCanvasCatalog } from './generationPolicy.ts';
import { buildUpstreamFingerprint, evaluateCatalogCompat, planAutoAdaptation } from './validation/compatKernel.ts';
import { planCanvasInputMutation } from './graph/canvasInputMutationGateway.ts';
import { reconcileCanvasForCatalog } from './graph/catalogReconcile.ts';

const CLAUDE = 'claude-opus-4-6';
const GEMINI = 'gemini-3.8-flash';
const DEEPSEEK = 'deepseek-v4-flash-vision-exp';
const GPT = 'gpt-5.5';
// Synthetic contracts exercise policy, not provider support claims.
function textModel(id, modalities = [], listed = true) {
  const prompt = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 };
  return { id, label: id === GEMINI ? 'Gemini 3.8 Flash' : id, family: 'test', operations: [
    { id: 'chat', label: '文本对话', listed, output: { type: 'text' }, inputs: [prompt] },
    ...(modalities.length ? [{ id: 'vision_chat', label: '素材分析', listed, output: { type: 'text' }, inputs: [prompt,
      ...modalities.map((type) => ({ slot: `reference_${type}`, type, role: 'reference', source: 'upstream_edge', min: 0, max: 4 })),
    ] }] : []),
  ] };
}
function catalog() {
  const models = [textModel('unapproved', ['image', 'video', 'audio']), textModel(CLAUDE), textModel(GEMINI, ['image', 'video', 'audio']), textModel(DEEPSEEK), textModel(GPT, ['image'])];
  return { source: 'omnimux', fingerprint: 'fixture', models, text: models.map(({id,label})=>({id,label})), image: [], video: [], audio: [], defaults: {text:'unapproved'} };
}
function fp(type) { return buildUpstreamFingerprint({prompt: 'Analyze', assets: type ? [{sourceNodeId: 'asset', type}] : []}); }
function node(id, model, materialType='text') { return {id, type:'material', position:{x:0,y:0}, data:{nodeKind:'generate', materialType, params: model ? {model} : {}, prompt:'Analyze'}}; }

test('curation intersects listed operations and enabled buckets; policy defaults cannot admit absent models', () => {
  const raw = catalog();
  const view = projectCanvasCatalog(raw);
  assert.deepEqual(view.text.map((m)=>m.id), [CLAUDE, GEMINI, DEEPSEEK, GPT]);
  assert.equal(view.defaults.text, GEMINI);
  assert.equal(raw.text.length, 5);
  assert.equal(evaluateCatalogCompat(view, fp(), {outputType:'text'}).models.some((m)=>m.modelId==='unapproved'), false);
  assert.equal(view.models.some((m)=>m.id==='unapproved'), false);
  assert.notEqual(view.fingerprint, raw.fingerprint);
  assert.deepEqual(view.audio, []);
  assert.equal(view.defaults.audio, '');
  raw.text = raw.text.filter((m)=>m.id!==GEMINI);
  assert.equal(projectCanvasCatalog(raw).models.some((m)=>m.id===GEMINI), false);
  assert.equal(projectCanvasCatalog(raw).defaults.text, CLAUDE);
  raw.models.find((m)=>m.id===GPT).operations.forEach((op)=>{op.listed=false;});
  assert.equal(projectCanvasCatalog(raw).text.some((m)=>m.id===GPT), false);
});

test('new nodes use compatible manual preference, then type default, then curated order', () => {
  const view = projectCanvasCatalog(catalog());
  const select = (overrides={})=>planAutoAdaptation({catalog:view, fingerprint:fp(), outputType:'text', ...overrides});
  assert.equal(select().modelId, GEMINI);
  assert.equal(select({preferredModelId: GPT}).modelId, GPT);
  assert.equal(select({preferredModelId: CLAUDE, fingerprint:fp('video')}).modelId, GEMINI);
  assert.equal(select({preferredModelId: 'unapproved'}).modelId, GEMINI);
  const withoutGemini = projectCanvasCatalog({...catalog(), text:catalog().text.filter((m)=>m.id!==GEMINI)});
  assert.equal(select({catalog:withoutGemini}).modelId, CLAUDE);
  assert.equal(select({catalog:withoutGemini, fingerprint:fp('video')}), null);
});

test('compatible current model survives preferences; unsupported input prefers default before same family', () => {
  const view = projectCanvasCatalog(catalog());
  const selected = planAutoAdaptation({catalog:view, fingerprint:fp('image'), outputType:'text', currentModelId:GPT, currentOperationId:'chat', preferredModelId:CLAUDE});
  assert.equal(selected.modelId, GPT);
  assert.equal(selected.operationId, 'vision_chat');
  const adapted = planAutoAdaptation({catalog:view, fingerprint:fp('video'), outputType:'text', currentModelId:CLAUDE});
  assert.equal(adapted.modelId, GEMINI);
  assert.equal(adapted.rule, 'type_default');
});

test('graph atomically assigns new-node preference; manual choice never changes sibling nodes', () => {
  const view=projectCanvasCatalog(catalog());
  const sibling=node('old', CLAUDE);
  const created=planCanvasInputMutation({nodes:[sibling],edges:[]},{addNodes:[node('new')]},{catalog:view,preferredModels:{text:GPT}});
  assert.equal(created.nodes.find((n)=>n.id==='new').data.params.model,GPT);
  assert.deepEqual(created.nodes.find((n)=>n.id==='old'),sibling);
  const manual=planCanvasInputMutation(created,{nodePatches:[{nodeId:'new',data:{params:{model:DEEPSEEK}}}]},{catalog:view,preferredModels:{text:GPT}});
  assert.equal(manual.nodes.find((n)=>n.id==='new').data.params.model,DEEPSEEK);
  assert.equal(manual.nodes.find((n)=>n.id==='new').data.compat.adaptation,undefined);
  assert.deepEqual(manual.nodes.find((n)=>n.id==='old'),sibling);
});

test('input adaptation preserves assets, explains switch, and leaves preference data untouched', () => {
  const view=projectCanvasCatalog(catalog());
  const prefs={text:CLAUDE};
  const asset={...node('asset'),data:{nodeKind:'import',materialType:'video'}};
  const result=planCanvasInputMutation({nodes:[node('n',CLAUDE),asset],edges:[]},{addEdges:[{source:'asset',target:'n'}]},{catalog:view,preferredModels:prefs});
  assert.equal(result.status,'allowed');
  assert.equal(result.edges.length,1);
  const changed=result.nodes.find((n)=>n.id==='n');
  assert.equal(changed.data.params.model,GEMINI);
  assert.equal(changed.data.params.operation,'vision_chat');
  assert.deepEqual(changed.data.compat.adaptation,{fromModelId:CLAUDE,toModelId:GEMINI,toModelLabel:'Gemini 3.8 Flash',inputTypes:['video']});
  assert.deepEqual(prefs,{text:CLAUDE});
});

test('saved excluded models preserve configuration and outputs during catalog hydration', () => {
  const original=node('saved','unapproved'); original.data.content='existing result';
  const result=reconcileCanvasForCatalog({nodes:[original],edges:[],catalog:projectCanvasCatalog(catalog()),preferredModels:{text:GPT},previousFingerprint:'old'});
  assert.equal(result.nodes[0].data.params.model,'unapproved');
  assert.equal(result.nodes[0].data.content,'existing result');
  assert.equal(result.nodes[0].data.compat.status,'configuration_error');
  assert.deepEqual(result.nodes[0].data.compat.reasonCodes,['not_listed']);
  const delayed=reconcileCanvasForCatalog({nodes:[node('empty')],edges:[],catalog:projectCanvasCatalog(catalog()),preferredModels:{text:GPT},previousFingerprint:'old'});
  assert.equal(delayed.nodes[0].data.params.model,GPT);
});

test('upstream text readiness follows executor prompt precedence and refreshes when content changes', () => {
  const target=node('target',CLAUDE); target.data.prompt='';
  const source={...node('source'),data:{nodeKind:'import',materialType:'text',content:'upstream text'}};
  const view=projectCanvasCatalog(catalog());
  const joined=planCanvasInputMutation({nodes:[source,target],edges:[]},{addEdges:[{source:'source',target:'target'}]},{catalog:view});
  assert.equal(joined.nodes.find((n)=>n.id==='target').data.compat.readyToSubmit,true);
  const cleared=planCanvasInputMutation(joined,{nodePatches:[{nodeId:'source',data:{content:''}}]},{catalog:view});
  assert.equal(cleared.nodes.find((n)=>n.id==='target').data.compat.readyToSubmit,false);
});

test('video editing intent cannot silently become generation when no compatible editor remains', () => {
  const view=projectCanvasCatalog(catalog());
  const m={id:'seedance-2-0-fast',label:'Video',operations:[{id:'text_to_video',listed:true,output:{type:'video'},inputs:[]}]};
  view.models.push(m);view.video.push({id:m.id,label:m.label});
  assert.equal(planAutoAdaptation({catalog:view,fingerprint:fp(),outputType:'video',currentModelId:m.id,currentOperationId:'video_edit'}),null);
});
