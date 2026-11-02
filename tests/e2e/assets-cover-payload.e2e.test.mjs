/**
 * tests/e2e/assets-cover-payload.e2e.test.mjs
 * 资产中心首屏封面负载瘦身与请求减法端到端契约测试（Issue #3875 / #3879）
 *
 * 两条硬规则：
 *   1. 只读仓库内的真实数据（随包目录 `cloud-catalog/`）与现场生成的产物；
 *      绝不读 `.workbuddy/` 等 gitignored 路径——干净 checkout 与 CI 必须能跑。
 *   2. 断言「工具与客户端能力正确」，不冒充「线上已生效」。缩略图对象上传 CDN
 *      并由 `--thumb-manifest` 重建目录之后，随包目录才会带上 `thumb_url`；
 *      在那之前，本文件断言的是**回落路径**与**产出正确性**。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_REENCODE_EXTS,
  THUMB_MANIFEST_SCHEMA,
  THUMB_QUALITY,
  THUMB_WIDTH,
  buildManifest,
  needsThumbnail,
  planThumbs,
  readIdList,
  thumbObjectKey,
} from '../../plugins/omnimux-assets/scripts/build-cover-thumbnails.mjs'
import {
  directMediaUrl,
  normalizeCloudAsset,
} from '../../plugins/omnimux-assets/src/client/cloud-feed-helpers.js'
import {
  LOCAL_CLOUD_BASE_URL,
  cloudManifestUrl,
  configuredCloudBaseUrl,
} from '../../plugins/omnimux-assets/src/client/cloud-source.js'
import { thumbnailUrlsOf } from '../../plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const catalogDir = path.join(root, 'plugins/omnimux-assets/cloud-catalog')
const clientDir = path.join(root, 'plugins/omnimux-assets/src/client')

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const readText = (file) => fs.readFileSync(file, 'utf8')

/** 首屏这一页的真实行。 */
const firstPage = readJson(path.join(catalogDir, 'character/page-0000.json'))
const catalogIndex = readJson(path.join(catalogDir, 'index.json'))

test('E2E 契约一：随包目录是云端的唯一事实来源，缩略图字段可选 (AC-1, AC-5)', () => {
  assert.equal(firstPage.items.length, 24, '首屏必须还是 24 行')

  // 缩略图尚未上传时，随包目录一行都不带 `thumb_url`——这正是「可选字段」的定义。
  // 一旦上传并重建，这里会变成非零；两种状态都不得出现「空串占位」。
  const withEmptyThumb = catalogIndex.filter(
    (row) => Object.hasOwn(row, 'thumb_url') && String(row.thumb_url) === '',
  )
  assert.deepEqual(withEmptyThumb.map((row) => row.id), [], 'index 不得出现空串 thumb_url')

  const pageWithEmptyThumb = firstPage.items.filter(
    (row) => Object.hasOwn(row, 'thumb_url') && String(row.thumb_url) === '',
  )
  assert.deepEqual(pageWithEmptyThumb.map((row) => row.id), [], '页分片不得出现空串 thumb_url')

  // 有 thumb_url 的行必须是 https 直链。
  for (const row of catalogIndex) {
    if (!Object.hasOwn(row, 'thumb_url')) continue
    assert.match(String(row.thumb_url), /^https:\/\//, `${row.id} 的 thumb_url 必须是 https`)
  }
})

test('E2E 契约二：PNG 行的缩略图计划覆盖完整，清单可现场生成 (AC-8)', () => {
  const pngRows = catalogIndex.filter((row) => String(row.cover_url ?? '').endsWith('.png'))
  // 6 张损坏立绘已从目录移除（#3892），PNG 行由 111 降为 105。
  assert.equal(pngRows.length, 105, 'PNG 行数应为 105')

  const plan = planThumbs(catalogIndex)
  // 计划阶段必须覆盖目录里全部 PNG 行，脚本对失败行如实 SKIP 而不是静默缩小计划。
  assert.equal(plan.length, 105, '计划阶段应包含全部 105 张 PNG')

  // 被移除的 6 个损坏角色不得再出现在目录或计划里，防止误加回来。
  const removedIds = [
    'character-digital-human-2894d810df1f',
    'character-digital-human-4735a1b47285',
    'character-digital-human-7046fdf8cc44',
    'character-digital-human-a75f2fc74e2d',
    'character-digital-human-b9deac16eeaf',
    'character-digital-human-c69f04ccae0f',
  ]
  const present = new Set([...catalogIndex.map((row) => row.id), ...plan.map((row) => row.id)])
  assert.deepEqual(removedIds.filter((id) => present.has(id)), [], '损坏角色不得回到目录')

  const manifest = buildManifest({
    rows: plan.map((row) => ({ id: row.id, key: row.key, bytes: 70 * 1024, width: THUMB_WIDTH })),
    generatedAt: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(manifest.total, 105, '清单按传入行数记账')
  assert.equal(manifest.width, THUMB_WIDTH)
  assert.equal(manifest.quality, THUMB_QUALITY)
  assert.equal(manifest.schema, THUMB_MANIFEST_SCHEMA)
  assert.equal(manifest.format, 'webp')
})

test('E2E 契约三：缩略图对象键稳定且不可越出前缀', () => {
  assert.equal(
    thumbObjectKey('character-animal-character-1d165a0e7baf'),
    'thumbs/character-animal-character-1d165a0e7baf.webp',
  )
  // 越界或空 id 一律拒绝，不静默改名成会碰撞的键。
  assert.equal(thumbObjectKey('../escape'), '')
  assert.equal(thumbObjectKey('a/b'), '')
  assert.equal(thumbObjectKey(''), '')
})

test('E2E 契约四：默认只重编码 PNG，file: 定位符永不入选', () => {
  assert.deepEqual([...DEFAULT_REENCODE_EXTS], ['.png'])
  assert.equal(needsThumbnail({ id: 'a', cover_url: 'https://cdn/x.png' }), true)
  assert.equal(needsThumbnail({ id: 'b', cover_url: 'https://cdn/x.jpg' }), false)
  assert.equal(needsThumbnail({ id: 'c', cover_url: 'file:素材库/x.png' }), false)
  assert.equal(needsThumbnail({ id: 'd', cover_url: '' }), false)
  // --all 放宽格式，但 file: 与空封面仍然出局。
  assert.equal(needsThumbnail({ id: 'e', cover_url: 'https://cdn/x.jpg' }, { all: true }), true)
  assert.equal(needsThumbnail({ id: 'f', cover_url: 'file:x.jpg' }, { all: true }), false)
})

test('E2E 契约五：planThumbs 按 id 排序、去重并支持限额', () => {
  const rows = [
    { id: 'b', cover_url: 'https://cdn/b.png' },
    { id: 'a', cover_url: 'https://cdn/a.png' },
    { id: 'a', cover_url: 'https://cdn/a.png' },
    { id: 'c', cover_url: 'https://cdn/c.jpg' },
  ]
  assert.deepEqual(planThumbs(rows).map((row) => row.id), ['a', 'b'])
  assert.deepEqual(planThumbs(rows, { limit: 1 }).map((row) => row.id), ['a'])
  assert.deepEqual(planThumbs(rows, { all: true }).map((row) => row.id), ['a', 'b', 'c'])
})

test('E2E 契约六：清单只认目录里存在的 id 与相对对象键', () => {
  const rows = [{ id: 'a' }, { id: 'b' }]
  const manifest = {
    rows: [
      { id: 'a', key: 'thumbs/a.webp' },
      { id: 'missing', key: 'thumbs/missing.webp' },
      { id: 'b', key: 'https://evil.example/b.webp' },
      { id: 'b', key: '../escape.webp' },
    ],
  }
  const urls = thumbnailUrlsOf(rows, manifest)
  assert.equal(urls.get('a'), 'https://assets.omnimux.ai/thumbs/a.webp')
  assert.equal(urls.has('missing'), false, '目录里没有的 id 不得挂缩略图')
  assert.equal(urls.has('b'), false, '绝对 URL 与越界键都必须拒绝')
  assert.equal(thumbnailUrlsOf(rows, null).size, 0, '没有清单就是没有缩略图')
})

test('E2E 契约七：卡片取图优先级为 缩略图 → 原图 → Host 兜底 (AC-2)', () => {
  const row = normalizeCloudAsset({
    id: 'x',
    name: 'n',
    media_type: 'audio',
    cover_url: 'https://cdn/original.png',
    thumb_url: 'https://cdn/thumb.webp',
    media_url: 'https://cdn/a.wav',
  })
  assert.equal(row.thumbUrl, 'https://cdn/thumb.webp')
  assert.equal(row.coverUrl, 'https://cdn/original.png')
  assert.equal(row.hasCover, true, 'hasCover 语义不变')

  const legacy = normalizeCloudAsset({
    id: 'y',
    name: 'n',
    media_type: 'audio',
    cover_url: 'file:素材库/x.png',
    media_url: 'file:素材库/x.wav',
  })
  assert.equal(legacy.thumbUrl, '')
  assert.equal(legacy.coverUrl, '', 'file: 定位符不得直连')
  assert.equal(legacy.hasCover, true, '有封面这一事实仍成立，只是走 Host')

  // 只有 https 可以直连；http 与 file: 都必须留在 Host 路由上。
  assert.equal(directMediaUrl('https://a/b.webp'), 'https://a/b.webp')
  assert.equal(directMediaUrl('http://a/b.webp'), '', 'http 不得直连（AC-2 仅 https）')
  assert.equal(directMediaUrl('file:a/b.webp'), '')
  assert.equal(directMediaUrl(undefined), '')

  // 视图源码：阶梯顺序与降档决策都委托给纯函数，行为断言在 cloud-feed-helpers.test.js。
  const viewSrc = readText(path.join(clientDir, 'CloudAssetsView.jsx'))
  assert.match(viewSrc, /const ladder = coverLadderOf\(asset, cloudMediaUrl\)/)
  assert.match(viewSrc, /const next = nextLadderStep\(\{ ladder, step: srcStep, mediaType: asset\.mediaType, hasClip \}\)/)
})

test('E2E 契约八：image 行也走取图阶梯，不会绕过缩略图 (AC-1, AC-2)', () => {
  const viewSrc = readText(path.join(clientDir, 'CloudAssetsView.jsx'))
  // 渲染的 src 必须来自阶梯，不能再出现「image 行直接拼 media 路由」的绕过写法。
  assert.equal(
    /const imageSrc = asset\.mediaType === 'image' \? cloudMediaUrl/.test(viewSrc),
    false,
    'image 行不得绕过阶梯',
  )
  assert.match(viewSrc, /const imageSrc = ladder\[srcStep\] \?\? ''/)
  // 阶梯耗尽必然落到兜底，不依赖同一 URL 反复报错。
  assert.match(viewSrc, /if \(next\.kind === 'hand-over-to-clip'\) setSrcStep\(ladder\.length\)\n    else onBroken\(\)/)
})

test('E2E 契约九：视图不再整批预取尾部封面，视频不提前拉流 (AC-3, AC-4)', () => {
  const viewSrc = readText(path.join(clientDir, 'CloudAssetsView.jsx'))
  assert.doesNotMatch(viewSrc, /import \{ preloadMedia \}/)
  assert.doesNotMatch(viewSrc, /preloadMedia\(covers\)/)
  assert.match(viewSrc, /loading="lazy"/, '视口懒加载必须保留')

  // 有封面的视频行不再进场 element.load()；无封面的 bareClip 仍要取首帧。
  assert.doesNotMatch(viewSrc, /if \(!element \|\| !showClip \|\| element\.readyState > 0\) return/)
  assert.match(viewSrc, /if \(!element \|\| !bareClip \|\| element\.readyState > 0\) return/)
})

test('E2E 契约十：悬停试听有停留门槛，回调不经 effect 依赖抖动 (AC-5)', () => {
  const viewSrc = readText(path.join(clientDir, 'CloudAssetsView.jsx'))
  assert.match(viewSrc, /export const HOVER_AUDITION_DELAY_MS = 200/)
  assert.match(viewSrc, /setTimeout\(\(\) => \{ togglePlayRef\.current\(asset\) \}, HOVER_AUDITION_DELAY_MS\)/)
  // 回调必须经 ref 持有，否则父级每次重渲染都会清掉待触发的 timer。
  assert.match(viewSrc, /const togglePlayRef = useRef\(onTogglePlay\)/)
  assert.equal(
    /\}, \[hovering, canPlay, playing, asset, onTogglePlay, autoplaySuppressed\]\)/.test(viewSrc),
    false,
    'onTogglePlay 不得留在依赖数组里',
  )
  // 显式点击走 togglePlay，不经过门槛。
  assert.match(viewSrc, /const togglePlay = useCallback\(\(\) => \{/)
})

test('E2E 契约十一：默认目录源为本地，远端仅显式配置 (AC-7)', () => {
  assert.equal(configuredCloudBaseUrl({}), LOCAL_CLOUD_BASE_URL)
  assert.equal(cloudManifestUrl(configuredCloudBaseUrl({})), '/omnimux/assets/cloud/manifest.json')
  assert.equal(
    configuredCloudBaseUrl({ __OMNIMUX_CLOUD_ASSETS_BASE_URL__: 'https://gateway.test/c' }),
    'https://gateway.test/c',
  )
})

test('E2E 契约十二：302 响应可缓存，本地 stream 缓存策略不变 (AC-6)', () => {
  const routesSrc = readText(path.join(root, 'plugins/omnimux-assets/src/http-routes.js'))
  assert.match(routesSrc, /'Cache-Control': 'private, max-age=3600'/, '302 必须可缓存')
  assert.doesNotMatch(routesSrc, /'Cache-Control': 'no-store'/, '不得再禁止缓存')
  assert.match(routesSrc, /'Cache-Control': 'private, max-age=30'/, '本地 stream 保持原策略')
})

test('E2E 契约十三：清单构建保持确定性（同输入同输出）', () => {
  const rows = [
    { id: 'b', key: 'thumbs/b.webp', bytes: 100, width: THUMB_WIDTH },
    { id: 'a', key: 'thumbs/a.webp', bytes: 200, width: THUMB_WIDTH },
  ]
  const one = buildManifest({ rows, generatedAt: '2026-01-01T00:00:00.000Z' })
  const two = buildManifest({ rows: rows.slice().reverse(), generatedAt: '2026-01-01T00:00:00.000Z' })
  assert.deepEqual(one, two, '行顺序不得影响产物')
  assert.deepEqual(one.rows.map((row) => row.id), ['a', 'b'])
  assert.equal(one.total, 2)
  assert.equal(one.totalBytes, 300)
})

test('E2E 契约十四：构建脚本不把空串 thumb_url 写进任何产物 (AC-5)', () => {
  const builderSrc = readText(path.join(root, 'plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs'))
  // `makeAsset` 不得给行预置空串：页分片原样序列化它的返回值，
  // 一个空串字段会让 6388 行的字节全部变化，破坏「构建字节可复现」。
  assert.equal(
    /thumb_url: ''/.test(builderSrc),
    false,
    'makeAsset 不得预置空串 thumb_url',
  )
  // 缩略图只在 attach 阶段、且只对非空 URL 赋值。
  assert.match(builderSrc, /row\.thumb_url = url/)
  assert.match(builderSrc, /if \(url === undefined\) continue/)
  // index 侧仍然只发射非空值。
  assert.match(builderSrc, /if \(typeof row\.thumb_url === 'string' && row\.thumb_url !== ''\) entry\.thumb_url = row\.thumb_url/)
})

test('E2E 契约十五：--ids 精确点名行，压过格式过滤且不影响既有选择 (AC-3, AC-4)', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  // 一个 JPEG 行 + 一个 PNG 行 + 一个 file: 行。
  const rows = [
    { id: 'scene-a', cover_url: 'https://cdn/a.jpg' },
    { id: 'char-b', cover_url: 'https://cdn/b.png' },
    { id: 'local-c', cover_url: 'file:素材库/c.png' },
  ]

  // 默认只认 PNG。
  assert.deepEqual(planThumbs(rows).map((row) => row.id), ['char-b'])
  // --all 认所有可远程取图的行。
  assert.deepEqual(planThumbs(rows, { all: true }).map((row) => row.id), ['char-b', 'scene-a'])

  // --ids 点名的 JPEG 行会被选中——这正是修超高分辨率封面所需的能力。
  const named = planThumbs(rows, { ids: new Set(['scene-a']) })
  assert.deepEqual(named.map((row) => row.id), ['scene-a'])

  // 点名一个 file: 行仍然拒绝：没有远程对象可配对。
  assert.deepEqual(planThumbs(rows, { ids: new Set(['local-c']) }), [])

  // ids 优先级高于格式过滤：同时给 ids 与 all 时只认 ids。
  assert.deepEqual(
    planThumbs(rows, { all: true, ids: new Set(['scene-a']) }).map((row) => row.id),
    ['scene-a'],
  )

  // ids 文件：每行一个 id，空行与 # 注释忽略。
  const dir = mkdtempSync(join(tmpdir(), 'thumbs-ids-'))
  try {
    const file = join(dir, 'ids.txt')
    writeFileSync(file, '# 注释\n\nscene-a\nchar-b\n\n')
    assert.deepEqual([...readIdList(file)].sort(), ['char-b', 'scene-a'])
    // 文件不可读时抛错，而不是静默返回空集——空集会看起来像一次成功的 no-op。
    assert.throws(() => readIdList(join(dir, 'missing.txt')), /--ids file is unreadable/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('E2E 契约十六：场景 3 张超高分辨率封面已带缩略图 (AC-1, AC-2, AC-4)', () => {
  const fixed = [
    'scene-city-001be78b97c4',
    'scene-city-0466597a641d',
    'scene-city-047aa1e5ce26',
  ]
  for (const id of fixed) {
    const row = catalogIndex.find((entry) => entry.id === id)
    assert.ok(row, `${id} 应仍在目录里`)
    assert.match(
      String(row.thumb_url ?? ''),
      new RegExp(`^https://assets\\.omnimux\\.ai/thumbs/${id}\\.webp$`),
      `${id} 必须有缩略图`,
    )
  }
  // 场景分类共 6 行带缩略图：本次修的 3 张 JPEG + #3882 已处理的 3 张 PNG。
  // 断言写成全集而不是「只有这 3 行」，否则会误伤前一次任务的结果。
  const sceneWithThumb = catalogIndex
    .filter((row) => row.category === 'scene' && Object.hasOwn(row, 'thumb_url'))
    .map((row) => row.id)
    .sort()
  assert.equal(sceneWithThumb.length, 6, '场景分类应有 6 行带缩略图')
  for (const id of fixed) assert.ok(sceneWithThumb.includes(id), `${id} 必须在其中`)
})
