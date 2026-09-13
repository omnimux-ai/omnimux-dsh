/**
 * 主对话草稿填充的门禁。
 *
 * 官方底座的输入框是 contenteditable 的 `div`（Lexical 编辑器），门禁按这条真身覆盖：
 * 1. 选择器先窄后宽，座位里的 contenteditable 优先于带作用域的 textarea，更优先于页面孤立元素；
 * 2. contenteditable 先走 `execCommand('insertText')`，命令无效才退回 textContent + input / change；
 * 3. textarea 走原型 setter + input / change，React 受控输入才会同步；
 * 4. 只读 / 禁用的候选被跳过，写入失败时回读校验会拦住「假装成功」。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { COMPOSER_SELECTORS, applyComposerDraft, findComposerField } from './prefill-chat.js'

/** 每例独立文档，避免用例之间的节点残留互相污染。 */
function makeDocument(body) {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url: 'http://localhost/' })
  return dom.window.document
}

/**
 * 造一个真实结构的底座 composer 座位：座位 div 包一个 contenteditable 输入框。
 *
 * @param {Document} document
 * @returns {{ seat: HTMLElement, field: HTMLElement }}
 */
function makeComposerSeat(document) {
  const seat = document.createElement('div')
  seat.setAttribute('data-composer-seat', '')
  const field = document.createElement('div')
  field.setAttribute('contenteditable', 'true')
  field.setAttribute('role', 'textbox')
  seat.append(field)
  document.body.append(seat)
  return { seat, field }
}

test('草稿写进底座 composer 座位的 contenteditable，而不是页面上更早出现的孤立 textarea', async () => {
  const document = makeDocument(`
    <textarea id="stray"></textarea>
    <div data-composer-seat><div contenteditable="true" role="textbox" id="seat"></div></div>
  `)
  const seat = document.getElementById('seat')
  const inputs = []
  seat.addEventListener('input', event => inputs.push(event))

  const wrote = await applyComposerDraft('我要创建一个定时任务', { document })

  assert.equal(wrote, true)
  assert.equal(seat.textContent, '我要创建一个定时任务')
  assert.equal(document.getElementById('stray').value, '', '孤立 textarea 不得被写入')
  assert.equal(inputs.length, 1, '退回通道必须派发一次 input 事件')
  assert.equal(inputs[0] instanceof document.defaultView.InputEvent, true, 'input 必须是真实 InputEvent')
  assert.equal(inputs[0].bubbles, true)
  assert.equal(COMPOSER_SELECTORS[0], '[data-composer-seat] [contenteditable="true"]', 'contenteditable 座位必须排在最前')
})

test('contenteditable 优先走 execCommand("insertText")，不再退回 textContent', async () => {
  const document = makeDocument('')
  const { field } = makeComposerSeat(document)
  const commands = []
  document.execCommand = (command, _showUi, value) => {
    commands.push({ command, value })
    field.textContent = value
    return true
  }
  let inputCount = 0
  field.addEventListener('input', () => { inputCount += 1 })

  const wrote = await applyComposerDraft('使用对话创建', { document })

  assert.equal(wrote, true)
  assert.deepEqual(commands, [{ command: 'insertText', value: '使用对话创建' }])
  assert.equal(field.textContent, '使用对话创建')
  assert.equal(inputCount, 0, '命令通道由浏览器派发 input，自己不得再补一次')
})

test('execCommand 返回 true 但内容未改变时退回 textContent 并派发 input 与 change', async () => {
  const document = makeDocument('')
  const { field } = makeComposerSeat(document)
  document.execCommand = () => true
  const seen = []
  field.addEventListener('input', event => seen.push(event.type))
  field.addEventListener('change', event => seen.push(event.type))

  const wrote = await applyComposerDraft('退回草稿', { document })

  assert.equal(wrote, true)
  assert.equal(field.textContent, '退回草稿')
  assert.deepEqual(seen, ['input', 'change'], '退回通道必须派发 input 与 change 各一次')
})

test('execCommand 不存在时（jsdom 等环境）直接走 textContent 通道', async () => {
  const document = makeDocument('')
  const { field } = makeComposerSeat(document)

  const wrote = await applyComposerDraft('无命令环境草稿', { document })

  assert.equal(wrote, true)
  assert.equal(field.textContent, '无命令环境草稿')
})

test('写入成功后光标落在草稿末尾', async () => {
  const document = makeDocument('')
  const { field } = makeComposerSeat(document)

  await applyComposerDraft('光标测试', { document })

  const selection = document.defaultView.getSelection()
  assert.equal(selection.rangeCount, 1)
  assert.equal(selection.focusNode, field)
  assert.equal(selection.focusOffset, field.childNodes.length, '光标必须落在内容末尾')
})

test('seat 内的 textarea 仍然可用：写入派发冒泡的 input 事件', async () => {
  const document = makeDocument('<div data-composer-seat><textarea id="seat"></textarea></div>')
  const seat = document.getElementById('seat')
  const seen = []
  document.addEventListener('input', event => seen.push(event.target.id))

  await applyComposerDraft('草稿', { document })

  assert.equal(seat.value, '草稿')
  assert.deepEqual(seen, ['seat'])
})

test('只读或禁用的候选被跳过，回退到下一个可写座位', async () => {
  const document = makeDocument(`
    <textarea data-input-text="true" readonly></textarea>
    <textarea data-input-text="true"></textarea>
  `)
  const fields = document.querySelectorAll('textarea[data-input-text="true"]')

  const wrote = await applyComposerDraft('回退草稿', { document })

  assert.equal(wrote, true)
  assert.equal(fields[0].value, '', '只读 textarea 必须保持为空')
  assert.equal(fields[1].value, '回退草稿')
})

test('页面上没有可写输入框时返回 false，不抛异常', async () => {
  const document = makeDocument('<textarea readonly></textarea>')

  assert.equal(findComposerField(document), null)
  assert.equal(await applyComposerDraft('无处可写', { document }), false)
})

test('缺少 document 时安全返回 false', async () => {
  assert.equal(findComposerField(undefined), null)
  assert.equal(await applyComposerDraft('草稿', { document: null }), false)
})
