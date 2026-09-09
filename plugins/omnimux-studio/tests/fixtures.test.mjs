import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VIDEO_MODELS, AGENT_MODELS, IMAGE_MODELS, IMAGE_EXAMPLES, filterItems } from '../src/client/fixtures.js'

test('F09 exact menu labels, ordering and demo prices', () => {
  assert.deepEqual(VIDEO_MODELS.map(item => item.name), ['Veo 3.1 Lite', 'Veo 3.1 Fast', 'Gemini Omni Flash', 'Grok Imagine', 'Seedance 2.5', 'Seedance 2', 'Seedance 2 Fast', 'MiniMax H3 Max', 'MiniMax H3', 'Wan 3.0', 'Kling 3', 'Kling 3 Omni'])
  assert.deepEqual(VIDEO_MODELS.map(item => item.cost), [3, 5, 11, 1, 17, 11, 6, 10, 12, 3, 9, 15])
  assert.deepEqual(AGENT_MODELS.map(item => item.name), ['Veo 3.1 Fast (体验)', 'Seedance 2', 'Seedance 2.5', 'MiniMax H3 Max'])
  assert.deepEqual(IMAGE_MODELS.map(item => item.name), ['Nano Banana 2', 'Nano Banana Pro', 'GPT Image 2', 'Seedream 5.0 Pro', 'Seedream 5.0 Lite', 'Seedream 4.5'])
  assert(VIDEO_MODELS.slice(0, 4).every(item => item.category === '视频体验组'))
  assert(VIDEO_MODELS.slice(4).every(item => item.category === '视频标准组'))
  assert([...VIDEO_MODELS, ...AGENT_MODELS, ...IMAGE_MODELS].every(item => item.id.startsWith('mock:')))
})
test('F09 independent dimensions are ANDed, clearing one retains others', () => {
  const filters = { modelId: IMAGE_MODELS[0].id, resolution: '2K', aspect: '1:1' }
  assert.equal(filterItems(IMAGE_EXAMPLES, filters).length, 1)
  assert.equal(filterItems(IMAGE_EXAMPLES, { ...filters, aspect: '9:16' }).length, 0)
  const remaining = { ...filters, modelId: null }
  assert.equal(filterItems(IMAGE_EXAMPLES, remaining).length, 1)
  assert.equal(filterItems(IMAGE_EXAMPLES, {}).length, 6)
  const history = IMAGE_EXAMPLES.map(item => ({ ...item, id: crypto.randomUUID() }))
  assert.equal(filterItems(history, filters).length, 1)
})
