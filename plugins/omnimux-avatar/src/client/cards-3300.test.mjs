import{test}from'node:test'
import assert from'node:assert/strict'
import{AVATAR_CSS}from'./styles.js'
import{build}from'esbuild'
import Module from'node:module'
import{createRequire}from'node:module'
import{fileURLToPath}from'node:url'
import React from'react'
import{renderToStaticMarkup}from'react-dom/server'
const require=createRequire(import.meta.url)
async function load(file){const path=fileURLToPath(new URL(file,import.meta.url));const out=await build({entryPoints:[path],bundle:true,write:false,format:'cjs',platform:'node',outfile:'card-test.cjs',jsx:'automatic',external:['react','react-dom','react-dom/*'],loader:{'.css':'local-css','.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'}});const mod=new Module(path);mod.filename=path;mod.paths=Module._nodeModulePaths(fileURLToPath(new URL('.',import.meta.url)));mod.require=require;mod._compile(out.outputFiles[0].text,path);return mod.exports}
test('角色类型独立图片区与标签行，无图仍保留身份',async()=>{const{OptionCard}=await load('./components/OptionCard.jsx');const html=renderToStaticMarkup(React.createElement(OptionCard,{categoryId:'tier',option:{id:'cat',label_en:'猫'},selected:true,t:k=>k,onClick(){}}));assert.match(html,/omx-avatar-opt--tier/);assert.match(html,/omx-avatar-tier-visual/);assert.match(html,/aria-label="猫"/);assert.match(html,/aria-pressed="true"/)})
test('深浅色块名称独立于实际颜色，仍沿宿主可读标签层',async()=>{const{OptionCard}=await load('./components/OptionCard.jsx');for(const swatch of ['#151515','#eee9dd']){const html=renderToStaticMarkup(React.createElement(OptionCard,{kind:'color',option:{id:swatch,label_en:'颜色',swatch},selected:false,t:k=>k,onClick(){}}));assert.match(html,/omx-avatar-opt--color/)}assert.match(AVATAR_CSS,/\.omx-avatar-opt--color \.omx-avatar-lbl \{[^}]*position:relative;[^}]*background:var\(--dsw-alias-bg-layer-2\)/)})
test('灵感为真实列式瀑布流，卡不跨列且相邻间距相同',()=>{const block=AVATAR_CSS.slice(AVATAR_CSS.indexOf('.omx-avatar-preset-grid {'),AVATAR_CSS.indexOf('.omx-avatar-preset-open {'));assert.match(block,/column-count:\s*var\(--avatar-preset-columns/);assert.match(block,/column-gap:\s*16px/);assert.match(block,/break-inside:\s*avoid/);assert.match(block,/margin-bottom:\s*16px/);assert.doesNotMatch(block,/display:\s*grid/)})
