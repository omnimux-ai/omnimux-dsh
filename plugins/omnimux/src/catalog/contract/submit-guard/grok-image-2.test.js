import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { getContractIndex } from '../index.js'
import { guardSubmit } from './index.js'
import { resolveModelId } from '../../project.js'
import { executeOmnimuxImage } from '../../../media/image.js'

const canonical = 'grok-imagine-image-2'
const modelIds = [canonical, 'grok-imagine-image', 'grok-imagine-image-2-0', 'grok-imagine-image-2.0']
const index = getContractIndex()

test('Grok Image 2 retains dated text_to_image evidence without listing multi_reference', () => {
  const model = index.get(canonical)
  const operation = model.operations.find((op) => op.id === 'text_to_image')
  assert.equal(operation.research.status, 'verified')
  assert.equal(operation.research.docUrl, 'docs/evidence/2026-08-16-omnimux-image.md')
  assert.equal(operation.research.verifiedAt, '2026-08-16')
  assert.equal(operation.execution.status, 'live')
  assert.deepEqual(model.listedOperations, [`${canonical}#text_to_image`])
})

for (const model of modelIds) {
  test(`Grok Image 2 resolves and admits ${model} without bypassing operation checks`, () => {
    assert.equal(resolveModelId(index, model), canonical)
    const plan = guardSubmit(
      { model, operation: 'text_to_image', prompt: 'a blue ceramic cup' },
      { index, seam: 'imageGenerate', outputType: 'image' },
    )
    assert.equal(plan.ok, true, plan.message)
    assert.equal(plan.modelId, canonical)
    assert.equal(plan.requestedModelId, model)
    assert.equal(plan.profileId, 'imageGenerate')
    const rejected = guardSubmit(
      { model, operation: 'multi_reference', prompt: 'a blue ceramic cup' },
      { index, seam: 'imageGenerate', outputType: 'image' },
    )
    assert.equal(rejected.ok, false)
  })

  test(`mock image submit sends the canonical model for ${model}`, async () => {
    const calls = []
    const result = await executeOmnimuxImage({
      model,
      operation: 'text_to_image',
      prompt: 'a blue ceramic cup',
      dest: join(tmpdir(), 'omnimux-grok-image-2-mock.png'),
      wait: false,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      fetcher: async (url, init) => {
        calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) })
        return new Response(JSON.stringify({ task_id: 'grok-image-2-mock', status: 'pending' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.omnimux.ai/v1/images/generations')
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].body.model, canonical)
    assert.equal(calls[0].body.prompt, 'a blue ceramic cup')
    assert.equal('platform' in calls[0].body, false)
    assert.equal(result.mode, 'submitted')
    assert.equal(result.taskId, 'grok-image-2-mock')
  })
}
