// Full-app ui rehearsal only, synthetic provider results are not live model evidence.
import assert from 'node:assert/strict'
import { join } from 'node:path'
export default async function ({ send, sleep, evidenceDir, io }) {
  const assertions=[]
  const evaluate=async expression=>{
    const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
    if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text)
    return response.result.value
  }
  const wait=async expression=>{
    for(let i=0;i<80;i++){if(await evaluate(expression))return;await sleep(250)}
    throw new Error('界面状态等待超时: '+expression)
  }
  await evaluate(`document.querySelector('[data-omnimux-avatar-entry]').click()`)
  await wait(`document.querySelectorAll('.omx-avatar-opt').length>50`)
  await wait(`Boolean(document.querySelector('.omx-avatar-avatars-name')?.textContent.trim())`)
  const selected=await evaluate(`([...document.querySelectorAll('.omx-avatar-opt')].find(el=>el.textContent.trim()==='女性')).getAttribute('aria-pressed')`)
  if(selected==='true'){
    await evaluate(`([...document.querySelectorAll('.omx-avatar-opt')].find(el=>el.textContent.trim()==='女性')).click()`)
    await wait(`([...document.querySelectorAll('.omx-avatar-opt')].find(el=>el.textContent.trim()==='女性')).getAttribute('aria-pressed')==='false'`)
  }
  await evaluate(`([...document.querySelectorAll('.omx-avatar-opt')].find(el=>el.textContent.trim()==='女性')).click()`)
  await wait(`([...document.querySelectorAll('.omx-avatar-opt')].find(el=>el.textContent.trim()==='女性')).getAttribute('aria-pressed')==='true'`)
  await evaluate(`document.querySelector('.omx-avatar-iconbtn').click()`)
  assert.equal(await evaluate(`([...document.querySelectorAll('.omx-avatar-opt')].find(el=>el.textContent.trim()==='女性')).getAttribute('aria-pressed')`),'true')
  assertions.push({name:'手选特征随机后保持',pass:true})
  await evaluate(`([...document.querySelectorAll('.omx-avatar-opt')].find(el=>el.textContent.trim()==='猫')).click()`)
  await wait(`document.querySelector('.omx-avatar-cta')?.disabled===false`)
  await evaluate(`document.querySelector('.omx-avatar-cta').click()`)
  await wait(`Boolean(document.querySelector('.omx-avatar-card.is-clickable img')?.naturalWidth)`)
  const first=await evaluate(`(async()=>{const avatars=await(await fetch('/api/omnimux/avatar/avatars')).json();const avatar=avatars.avatars.find(row=>row.name==='未命名');return {id:avatar.id,tasks:(await(await fetch('/api/omnimux/avatar/tasks?avatarId='+avatar.id)).json()).tasks}})()`)
  assert.equal(first.tasks.length,1)
  assert.equal(first.tasks[0].status,'ready')
  assert.equal(first.tasks[0].input.tier,'cat')
  assert.equal(first.tasks[0].input.size,'16:9')
  await evaluate(`document.querySelector('.omx-avatar-mv-tile--add').click()`)
  await wait(`Boolean(document.querySelector('[role="dialog"] img'))`)
  const child=await evaluate(`(async()=>(await(await fetch('/api/omnimux/avatar/tasks?avatarId=${first.id}')).json()).tasks.find(row=>row.kind==='multiview'))()`)
  assert.equal(child.input.tier,'cat')
  assert.equal(child.parentTaskId,first.tasks[0].taskId)
  const download=await evaluate(`document.querySelector('[role="dialog"] a[download]')?.getAttribute('href')`)
  assert.match(download,/\/api\/omnimux\/avatar\/task\/image\?/)
  const media=await evaluate(`(async()=>{const response=await fetch(${JSON.stringify(download)});return {status:response.status,type:response.headers.get('content-type'),bytes:(await response.arrayBuffer()).byteLength}})()`)
  assert.equal(media.status,200);assert.equal(media.type,'image/png');assert.equal(media.bytes>0,true)
  assertions.push({name:'动物多视角保留父快照及本地下载',pass:true,detail:media})
  const shot=await send('Page.captureScreenshot',{format:'png'})
  io.writeFileSync(join(evidenceDir,'avatar-animal-multiview.png'),Buffer.from(shot.data,'base64'))
  return {assertions}
}
