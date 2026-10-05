// 虚拟形象舞台（Issue #3176）端到端契约回归。
//
// 为什么要有这一支：真机验收能发现「元素在、图没加载出来」这类缺陷，但真机运行昂贵、不进 CI。
// 这里把已经用真机证实过的两条契约钉成可重复执行的回归：
// 1. 预设美术必须走插件自己的取图地址——直接拿数据里的原始路径当 <img src> 会在真机上全部裂图
//    （原始路径是源工程的 /influencer-presets/<hash>.webp，本应用的源下不存在该地址）。
// 2. 舞台的滚动与吸附契约、左栏入口标记、无原生下拉，必须保持不变。
//
// 真机实机证据与逐条旅程断言见 docs/evidence/avatar-3176/（由 scripts/qa/avatar-stage-acceptance.mjs 产出）。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(here, '../../plugins/omnimux-avatar')
const clientRoot = path.join(pluginRoot, 'src/client')

const read = (rel) => fs.readFileSync(path.join(pluginRoot, rel), 'utf8')

test('E2E: 预设美术一律经插件取图地址，不得把数据里的原始路径直接当图片地址', () => {
  const grid = fs.readFileSync(path.join(clientRoot, 'components/ExplorePresetGrid.jsx'), 'utf8')
  const dialog = fs.readFileSync(path.join(clientRoot, 'components/PresetPreviewDialog.jsx'), 'utf8')

  assert.match(grid, /src=\{presetAssetUrl\(preset\.preview\.path\)\}/, '网格卡片必须用 presetAssetUrl 包裹预览图路径')
  assert.match(dialog, /src=\{presetAssetUrl\(preset\.sheet\.path\)\}/, '预览弹窗必须用 presetAssetUrl 包裹设定图路径')

  // 反向断言：裸路径一旦回归，真机上就是整屏裂图，而只数 <img> 个数的断言察觉不到。
  assert.doesNotMatch(grid, /src=\{preset\.preview\.path\}/, '网格不得直接使用原始路径')
  assert.doesNotMatch(dialog, /src=\{preset\.sheet\.path\}/, '弹窗不得直接使用原始路径')

  // 取图地址必须真的把 path 交给宿主路由，而不是拼一个浏览器取不到的源。
  const api = fs.readFileSync(path.join(clientRoot, 'api.js'), 'utf8')
  assert.match(api, /presetAsset: '\/api\/omnimux\/avatar\/presets\/asset'/, '取图路由前缀必须与宿主注册的路由一致')
  assert.match(read('src/http.js'), /route === '\/presets\/asset'/, '宿主必须注册 /presets/asset 路由')
})

test('E2E: 舞台滚动与吸附契约保持单一滚动容器', () => {
  const stage = fs.readFileSync(path.join(clientRoot, 'AvatarStage.jsx'), 'utf8')
  assert.match(stage, /omx-avatar-page/, '舞台根节点类名必须保留')
  assert.match(stage, /omx-stage-scroll/, '舞台根节点必须挂滚动契约声明')
  assert.match(stage, /omx-stage-sticky/, '吸附头必须挂吸附契约声明')

  const styles = fs.readFileSync(path.join(clientRoot, 'styles.js'), 'utf8')
  assert.match(styles, /CANONICAL_STICKY_DECL/, '吸附声明必须来自契约常量而不是就地手写')
  assert.match(styles, /CANONICAL_SCROLL_DECL/, '滚动声明必须来自契约常量而不是就地手写')
})

test('E2E: 左栏入口与舞台页签按契约注册，且舞台内没有原生下拉', () => {
  const index = fs.readFileSync(path.join(clientRoot, 'index.js'), 'utf8')
  assert.match(index, /omnimux-avatar:studio/, '舞台页签 id 必须保持')
  assert.match(index, /data-omnimux-avatar-entry/, '左栏入口标记必须保持')
  assert.match(index, /ctx\.locale\.register\(NS, \{ zh, en \}\)/, '词典必须注册，否则页面会渲染成键名')

  const components = fs.readdirSync(path.join(clientRoot, 'components'))
  for (const file of components.filter((f) => f.endsWith('.jsx'))) {
    const source = fs.readFileSync(path.join(clientRoot, 'components', file), 'utf8')
    assert.doesNotMatch(source, /<select[\s>]/, `${file} 不得使用原生下拉（本仓 UI 契约）`)
  }
  assert.doesNotMatch(read('src/client/AvatarStage.jsx'), /<select[\s>]/, 'AvatarStage 不得使用原生下拉（本仓 UI 契约）')
})
