/**
 * tests/e2e/clip-preview-refresh-3146.e2e.test.mjs
 * 成片节点重复导出后预览不自动刷新的端到端契约（Issue #3146）。
 *
 * 真机缺陷：画布导出**原地覆盖**同一个 `<projectId>.mp4`，路径与字节数都不变，
 * 下游成片节点的 `mediaUrl` 因此逐字符相同；浏览器复用同一个 `<video>` 元素、
 * 不再取流，停在 `readyState=0` / `error.code=4`，直到有人显式 `load()`。
 *
 * 本用例把两端真实模块串起来验证：
 *  1. 剪辑宿主真实的 save-export 路由（真实请求体 + 真实落盘）对同一文件重导出
 *     必须给出**不同**的 `revision`；两次字节数相同，所以只带 size 的版本串会
 *     碰撞，无法单独作为缓存判据；
 *  2. 该 `revision` 经真实的 `planClipExportDownstream` 落到下游成片节点
 *     `mediaUrl` 的 `&rev=<token>` 上，且重导出复用同一节点、不新增重复节点；
 *  3. 没有 `revision` 时（旧宿主/旧调用方）`mediaUrl` 与修复前**逐字符一致**，
 *     保证向后兼容。
 *
 * 实机预演证据：docs/evidence/clip-preview-refresh-3146/（真实浏览器操作路径与截图）。
 *
 * 位置说明：契约横跨 omnimux-clip 与 omnimux-workflow 两个插件，而
 * `scripts/verify-plugin-boundaries.mjs` 禁止 plugins/ 下的跨插件私有相对导入，
 * 故落在仓库级 tests/e2e/（与 assets-grid-masonry 等跨插件契约同址）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { createClipDispatcher, registerClipRoutes } from '../../plugins/omnimux-clip/src/http/routes.js'
import { ensureClipDirs, resolveClipPaths } from '../../plugins/omnimux-clip/src/paths.js'
import { planClipExportDownstream } from '../../plugins/omnimux-workflow/src/canvas/nodes/definitions/videoCompositionDownstream.ts'

const PROJECT_ID = 'clip_node_e2e_revision'
const SAVE_EXPORT_URL = `/omnimux-clip/api/projects/${PROJECT_ID}/save-export`
const LOCAL_FILE_MEDIA_URL = '/omnimux-workflow/api/local-file'

/** 与实机观测的成片同量级：两次导出字节数完全相同，只有 mtime 会推进。 */
const EXPORT_BYTES = 2290

/** 重导出之间真实隔着用户的一次操作；1.1s 保证任何文件系统时间粒度下 mtime 都已推进。 */
const REEXPORT_GAP_MS = 1100

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
  const home = mkdtempSync(join(tmpdir(), 'clip-revision-e2e-'))
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

/** 走真实路由上传一次导出（真实落盘到 exports 目录）。 */
async function uploadExport(handler, bytes) {
  const res = fakeRes()
  await handler(
    request(SAVE_EXPORT_URL, { 'content-type': 'application/octet-stream' }, [bytes]),
    res,
  )
  return res.state
}

/** 下游成片节点的期望媒体 URL（修复后的形态：宿主 URL + 版本串）。 */
function expectedRevisionedUrl(videoPath, revision) {
  return `${LOCAL_FILE_MEDIA_URL}?path=${encodeURIComponent(videoPath)}&rev=${encodeURIComponent(revision)}`
}

/** 修复前（无版本串）的媒体 URL 形态，用作逐字符基线。 */
function preFixUrl(videoPath) {
  return `${LOCAL_FILE_MEDIA_URL}?path=${encodeURIComponent(videoPath)}`
}

const compositionNode = {
  id: 'node_video_composition_1',
  type: 'video_composition',
  position: { x: 40, y: 80 },
  data: { title: '视频合成', status: 'completed' },
}

function planWith(output, nodes, edges) {
  return planClipExportDownstream({
    sourceNodeId: compositionNode.id,
    sourcePosition: compositionNode.position,
    sourceLabel: '视频合成',
    output,
    currentNodes: nodes,
    currentEdges: edges,
    nodeWidth: 350,
  })
}

test('e2e：同一文件重导出的 revision 必须变化，且 size 段相同（size-only 版本串不足以区分）', async () => {
  const { home, paths, handler } = mountRoutes()
  try {
    const bytes = Buffer.alloc(EXPORT_BYTES, 7)

    const first = await uploadExport(handler, bytes)
    await delay(REEXPORT_GAP_MS)
    const second = await uploadExport(handler, bytes)

    assert.equal(first.status, 200)
    assert.equal(second.status, 200)

    // 原地覆盖：路径不变，这正是浏览器复用旧 <video> 的前提。
    const exportedPath = join(paths.exportsDir, `${PROJECT_ID}.mp4`)
    assert.equal(first.body.path, exportedPath)
    assert.equal(second.body.path, exportedPath)
    assert.equal(readFileSync(exportedPath).equals(bytes), true)

    const onDisk = statSync(exportedPath)
    assert.equal(first.body.bytes, EXPORT_BYTES)
    assert.equal(second.body.bytes, EXPORT_BYTES)

    const [mtimeOne, sizeOne] = String(first.body.revision).split(':')
    const [mtimeTwo, sizeTwo] = String(second.body.revision).split(':')

    // 字节数相同 → 只带 size 的版本串两次会碰撞，必须靠 mtime 段区分。
    assert.equal(sizeOne, String(onDisk.size))
    assert.equal(sizeTwo, String(onDisk.size))
    assert.equal(sizeOne, sizeTwo)
    assert.notEqual(mtimeOne, mtimeTwo)
    assert.notEqual(first.body.revision, second.body.revision)

    // 版本串必须是**真实落盘文件**的身份，而不是请求里的回声。
    assert.ok(
      Math.abs(Number(mtimeTwo) - onDisk.mtimeMs) < 1000,
      `revision 的 mtime 段应等于落盘文件的 mtime（revision=${second.body.revision}, mtimeMs=${onDisk.mtimeMs}）`,
    )
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('e2e：重导出的 revision 让下游成片节点 mediaUrl 变化，且复用同一节点不新增重复节点', async () => {
  const { home, handler } = mountRoutes()
  try {
    const bytes = Buffer.alloc(EXPORT_BYTES, 7)

    const first = await uploadExport(handler, bytes)
    await delay(REEXPORT_GAP_MS)
    const second = await uploadExport(handler, bytes)

    const videoPath = second.body.path
    assert.equal(first.body.path, videoPath)

    const firstPlan = planWith(
      { videoPath, revision: first.body.revision },
      [compositionNode],
      [],
    )
    assert.equal(firstPlan.addNodes.length, 1)
    const downstream = firstPlan.addNodes[0]
    assert.equal(downstream.data.mediaUrl, expectedRevisionedUrl(videoPath, first.body.revision))

    // 第二次导出后画布拿到的是同一个节点 + 新的 revision。
    const secondPlan = planWith(
      { videoPath, revision: second.body.revision },
      [compositionNode, downstream],
      firstPlan.addEdges,
    )

    assert.deepEqual(secondPlan.addNodes, [], '重导出不得新增重复成片节点')
    assert.deepEqual(secondPlan.addEdges, [])
    assert.equal(secondPlan.nodePatches.length, 1)
    assert.equal(secondPlan.nodePatches[0].nodeId, downstream.id)
    assert.equal(
      secondPlan.nodePatches[0].data.mediaUrl,
      expectedRevisionedUrl(videoPath, second.body.revision),
    )
    assert.notEqual(
      secondPlan.nodePatches[0].data.mediaUrl,
      downstream.data.mediaUrl,
      'URL 必须随 revision 变化，否则浏览器复用旧 <video> 停在失败态',
    )
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('e2e：没有 revision 时 mediaUrl 与修复前逐字符一致（向后兼容）', async () => {
  const { home, handler } = mountRoutes()
  try {
    const exported = await uploadExport(handler, Buffer.alloc(EXPORT_BYTES, 7))
    assert.equal(exported.status, 200)
    const videoPath = exported.body.path

    // 旧宿主/旧调用方只给 videoPath：URL 必须与修复前完全相同，不加任何 rev。
    const plan = planWith({ videoPath }, [compositionNode], [])
    assert.equal(plan.addNodes.length, 1)
    const mediaUrl = plan.addNodes[0].data.mediaUrl

    assert.equal(mediaUrl, preFixUrl(videoPath))
    assert.equal(mediaUrl.includes('rev='), false)
    assert.equal(mediaUrl.includes('?path='), true)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
