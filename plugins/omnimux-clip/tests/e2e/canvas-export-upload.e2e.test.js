/**
 * 画布视频合成导出：上传通道端到端契约。
 *
 * 真实 HTTP 路由 + 真实落盘，不 mock 文件系统。锁定本次缺陷的根因：
 * 旧通道把整段视频 base64 塞进 JSON body，撞上 8 MiB 上限被 400 拒绝，
 * 客户端因此拿不到 path，下游成片节点指向非本次合成的文件。
 *
 * 验收：>8 MiB 的导出必须 2xx 且字节与磁盘一致；旧 JSON 通道在同尺寸下
 * 仍被拒绝（这正是必须换通道的原因，防止回退）。
 * 实机预演证据见 docs/evidence/canvas-clip-export-stale/live-repro.md。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createClipDispatcher, registerClipRoutes } from '../../src/http/routes.js'
import { ensureClipDirs, resolveClipPaths } from '../../src/paths.js'

const PROJECT_ID = 'clip_node_e2e_upload'
const SAVE_EXPORT_URL = `/omnimux-clip/api/projects/${PROJECT_ID}/save-export`

function fakeRes() {
  const state = { status: 0, body: null }
  return {
    state,
    writeHead(status) {
      state.status = status
    },
    end(text) {
      state.body = text ? JSON.parse(text) : null
    },
  }
}

function request(url, headers, chunks) {
  const stream = Readable.from(chunks)
  stream.method = 'POST'
  stream.url = url
  stream.headers = { host: '127.0.0.1:45120', ...headers }
  return stream
}

function mountRoutes() {
  const home = mkdtempSync(join(tmpdir(), 'clip-export-e2e-'))
  const paths = ensureClipDirs(resolveClipPaths({ homeDir: home, env: {} }))
  const dispatcher = createClipDispatcher({ paths })
  let handler
  registerClipRoutes(
    { register(route) { handler = route.handler; return () => {} } },
    dispatcher,
    { paths, getConnection: () => ({ requestRejection: () => undefined }) },
  )
  return { home, paths, handler }
}

test('e2e：>8MiB 合成导出经原始字节通道落盘，节点拿到的 path 就是该文件', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    // 9 MiB ≈ 一段 30 秒 1080p 成片的量级；旧 JSON 通道在此必然 400。
    const payload = Buffer.alloc(9 * 1024 * 1024, 11)
    const res = fakeRes()
    await handler(
      request(SAVE_EXPORT_URL, { 'content-type': 'application/octet-stream' }, [payload]),
      res,
    )

    assert.equal(res.state.status, 200)
    const exportedPath = res.state.body.path
    assert.equal(exportedPath, join(paths.exportsDir, `${PROJECT_ID}.mp4`))
    assert.equal(res.state.body.bytes, payload.length)
    assert.equal(existsSync(exportedPath), true)

    const onDisk = statSync(exportedPath)
    assert.equal(onDisk.size, payload.length)
    assert.equal(readFileSync(exportedPath).equals(payload), true)
    // 临时上传文件必须回收，导出目录只留成片。
    assert.deepEqual(readdirSync(paths.tmpDir), [])
    assert.deepEqual(readdirSync(paths.exportsDir), [`${PROJECT_ID}.mp4`])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('e2e：旧 base64 JSON 通道对同尺寸导出仍被拒（防止回退到旧传输）', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    const payload = Buffer.alloc(9 * 1024 * 1024, 11)
    const res = fakeRes()
    await handler(
      request(
        SAVE_EXPORT_URL,
        { 'content-type': 'application/json' },
        [Buffer.from(JSON.stringify({ base64: payload.toString('base64'), mime: 'video/mp4' }))],
      ),
      res,
    )

    assert.equal(res.state.status, 400)
    assert.equal(res.state.body.error, 'invalid-json')
    assert.deepEqual(readdirSync(paths.exportsDir), [])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('e2e：小尺寸导出两条通道都可用，落盘内容一致', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    const raw = Buffer.from('small-composition-bytes')

    const rawRes = fakeRes()
    await handler(
      request(
        `/omnimux-clip/api/projects/${PROJECT_ID}_raw/save-export`,
        { 'content-type': 'application/octet-stream' },
        [raw],
      ),
      rawRes,
    )
    const jsonRes = fakeRes()
    await handler(
      request(
        `/omnimux-clip/api/projects/${PROJECT_ID}_json/save-export`,
        { 'content-type': 'application/json' },
        [Buffer.from(JSON.stringify({ base64: raw.toString('base64') }))],
      ),
      jsonRes,
    )

    assert.equal(rawRes.state.status, 200)
    assert.equal(jsonRes.state.status, 200)
    assert.equal(
      readFileSync(join(paths.exportsDir, `${PROJECT_ID}_raw.mp4`)).equals(raw),
      true,
    )
    assert.equal(
      readFileSync(join(paths.exportsDir, `${PROJECT_ID}_json.mp4`)).equals(raw),
      true,
    )
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
