import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProductPreview } from './product-attachment-sync.js'
import { adaptCardToAttachmentPayload } from '../../../../../omnimux-assets/src/asset-hub/asset-hub-data.js'

test('resolveProductPreview: 各种商品封面形态与严格字符串类型保证 (SSOT)', () => {
  // 1. 空输入兜底
  assert.equal(resolveProductPreview(null), '')
  assert.equal(resolveProductPreview(undefined), '')
  assert.equal(resolveProductPreview({}), '')

  // 2. 输入合法 URL 字符串
  assert.equal(resolveProductPreview('https://cdn.example.com/item.png'), 'https://cdn.example.com/item.png')

  // 3. 拦截 [object Object] 脏字符串
  assert.equal(resolveProductPreview('[object Object]'), '')
  assert.equal(resolveProductPreview('https://example.com/[object Object]'), '')

  // 4. 标准商品库格式：cover 为对象且包含 id，自身有 id
  const prodWithCoverObj = {
    id: 'prd_57e8e74b',
    name: '中老年纯棉前扣无钢圈薄款文胸 (大码36-50)',
    cover_media_id: 'med_f6d11874',
    cover: {
      id: 'med_f6d11874',
      original_name: 'prod-1.webp',
      size: 67484,
    },
  }
  assert.equal(
    resolveProductPreview(prodWithCoverObj),
    '/omnimux/products/prd_57e8e74b?preview=med_f6d11874',
    'cover 为对象时必须通过 cover.id 和 id 解析为正确的预览路由'
  )

  // 5. 仅有 cover_media_id，无 cover 对象
  const prodWithMediaIdOnly = {
    id: 'prd_100',
    cover_media_id: 'med_999',
  }
  assert.equal(
    resolveProductPreview(prodWithMediaIdOnly),
    '/omnimux/products/prd_100?preview=med_999'
  )

  // 6. 本地物理路径 real_path
  const prodWithLocalPath = {
    id: 'prd_local',
    cover: {
      real_path: '/Users/test/.dsh/omnimux/products/media/pic.jpg',
    },
  }
  assert.equal(
    resolveProductPreview(prodWithLocalPath),
    'file:///Users/test/.dsh/omnimux/products/media/pic.jpg'
  )

  // 7. 带有 images 数组（第一项为带有 id 的媒体对象）
  const prodWithImagesArr = {
    id: 'prd_arr',
    images: [{ id: 'med_first' }, { id: 'med_second' }],
  }
  assert.equal(
    resolveProductPreview(prodWithImagesArr),
    '/omnimux/products/prd_arr?preview=med_first'
  )

  // 8. 归一化卡片对象（嵌套 raw 且含有 cover 对象）
  const cardItem = {
    id: 'prd_57e8e74b',
    lane: 'products',
    title: '中老年纯棉前扣无钢圈薄款文胸',
    raw: prodWithCoverObj,
  }
  assert.equal(
    resolveProductPreview(cardItem),
    '/omnimux/products/prd_57e8e74b?preview=med_f6d11874',
    '归一化卡片传入时必须能穿透 raw 提取正确预览图'
  )
})

test('adaptCardToAttachmentPayload: 商品库卡片转换与类型安全门禁', () => {
  const prodCard = {
    id: 'prd_57e8e74b',
    lane: 'products',
    title: '中老年纯棉前扣无钢圈薄款文胸 (大码36-50)',
    raw: {
      id: 'prd_57e8e74b',
      price: 'S$6.40',
      cover_media_id: 'med_f6d11874',
      cover: { id: 'med_f6d11874' },
      selling_points: '前开扣便捷穿脱；纯棉亲肤',
    },
  }

  const payload = adaptCardToAttachmentPayload(prodCard)
  assert.ok(payload, '必须生成合法的 AttachmentPayload')
  assert.equal(payload.kind, 'product')
  assert.equal(payload.extension, 'PRD')
  assert.equal(payload.entityId, 'prd_57e8e74b')
  assert.equal(payload.previewUrl, '/omnimux/products/prd_57e8e74b?preview=med_f6d11874')
  assert.equal(typeof payload.previewUrl, 'string')
  assert.ok(!payload.previewUrl.includes('[object Object]'), 'previewUrl 绝不能包含 [object Object]')
  assert.equal(payload.relativePath, 'materials/products/prd_57e8e74b.prd')
  assert.ok(payload.metadata?.agentContext?.summary?.includes('中老年纯棉前扣无钢圈薄款文胸'))
})
