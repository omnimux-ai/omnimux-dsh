import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdir, readFile, mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyExamples } from '../../scripts/copy-examples.mjs'
const root=fileURLToPath(new URL('../../',import.meta.url)), require=createRequire(import.meta.url)
const directory=`${root}node_modules/.cache/forms-test`
await mkdir(directory,{recursive:true})
const outfile=`${directory}/render.cjs`
await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {ChakraProvider} from '@chakra-ui/react';import {FormField} from './src/client/Fields.jsx';import {formSystem} from './src/client/theme.js';import {FormsPage} from './src/client/FormsPage.jsx';export function renderPage(definitions){globalThis.window={};try{return renderToStaticMarkup(<FormsPage definitions={definitions}/>)}finally{delete globalThis.window}};export function render(field){return renderToStaticMarkup(<ChakraProvider value={formSystem}><FormField field={field} value={field.default} errors={[]} state={{staleRefs:[],uploads:[]}} editor={{set(){}}} hub={{}} workspaceId="w"/></ChakraProvider>)};export function mountPage(el,props){const root=createRoot(el);flushSync(()=>root.render(<FormsPage {...props}/>));return {update(next){flushSync(()=>root.render(<FormsPage {...next}/>))},unmount(){flushSync(()=>root.unmount())}}};export {formSystem};`,resolveDir:root,loader:'jsx'},bundle:true,alias:{'@omnimux/form-contract':`${root}../../packages/form-contract/src/index.ts`},format:'cjs',platform:'node',outfile,define:{'process.env.NODE_ENV':'"production"'}})
const {render,renderPage,formSystem,mountPage}=require(outfile)
test('all seven native Chakra fields render labels, controls and escaped text',()=>{
 const basic={id:'field',label:'<script>bad()</script>',required:true}
 const fields=[{type:'text'},{type:'textarea'},{type:'file',accept:['video/*'],maxFiles:1,maxBytes:100},{type:'number',min:1,max:10,step:1,default:2},{type:'slider',min:1,max:10,step:1,default:2},{type:'select',options:[{value:'a',label:'Alpha'}]},{type:'aspect-ratio',options:[{value:'16:9',label:'Wide'}]}]
 for(const field of fields){const html=render({...basic,...field});assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));assert.ok(!html.includes('<script>bad()'));assert.ok(html.includes('data-form-field="field"'))}
})
test('theme emits no document reset or html/body base styling',()=>{
 assert.equal(formSystem._config.preflight,false);assert.equal(formSystem._config.cssVarsRoot,'.omnimux-forms-body');assert.deepEqual(formSystem._config.globalCss,{})
 const globals=JSON.stringify(formSystem._global)
 assert.ok(globals.includes('.omnimux-forms-body'));assert.ok(!globals.includes(':root'));assert.ok(!globals.includes('html'))
})
test('browser page embeds the real templates and contract without a runtime source dependency',async()=>{
 const result=await build({entryPoints:[`${root}src/client/FormsPage.jsx`],bundle:true,write:false,format:'cjs',platform:'browser',jsx:'automatic',alias:{'@omnimux/form-contract':`${root}../../packages/form-contract/src/index.ts`},external:['react','react/jsx-runtime','react-dom'],define:{'process.env.NODE_ENV':'"production"'}})
 const client=result.outputFiles[0].text
 for(const id of ['marketing-insight','video-deconstruct','structure-replication','element-replacement']) assert.ok(client.includes(id))
 assert.ok(!client.includes('require("@omnimux/form-contract")'))
})
test('packaging copies real example bytes and fails if required sources are missing',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forms-examples-'))
 t.after(()=>rm(directory,{recursive:true,force:true}))
 const source=`${root}../../packages/form-contract/examples`
 await copyExamples(source,`${directory}/assets/examples`)
 assert.deepEqual(await readFile(`${directory}/assets/examples/replication-demo.mp4`),await readFile(`${source}/replication-demo.mp4`))
 await assert.rejects(copyExamples(`${directory}/missing`,`${directory}/other`),{code:'ENOENT'})
})

test('malformed bundled definition fails closed before reading examples or fields',()=>{const html=renderPage([{id:'broken'}]);assert.ok(html.includes('模板配置不可用'));assert.ok(!html.includes('填写表单'));assert.ok(!html.includes('data-form-field'))})


test('page attaches its real workbench store, balances replacement and unmount, and hides inactive content',()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'})
 const saved={window:globalThis.window,document:globalThis.document}
 globalThis.window=dom.window;globalThis.document=dom.window.document
 const calls=[],first={},second={}
 window.__omnimuxWorkbench={attachStore:s=>calls.push(['attach',s]),detachStore:s=>calls.push(['detach',s])}
 let mounted
 try {
  mounted=mountPage(document.getElementById('root'),{definitions:[{id:'broken'}],store:first})
  assert.deepEqual(calls,[['attach',first]])
  mounted.update({definitions:[{id:'broken'}],store:second,visible:false})
  assert.deepEqual(calls,[['attach',first],['detach',first],['attach',second]])
  const body=document.querySelector('.omnimux-forms-body')
  assert.equal(body.getAttribute('aria-hidden'),'true')
  mounted.unmount();mounted=null
  assert.deepEqual(calls.at(-1),['detach',second])
 } finally { mounted?.unmount();globalThis.window=saved.window;globalThis.document=saved.document;dom.window.close() }
})
