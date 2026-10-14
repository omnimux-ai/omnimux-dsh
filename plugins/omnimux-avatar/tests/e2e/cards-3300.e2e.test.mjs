// Full-app synthetic journey; does not request paid media generation.
import assert from 'node:assert/strict'
import { join } from 'node:path'
export default async function({send,sleep,evidenceDir,io}) {
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description);return result.result.value}
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(200)}throw Error('Card view not ready: '+expression)}
  const shot=async name=>{const result=await send('Page.captureScreenshot',{format:'png'});io.writeFileSync(join(evidenceDir,name+'.png'),Buffer.from(result.data,'base64'))}
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  await evaluate(`document.querySelector('[data-omnimux-avatar-entry]').click()`)
  await wait(`document.querySelectorAll('.omx-avatar-preset-card').length>20`)
  const selected=await evaluate(`document.querySelector('.omx-avatar-opt--tier[aria-pressed="true"]').getAttribute('aria-label')`)
  await evaluate(`document.querySelector('[aria-label="角色类型"]').click()`)
  assert.equal(await evaluate(`document.querySelectorAll('.omx-avatar-opt--tier').length`),0)
  await evaluate(`document.querySelector('[aria-label="角色类型"]').click()`)
  assert.equal(await evaluate(`document.querySelector('.omx-avatar-opt--tier[aria-pressed="true"]').getAttribute('aria-label')`),selected)
  const type=await evaluate(`(()=>{const el=document.querySelector('.omx-avatar-opt--tier');return{width:el.clientWidth,height:el.clientHeight,bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el.querySelector('.omx-avatar-tier-label')).color}})()`)
  assert.equal(type.width,88);assert.equal(type.height,104)
  await wait(`[...document.querySelectorAll('.omx-avatar-preset-card img')].slice(0,4).every(x=>x.naturalWidth>0)`)
  const geometry=await evaluate(`(()=>{const grid=document.querySelector('.omx-avatar-preset-grid');return{count:getComputedStyle(grid).columnCount,gap:getComputedStyle(grid).columnGap,width:grid.clientWidth,scrollWidth:grid.scrollWidth,cards:[...grid.children].map(el=>{const r=el.getBoundingClientRect();return{x:r.x,top:r.top,bottom:r.bottom}})}})()`)
  assert.equal(geometry.count,'4');assert.equal(geometry.gap,'16px');assert.ok(geometry.scrollWidth<=geometry.width)
  const column=geometry.cards.filter(x=>Math.abs(x.x-geometry.cards[0].x)<1)
  assert.ok(column.length>2)
  for(let i=1;i<column.length;i++)assert.ok(Math.abs(column[i].top-column[i-1].bottom-16)<2)
  await shot('cards-masonry-desktop')
  await evaluate(`document.querySelector('.omx-avatar-preset-open').click()`)
  await wait(`Boolean(document.querySelector('[role="dialog"]'))`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'})
  await wait(`!document.querySelector('[role="dialog"]')`)
  await evaluate(`(()=>{const group=[...document.querySelectorAll('.omx-avatar-group-head')].find(x=>x.textContent.includes('发色'));group.scrollIntoView({block:'center'})})()`)
  const color=await evaluate(`(()=>{const el=document.querySelector('.omx-avatar-opt--color');const swatch=el.querySelector('.omx-avatar-swatch').getBoundingClientRect(),label=el.querySelector('.omx-avatar-lbl'),r=label.getBoundingClientRect();return{swatchBottom:swatch.bottom,labelTop:r.top,labelHeight:r.height,bg:getComputedStyle(label).backgroundColor,color:getComputedStyle(label).color,position:getComputedStyle(label).position}})()`)
  assert.equal(color.position,'relative');assert.ok(color.labelTop>=color.swatchBottom-1);assert.equal(color.labelHeight,24)
  await shot('color-label-independent')
  await evaluate(`(()=>{const group=[...document.querySelectorAll('.omx-avatar-group-head')].find(x=>x.textContent.includes('体型'));group.scrollIntoView({block:'center'});document.querySelector('.omx-avatar-opt--media img').dispatchEvent(new Event('error'))})()`)
  await sleep(50)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.omx-avatar-opt--media .omx-avatar-lbl')).opacity`),'1')
  await shot('failed-label-readable')
  for(const width of [820,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width===390});await sleep(200)
    if(width===390)await evaluate(`[...document.querySelectorAll('.omx-avatar-mobile-nav button')].find(x=>x.textContent.trim()==='灵感').click()`)
    const result=await evaluate(`(()=>{const grid=document.querySelector('.omx-avatar-preset-grid');return{count:getComputedStyle(grid).columnCount,width:grid.clientWidth,scrollWidth:grid.scrollWidth}})()`)
    assert.equal(result.count,width===390?'2':'3');assert.ok(result.scrollWidth<=result.width)
    await shot('masonry-'+width)
  }
  io.writeFileSync(join(evidenceDir,'cards-geometry.json'),JSON.stringify({type,geometry,color},null,2))
  return {assertions:[{name:'类型卡独立标签与折叠保留选择',pass:true,detail:type},{name:'四列连续16像素且两三列窄屏无溢出',pass:true,detail:geometry},{name:'色块名称独立安全行',pass:true,detail:color},{name:'媒体失败可读且预览独立关闭',pass:true}]}
}
