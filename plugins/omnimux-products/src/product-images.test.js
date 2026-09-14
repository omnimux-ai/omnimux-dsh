/**
 * 实物商品图落盘的契约（AC-205 的落盘腿）。
 *
 * 商品图是远程 URL，而产品库的 `media[]` 只认磁盘上真实存在的绝对路径，所以这
 * 一步必须真的下载并写盘。这里盯四件事：候选地址的筛选、写盘纪律（0o700 / 0o600）、
 * 单张失败只跳过这一张、整批失败回滚已写的文件。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  PRODUCT_IMAGES_MAX,
  PRODUCT_IMAGE_MAX_BYTES,
  buildProductImageName,
  persistProductImages,
  productImageUrls,
} from './product-images.js'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function workDir() {
  const root = mkdtempSync(join(tmpdir(), 'products-images-'))
  roots.push(root)
  return root
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

/**
 * 每个地址一个响应。给字符串就是纯文本（类型不认识），给 Buffer 就是图片。
 * @param {Record<string, { buffer?: Buffer, mime?: string, bytes?: string } | 'html' | 'boom'>} table
 */
function stubFetcher(table) {
  const calls = []
  return {
    calls,
    fetcher: async (url) => {
      calls.push(url)
      const row = table[url]
      if (row === undefined || row === 'boom') throw new Error('network down')
      if (row === 'html') {
        return {
          ok: true,
          headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
          arrayBuffer: async () => Buffer.from('<html></html>'),
        }
      }
      return {
        ok: true,
        headers: {
          get: (name) => {
            const key = name.toLowerCase()
            if (key === 'content-type') return row.mime ?? 'image/png'
            if (key === 'content-length') return row.bytes ?? null
            return null
          },
        },
        arrayBuffer: async () => row.buffer ?? PNG,
      }
    },
  }
}

describe('products · product image candidates', () => {
  it('keeps only http(s) urls, in order, without duplicates', () => {
    assert.deepEqual(productImageUrls([
      'https://cdn.example.com/a.jpg',
      'http://cdn.example.com/b.jpg',
      ' data:image/png;base64,AAAA',
      '/img/relative.jpg',
      'https://cdn.example.com/a.jpg',
      null,
      42,
      'https://cdn.example.com/c.jpg',
    ]), [
      'https://cdn.example.com/a.jpg',
      'http://cdn.example.com/b.jpg',
      'https://cdn.example.com/c.jpg',
    ])
  })

  it(`caps the gallery at ${PRODUCT_IMAGES_MAX} images`, () => {
    const many = Array.from({ length: 20 }, (_, i) => `https://cdn.example.com/${i}.jpg`)
    assert.equal(productImageUrls(many).length, PRODUCT_IMAGES_MAX)
    assert.equal(productImageUrls([]).length, 0)
    assert.deepEqual(productImageUrls(null), [])
  })

  it('names a file after the host, the slot and the extension', () => {
    const name = buildProductImageName('shop.example.com', 2, 'jpg', '20260914T000000Z', 'abcd1234')
    assert.equal(name, 'product-shop-example-com-02-20260914T000000Z-abcd1234.jpg')
    assert.match(buildProductImageName('shop.example.com', 1, 'webp'), /^product-shop-example-com-01-\d{8}T\d{6}Z-[0-9a-f]+\.webp$/)
  })
})

describe('products · persisting product images', () => {
  it('downloads each image into the media directory at 0o700 / 0o600', async () => {
    const root = workDir()
    const mediaDir = join(root, 'omnimux', 'products', 'media')
    const { fetcher, calls } = stubFetcher({
      'https://cdn.example.com/a.png': { buffer: PNG },
      'https://cdn.example.com/b.png': { buffer: PNG, mime: 'image/webp' },
    })

    const rows = await persistProductImages({
      images: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'],
      url: 'https://shop.example.com/p/aurora-mug',
      mediaDir,
      fetcher,
    })

    assert.deepEqual(calls, ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'])
    assert.equal(rows.length, 2)
    assert.equal(statSync(mediaDir).mode & 0o777, 0o700)
    for (const [index, row] of rows.entries()) {
      assert.match(row.id, /^med_[0-9a-f]{8}$/)
      assert.equal(row.real_path.startsWith(join(mediaDir, 'product-shop-example-com-')), true)
      assert.equal(statSync(row.real_path).mode & 0o777, 0o600)
      assert.equal(readFileSync(row.real_path).length, PNG.length)
      assert.equal(row.original_name.endsWith(index === 0 ? '.png' : '.webp'), true)
    }
  })

  it('skips a page that answers HTML, a dead url and an oversized image without failing the batch', async () => {
    const root = workDir()
    const mediaDir = join(root, 'media')
    const { fetcher } = stubFetcher({
      'https://cdn.example.com/page': 'html',
      'https://cdn.example.com/dead.png': 'boom',
      'https://cdn.example.com/huge.png': { bytes: String(PRODUCT_IMAGE_MAX_BYTES + 1) },
      'https://cdn.example.com/good.jpg': { buffer: PNG },
    })

    const rows = await persistProductImages({
      images: [
        'https://cdn.example.com/page',
        'https://cdn.example.com/dead.png',
        'https://cdn.example.com/huge.png',
        'https://cdn.example.com/good.jpg',
      ],
      url: 'https://shop.example.com/p/aurora-mug',
      mediaDir,
      fetcher,
    })

    assert.equal(rows.length, 1, 'the one real image still lands')
    assert.equal(rows[0].original_name.includes('-04-'), true, 'the slot keeps the page order')
  })

  it('rolls back what it already wrote when a later write fails', async () => {
    const root = workDir()
    const mediaDir = join(root, 'media')
    const { fetcher } = stubFetcher({
      'https://cdn.example.com/a.png': { buffer: PNG },
      'https://cdn.example.com/b.png': { buffer: PNG },
    })
    let calls = 0
    const rows = await persistProductImages({
      images: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'],
      url: 'https://shop.example.com/p/aurora-mug',
      mediaDir,
      fetcher,
      deps: {
        write: async (file, buffer) => {
          calls += 1
          if (calls === 2) throw new Error('disk full')
          const { writeFileSync } = await import('node:fs')
          writeFileSync(file, buffer)
        },
      },
    })

    assert.deepEqual(rows, [], 'a half-written gallery is worse than none')
    assert.deepEqual(readdirSync(mediaDir), [], 'nothing survives the rollback')
  })

  it('answers an empty gallery instead of throwing when there is nowhere to write', async () => {
    const { fetcher, calls } = stubFetcher({ 'https://cdn.example.com/a.png': { buffer: PNG } })
    assert.deepEqual(await persistProductImages({ images: ['https://cdn.example.com/a.png'], fetcher }), [])
    assert.deepEqual(await persistProductImages({ images: [], mediaDir: '/tmp/nope', fetcher }), [])
    assert.deepEqual(await persistProductImages({ images: ['https://cdn.example.com/a.png'], mediaDir: '/tmp/nope' }), [])
    assert.equal(calls.length, 0, 'no media directory means no download at all')
  })
})
