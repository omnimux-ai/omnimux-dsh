// Full application ui journey, no real provider or paid generation request.
import assert from 'node:assert/strict'
import{join}from'node:path'
export default async function({send,sleep,evidenceDir,io}){
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value}
 const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(200)}throw Error('View not ready '+expression)}
 const click=async selector=>{const point=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})}
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});io.writeFileSync(join(evidenceDir,name+'.png'),Buffer.from(r.data,'base64'))}
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
 await click('[data-omnimux-avatar-entry]');await wait(`document.querySelectorAll('.omx-avatar-opt').length>50`)
 assert.equal(await evaluate(`[...document.querySelectorAll('.omx-avatar-opt')].every(x=>x.getAttribute('aria-label'))`),true)
 await click('.omx-avatar-selection-summary [aria-expanded]')
 assert.equal(await evaluate(`document.querySelector('.omx-avatar-selection-summary').dataset.expanded`),'true')
 await click('.omx-avatar-selection-summary [aria-expanded]')
 await shot('character-parity')
 await click('[aria-label="视频创作"]');await wait(`document.querySelector('[aria-label="添加参考视频"]')?.getBoundingClientRect().width>0`)
 await click('[aria-label="添加参考视频"]');await wait(`Boolean(document.querySelector('[role="dialog"]'))`)
 assert.equal(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('上传本地视频')`),true)
 assert.equal(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('上传本地图片')`),false)
 await shot('reference-picker-parity')
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait(`!document.querySelector('[role="dialog"]')`)
 assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'添加参考视频')
 await click('[aria-label="添加参考图片"]');await wait(`Boolean(document.querySelector('[role="dialog"]'))`)
 assert.equal(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('上传本地图片')`),true)
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait(`!document.querySelector('[role="dialog"]')`)
 for(const width of [1280,820,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});await sleep(250)
  const bounds=await evaluate(`(()=>{const r=document.querySelector('.omx-avatar-motion-footer').getBoundingClientRect();return{bottom:r.bottom,top:r.top,height:r.height}})()`)
  assert.ok(bounds.height>0&&bounds.bottom<=900&&bounds.top>=0,'生成视频固定栏必须可见')
  assert.equal(await evaluate(`document.querySelector('.omx-avatar-page').scrollWidth<=document.querySelector('.omx-avatar-page').clientWidth`),true)
  await shot('motion-parity-'+width)
 }
 return{assertions:[{name:'两类素材独立选择与Escape关闭恢复焦点',pass:true},{name:'角色摘要展开与选项名称可读',pass:true},{name:'1280/820/390底栏可见且无横溢出',pass:true}]}
}
