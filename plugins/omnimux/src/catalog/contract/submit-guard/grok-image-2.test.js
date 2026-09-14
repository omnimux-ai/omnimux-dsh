import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getContractIndex } from '../index.js'
import { GUARD_CODES, guardSubmit } from './index.js'
import { resolveModelId } from '../../project.js'

const canonical = 'grok-imagine-image-2-0'
const modelIds = [canonical, 'grok-imagine-image', 'grok-imagine-image-2', 'grok-imagine-image-2.0']
const index = getContractIndex()

test('Grok Image 2 keeps its dated evidence but holds no listed operation', () => {
  const model = index.get(canonical)
  const operation = model.operations.find((op) => op.id === 'text_to_image')
  // The 2026-08-16 dated evidence predates three upstream catalog changes, so it stays
  // registered as evidence while the shelf claim is withdrawn: draft research, stub
  // execution, no listed operation. Evidence retention and listing are separate facts.
  assert.equal(operation.research.status, 'draft')
  assert.equal(operation.research.docUrl, 'docs/evidence/2026-08-16-omnimux-image.md')
  assert.equal(operation.execution.status, 'stub')
  assert.equal(model.listed, false)
  assert.deepEqual(model.listedOperations, [])
})

for (const model of modelIds) {
  test(`Grok Image 2 resolves ${model} to ${canonical} without bypassing operation checks`, () => {
    assert.equal(resolveModelId(index, model), canonical)
    const plan = guardSubmit(
      { model, operation: 'text_to_image', prompt: 'a blue ceramic cup' },
      { index, seam: 'imageGenerate', outputType: 'image' },
    )
    assert.equal(plan.ok, false, 'text_to_image on a draft-research model must not be admitted')
    assert.equal(plan.code, GUARD_CODES.RESEARCH_NOT_VERIFIED)
    assert.equal(plan.details.modelId, canonical)
    const rejected = guardSubmit(
      { model, operation: 'multi_reference', prompt: 'a blue ceramic cup' },
      { index, seam: 'imageGenerate', outputType: 'image' },
    )
    assert.equal(rejected.ok, false)
    assert.equal(rejected.code, GUARD_CODES.RESEARCH_NOT_VERIFIED)
    assert.equal(rejected.details.modelId, canonical)
  })
}
