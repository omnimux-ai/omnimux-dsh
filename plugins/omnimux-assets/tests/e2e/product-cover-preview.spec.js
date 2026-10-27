import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// 产品卡片已收敛为产品插件单真源；资产库不再自绘一份。
const productsRoot = join(here, '../../../omnimux-products/src/client')
const productGridJsx = readFileSync(join(productsRoot, 'ProductGrid.jsx'), 'utf8')
const apiJs = readFileSync(join(productsRoot, 'api.js'), 'utf8')

test('资产中心产品库商品微卡封面图预览路径规范与图片渲染契约 (Issue #2338)', () => {
  // 1. 验证 previewUrl 实现符合标准查询参数格式，杜绝错误拼装为 /media/{id}
  assert.match(
    apiJs,
    /new URLSearchParams\(\{ preview: mediaId \}\)[\s\S]*?return `\/omnimux\/products\/\$\{encodeURIComponent\(productId\)\}\?\$\{query\}`/,
    'previewUrl 必须使用标准 ?preview= 查询参数对齐商品服务后端契约'
  )

  // 2. 验证严禁出现旧式导致 404 的 /products/{id}/media/{id} 路径
  assert.doesNotMatch(
    apiJs,
    /\/omnimux\/products\/\$\{encodeURIComponent\(productId\)\}\/media\/\$\{encodeURIComponent\(mediaId\)\}/,
    '严禁使用未注册的 /media/{mediaId} 子路径'
  )

  // 3. 验证存在卡片图片元素并带有 omnimux-products-card-media 类名及 onError 容错
  assert.match(
    productGridJsx,
    /<img\s+src=\{preview\}\s+alt=""\s+className="omnimux-products-card-media"/,
    '必须渲染带有 omnimux-products-card-media 的商品封面图片'
  )

  // 4. 验证依用户指示彻底移除右上角类型徽章与右下角价格标签 (Issue #2347)
  assert.doesNotMatch(
    productGridJsx,
    /omnimux-products-badge/,
    '必须移除缩略图右上角类型徽章以保持纯粹视觉'
  )
  assert.doesNotMatch(
    productGridJsx,
    /omnimux-products-card-price/,
    '必须移除副标题右下角的价格标签'
  )
})
