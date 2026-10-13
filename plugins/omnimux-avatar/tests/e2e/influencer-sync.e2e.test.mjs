// Execute with the isolated full-app runner in ui mode after live functional rehearsal.
import assert from 'node:assert/strict'
import { join } from 'node:path'
export default async function ({ send, sleep, evidenceDir, io }) {
  const assertions = []
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
    return response.result.value
  }
  const wait = async expression => {
    for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await sleep(250) }
    throw new Error('界面状态等待超时: ' + expression)
  }
  await evaluate(`document.querySelector('[data-omnimux-avatar-entry]').click()`)
  await wait(`Boolean(document.querySelector('.omx-avatar-builder') && document.querySelector('.omx-avatar-avatars-name')?.textContent.trim())`)
  await wait(`document.querySelectorAll('.omx-avatar-opt').length > 3`)
  await evaluate(`document.querySelector('.omx-avatar-iconbtn').click()`)
  await wait(`document.querySelector('.omx-avatar-cta')?.disabled === false`)
  await evaluate(`document.querySelector('.omx-avatar-cta').click()`)
  await wait(`Boolean(document.querySelector('.omx-avatar-card.is-clickable img')?.naturalWidth)`)
  const first = await evaluate(`(async () => {
    const list = await (await fetch('/api/omnimux/avatar/avatars')).json();
    const avatar = list.avatars.find(row => row.name === '未命名');
    const history = await (await fetch('/api/omnimux/avatar/tasks?avatarId=' + avatar.id)).json();
    return { id: avatar.id, task: history.tasks.at(-1) };
  })()`)
  assert.equal(first.task.status, 'ready')
  assert.equal(typeof first.task.input.selection, 'object')
  assertions.push({ name: '页面生图至本地成品和参数快照', pass: true, detail: { kind: first.task.kind, status: first.task.status, source: 'ui模拟，不是真实模型' } })
  await evaluate(`document.querySelector('.omx-avatar-card.is-clickable').click()`)
  await wait(`document.querySelector('.omx-avatar-cta')?.disabled === false`)
  await evaluate(`document.querySelector('.omx-avatar-cta').click()`)
  await wait(`document.querySelectorAll('.omx-avatar-card.is-clickable').length >= 2`)
  const history = await evaluate(`(async () => (await (await fetch('/api/omnimux/avatar/tasks?avatarId=${first.id}')).json()).tasks)()`)
  assert.equal(history.length, 2)
  assert.notEqual(history[0].destPath, history[1].destPath)
  assert.equal(history.every(row => Boolean(row.input)), true)
  assertions.push({ name: '连续生成保留独立历史文件与设定', pass: true, detail: { count: history.length, distinctOutputs: true } })
  const capture = await send('Page.captureScreenshot', { format: 'png' })
  io.writeFileSync(join(evidenceDir, 'avatar-lifecycle-history.png'), Buffer.from(capture.data, 'base64'))
  return { assertions }
}
