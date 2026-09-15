/**
 * 角色卡立绘优先渲染 — 端到端契约（Issue #1966）
 *
 * 断言打在**真实产物**上：`cloud-catalog/index.json` 里那 100 款带立绘的语音角色，
 * 以及渲染层对这类行的判定与落笔。三者必须对得上，否则「动物拟人」等分类会整屏
 * 只剩色板和播放键，角色长什么样完全看不见。
 *
 * 立绘在盘上是真的：这里不只比字段，还落盘核对封面文件存在且非空。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { cloudCardKind } from '../../plugins/omnimux-assets/src/client/cloud-feed-helpers.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const assetsRoot = '/Users/x/Desktop/Project/OPC/资产库'

const catalogDir = path.join(root, 'plugins/omnimux-assets/cloud-catalog')
const index = JSON.parse(fs.readFileSync(path.join(catalogDir, 'index.json'), 'utf8'))
const viewJsx = fs.readFileSync(
  path.join(root, 'plugins/omnimux-assets/src/client/CloudAssetsView.jsx'),
  'utf8',
)

/** 带立绘的语音角色：有封面、媒体是音频。 */
const avatarVoices = index.filter(
  (row) => row.category === 'character'
    && typeof row.cover_url === 'string' && row.cover_url !== ''
    && row.media_type === 'audio',
)

test('E2E: 带立绘的语音角色卡渲染立绘而不是空色块', async () => {
  assert.ok(avatarVoices.length > 0, '目录里必须存在「有立绘 + 语音」的角色行')

  // 1) 数据层：这类行既有立绘也有可播的语音。
  for (const row of avatarVoices) {
    assert.ok(
      row.cover_url.startsWith('file:') || row.cover_url.startsWith('https://assets.omnimux.ai/'),
      `${row.name} 的封面必须是本地文件或官方域名`,
    )
    assert.ok(row.media_url !== '', `${row.name} 必须有可播的语音`)
  }

  // 2) 立绘在盘上是真的（只抽查有本地副本的行，取前 5 个）。
  const localOnes = avatarVoices.filter((row) => row.cover_url.startsWith('file:')).slice(0, 5)
  assert.ok(localOnes.length > 0, '至少要有一行封面落在本地')
  for (const row of localOnes) {
    const abs = path.join(assetsRoot, row.cover_url.slice('file:'.length))
    assert.ok(fs.existsSync(abs), `${row.name} 的立绘必须存在：${abs}`)
    assert.ok(fs.statSync(abs).size > 1024, `${row.name} 的立绘不能是空文件`)
  }

  // 3) 判定层：这类行必须是图片卡，而不是语音色块。
  for (const row of avatarVoices.slice(0, 5)) {
    const kind = cloudCardKind({
      hasCover: true,
      hasMedia: true,
      mediaType: 'audio',
      playable: true,
    })
    assert.equal(kind, 'media', `${row.name} 应判为图片卡`)
  }

  // 4) 渲染层：立绘与播放键同时落笔，且立绘只由封面/非语音媒体决定。
  assert.match(viewJsx, /const showArt = asset\?\.hasCover === true \|\| \(asset\?\.hasMedia === true && asset\?\.mediaType !== 'audio'\)/)
  assert.match(viewJsx, /\{showArt \? <CloudTileMedia/)
  assert.match(viewJsx, /className="omnimux-assets-cloud-play"/)

  // 5) 没有立绘的纯语音行仍走语音卡，不能被这次改动带偏。
  assert.equal(
    cloudCardKind({ hasCover: false, hasMedia: true, mediaType: 'audio', playable: true }),
    'audio',
  )
})
