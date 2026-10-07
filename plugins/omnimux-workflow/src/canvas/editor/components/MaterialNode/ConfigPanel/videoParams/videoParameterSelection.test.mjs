import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVideoParameterSelection } from './videoParameterSelection.ts';

const resolution = (defaultValue) => ({ options: [{value:'480p'},{value:'720p'},{value:'1080p'}], defaultValue });
const a = { id:'a', label:'A', parameters:{resolution:resolution('720p'),duration:{options:[{value:5},{value:10}],defaultValue:5}} };
const b = { id:'b', label:'B', parameters:{resolution:resolution('1080p'),duration:{options:[{value:5},{value:10}],defaultValue:10}} };
const catalog = { video:[a,b], models:[a,b].map(m => ({...m,operations:[
  {id:'text_to_video',listed:true,output:{type:'video'},inputs:[]},
  {id:'first_frame',listed:true,output:{type:'video'},inputs:[{slot:'first_frame',type:'image',source:'upstream_edge',min:1,max:1}],parameters:{resolution:resolution('720p')}},
]})) };
const transition = (params, targetModelItem, extra={}) => buildVideoParameterSelection({params,currentModelItem:catalog.video.find(m=>m.id===params.model),targetModelItem,catalog,...extra});

test('explicit target selection recovers unknown current model without borrowing fallback controls', () => {
  const result = transition({model:'missing',resolution:'480p'},b,{explicitModelSelection:true,currentModelItem:a});
  assert.equal(result.params.model,'b'); assert.equal(result.params.resolution,'1080p');
  assert.equal(result.parameterSelections.byModel.a,undefined);
});

test('unsupported required field is omitted without an impossible setting error', () => {
  const target = {...b,parameters:{...b.parameters,sound:{supported:false,required:true,defaultValue:false}}};
  const result=transition({model:'a',sound:true},target);
  assert.equal(result.params.sound,undefined); assert.deepEqual(result.errors,[]);
});

test('removed schema controls are dropped but creative content survives', () => {
  const result = transition({model:'a',operation:'text_to_video',seed:7,sound:true,negativePrompt:'keep'},b);
  assert.equal(result.params.seed,undefined); assert.equal(result.params.sound,undefined); assert.equal(result.params.negativePrompt,'keep');
});
test('malformed history is ignored without crashing', () => {
  for (const parameterSelections of [{version:1}, {version:1,byModel:null}, {version:1,byModel:{b:null}}, {version:1,byModel:{b:{lastOperationId:'text_to_video',byOperation:null}}}]) {
    const result = transition({model:'a',operation:'text_to_video'},b,{parameterSelections});
    assert.equal(result.params.resolution,'1080p');
  }
});
test('unresolved current model cannot be migrated through a fallback model item', () => {
  const params = {model:'missing',operation:'text_to_video',resolution:'480p'};
  const result = buildVideoParameterSelection({params,currentModelItem:a,targetModelItem:a,catalog});
  assert.deepEqual(result.params,params); assert.equal(result.parameterSelections,undefined);
});

test('first visit uses target defaults; returning restores current branch, not another model', () => {
  const old = {model:'a',operation:'text_to_video',resolution:'480p',duration:5,prompt:'keep',firstFrameUrl:'https://example.test/a.png'};
  const next = transition(old,b,{routing:{allowedGroups:['channel-b']}});
  assert.equal(next.params.resolution,'1080p'); assert.equal(next.params.duration,10);
  assert.deepEqual(next.params.routing,{allowedGroups:['channel-b']});
  assert.equal(next.params.prompt,'keep'); assert.equal(next.params.firstFrameUrl,old.firstFrameUrl);
  assert.equal(next.params.parameterSelections,undefined);
  const back = transition({...next.params,resolution:'720p'},a,{parameterSelections:next.parameterSelections});
  assert.equal(back.params.resolution,'480p');
  assert.equal(back.parameterSelections.byModel.b.byOperation.text_to_video.resolution,'720p');
  assert.equal(next.parameterSelections.byModel.b.byOperation.text_to_video.resolution,'1080p');
});
test('modes remember their own controls and last explicit mode across model roundtrip', () => {
  const first = transition({model:'a',operation:'text_to_video',resolution:'1080p'},a,{nextOperationId:'first_frame'});
  assert.equal(first.params.resolution,'720p');
  const other = transition({...first.params,resolution:'480p'},b,{parameterSelections:first.parameterSelections});
  const back = transition(other.params,a,{parameterSelections:other.parameterSelections});
  assert.equal(back.params.operation,'first_frame'); assert.equal(back.params.resolution,'480p');
  const text = transition(back.params,a,{parameterSelections:back.parameterSelections,nextOperationId:'text_to_video'});
  assert.equal(text.params.resolution,'1080p');
});
test('legacy invalid resolution is corrected visibly, migrates current branch only and is idempotent', () => {
  const target = {...a,parameters:{resolution:{options:[{value:'720p'}],defaultValue:'720p'}}};
  const currentCatalog = {...catalog,video:[target],models:[{...catalog.models[0],...target}]};
  const result = buildVideoParameterSelection({params:{model:'a',operation:'text_to_video',resolution:'480p'},currentModelItem:target,targetModelItem:target,catalog:currentCatalog});
  assert.equal(result.params.resolution,'720p'); assert.match(result.notices.join(' '),/480p/);
  assert.deepEqual(Object.keys(result.parameterSelections.byModel),['a']);
  const again = buildVideoParameterSelection({...result,currentModelItem:target,targetModelItem:target,catalog:currentCatalog});
  assert.deepEqual(again.params,result.params); assert.deepEqual(again.parameterSelections,result.parameterSelections); assert.deepEqual(again.notices,[]);
});
test('required field without valid explicit default blocks instead of choosing first expensive option', () => {
  const target = {...b,parameters:{resolution:{required:true,options:[{value:'4k'}]}}};
  const result = transition({model:'a',operation:'text_to_video'},target);
  assert.equal(result.params.resolution,undefined); assert.ok(result.errors.length > 0);
});
test('unknown model or unavailable catalog cannot write guessed defaults/history', () => {
  const params = {model:'missing',resolution:'480p',operation:'unknown'};
  const result = buildVideoParameterSelection({params,catalog:null});
  assert.deepEqual(result.params,params); assert.equal(result.parameterSelections,undefined); assert.ok(result.errors.length);
});
test('unknown explicit mode remains invalid rather than fabricating support', () => {
  const result = transition({model:'a',operation:'unknown',resolution:'480p'},a);
  assert.equal(result.params.operation,'unknown'); assert.equal(result.parameterSelections,undefined); assert.ok(result.errors.length);
});
test('schema controls do not capture prompt/media/routing and non-scalar runtime values', () => {
  const result = transition({model:'a',operation:'text_to_video',resolution:'480p',prompt:'keep',routing:{allowedGroups:['a']},firstFrameUrl:'https://example.test/a'},b);
  assert.deepEqual(Object.keys(result.parameterSelections.byModel.a.byOperation.text_to_video).sort(),['duration','resolution']);
});

test('operation adapts to line constraints when preferred operation is not supported by target channel group', () => {
  const h3 = { id:'minimax-h3', label:'Hailuo H3', parameters:{resolution:resolution('720p')} };
  const restrictedModel = {
    ...h3,
    operations: [
      { id:'first_frame', listed:true, output:{type:'video'}, inputs:[{slot:'first_frame',type:'image',source:'upstream_edge',min:1,max:1}] },
      { id:'digital_human', listed:true, output:{type:'video'}, inputs:[{slot:'character',type:'image',source:'upstream_edge',min:1,max:1},{slot:'driving_audio',type:'audio',source:'upstream_edge',min:1,max:1}] }
    ]
  };
  const currentParams = { model:'minimax-h3', operation:'first_frame', resolution:'720p' };
  const result = buildVideoParameterSelection({
    params: currentParams,
    currentModelItem: h3,
    targetModelItem: restrictedModel,
    catalog: { video:[restrictedModel], models:[restrictedModel] },
    routing: { allowedGroups: ['lipsync'] },
  });
  assert.equal(result.params.operation, 'digital_human');
  assert.deepEqual(result.errors, []);
});

test('comfyui line narrows the operation list and keeps hidden parameters from resurfacing', () => {
  const resolution = { options:[{value:'768P'},{value:'2K'}], defaultValue:'2K' };
  const operation = (id) => ({
    id, listed:true, output:{type:'video'},
    inputs:[{slot:'prompt',type:'text',source:'node_field',min:0,max:1}],
    // The operation republishes the control the line refuses; the panel must not read it back.
    parameters:{ resolution:{...resolution} },
  });
  const h3 = {
    id:'minimax-h3', label:'海螺 H3',
    parameters:{ resolution:{...resolution}, duration:{options:[{value:5},{value:10}],defaultValue:10} },
    operations:[operation('text_to_video'), operation('video_multi_ref')],
  };
  const catalog = { video:[h3], models:[h3] };
  const args = { currentModelItem:h3, targetModelItem:h3, catalog };

  const narrowed = buildVideoParameterSelection({
    ...args,
    params:{ model:'minimax-h3', operation:'text_to_video', resolution:'2K', duration:5 },
    routing:{ channelGroupId:'comfyui', allowedGroups:['comfyui'] },
  });
  assert.equal(narrowed.params.operation, 'video_multi_ref');
  assert.equal(narrowed.params.resolution, undefined);
  // 模式被渠道收敛到唯一允许项，时长回到该模式的模型默认值（10s），不是用户上一次的 5s。
  assert.equal(narrowed.params.duration, 10);
  assert.deepEqual(narrowed.notices.filter((notice) => notice.includes('清晰度')), []);

  const open = buildVideoParameterSelection({
    ...args,
    params:{ model:'minimax-h3', operation:'text_to_video', resolution:'2K', duration:5 },
  });
  assert.equal(open.params.operation, 'text_to_video');
  assert.equal(open.params.resolution, '2K');
});

