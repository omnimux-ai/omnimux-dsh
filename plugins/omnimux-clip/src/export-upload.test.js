/**
 * 画布导出上传：原始字节通道（application/octet-stream）。
 *
 * 回归背景：画布导出曾把整段视频 base64 塞进 JSON body，撞上 `readJsonBody`
 * 默认 8 MiB 上限 → 400 → 客户端拿不到 path，下游成片节点因此指向非本次合成
 * 的文件。此文件锁定新的原始字节通道与旧 JSON 通道的兼容性。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createClipDispatcher, registerClipRoutes } from './http/routes.js'
import { ensureClipDirs, resolveClipPaths } from './paths.js'

const PROJECT_ID = 'clip_node_regression_1'
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

/** 最小可用的浏览器同源请求（无 origin/sec-fetch-site，放行）。 */
function request(url, headers, chunks) {
  const stream = Readable.from(chunks)
  stream.method = 'POST'
  stream.url = url
  stream.headers = { host: '127.0.0.1:45120', ...headers }
  return stream
}

function mountRoutes() {
  const home = mkdtempSync(join(tmpdir(), 'clip-export-upload-'))
  const paths = ensureClipDirs(resolveClipPaths({ homeDir: home, env: {} }))
  const dispatcher = createClipDispatcher({ paths })
  let handler
  const webServer = {
    register(route) {
      handler = route.handler
      return () => {}
    },
  }
  registerClipRoutes(webServer, dispatcher, {
    paths,
    getConnection: () => ({ requestRejection: () => undefined }),
  })
  return { home, paths, handler }
}

test('原始字节上传：9 MiB 视频体成功落盘，不再撞 8 MiB JSON 上限', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    const payload = Buffer.alloc(9 * 1024 * 1024, 7)
    const res = fakeRes()
    await handler(
      request(SAVE_EXPORT_URL, { 'content-type': 'application/octet-stream' }, [payload]),
      res,
    )

    const dest = join(paths.exportsDir, `${PROJECT_ID}.mp4`)
    assert.equal(res.state.status, 200)
    assert.equal(res.state.body.path, dest)
    assert.equal(res.state.body.bytes, payload.length)
    assert.equal(existsSync(dest), true)
    const written = readFileSync(dest)
    assert.equal(written.length, payload.length)
    assert.equal(written[0], 7)
    assert.equal(written[written.length - 1], 7)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('原始字节上传：临时文件被清理，不留在 clip tmp 目录', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    const payload = Buffer.alloc(1024, 3)
    await handler(
      request(SAVE_EXPORT_URL, { 'content-type': 'application/octet-stream' }, [payload]),
      fakeRes(),
    )
    assert.deepEqual(readdirSync(paths.tmpDir), [])
    assert.deepEqual(readdirSync(paths.exportsDir), [`${PROJECT_ID}.mp4`])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('原始字节上传只认 save-export 路径：其它路径按 JSON 处理并拒绝', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    const res = fakeRes()
    await handler(
      request(
        '/omnimux-clip/api/unknown-route',
        { 'content-type': 'application/octet-stream' },
        [Buffer.alloc(64, 1)],
      ),
      res,
    )
    // 非 save-export → 不当原始字节上传，二进制体解析 JSON 失败。
    assert.equal(res.state.status, 400)
    assert.equal(res.state.body.error, 'invalid-json')
    assert.deepEqual(readdirSync(paths.tmpDir), [])
    assert.deepEqual(readdirSync(paths.exportsDir), [])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('旧 base64 JSON 通道保持兼容', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    const raw = Buffer.from('legacy-json-export')
    const res = fakeRes()
    await handler(
      request(
        SAVE_EXPORT_URL,
        { 'content-type': 'application/json' },
        [Buffer.from(JSON.stringify({ base64: raw.toString('base64'), mime: 'video/mp4' }))],
      ),
      res,
    )

    const dest = join(paths.exportsDir, `${PROJECT_ID}.mp4`)
    assert.equal(res.state.status, 200)
    assert.equal(res.state.body.path, dest)
    assert.equal(readFileSync(dest, 'utf8'), 'legacy-json-export')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('原始字节上传仅对 save-export 生效，普通 PUT 仍走 JSON 且不写导出目录', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    const stream = request(
      `/omnimux-clip/api/projects/${PROJECT_ID}`,
      { 'content-type': 'application/octet-stream' },
      [Buffer.from('{}')],
    )
    stream.method = 'PUT'
    const res = fakeRes()
    await handler(stream, res)

    assert.equal(res.state.status, 200)
    assert.equal(res.state.body.saved, true)
    assert.deepEqual(readdirSync(paths.exportsDir), [])
    assert.deepEqual(readdirSync(paths.tmpDir), [])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

/* ── Issue #3146：画布导出原地覆盖同一个 <projectId>.mp4 ───────────────
 * 下游成片节点只能靠服务端给出的内容身份（mtimeMs:size）判断「文件换了」，
 * 从而改写 mediaUrl 让 <video> 重新取流。
 */

test('save-export 响应带内容版本串，且两次导出必然不同', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    const first = fakeRes()
    await handler(
      request(SAVE_EXPORT_URL, { 'content-type': 'application/octet-stream' }, [Buffer.alloc(2048, 1)]),
      first,
    )
    assert.equal(first.state.status, 200)
    const dest = join(paths.exportsDir, `${PROJECT_ID}.mp4`)
    assert.equal(first.state.body.path, dest);
    assert.equal(first.state.body.revision, `${statSync(dest).mtimeMs}:2048`)
    assert.equal(first.state.body.bytes, 2048)

    // 二次导出覆盖同一路径：内容更长，且 mtime 前进。
    await new Promise((resolve) => setTimeout(resolve, 12))
    const second = fakeRes()
    await handler(
      request(SAVE_EXPORT_URL, { 'content-type': 'application/octet-stream' }, [Buffer.alloc(4096, 2)]),
      second,
    )
    assert.equal(second.state.status, 200)
    assert.equal(second.state.body.path, dest)
    assert.equal(second.state.body.revision, `${statSync(dest).mtimeMs}:4096`)
    assert.notEqual(second.state.body.revision, first.state.body.revision)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
