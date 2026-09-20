import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { ClipDomainError } from './errors.js'
import { ensureClipDirs, resolveClipPaths } from './paths.js'
import { createProjectStore } from './store/projectStore.js'
import { createClipTools } from './tools.js'
import { createEmptySchema } from './client/store/timelineTypes.js'
import { apply, inject as moduleInject } from './index.js'

function tempStore() {
  const home = mkdtempSync(join(tmpdir(), 'omnimux-clip-tools-'))
  const paths = ensureClipDirs(resolveClipPaths({ homeDir: home, env: {} }))
  const store = createProjectStore({ paths })
  return { home, paths, store }
}

function byName(tools, name) {
  const tool = tools.find((item) => item.name === name)
  assert.ok(tool, `missing tool ${name}`)
  return tool
}

describe('clip_* tools', () => {
  /** @type {{ home: string, paths: object, store: ReturnType<typeof createProjectStore> }} */
  let ctx
  let overlay = false
  let tools

  beforeEach(() => {
    ctx = tempStore()
    overlay = false
    ctx.store.create('demo', (() => {
      const schema = createEmptySchema({ projectId: 'demo' })
      schema.tracks[0].clips.push({
        id: 'clip_a',
        trackId: 'track_video',
        name: 'A',
        mediaType: 'video',
        startTimeMs: 0,
        durationMs: 4000,
        sourceUrl: '/tmp/a.mp4',
        sourceInMs: 0,
        sourceOutMs: 4000,
        speed: 1,
        volume: 1,
      })
      schema.canvasConfig.durationMs = 4000
      return schema
    })())
    tools = createClipTools({
      store: ctx.store,
      overlayReady: () => overlay,
    })
  })

  afterEach(() => {
    rmSync(ctx.home, { recursive: true, force: true })
  })

  it('registers the nine frozen tool names', () => {
    assert.deepEqual(
      tools.map((item) => item.name),
      ['clip_list', 'clip_create', 'clip_open', 'clip_get', 'clip_edit', 'clip_view', 'clip_snapshot', 'clip_diagnostics', 'clip_export'],
    )
  })

  it('clip_create persists an empty project and clip_list discovers it', async () => {
    const created = await byName(tools, 'clip_create').execute({ name: ' 我的短视频 ', resolution: 'portrait', fps: 24 })
    assert.match(created.projectId, /^clip_/)
    assert.equal(created.name, '我的短视频')
    assert.equal(created.aspectRatio, '9:16')
    assert.equal(created.fps, 24)
    // persisted: clip_get can read it back without an overlay
    const got = await byName(tools, 'clip_get').execute({ projectId: created.projectId })
    assert.equal(got.projectId, created.projectId)
    const listed = await byName(tools, 'clip_list').execute({})
    const hit = listed.projects.find((item) => item.id === created.projectId)
    assert.ok(hit, 'clip_list must surface the created project')
    assert.equal(hit.projectName, '我的短视频')
    assert.equal(hit.aspectRatio, '9:16')
  })

  it('clip_create validates name / resolution / fps', async () => {
    const create = byName(tools, 'clip_create')
    await assert.rejects(() => create.execute({ name: '  ' }), (e) => e instanceof ClipDomainError)
    await assert.rejects(() => create.execute({ name: 'x'.repeat(81) }), (e) => e instanceof ClipDomainError)
    await assert.rejects(() => create.execute({ name: 'ok', resolution: 'wide' }), (e) => e instanceof ClipDomainError)
    await assert.rejects(() => create.execute({ name: 'ok', fps: 0 }), (e) => e instanceof ClipDomainError)
  })

  it('clip_list sorts newest first and clamps limit', async () => {
    await byName(tools, 'clip_create').execute({ name: 'newer' })
    const all = await byName(tools, 'clip_list').execute({})
    assert.equal(all.count, 2)
    assert.equal(all.projects[0].projectName, 'newer')
    const one = await byName(tools, 'clip_list').execute({ limit: 1 })
    assert.equal(one.projects.length, 1)
    await assert.rejects(() => byName(tools, 'clip_list').execute({ limit: -1 }), (e) => e instanceof ClipDomainError)
  })

  it('clip_open validates the project then calls the injected open channel', async () => {
    const opened = []
    const openTools = createClipTools({
      store: ctx.store,
      overlayReady: () => false,
      openEditor: (projectId) => { opened.push(projectId); return { channels: ['clip-event'] } },
    })
    const result = await byName(openTools, 'clip_open').execute({ projectId: 'demo' })
    assert.deepEqual(opened, ['demo'])
    assert.equal(result.opened, true)
    assert.deepEqual(result.channels, ['clip-event'])
    assert.equal(result.overlayReady, false)
    await assert.rejects(
      () => byName(openTools, 'clip_open').execute({ projectId: 'ghost' }),
      (e) => e instanceof ClipDomainError && e.code === 'not-found',
    )
  })

  it('clip_open surfaces ui-unavailable when no UI channel exists', async () => {
    const noUiTools = createClipTools({
      store: ctx.store,
      openEditor: () => { throw ClipDomainError.uiUnavailable('no DOM in this realm') },
    })
    await assert.rejects(
      () => byName(noUiTools, 'clip_open').execute({ projectId: 'demo' }),
      (e) => e instanceof ClipDomainError && e.code === 'ui-unavailable',
    )
  })

  it('clip_get returns seconds and respects view=clips', async () => {
    const summary = await byName(tools, 'clip_get').execute({ projectId: 'demo' })
    assert.equal(summary.projectId, 'demo')
    assert.equal(summary.durationSec, 4)
    assert.equal(summary.clipCount, 1)
    const clips = await byName(tools, 'clip_get').execute({ projectId: 'demo', view: 'clips' })
    assert.equal(clips.clips[0].startSec, 0)
    assert.equal(clips.clips[0].durationSec, 4)
  })

  it('clip_edit is one undo step and validateOnly does not persist', async () => {
    const preview = await byName(tools, 'clip_edit').execute({
      projectId: 'demo',
      description: 'dry run split',
      validateOnly: true,
      operations: [{ type: 'split_clip', clipId: 'clip_a', atSec: 1 }],
    })
    assert.equal(preview.persisted, false)
    assert.equal(ctx.store.load('demo').schema.tracks[0].clips.length, 1)

    const live = await byName(tools, 'clip_edit').execute({
      projectId: 'demo',
      description: 'split at 1s',
      operations: [{ type: 'split_clip', clipId: 'clip_a', atSec: 1 }],
    })
    assert.equal(live.persisted, true)
    assert.equal(live.undoStep, true)
    const after = ctx.store.load('demo')
    assert.equal(after.schema.tracks[0].clips.length, 2)
    assert.equal(after.history.past.length, 1)
    assert.equal(after.history.past[0].tracks[0].clips.length, 1)
  })

  it('clip_view / clip_snapshot throw PREVIEW_NOT_READY when overlay is down', async () => {
    await assert.rejects(
      () => byName(tools, 'clip_view').execute({ projectId: 'demo', action: 'play' }),
      (error) => error instanceof ClipDomainError && error.code === 'PREVIEW_NOT_READY',
    )
    await assert.rejects(
      () => byName(tools, 'clip_snapshot').execute({ projectId: 'demo', times: [0] }),
      (error) => error instanceof ClipDomainError && error.code === 'PREVIEW_NOT_READY',
    )
  })

  it('clip_view seeks in seconds without creating an undo step', async () => {
    overlay = true
    const before = ctx.store.load('demo').history.past.length
    const result = await byName(tools, 'clip_view').execute({
      projectId: 'demo',
      action: 'seek',
      toSec: 1.25,
    })
    assert.equal(result.playheadSec, 1.25)
    assert.equal(result.isPlaying, false)
    assert.equal(ctx.store.load('demo').history.past.length, before)
  })

  it('clip_snapshot writes png paths and clip_export queues a job', async () => {
    overlay = true
    const snap = await byName(tools, 'clip_snapshot').execute({
      projectId: 'demo',
      times: [0, 1.5],
    })
    assert.equal(snap.frames.length, 2)
    assert.equal(existsSync(snap.frames[0].path), true)
    assert.equal(snap.frames[1].timeSec, 1.5)

    const exported = await byName(tools, 'clip_export').execute({
      projectId: 'demo',
      resolution: '1080p',
      fps: 30,
    })
    assert.equal(exported.status, 'queued')
    assert.equal(exported.mode, 'live')
    assert.equal(exported.resolution, '1080p')
    assert.match(exported.dest, /\.mp4$/)
    const jobFile = exported.dest.replace(/\.mp4$/, '.export.json')
    const job = JSON.parse(readFileSync(jobFile, 'utf8'))
    assert.equal(job.projectId, 'demo')
  })

  it('clip_diagnostics reports gaps without throwing', async () => {
    await byName(tools, 'clip_edit').execute({
      projectId: 'demo',
      description: 'open a hole',
      operations: [{ type: 'trim_clip', clipId: 'clip_a', durationSec: 1 }],
    })
    await byName(tools, 'clip_edit').execute({
      projectId: 'demo',
      description: 'add later clip',
      operations: [{
        type: 'add_clip',
        trackId: 'track_video',
        clipId: 'clip_b',
        startSec: 3,
        durationSec: 1,
        path: '/tmp/b.mp4',
      }],
    })
    const report = await byName(tools, 'clip_diagnostics').execute({ projectId: 'demo' })
    assert.equal(report.ok, false)
    assert.ok(report.issues.some((item) => item.code === 'timeline_gap'))
  })

  it('missing projectId and unknown project throw ClipDomainError, never { ok: false }', async () => {
    await assert.rejects(
      () => byName(tools, 'clip_get').execute({}),
      (error) => error instanceof ClipDomainError && error.code === 'invalid-id',
    )
    await assert.rejects(
      () => byName(tools, 'clip_get').execute({ projectId: 'nope' }),
      (error) => error instanceof ClipDomainError && error.code === 'not-found',
    )
  })
})

describe('apply() host entry', () => {
  it('declares strict injects including systemPrompt (regression: boot crash)', () => {
    assert.deepEqual(moduleInject, ['tools', 'systemPrompt'])
  })

  it('registers tools, prompt and clipEditor seam', () => {
    const registered = []
    const provided = {}
    const sections = []
    const home = mkdtempSync(join(tmpdir(), 'omnimux-clip-apply-'))
    const prev = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      apply({
        tools: { register: (tool) => registered.push(tool.name) },
        systemPrompt: { section: (spec) => sections.push(spec.name) },
        provide: (name, value) => { provided[name] = value },
        inject: () => {},
      })
    } finally {
      if (prev == null) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
      rmSync(home, { recursive: true, force: true })
    }
    assert.deepEqual(registered, [
      'clip_list', 'clip_create', 'clip_open',
      'clip_get', 'clip_edit', 'clip_view', 'clip_snapshot', 'clip_diagnostics', 'clip_export',
    ])
    assert.deepEqual(sections, ['clip:ops'])
    assert.equal(typeof provided.clipEditor.open, 'function')
    assert.equal(typeof provided.clipEditor.export, 'function')
  })

  it('mounts routes via canonical guarded webServer resolution (regression: register without inject)', () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-clip-mount-'))
    const prev = process.env.DSH_HOME
    process.env.DSH_HOME = home
    const mounted = []
    const effects = []
    let captured = null
    try {
      apply({
        tools: { register: () => {} },
        systemPrompt: { section: () => {} },
        provide: () => {},
        inject: (deps, cb) => { if (deps.includes('webServer')) captured = cb },
      })
      // Case A: nested callback hands us a ctx whose .register is gated —
      // the guarded mount must resolve via get() and mount exactly once.
      captured({
        get: (name) => name === 'webServer'
          ? { register: (route) => { mounted.push(route.path); return () => {} } }
          : undefined,
        effect: (fn, label) => { effects.push(label); fn() },
      })
      // Case B: raw service handed directly with no effect() — must still mount.
      apply({
        tools: { register: () => {} },
        systemPrompt: { section: () => {} },
        provide: () => {},
        inject: (deps, cb) => { if (deps.includes('webServer')) cb({}) }, // no get, no register → must NOT throw
      })
    } finally {
      if (prev == null) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
      rmSync(home, { recursive: true, force: true })
    }
    assert.deepEqual(mounted, ['/omnimux-clip/api'])
    assert.deepEqual(effects, ['omnimux-clip: http routes'])
  })
})
