import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const cascade = readFileSync(new URL('../src/canvas/editor/components/MaterialNode/ConfigPanel/ModelCascadeMenu.tsx', import.meta.url), 'utf8')
const configPanel = readFileSync(new URL('../src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx', import.meta.url), 'utf8')
const modelPicker = readFileSync(new URL('../../omnimux/src/client/composer-quick-shortcuts/ModelPicker.jsx', import.meta.url), 'utf8')

test('selected model capsule shows only brand icon + canonical model id', () => {
  assert.equal(cascade.includes('const { modelId: triggerModelId } = parseModelAndGroup(activeModelId);'), true)
  assert.equal(cascade.includes('<span className="wf-model-cascade-capsule__name">{triggerDisplayText}</span>'), true)
  assert.equal(cascade.includes('activeGroup.label'), false, 'selected capsule must not append channel group text')
  assert.equal(cascade.includes('wf-model-cascade-capsule__badge'), false, 'selected capsule must not render group badge')
})

test('model rows and config options render canonical ids, not marketing labels', () => {
  assert.equal(cascade.includes('{item.id}'), true)
  assert.equal(cascade.includes('item.subtitle'), false)
  assert.equal(configPanel.includes('label: row.id'), true)
  assert.equal(configPanel.includes('<span>{row.id}</span>'), true)
  assert.equal(modelPicker.includes('const name = rawId;'), true)
  assert.equal(modelPicker.includes('const capsuleName = rawId;'), true)
  assert.equal(modelPicker.includes("subtitle: '',"), true)
})
