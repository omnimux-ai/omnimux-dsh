import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { parseDraftMessage, DRAFT_FORMAT_INSTRUCTIONS, type DraftDocument } from '../extension/src/shared/draft.ts'

const draft: DraftDocument = {
  version: 1,
  title: '文案',
  variants: [{ id: 'a', label: '方案一', fields: [{ id: 'body', label: '正文', value: '第一行\n第二行 `code` <b>纯文本</b>' }] }],
}
const fence = (value: unknown) => '```omnimux-draft\n' + JSON.stringify(value) + '\n```'
const reject = (text: string) => assert.deepEqual(parseDraftMessage(text), { before: text, after: '', draft: null })

test('single draft preserves surrounding Markdown exactly', () => {
  const before = '# 说明\n\n> 引用\n\n'
  const after = '\n\n**后记**\n'
  assert.deepEqual(parseDraftMessage(before + fence(draft) + after), { before, after, draft })
})

test('multiple variants and fields preserve string identities and empty unknown values', () => {
  const value = { ...draft, variants: [draft.variants[0], { id: 'b', label: '方案二', fields: [
    { id: '12', label: '姓名', value: '' }, { id: 'email', label: '邮箱', value: '' },
  ] }] }
  assert.deepEqual(parseDraftMessage(fence(value)).draft, value)
})

test('ordinary messages, quoted examples and nested code are never drafts', () => {
  for (const text of ['你好', '> 这是很长的引用\n\n## 复盘', JSON.stringify(draft),
    '```json\n' + JSON.stringify(draft) + '\n```',
    '````markdown\n' + fence(draft) + '\n````',
    '> ```omnimux-draft\n> ' + JSON.stringify(draft) + '\n> ```']) reject(text)
})

test('malformed, unclosed and multiple reserved fences fail closed', () => {
  for (const text of ['```omnimux-draft\n{}\n```', '```omnimux-draft\n' + JSON.stringify(draft),
    '```omnimux-draft\nnot json\n```', fence(draft) + '\n' + fence(draft),
    fence(draft) + '\n```omnimux-draft\nbroken', '```omnimux-draft extra\n' + JSON.stringify(draft) + '\n```']) reject(text)
})

test('invalid schema and execution metadata are rejected at every level', () => {
  const variant = draft.variants[0]!
  const field = variant.fields[0]!
  for (const value of [null, [], { ...draft, version: 2 }, { ...draft, title: 1 },
    { ...draft, variants: [] }, { ...draft, selector: '#target' },
    { ...draft, variants: [{ ...variant, fields: [] }] },
    { ...draft, variants: [variant, variant] },
    { ...draft, variants: [{ ...variant, target: '12' }] },
    { ...draft, variants: [{ ...variant, fields: [field, field] }] },
    { ...draft, variants: [{ ...variant, fields: [{ ...field, id: 12 }] }] },
    { ...draft, variants: [{ ...variant, fields: [{ ...field, value: { html: 'x' } }] }] },
    { ...draft, variants: [{ ...variant, fields: [{ ...field, selector: 'input' }] }] },
  ]) reject(fence(value))
})

test('indented reserved fence inside a list is not a top-level draft', () => {
  reject('- example\n\n' + fence(draft).split('\n').map(line => '  ' + line).join('\n'))
})

test('oversized input fails closed', () => {
  reject(fence({ ...draft, title: 'x'.repeat(1_000_000) }))
  reject(fence({ ...draft, variants: Array.from({ length: 1000 }, (_, i) => ({ ...draft.variants[0], id: String(i) })) }))
})

test('Host section consumes shared instructions; independent copilot remains plain text', () => {
  const host = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(host, /import\s*\{\s*DRAFT_FORMAT_INSTRUCTIONS\s*\}\s*from\s*['"]\.\/draft\.ts['"]/)
  assert.match(host, /text:[\s\S]*\+ DRAFT_FORMAT_INSTRUCTIONS/)
  const copilot = readFileSync(new URL('../extension/src/content/twitter-copilot/prompts.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(copilot, /omnimux-draft|DRAFT_FORMAT_INSTRUCTIONS/)
  assert.match(DRAFT_FORMAT_INSTRUCTIONS, /omnimux-draft/)
  assert.match(DRAFT_FORMAT_INSTRUCTIONS, /version/)
  assert.match(DRAFT_FORMAT_INSTRUCTIONS, /variants/)
  assert.match(DRAFT_FORMAT_INSTRUCTIONS, /FormSnapshot/)
  assert.match(DRAFT_FORMAT_INSTRUCTIONS, /copy-only/)
})
