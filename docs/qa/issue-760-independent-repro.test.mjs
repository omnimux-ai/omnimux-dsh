import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

import { planResourcePickerCommit } from '../../plugins/omnimux-workflow/src/canvas/editor/utils/resourcePickerPolicy.ts';
import { planCanvasInputMutation } from '../../plugins/omnimux-workflow/src/shared/graph/canvasInputMutationGateway.ts';
import { catalogFor, operation, slot } from '../../plugins/omnimux-workflow/src/workflow/seam/submissionFixtures.mjs';
import { createMaterialGatewayExecutor } from '../../plugins/omnimux-workflow/src/workflow/execution/materialGatewayExecutor.ts';
import { referenceToken } from '../../plugins/omnimux-workflow/src/canvas/editor/components/PromptTokenEditor/referenceCandidates.ts';
const require = createRequire(new URL('../../plugins/omnimux-workflow/package.json', import.meta.url));
const { JSDOM } = createRequire(new URL('../../plugins/omnimux/package.json', import.meta.url))('jsdom');
const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>');
for (const name of ['window','document','Node','HTMLElement','Element']) globalThis[name] = dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const bundle = await build({entryPoints:[new URL('../../plugins/omnimux-workflow/src/canvas/editor/components/PromptTokenEditor/PromptTokenEditor.tsx',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react-dom/client']});
const mod = {exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports);
const Editor = mod.exports.default;
const root = createRoot(document.querySelector('main'));
after(async () => { await act(() => root.unmount()); dom.window.close(); });
const image = id => ({id,type:'material',position:{x:0,y:0},data:{materialType:'image',nodeKind:'import',label:id,mediaUrl:`https://example.test/${id}.png`}});
const occupant = id => ({sourceNodeId:id,edgeId:`e-${id}`,pinned:true});

test('replace first strip occupant preserves second occupant rather than replacing last', () => {
  const catalog = catalogFor('image','refs',[operation('image_to_image','image',[slot('image','reference',0,2,'refs')])]);
  const target = {id:'target',type:'material',position:{x:0,y:0},data:{materialType:'image',nodeKind:'generate',prompt:'describe',params:{model:'refs',operation:'image_to_image'},slotBindings:{refs:[occupant('a'),occupant('b')]}}};
  const nodes = [target,...['a','b','c'].map(image)];
  const edges = ['a','b','c'].map(id => ({id:`e-${id}`,source:id,target:'target'}));
  // Replacement request carries the clicked occupant identity through the picker.
  const plan = planResourcePickerCommit({nodes,edges,targetNodeId:'target',selectedCanvasNodeIds:['c'],localFiles:[],mode:'replace',replaceEdgeId:'e-a',targetSlot:'refs',acceptedTypes:['image'],slotMax:2});
  const result = planCanvasInputMutation({nodes,edges},{addNodes:plan.addNodes,addEdges:plan.addEdges,nodePatches:plan.nodePatches},{catalog});
  assert.equal(result.status,'allowed');
  assert.deepEqual(result.nodes[0].data.slotBindings.refs.map(item=>item.sourceNodeId),['c','b']);
});

test('text-only mention in audio node submits upstream script without becoming local instruction', async () => {
  const catalog = catalogFor('audio','tts',[operation('text_to_speech','audio',[])]);
  const requests=[];
  const gateway={capabilities:async()=>catalog,submit:async request=>{requests.push(request);return {taskId:'offline'};},awaitTask:async()=>({type:'audio',url:'https://example.test/out.mp3'})};
  const node={id:'target',type:'material',data:{materialType:'audio',prompt:referenceToken('script','script','text').raw,params:{model:'tts',operation:'text_to_speech'},slotBindings:{}}};
  const output={text:'Only this script should be spoken.'};
  await createMaterialGatewayExecutor({gateway}).execute(node,{upstreamOutputs:new Map([['script',output]]),upstreamBindings:[{edgeId:'e-script',sourceNodeId:'script',output}],mediaDir:'/unused-offline',signal:new AbortController().signal});
  assert.equal(requests.length,1);
  assert.equal(requests[0].prompt,output.text);
});

test('reference thumbnail updates when upstream selection changes without editing prompt', async () => {
  const value='before @ref[a:-2:a.png] after';
  const props=url=>({value,currentReferences:[{...referenceToken('a','a.png','image',url),availability:'ready',connected:true}]});
  await act(()=>root.render(React.createElement(Editor,props('https://example.test/old.png'))));
  assert.equal(document.querySelector('.wf-prompt-token__thumb').src,'https://example.test/old.png');
  const editor = document.querySelector('.wf-prompt-token-editor');
  const text = editor.firstChild;
  const tokenSpan = editor.querySelector('.wf-prompt-token');
  const range = document.createRange();
  range.setStart(text, 3); range.collapse(true);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
  await act(()=>root.render(React.createElement(Editor,props('https://example.test/new.png'))));
  assert.equal(document.querySelector('.wf-prompt-token__thumb').src,'https://example.test/new.png');
  assert.equal(editor.firstChild, text);
  assert.equal(editor.querySelector('.wf-prompt-token'), tokenSpan);
  assert.equal(window.getSelection().anchorNode, text);
  assert.equal(window.getSelection().anchorOffset, 3);
  await act(()=>root.render(React.createElement(Editor,props(undefined))));
  assert.equal(editor.querySelector('.wf-prompt-token__thumb'), null);
  assert.ok(editor.querySelector('.wf-prompt-token__icon'));
  await act(()=>root.render(React.createElement(Editor,props('https://example.test/ready.png'))));
  assert.equal(editor.querySelector('.wf-prompt-token__thumb').src, 'https://example.test/ready.png');
  assert.equal(editor.firstChild, text);
  assert.equal(window.getSelection().anchorOffset, 3);
  await act(() => editor.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true })));
  await act(()=>root.render(React.createElement(Editor,props('https://example.test/composed.png'))));
  assert.equal(editor.querySelector('.wf-prompt-token__thumb').src, 'https://example.test/ready.png');
  await act(() => editor.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true })));
  assert.equal(editor.querySelector('.wf-prompt-token__thumb').src, 'https://example.test/composed.png');
  assert.equal(window.getSelection().anchorNode, text);
  assert.equal(window.getSelection().anchorOffset, 3);
});
