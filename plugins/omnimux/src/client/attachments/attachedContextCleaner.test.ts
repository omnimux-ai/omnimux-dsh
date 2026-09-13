import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  ATTACHED_CONTEXT_MARKER,
  findAttachedContextStart,
  hasAttachedContextMarker,
  hideAttachedContextBlock,
} from './attachedContextCleaner.ts'

/** 复刻提交时的真实气泡内容：用户自己写的一行 + 附件关联上下文数据块。 */
const USER_TEXT = '复刻这条爆款视频'
const CONTEXT_BLOCK = [
  '',
  '---',
  '### 会话关联上下文 (Attached Context):',
  '- [视频] US beauty hook (`MP4`, 0:31): @inspiration/videos/us-beauty.mp4',
].join('\n')

function withDom(html) {
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
  }
}

test('hasAttachedContextMarker：中英文标记都能识别，普通文本不误判', () => {
  assert.equal(hasAttachedContextMarker(CONTEXT_BLOCK), true)
  assert.equal(hasAttachedContextMarker('### Attached Context:'), true)
  assert.equal(hasAttachedContextMarker('复刻这条爆款视频'), false)
  assert.equal(hasAttachedContextMarker(null), false)
  assert.equal(hasAttachedContextMarker(undefined), false)
})

test('findAttachedContextStart：取最早出现的标记位置', () => {
  assert.equal(findAttachedContextStart('abc'), -1)
  const text = `正文\n\n${ATTACHED_CONTEXT_MARKER} (Attached Context):`
  assert.equal(findAttachedContextStart(text), text.indexOf(ATTACHED_CONTEXT_MARKER))
})

test('hideAttachedContextBlock：气泡只剩用户自己写的那句话', () => {
  const env = withDom('<div id="bubble"></div>')
  const bubble = env.document.querySelector('#bubble')
  bubble.textContent = `${USER_TEXT}${CONTEXT_BLOCK}`

  const changed = hideAttachedContextBlock(bubble, env.document)

  assert.equal(changed, true)
  assert.equal(bubble.textContent, USER_TEXT, '用户气泡不得再出现附件数据块')
  assert.ok(!bubble.textContent.includes(ATTACHED_CONTEXT_MARKER))
  assert.ok(!bubble.textContent.includes('@inspiration/'))
})

test('hideAttachedContextBlock：多节点渲染（宿主按 Markdown 分段）也能整块摘掉', () => {
  const html = [
    '<div id="bubble">',
    '  <p>复刻这条爆款视频</p>',
    '  <hr />',
    '  <h3>### 会话关联上下文 (Attached Context):</h3>',
    '  <ul><li>[视频] US beauty hook (<code>MP4</code>, 0:31): @inspiration/videos/us-beauty.mp4</li></ul>',
    '  <p>https://example.com/leftover</p>',
    '</div>',
  ].join('\n')
  const env = withDom(html)
  const bubble = env.document.querySelector('#bubble')

  const changed = hideAttachedContextBlock(bubble, env.document)

  assert.equal(changed, true)
  assert.equal(bubble.textContent.replace(/\s+/g, ''), '复刻这条爆款视频', '数据块整段（含分隔线与后续节点）都必须消失')
  assert.equal(bubble.querySelectorAll('hr').length, 0, '数据块自带的分隔线也必须摘掉，不能留一条孤线')
  assert.equal(bubble.textContent.includes('Attached Context'), false, '数据块标题文字必须消失')
})

test('hideAttachedContextBlock：重复执行是幂等的', () => {
  const env = withDom('<div id="bubble"></div>')
  const bubble = env.document.querySelector('#bubble')
  bubble.textContent = `${USER_TEXT}${CONTEXT_BLOCK}`

  assert.equal(hideAttachedContextBlock(bubble, env.document), true)
  assert.equal(hideAttachedContextBlock(bubble, env.document), false)
  assert.equal(bubble.textContent, USER_TEXT)
})

test('hideAttachedContextBlock：没有数据块时不动用户内容', () => {
  const env = withDom('<div id="bubble">就是一句普通提问</div>')
  const bubble = env.document.querySelector('#bubble')

  assert.equal(hideAttachedContextBlock(bubble, env.document), false)
  assert.equal(bubble.textContent, '就是一句普通提问')
  assert.equal(hideAttachedContextBlock(null, env.document), false)
})

test('hideAttachedContextBlock：数据块被 URL 胶囊打散后仍能按标记摘除', () => {
  const html = [
    '<div id="bubble">',
    '  复刻这条爆款视频',
    '  ### 会话关联上下文 (Attached Context):',
    '  - [视频] US beauty hook (<code>MP4</code>, 0:31):',
    '  <span class="omx-chat-link-pill">inspiration</span>',
    '</div>',
  ].join('\n')
  const env = withDom(html)
  const bubble = env.document.querySelector('#bubble')

  assert.equal(hideAttachedContextBlock(bubble, env.document), true)
  assert.equal(bubble.textContent.replace(/\s+/g, ''), '复刻这条爆款视频')
})

test('hideAttachedContextBlock：用户正文里的分隔线不受影响', () => {
  const env = withDom('<div id="bubble"></div>')
  const bubble = env.document.querySelector('#bubble')
  bubble.textContent = `第一段\n\n---\n\n第二段\n${CONTEXT_BLOCK}`

  assert.equal(hideAttachedContextBlock(bubble, env.document), true)
  // 用户自己写的分隔线留着（数据块前导的那条已被上一步一起收走）
  assert.equal(bubble.textContent, '第一段\n\n---\n\n第二段')
})
