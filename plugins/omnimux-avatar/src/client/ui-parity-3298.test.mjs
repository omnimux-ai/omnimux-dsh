import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import Module from 'node:module'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const require=createRequire(import.meta.url)
async function load(file){
 const path=fileURLToPath(new URL(file,import.meta.url))
 const output=await build({entryPoints:[path],bundle:true,write:false,format:'cjs',platform:'node',outfile:'ui-test.cjs',jsx:'automatic',external:['react','react-dom','react-dom/*'],loader:{'.css':'local-css','.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'}})
 const module=new Module(path);module.filename=path;module.paths=Module._nodeModulePaths(fileURLToPath(new URL('.',import.meta.url)));module.require=require;module._compile(output.outputFiles[0].text,path);return module.exports
}
test('未加载媒体的角色类型仍有明确名称与选择身份',async()=>{
 const{OptionCard}=await load('./components/OptionCard.jsx')
 const html=renderToStaticMarkup(React.createElement(OptionCard,{option:{id:'normal',label_en:'普通',imageUrl:'https://invalid.test/type.webp'},selected:true,t:k=>k,onClick(){}}))
 assert.match(html,/aria-label="普通"/)
 assert.match(html,/aria-pressed="true"/)
})
test('视频表单明确区分两种素材入口且固定操作区独立于滚动表单',async()=>{
 const{MotionPanel}=await load('./components/MotionPanel.jsx')
 const html=renderToStaticMarkup(React.createElement(MotionPanel,{avatarId:'test',tasks:[],active:false,onAccepted(){},onError(){}}))
 assert.match(html,/aria-label="添加参考视频"/)
 assert.match(html,/aria-label="添加参考图片"/)
 assert.match(html,/omx-avatar-motion-footer/)
 assert.match(html,/清晰度/)
 assert.doesNotMatch(html,/>Select</)
})
