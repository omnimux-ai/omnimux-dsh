/**
 * tests/e2e/assets-cover-payload.e2e.test.mjs
 * 资产中心首屏封面负载瘦身与请求减法端到端契约测试（Issue #3875）
 *
 * 全部断言都跑在真实数据上：随包目录 `cloud-catalog/` 的真实分页文件，加上
 * 真实生成的 `thumb-manifest.json`。不联网、不 mock。
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
const manifestPath = path.join(root, '.workbuddy/evidence/assets-cover-payload/thumb-manifest.json')

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const readText = (file) => fs.readFileSync(file, 'utf8')

/** 首屏这一页的真实行。 */
const firstPage = readJson(path.join(catalogDir, 'character/page-0000.json'))
const thumbManifest = readJson(manifestPath)
const thumbBytesById = new Map(thumbManifest.rows.map((row) => [row.id, row.bytes]))

test('E2E 契约一：角色首屏封面预算从 79 MB 降到 2 MB 以内 (AC-1)', () => {
  // 真实封面体积由 evidence 报告采集（HEAD content-length），这里断言其结论。
  const report = readJson(path.join(root, '.workbuddy/evidence/assets-cover-payload/cover-payload-report.json'))

  assert.equal(firstPage.items.length, 24, '首屏必须还是 24 行')
  assert.ok(report.firstPage.originalMB > 70, `原始封面体积应远超 70 MB，实测 ${report.firstPage.originalMB}`)
  assert.ok(
    report.firstPage.thumbnailMB <= 2,
    `缩略图首屏预算必须 ≤ 2 MB，实测 ${report.firstPage.thumbnailMB} MB`,
  )
  assert.equal(report.firstPage.coveredRows, 24, '首屏 24 行必须全部有缩略图')
  assert.ok(
    report.firstPage.reductionPercent >= 90,
    `降幅必须 ≥ 90%，实测 ${report.firstPage.reductionPercent}%`,
  )
})

test('E2E 契约二：PNG 行除损坏源外均有缩略图，单张 ≤ 160 KB (AC-8)', () => {
  const index = readJson(path.join(catalogDir, 'index.json'))
  const pngRows = index.filter((row) => String(row.cover_url ?? '').endsWith('.png'))

  // 111 张 PNG 里 6 张源文件本身已截断（CDN 上就是坏图），缩略图脚本如实跳过。
  const BROKEN = 6
  assert.equal(pngRows.length, 111, 'PNG 行数应为 111')
  assert.equal(thumbManifest.rows.length, 111 - BROKEN, '除 6 张损坏源外都应产出缩略图')

  const oversize = thumbManifest.rows.filter((row) => row.bytes > 160 * 1024)
  assert.deepEqual(oversize.map((row) => row.id), [], '不得有单张超过 160 KB 的缩略图')

  assert.equal(thumbManifest.width, THUMB_WIDTH)
  assert.equal(thumbManifest.quality, THUMB_QUALITY)
  assert.equal(thumbManifest.schema, THUMB_MANIFEST_SCHEMA)
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
  // 归一化层：两个直链字段只接受 http(s)，file: 留给 Host 路由。
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

  assert.equal(directMediaUrl('https://a/b.webp'), 'https://a/b.webp')
  assert.equal(directMediaUrl('http://a/b.webp'), 'http://a/b.webp')
  assert.equal(directMediaUrl('file:a/b.webp'), '')
  assert.equal(directMediaUrl(undefined), '')

  // 视图源码：阶梯顺序与逐级降档。
  const viewSrc = readText(path.join(clientDir, 'CloudAssetsView.jsx'))
  assert.match(viewSrc, /\[asset\.thumbUrl, asset\.coverUrl, cloudMediaUrl\(asset\.id, 'cover'\)\]/)
  assert.match(viewSrc, /if \(srcStep < coverLadder\.length - 1\)/)
})

test('E2E 契约八：视图不再整批预取尾部封面，视频不提前拉流 (AC-3, AC-4)', () => {
  const viewSrc = readText(path.join(clientDir, 'CloudAssetsView.jsx'))
  assert.doesNotMatch(viewSrc, /import \{ preloadMedia \}/)
  assert.doesNotMatch(viewSrc, /preloadMedia\(covers\)/)
  assert.match(viewSrc, /loading="lazy"/, '视口懒加载必须保留')

  // 有封面的视频行不再进场 element.load()；无封面的 bareClip 仍要取首帧。
  assert.doesNotMatch(viewSrc, /if \(!element \|\| !showClip \|\| element\.readyState > 0\) return/)
  assert.match(viewSrc, /if \(!element \|\| !bareClip \|\| element\.readyState > 0\) return/)
})

test('E2E 契约九：悬停试听有停留门槛，显式点击不受限 (AC-5)', () => {
  const viewSrc = readText(path.join(clientDir, 'CloudAssetsView.jsx'))
  assert.match(viewSrc, /export const HOVER_AUDITION_DELAY_MS = 200/)
  assert.match(viewSrc, /setTimeout\(\(\) => \{ onTogglePlay\(asset\) \}, HOVER_AUDITION_DELAY_MS\)/)
  // 显式点击走 togglePlay，不经过门槛。
  assert.match(viewSrc, /const togglePlay = useCallback\(\(\) => \{/)
})

test('E2E 契约十：默认目录源为本地，远端仅显式配置 (AC-7)', () => {
  assert.equal(configuredCloudBaseUrl({}), LOCAL_CLOUD_BASE_URL)
  assert.equal(cloudManifestUrl(configuredCloudBaseUrl({})), '/omnimux/assets/cloud/manifest.json')
  // 显式覆盖仍然生效。
  assert.equal(
    configuredCloudBaseUrl({ __OMNIMUX_CLOUD_ASSETS_BASE_URL__: 'https://gateway.test/c' }),
    'https://gateway.test/c',
  )
})

test('E2E 契约十一：302 响应可缓存，本地 stream 缓存策略不变 (AC-6)', () => {
  const routesSrc = readText(path.join(root, 'plugins/omnimux-assets/src/http-routes.js'))
  assert.match(routesSrc, /'Cache-Control': 'private, max-age=3600'/, '302 必须可缓存')
  assert.doesNotMatch(routesSrc, /'Cache-Control': 'no-store'/, '不得再禁止缓存')
  assert.match(routesSrc, /'Cache-Control': 'private, max-age=30'/, '本地 stream 保持原策略')
})

test('E2E 契约十二：清单构建保持确定性（同输入同输出）', () => {
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
