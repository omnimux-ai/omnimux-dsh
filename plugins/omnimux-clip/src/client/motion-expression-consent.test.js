import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const built = await build({
  stdin: {
    contents: `export * from './openreel/core/motion/motion-expressions';
export { ProjectSerializer } from './openreel/core/storage/project-serializer';`,
    resolveDir: dirname(fileURLToPath(import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
})
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const property = 'transform.position.x'
const code = '(globalThis.__motionConsentTestMarker = 1, value + 7)'
const expression = (source = code, id = 'expression-1') => ({
  ...api.createMotionExpression('expression', property, id), code: source,
})
const evaluate = (expr, extra = {}) => api.evaluateMotionPropertyValueAtTime({
  expressions: [expr], keyframes: [], property, localTime: 0, fallback: 10, duration: 5, ...extra,
})
const makeProject = (expr) => ({
  id: 'project-1', name: 'Consent regression', createdAt: 0, modifiedAt: 0,
  settings: { width: 640, height: 360, frameRate: 30, sampleRate: 48000, channels: 2 },
  mediaLibrary: { items: [] }, timeline: { tracks: [], subtitles: [], markers: [], duration: 5 },
  motionCompositions: [{
    id: 'composition-1', name: 'Motion', width: 640, height: 360, frameRate: 30, duration: 5,
    layers: [{ id: 'layer-1', keyframes: [], expressions: [expr] }],
  }], motionInstances: [],
})
const fromProject = (project) => project.motionCompositions[0].layers[0].expressions[0]

beforeEach(() => {
  api.clearMotionExpressionCodeApprovals()
  delete globalThis.__motionConsentTestMarker
})

for (const [name, source] of [
  ['expression body', code],
  ['statement body', 'globalThis.__motionConsentTestMarker = 1; return value + 7;'],
  ['constructor indirection', '(() => {}).constructor("globalThis.__motionConsentTestMarker = 1; return 17")()'],
]) {
  test(`imported ${name} cannot execute or authorize itself`, () => {
    const expr = JSON.parse(JSON.stringify({ ...expression(source), approved: true, trusted: true }))
    assert.equal(evaluate(expr), 10)
    assert.equal(globalThis.__motionConsentTestMarker, undefined)
    assert.match(api.getMotionExpressionError(expr.id), /暂停/)
  })
}

test('explicit approval preserves execution through normalization and internal edit/export clones', () => {
  const expr = api.approveMotionExpressionCode(expression())
  const layer = api.addMotionLayerExpression({ id: 'layer-1', expressions: [] }, expr)
  for (const copy of [expr, layer.expressions[0], structuredClone(expr), JSON.parse(JSON.stringify(expr))]) {
    delete globalThis.__motionConsentTestMarker
    assert.equal(evaluate(copy), 17)
    assert.equal(globalThis.__motionConsentTestMarker, 1)
  }
})

test('edited text and copied IDs cannot reuse a different grant', () => {
  const expr = api.approveMotionExpressionCode(expression('value + 7'))
  assert.equal(evaluate(expr), 17)
  assert.equal(evaluate({ ...expr, code, trusted: true }), 10)
  assert.equal(evaluate({ ...expr, code: expr.code + ' ' }), 10)
  assert.equal(evaluate({ ...expr, id: 'different-expression' }), 10)
  assert.equal(globalThis.__motionConsentTestMarker, undefined)
})

test('revocation also blocks already compiled code', () => {
  const expr = api.approveMotionExpressionCode(expression())
  assert.equal(evaluate(expr), 17)
  delete globalThis.__motionConsentTestMarker
  api.clearMotionExpressionCodeApprovals()
  assert.equal(evaluate(expr), 10)
  assert.equal(globalThis.__motionConsentTestMarker, undefined)
})

test('ordinary enabled switch never grants script permission', () => {
  const expr = expression()
  const layer = api.toggleMotionLayerExpression({ expressions: [expr] }, expr.id, true)
  assert.equal(evaluate(layer.expressions[0]), 10)
  assert.equal(globalThis.__motionConsentTestMarker, undefined)
})

test('numeric presets and keyed fallback do not require permission', () => {
  const sine = { ...api.createMotionExpression('sine', property), amplitude: 24, frequency: 1 }
  assert.equal(evaluate(sine, { localTime: 0.25 }), 34)
  assert.equal(evaluate(expression(), {
    keyframes: [{ id: 'key-1', property, time: 0, value: 42, easing: 'linear' }],
  }), 42)
  assert.equal(globalThis.__motionConsentTestMarker, undefined)
})

test('approving a layer reference does not authorize its target script', () => {
  api.registerMotionExpressionBaseValueResolver(() => 20)
  const own = api.approveMotionExpressionCode(expression(`layer("Target").value("${property}") + 1`, 'own'))
  const target = expression(code, 'target')
  const ownLayer = { id: 'own-layer', name: 'Own', keyframes: [], expressions: [own] }
  const targetLayer = { id: 'target-layer', name: 'Target', keyframes: [], expressions: [target] }
  const composition = { duration: 5, layers: [ownLayer, targetLayer] }
  assert.equal(evaluate(own, { context: { layer: ownLayer, composition } }), 21)
  assert.equal(globalThis.__motionConsentTestMarker, undefined)
  assert.match(api.getMotionExpressionError(target.id), /暂停/)
})

for (const version of ['1.0.0', '0.9.0']) {
  test(`successful JSON import (${version}) resets even matching prior IDs and code`, () => {
    const expr = api.approveMotionExpressionCode(expression())
    const project = makeProject(expr)
    const serializer = new api.ProjectSerializer({})
    const exported = serializer.exportToJson(project)
    assert.equal(evaluate(expr), 17, 'exporting must preserve the open-project grant')
    delete globalThis.__motionConsentTestMarker
    const envelope = JSON.parse(exported)
    envelope.version = version
    const imported = serializer.importFromJson(JSON.stringify(envelope))
    assert.equal(fromProject(imported).code, code, 'source is preserved')
    assert.equal(fromProject(imported).enabled, true, 'enabled remains project data')
    assert.equal(evaluate(fromProject(imported)), 10)
    assert.equal(globalThis.__motionConsentTestMarker, undefined)
  })
}

test('loading stored projects revokes old approval; missing or invalid imports keep current state', async () => {
  const expr = api.approveMotionExpressionCode(expression('value + 7'))
  const serializer = new api.ProjectSerializer({ loadProject: async (id) => id === 'found' ? makeProject(expr) : null })
  assert.equal(await serializer.loadProject('missing'), null)
  assert.throws(() => serializer.importFromJson('{'))
  assert.equal(evaluate(expr), 17)
  const loaded = await serializer.loadProject('found')
  assert.equal(evaluate(fromProject(loaded)), 10)
})
