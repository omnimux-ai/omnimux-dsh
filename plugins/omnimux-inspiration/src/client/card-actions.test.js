import assert from 'node:assert/strict'
import { it } from 'node:test'
import { buildCardMenuItems } from './card-actions.js'

const zh = new Map(Object.entries({
  'card.menu.addToConversation': '添加到对话',
  'card.menu.delete': '删除',
  'collection.merge': '合并为合集',
  'collection.remove': '移出合集',
}))
const t = (key) => zh.get(key) || key

function labels(local, inCollection) {
  return buildCardMenuItems({
    t,
    local,
    inCollection,
    onAddToConversation() {},
    onMerge() {},
    onRemove() {},
    onDelete() {},
  }).map((item) => item.label)
}

it('local cards can add to conversation, merge and delete', () => {
  assert.deepEqual(labels(true, false), ['添加到对话', '合并为合集', '删除'])
})

it('a collection member removes instead of merging', () => {
  assert.deepEqual(labels(true, true), ['添加到对话', '移出合集', '删除'])
})

it('cloud cards only get the conversation entry', () => {
  assert.deepEqual(labels(false, false), ['添加到对话'])
})

it('drops items without a handler', () => {
  const items = buildCardMenuItems({ t, local: true, inCollection: false, onAddToConversation() {} })
  assert.deepEqual(items.map((item) => item.id), ['chat'])
})
