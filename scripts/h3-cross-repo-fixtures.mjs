import assert from 'node:assert/strict'
import { guardSubmit } from '../plugins/omnimux/src/catalog/contract/submit-guard/guard.js'
import { mapOmnimuxInput } from '../plugins/omnimux/src/media/vendors/omnimux.js'

const image = (name, role = 'reference') => ({ type: 'image', role, pathOrUrl: `https://example.invalid/${name}.png`, mime: 'image/png', sizeBytes: 1000 })
const video = name => ({ type: 'video', role: 'reference', pathOrUrl: `https://example.invalid/${name}.mp4`, mime: 'video/mp4', sizeBytes: 1000, durationSec: 3 })
const cases = [
  { name: 'max-first', model: 'minimax-h3-max', operation: 'first_frame', references: [image('first', 'first_frame')] },
  { name: 'turbo-first', model: 'minimax-h3-max-turbo', operation: 'first_frame', references: [image('first', 'first_frame')] },
  { name: 'max-references', model: 'minimax-h3-max', operation: 'video_multi_ref', references: [image('second'), image('first'), video('second'), video('first')] },
]
const fixtures = cases.map(input => {
  const plan = guardSubmit({ ...input, prompt: 'fixture', resolution: '768p', duration: 5 }, { seam: 'videoGenerate' })
  assert.equal(plan.ok, true, JSON.stringify(plan))
  return { name: input.name, body: { ...mapOmnimuxInput('video', { prompt: 'fixture', guardPlan: plan }), model: plan.model.routing.wireModel } }
})
for (const request of [
  { model: 'minimax-h3-max-turbo', operation: 'video_multi_ref', references: [video('first')] },
  { model: 'minimax-h3-max', operation: 'first_frame', references: [] },
]) {
  const plan = guardSubmit({ ...request, prompt: 'fixture' }, { seam: 'videoGenerate' })
  assert.equal(plan.ok, false, 'invalid requests must not reach the vendor')
}
console.log(JSON.stringify(fixtures))
