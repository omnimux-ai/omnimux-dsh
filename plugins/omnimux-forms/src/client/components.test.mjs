import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url)), require=createRequire(import.meta.url)
const directory=`${root}node_modules/.cache/forms-test`
await mkdir(directory,{recursive:true})
const outfile=`${directory}/render.cjs`
await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {ChakraProvider} from '@chakra-ui/react';import {FormField} from './src/client/Fields.jsx';import {formSystem} from './src/client/theme.js';import {FormsPage} from './src/client/FormsPage.jsx';export function renderPage(definitions){globalThis.window={};try{return renderToStaticMarkup(<FormsPage definitions={definitions}/>)}finally{delete globalThis.window}};export function render(field){return renderToStaticMarkup(<ChakraProvider value={formSystem}><FormField field={field} value={field.default} errors={[]} state={{staleRefs:[],uploads:[]}} editor={{set(){}}} hub={{}} workspaceId="w"/></ChakraProvider>)};export {formSystem};`,resolveDir:root,loader:'jsx'},bundle:true,alias:{'@omnimux/form-contract':`${root}../../packages/form-contract/src/index.ts`},format:'cjs',platform:'node',outfile,define:{'process.env.NODE_ENV':'"production"'}})
const {render,renderPage,formSystem}=require(outfile)
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
test('runtime templates are bundled and generated example is copied into installed plugin',async()=>{
 const client=await readFile(`${root}lib/client.js`,'utf8');assert.ok(client.includes('video-deconstruct'));assert.ok(!client.includes('require("@omnimux/form-contract")'))
 const bytes=await readFile(`${root}assets/examples/replication-demo.mp4`);assert.ok(bytes.length>1000)
})

test('malformed bundled definition fails closed before reading examples or fields',()=>{const html=renderPage([{id:'broken'}]);assert.ok(html.includes('模板配置不可用'));assert.ok(!html.includes('填写表单'));assert.ok(!html.includes('data-form-field'))})
