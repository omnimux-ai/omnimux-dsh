import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasReferenceCandidates, currentReferenceCandidates, referenceMutation, referenceToken } from './referenceCandidates.ts';
import { parseMarkdownToTokenSegments, serializeSegmentsToMarkdown } from './promptTokenCompiler.ts';
import { planCanvasInputMutation } from '../../../../shared/graph/canvasInputMutationGateway.ts';
import { catalogFor, operation, slot } from '../../../../workflow/seam/submissionFixtures.mjs';
import { createMaterialGatewayExecutor } from '../../../../workflow/execution/materialGatewayExecutor.ts';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const node = (id, type = 'image', extra = {}) => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialType: type, nodeKind: 'import', label: id, mediaUrl: type === 'image' ? `https://example.test/${id}.png` : undefined, content: type === 'text' ? `正文 ${id}` : undefined, ...extra } });
const target = () => node('target', 'image', { nodeKind: 'generate', prompt: '', params: { model: 'refs', operation: 'image_to_image' } });
const catalog = catalogFor('image', 'refs', [operation('image_to_image', 'image', [slot('image', 'reference', 0, 1, 'refs'), { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 }])]);

test('store history undoes and redoes feed and token as one action even during rapid typing', async () => {
 const result = await build({ entryPoints:[new URL('../../../store/canvasStore.ts',import.meta.url).pathname], bundle:true, write:false, platform:'node', format:'cjs', nodePaths:(process.env.NODE_PATH??'').split(':').filter(Boolean), plugins:[{name:'preferences',setup(build){
  build.onResolve({filter:/generationPreferencesStore$/},()=>({path:'preferences',namespace:'mock'}));
  build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const useGenerationPreferencesStore={getState:()=>({lastModelByType:{}})};'}));
 }}] });
 const mod={exports:{}}; new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const store=mod.exports.useCanvasStore;
 store.getState().hydrateGraph([target(),node('a')],[]); store.getState().setCatalogRuntime(catalog); store.getState().clearHistory();
 store.getState().applyCanvasInputMutation({nodePatches:[{nodeId:'target',data:{prompt:'前文 @a'}}]}); store.getState().pushHistory();
 const before=JSON.stringify({nodes:store.getState().nodes,edges:store.getState().edges});
 const prompt=`前文 ${referenceToken('a','a','image').raw} `;
 store.getState().applyCanvasInputMutation(referenceMutation('target','a',prompt,store.getState().edges)); store.getState().pushHistory(true);
 const after=JSON.stringify({nodes:store.getState().nodes,edges:store.getState().edges});
 store.getState().undo(); assert.equal(JSON.stringify({nodes:store.getState().nodes,edges:store.getState().edges}),before);
 store.getState().redo(); assert.equal(JSON.stringify({nodes:store.getState().nodes,edges:store.getState().edges}),after);
});

test('current references derive from canonical bindings and include text and standby feed without slotState', () => {
 const upstreams = ['a', 'b', 'text'].map((id) => ({ nodeId: id, edgeId: `e-${id}`, label: id, materialType: id === 'text' ? 'text' : 'image', availability: 'ready', hasMedia: true }));
 const items = currentReferenceCandidates(upstreams, { refs: [{ edgeId: 'e-b', sourceNodeId: 'b' }] });
 assert.deepEqual(items.map(item => item.nodeId), ['b','a','text']);
 assert.deepEqual(items.map(item => item.slotIndex), [0,-2,-1]);
});

test('canvas discovery lists every image/text node excluding self, preserving pending and cycle explanations', () => {
 const nodes = [target(), node('a'), node('pending', 'image', { mediaUrl: '' }), node('text', 'text'), node('audio', 'audio')];
 const items = canvasReferenceCandidates('target', nodes, [{ id: 'back', source: 'target', target: 'text' }]);
 assert.deepEqual(items.map(item => item.nodeId), ['a','pending','text']);
 assert.equal(items[1].availability, 'waiting');
 assert.equal(items[2].reasonCode, 'cycle');
});

test('reference mutation creates one feed and prompt atomically, existing source never adds duplicate edges', () => {
 const nodes = [target(), node('a')];
 const prompt = `改写 ${referenceToken('a','a','image').raw}`;
 const first = planCanvasInputMutation({nodes, edges: []}, referenceMutation('target','a',prompt,[]), {catalog});
 assert.equal(first.status, 'allowed'); assert.equal(first.edges.length,1);
 assert.equal(first.nodes[0].data.prompt,prompt);
 const second = planCanvasInputMutation(first, referenceMutation('target','a',prompt,first.edges), {catalog});
 assert.equal(second.edges.length,1); assert.deepEqual(second.nodes[0].data.params,nodes[0].data.params);
 assert.equal(second.nodes[0].data.slotBindings.refs.length,1);
 const persisted = JSON.parse(JSON.stringify(second));
 assert.equal(persisted.nodes[0].data.prompt,prompt); assert.equal(persisted.edges[0].source,'a');
});

test('cycle, missing source and self-link reject prompt and edge together without altering graph', () => {
 const current = {nodes: [target(), node('a', 'image', {nodeKind:'generate'})], edges:[{id:'reverse', source:'target',target:'a'}]};
 for (const [source, reason] of [['a','cycle'],['gone','missing_node'],['target','self_connection']]) {
  const plan = planCanvasInputMutation(current, referenceMutation('target',source,'must not save',current.edges), {catalog});
  assert.equal(plan.reasonCode,reason); assert.equal(plan.status,'rejected');
  assert.equal(plan.nodes,current.nodes); assert.equal(plan.edges,current.edges); assert.equal(plan.nodes[0].data.prompt,'');
 }
});

test('token identity does not bind a different node with the same slot index; text survives serialization', () => {
 const state = { activeSlots:[{ sourceNodeId:'other',slotIndex:0,materialType:'image',mediaUrl:'wrong',label:'wrong'}],overflowPool:[] };
 const legacy = parseMarkdownToTokenSegments('@ref[original:0:original.png]',state)[0];
 assert.equal(legacy.token.mediaUrl,undefined);
 const text = referenceToken('text','无扩展名标题','text');
 const parsed = parseMarkdownToTokenSegments(text.raw,state);
 assert.equal(parsed[0].token.materialType,'text'); assert.equal(parsed[0].token.mediaUrl,undefined);
 assert.equal(serializeSegmentsToMarkdown(parsed),text.raw);
 assert.deepEqual(parseMarkdownToTokenSegments(''),[]);
 assert.equal(serializeSegmentsToMarkdown(parseMarkdownToTokenSegments('已保存的 @ 用户文本')),'已保存的 @ 用户文本');
});

test('mention feed keeps First-N capacity and sends only occupied image plus all upstream text and local instructions', async () => {
 let graph = {nodes: [target(), node('a'), node('b'), node('text','text')],edges:[]};
 const prompt = `缩短到30秒 ${referenceToken('b','b.png','image').raw} ${referenceToken('text','剧本','text').raw}`;
 for (const id of ['a','b','text']) {
  graph = planCanvasInputMutation(graph,referenceMutation('target',id,prompt,graph.edges),{catalog});
  assert.equal(graph.status,'allowed');
 }
 assert.equal(graph.edges.length,3);
 const result = graph.nodes.find(item=>item.id==='target');
 assert.equal(result.data.slotBindings.refs.length,1);
 assert.equal(result.data.slotBindings.refs[0].sourceNodeId,'a');
 result.data.slotState = {activeSlots:[],overflowPool:[{sourceNodeId:'b',mediaUrl:'https://example.test/b.png',materialType:'image'}]};
 const requests = [];
 const gateway = {capabilities:async()=>catalog,submit:async request=>{requests.push(request);return {taskId:'offline'};},awaitTask:async()=>({type:'image',url:'https://example.test/out.png'})};
 const outputs = new Map([['a',{mediaAssets:[{type:'image',url:'https://example.test/a.png'}]}],['b',{mediaAssets:[{type:'image',url:'https://example.test/b.png'}]}],['text',{text:'完整原剧本内容'}]]);
 await createMaterialGatewayExecutor({gateway}).execute(result,{upstreamOutputs:outputs,upstreamBindings:graph.edges.map(edge=>({edgeId:edge.id,sourceNodeId:edge.source,output:outputs.get(edge.source)})),mediaDir:'/tmp/offline-reference',signal:new AbortController().signal});
 assert.equal(requests.length,1);
 assert.deepEqual(requests[0].references.map(ref=>ref.sourceNodeId),['a']);
 assert.match(requests[0].prompt,/完整原剧本内容/); assert.match(requests[0].prompt,/缩短到30秒/);
 assert.doesNotMatch(requests[0].prompt,/@ref\[/);
 assert.equal(requests[0].model,'refs'); assert.equal(requests[0].operation,'image_to_image');
});
