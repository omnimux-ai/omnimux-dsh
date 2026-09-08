import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(new URL('../../../../../../omnimux/package.json', import.meta.url))('jsdom');
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { referenceToken } from './referenceCandidates.ts';

const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>',{url:'https://example.test'});
for (const name of ['window','document','Node','HTMLElement','Element','MouseEvent','KeyboardEvent']) globalThis[name]=dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.Range.prototype.getBoundingClientRect=()=>({left:200,top:420,bottom:438,width:1,height:18});
dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
const bundle=await build({entryPoints:[new URL('./PromptTokenEditor.tsx',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react-dom/client'],nodePaths:(process.env.NODE_PATH??'').split(':').filter(Boolean)});
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const Editor=mod.exports.default;
const candidate=(id,type='image',extra={})=>({...referenceToken(id,`${id}${type==='image'?'.png':''}`,type),availability:'ready',connected:false,...extra});
const canvas=[candidate('portrait'),candidate('script','text'),candidate('cyclic','text',{reasonCode:'cycle'})];
let root;
async function mount(extra={}) {
 if(root)await act(()=>root.unmount());
 root=createRoot(document.querySelector('main'));
 const changes=[];const commits=[];
 await act(()=>root.render(React.createElement(Editor,{value:'',canvasReferences:canvas,currentReferences:[],onChange:value=>changes.push(value),onCommitReference:(token,prompt)=>{commits.push({token,prompt});return true;},...extra})));
 return {editor:document.querySelector('[role="textbox"]'),changes,commits};
}
async function type(editor,text) {
 editor.textContent=text;
 const range=document.createRange();range.setStart(editor.firstChild,text.length);range.collapse(true);
 const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
 await act(()=>editor.dispatchEvent(new window.Event('input',{bubbles:true})));
}
async function key(editor,name,extra={}) {await act(()=>editor.dispatchEvent(new window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...extra})));}
after(async()=>{if(root)await act(()=>root.unmount());dom.window.close();});

test('empty editor contains no prefilled @; saved literal user text remains unchanged',async()=>{
 let view=await mount();assert.equal(view.editor.textContent,'');assert.equal(document.querySelector('[role="listbox"]'),null);
 view=await mount({value:'真实文本 @ 保留'});assert.equal(view.editor.textContent,'真实文本 @ 保留');
});
test('audio authority count remains unique with reference menus and preserves overflow semantics', async () => {
  for (const count of [0, 10000, 10001]) {
    const { editor, commits } = await mount({ materialType: 'audio', maxLength: 10000, countOverride: count });
    const counters = document.querySelectorAll('.wf-prompt-token-meta-count');
    assert.equal(counters.length, 1);
    assert.equal(counters[0].textContent, `${count}/10000`);
    assert.equal(counters[0].getAttribute('data-exceeded'), String(count > 10000));
    assert.equal(counters[0].classList.contains('wf-prompt-token-meta-count--exceeded'), count > 10000);
    assert.equal(counters[0].getAttribute('role'), count > 10000 ? 'alert' : null);
    await type(editor, '@por');
    await key(editor, 'ArrowRight');
    await key(editor, 'Enter');
    assert.equal(commits.length, 1);
    assert.equal(document.querySelectorAll('.wf-prompt-token-meta-count').length, 1);
    assert.equal(counters[0].textContent, `${count}/10000`);
  }
});

test('canvas submenu selection replaces @query in place with one atomic token and closes portals',async()=>{
 const {editor,commits}=await mount();await type(editor,'前文 @por');
 assert.equal(document.querySelectorAll('[role="listbox"]').length,1);
 await key(editor,'ArrowRight');await key(editor,'Enter');
 assert.equal(commits.length,1);assert.equal(commits[0].token.nodeId,'portrait');
 assert.equal(commits[0].prompt,'前文 @ref[portrait:-2:portrait.png] ');
 assert.equal(editor.querySelectorAll('[contenteditable="false"]').length,1);
 assert.equal(document.querySelector('[role="listbox"]'),null);
});
test('two-level keyboard navigation enters text category, rejects cycle, and supports left/Escape',async()=>{
 const {editor,commits}=await mount();await type(editor,'@');
 await key(editor,'ArrowDown');await key(editor,'ArrowRight');await key(editor,'ArrowDown');await key(editor,'Enter');
 assert.equal(commits.length,0);assert.ok(document.querySelector('[aria-disabled="true"]'));
 await key(editor,'ArrowLeft');assert.equal(document.querySelectorAll('[role="listbox"]').length,1);
 await key(editor,'ArrowRight');await key(editor,'Enter');assert.equal(commits[0].token.materialType,'text');
 await type(editor,'@');await key(editor,'Escape');assert.equal(document.querySelector('[role="listbox"]'),null);
});
test('IME Enter never selects a reference or prevents composition',async()=>{
 const {editor,commits}=await mount();await type(editor,'@');
 const event=new window.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});
 await act(()=>editor.dispatchEvent(event));assert.equal(event.defaultPrevented,false);assert.equal(commits.length,0);
});
test('rejected graph transaction restores prompt rather than leaving an unlinked token',async()=>{
 const {editor}=await mount({onCommitReference:()=>false});await type(editor,'保留 @por');await key(editor,'ArrowRight');await key(editor,'Enter');
 assert.equal(editor.textContent,'保留 @por');assert.equal(editor.querySelector('.wf-prompt-token'),null);
});
test('Delete removes one token and editor undo routes to graph history',async()=>{
 const history=[];const {editor,changes}=await mount({value:'@ref[script:-1:script]',onHistoryStep:redo=>history.push(redo)});
 const range=document.createRange();range.setStart(editor,0);range.collapse(true);window.getSelection().removeAllRanges();window.getSelection().addRange(range);
 await key(editor,'Delete');assert.equal(editor.querySelector('.wf-prompt-token'),null);assert.equal(changes.at(-1),'');
 await key(editor,'z',{ctrlKey:true});await key(editor,'z',{ctrlKey:true,shiftKey:true});assert.deepEqual(history,[false,true]);
});
