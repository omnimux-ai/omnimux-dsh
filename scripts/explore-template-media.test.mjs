import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createExploreMediaPlan } from './explore-template-media.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const templates = JSON.parse(await readFile(new URL('../plugins/omnimux/src/client/session-guide/templates/creative-templates.json', import.meta.url)))

test('offline plan validates source inputs, scope, containment and deterministic ordering', async () => {
  await mkdir(join(root, '.agent-reports/explore-video-preview'), { recursive: true })
  const sandbox = await mkdtemp(join(root, '.agent-reports/explore-video-preview/unit-media-'))
  const sourceRoot = join(sandbox, 'source')
  const sourceFile = join(sourceRoot, 'inspiration-library/video/pippit-marketing-agent.json')
  const items = templates.filter(t => t.sourcePlatform === 'pippit').map((template, index) => ({
    id: template.id.slice('tpl-pippit-'.length), localCoverPath: 'cover.png',
    media: [{ kind: 'image' }, ...Array.from({ length: index < 3 ? 4 : 3 }, (_, i) => ({ kind: 'video', localVideoPath: `video${i}.mp4` }))],
  }))
  const save = data => writeFile(sourceFile, JSON.stringify({ items: data }))
  try {
    await mkdir(join(sourceRoot, 'inspiration-library/video'), { recursive: true })
    await writeFile(join(sourceRoot, 'cover.png'), Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]))
    for (let i = 0; i < 4; i++) await writeFile(join(sourceRoot, `video${i}.mp4`), Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,i]))
    await save(items)
    const plan = await createExploreMediaPlan(sourceRoot)
    assert.deepEqual(plan, await createExploreMediaPlan(sourceRoot))
    assert.equal(plan.summary.templates, 395)
    assert.equal(plan.summary.applications, 7)
    assert.equal(plan.summary.pippitVideos, 291)
    const first = plan.references.find(r => r.sourcePlatform === 'pippit')
    assert.deepEqual(first.variants.map(v => v.sourceIndex), [1, 2, 3, 4])
    assert.equal(first.preview, first.variants[0].payloadId)
    assert.ok(plan.payloads.every(p => p.publicUrl === null))
    assert.ok(plan.payloads.filter(p => p.sourceLocation).every(p => !/[?#]/.test(p.sourceLocation)))
    for (const media of [undefined, null, {}, 'bad', [], [null]]) {
      const changed = structuredClone(items)
      changed[0].media = media
      await save(changed)
      await assert.rejects(createExploreMediaPlan(sourceRoot), error => error.message.includes('tpl-pippit-' + items[0].id))
    }
    await save(items.slice(1))
    await assert.rejects(createExploreMediaPlan(sourceRoot), /pippitTemplates actual=95, expected=96/)
    const fewerVideos = structuredClone(items)
    fewerVideos[0].media.pop()
    await save(fewerVideos)
    await assert.rejects(createExploreMediaPlan(sourceRoot), /pippitVideos actual=290, expected=291/)
    await save(items)
    for (const bytes of [Buffer.from([255,216,255]), Buffer.from([0,0,0,0,102,116,121,112]), Buffer.from([137,80,78,71,13,10,26,10])]) {
      await writeFile(join(sourceRoot, 'cover.png'), bytes)
      await assert.rejects(createExploreMediaPlan(sourceRoot), /Media too short: cover.png/)
    }
    await writeFile(join(sourceRoot, 'cover.png'), Buffer.alloc(12))
    await assert.rejects(createExploreMediaPlan(sourceRoot), /Unknown media header: cover.png/)
    await writeFile(join(sandbox, 'outside.png'), Buffer.alloc(12))
    await symlink(join(sandbox, 'outside.png'), join(sourceRoot, 'escape.png'))
    const escaped = structuredClone(items)
    escaped[0].localCoverPath = 'escape.png'
    await save(escaped)
    await assert.rejects(createExploreMediaPlan(sourceRoot), /Media path escapes source root/)
    await assert.rejects(createExploreMediaPlan('relative'), /explicit absolute source root/)
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
})
