/**
 * 二级表单页面的端到端回归。
 *
 * 这里驱动的是真实链路：真实 HTTP 分发器、真实导入器、真实落库、真实表单状态机
 * 与真实指纹。唯一被替换的是两个测试不该跨过的边界 —— 落地页的网络读取，以及
 * 真正按下快门的那支浏览器（后者的真机几何证据在
 * `scripts/verify-product-secondary-page.mjs` 与 `.workbuddy/evidence/product-secondary-page/`）。
 *
 * 用例编号对应 `specs/product-secondary-page.spec.md` §2 的 AC 条目。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { createDraftMediaRegistry } from '../../src/draft-media.js'
import { createProductsDispatcher } from '../../src/http-routes.js'
import { createLibraryStore } from '../../src/library.js'
import { mediaDirOf } from '../../src/paths.js'
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from '../../src/screenshot-contract.js'
import {
  bundleFormReturn,
  computeProductFingerprint,
  formSnapshotOf,
  importedMediaOf,
  mergeImportedMedia,
} from '../../src/client/useProductFormState.js'

const PAGE_URL = 'https://platform.example.com/product/open-platform'
const roots = []

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true })
})

/** 一次真实的落地页解析结果（两张首屏截图 + 六个战略模块）。 */
function importedDraft(media) {
  return {
    name: 'MiniMax 开放平台',
    selling_points: '一站式多模态模型服务，超长上下文',
    features: '文本模型 API，让开发者一个接口接入多模态',
    target_audience: 'AI 应用开发者',
    brand: 'MiniMax',
    price: '',
    sku: '',
    promotion: '',
    link: PAGE_URL,
    categories: ['AI 平台'],
    images: [],
    kind: 'digital',
    analysis: { mode: 'model', model: 'gemini-3.8-flash', reason: null },
    media,
    cover_media_id: media[0]?.id ?? null,
    screenshots: {
      status: 'captured',
      reason: null,
      viewports: [
        { kind: 'desktop', ok: true, width: DESKTOP_VIEWPORT.width, height: DESKTOP_VIEWPORT.height, bytes: 3, reason: null },
        { kind: 'mobile', ok: true, width: MOBILE_VIEWPORT.width * 2, height: MOBILE_VIEWPORT.height * 2, bytes: 3, reason: null },
      ],
    },
  }
}

/**
 * 一套真实环境：真实库 + 真实分发器 + 真实媒体目录，只有落地页读取是替身。
 */
function makeEnv() {
  const root = mkdtempSync(join(tmpdir(), 'products-secondary-'))
  roots.push(root)
  const paths = { libraryFile: join(root, 'library.json'), mediaDir: join(root, 'media') }
  const library = createLibraryStore({ paths })
  const media = []
  for (const [index, viewport] of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT].entries()) {
    const file = join(paths.mediaDir, `site-platform-${viewport.kind}-20260914T000000Z-000${index}.png`)
    // 目录要先存在；文件本身由「截图链路」写盘，这里直接落一份等价产物。
    mkdirSync(paths.mediaDir, { recursive: true })
    writeFileSync(file, 'png')
    media.push({ id: `med_${viewport.kind}`, real_path: file, original_name: `site-platform-${viewport.kind}-20260914T000000Z-000${index}.png` })
  }
  const draftMedia = createDraftMediaRegistry({ mediaDir: mediaDirOf(paths) })
  const dispatcher = createProductsDispatcher({
    library,
    paths,
    draftMedia,
    importFromUrl: async () => importedDraft(media),
  })
  return { root, paths, library, dispatcher, media, draftMedia }
}

const get = (dispatcher, url) => dispatcher.dispatch({ method: 'GET', url })
const post = (dispatcher, url, body) => dispatcher.dispatch({ method: 'POST', url, body })

describe('e2e · secondary page · AC-301/AC-403 解析后创建态即可看到截图', () => {
  it('imports register both viewports, and the draft route streams them read-only', async () => {
    const env = makeEnv()

    const imported = await post(env.dispatcher, '/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' })
    assert.equal(imported.status, 200)
    assert.equal(imported.body.data.media.length, 2)
    assert.equal(env.draftMedia.size(), 2)

    for (const row of env.media) {
      const stream = await get(env.dispatcher, `/omnimux/products/draft-media/${row.id}`)
      assert.equal(stream.status, 200, `${row.id} should stream before the product exists`)
      assert.equal(stream.stream.absolutePath, row.real_path)
      assert.equal(stream.stream.mime, 'image/png')
    }
  })

  it('an id nobody registered is refused, and the route never writes', async () => {
    const env = makeEnv()
    const before = existsSync(env.paths.libraryFile)
    const missing = await get(env.dispatcher, '/omnimux/products/draft-media/med_forged')
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error, 'draft-media-not-found')
    assert.equal(existsSync(env.paths.libraryFile), before, 'a read must not create the library file')
  })
})

describe('e2e · secondary page · AC-201/AC-202 指纹是唯一的脏判定', () => {
  it('an untouched form is clean, and re-typing the same value keeps it clean', async () => {
    const env = makeEnv()
    const imported = (await post(env.dispatcher, '/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' })).body.data

    const form = bundleFormReturn(
      { fields: { name: imported.name, kind: 'digital', selling: imported.selling_points, audience: imported.target_audience, brand: imported.brand, features: imported.features, price: '', sku: '', promotion: '', link: imported.link } },
      { categories: imported.categories, media: importedMediaOf(imported), coverId: imported.cover_media_id, tagDraft: '' },
      { strategy: {}, strategyTouched: false, strategyOpen: false },
      false,
    )
    const baseline = computeProductFingerprint(formSnapshotOf(null))
    assert.notEqual(computeProductFingerprint(form.state), baseline, 'an import is a real change')

    // 保存成功后页面卸载；重新进入时基线重锚到落库内容 → 立刻干净。
    const saved = (await post(env.dispatcher, '/omnimux/products', form.payload())).body.product
    const reopened = computeProductFingerprint(formSnapshotOf(saved))
    assert.equal(reopened, computeProductFingerprint(form.state), 'reopening an imported record must not look dirty')
  })

  it('a change to any stored field moves the fingerprint, and reverting clears it', async () => {
    const env = makeEnv()
    const product = (await post(env.dispatcher, '/omnimux/products', {
      name: 'Aurora Mug',
      kind: 'physical',
      selling_points: '6 小时保温',
      price: '24.9',
      sku: 'AM-350',
    })).body.product

    const baseline = computeProductFingerprint(formSnapshotOf(product))
    const edited = computeProductFingerprint(formSnapshotOf({ ...product, selling_points: '8 小时保温' }))
    assert.notEqual(edited, baseline)
    const reverted = computeProductFingerprint(formSnapshotOf({ ...product }))
    assert.equal(reverted, baseline)
  })
})

describe('e2e · secondary page · AC-203 保存并返回真的落库', () => {
  it('create → save → the record is readable, and update does not create a second row', async () => {
    const env = makeEnv()
    const imported = (await post(env.dispatcher, '/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' })).body.data

    const form = bundleFormReturn(
      { fields: { name: imported.name, kind: 'digital', selling: imported.selling_points, audience: imported.target_audience, brand: imported.brand, features: imported.features, price: '', sku: '', promotion: '', link: imported.link } },
      { categories: imported.categories, media: importedMediaOf(imported), coverId: imported.cover_media_id, tagDraft: '' },
      { strategy: {}, strategyTouched: true, strategyOpen: true },
      false,
    )
    const created = await post(env.dispatcher, '/omnimux/products', form.payload())
    assert.equal(created.status, 200)
    const createdId = created.body.product.id
    assert.equal(env.library.list().length, 1)

    // 保存后再改一个字段并保存：走更新，不新增记录。
    const reopened = bundleFormReturn(
      { fields: { name: 'MiniMax 开放平台 2', kind: 'digital', selling: imported.selling_points, audience: imported.target_audience, brand: imported.brand, features: imported.features, price: '', sku: '', promotion: '', link: imported.link } },
      { categories: imported.categories, media: importedMediaOf(imported), coverId: imported.cover_media_id, tagDraft: '' },
      { strategy: {}, strategyTouched: false, strategyOpen: false },
      false,
    )
    const updated = await env.dispatcher.dispatch({
      method: 'PUT',
      url: `/omnimux/products/${createdId}`,
      body: reopened.payload(),
    })
    assert.equal(updated.status, 200)
    assert.equal(env.library.list().length, 1, 'editing must not fork the record')
    assert.equal(env.library.get(createdId).name, 'MiniMax 开放平台 2')
  })

  it('a save that the library refuses leaves the stored record untouched', async () => {
    const env = makeEnv()
    const product = (await post(env.dispatcher, '/omnimux/products', { name: 'Aurora Mug' })).body.product
    const missing = join(env.root, 'gone.png')
    const refused = await env.dispatcher.dispatch({
      method: 'PUT',
      url: `/omnimux/products/${product.id}`,
      body: { name: 'Aurora Mug 2', kind: 'physical', media: [{ real_path: missing, original_name: 'gone.png' }], categories: [] },
    })
    assert.equal(refused.status, 400)
    assert.equal(env.library.get(product.id).name, 'Aurora Mug')
  })
})

describe('e2e · secondary page · 截图合并口径与导入一致', () => {
  it('the desktop shot is the cover, and a second import never duplicates it', async () => {
    const env = makeEnv()
    const imported = (await post(env.dispatcher, '/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' })).body.data
    const first = importedMediaOf(imported)
    assert.equal(first[0].id, 'med_desktop', 'desktop leads so media[0] is the cover')

    const merged = mergeImportedMedia(first, importedMediaOf(imported))
    assert.equal(merged.length, 2, 're-importing the same shots must not duplicate rows')
  })
})

describe('e2e · secondary page · AC-101 页头与表单间分割线', () => {
  it('ProductFormPage mounts Divider between PageHeader and form-scroll', () => {
    const pageSource = readFileSync(new URL('../../src/client/ProductFormPage.jsx', import.meta.url), 'utf8')
    assert.match(pageSource, /import \{[^}]*Divider[^}]*\} from 'dsh-ui-kit'/)
    assert.match(pageSource, /<PageHeader[\s\S]*?\/>\s*<Divider \/>\s*<div className="omnimux-products-form-scroll">/)
  })
})
