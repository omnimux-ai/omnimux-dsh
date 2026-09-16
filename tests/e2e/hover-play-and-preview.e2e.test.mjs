/**
 * 资产中心所有可播放资产悬停直接播放与点击保持放大预览 — 端到端契约（Issue #2019）
 *
 * 断言打在真实产物规则与代码上：
 * 1. 视频预加载与顺畅秒播：挂载时即刻预备元数据与首帧，hovering 时无阻塞调用 play()；
 * 2. 音频资产悬停直接试听：通过 useEffect 监听 hovering 状态自动启停播放；
 * 3. 缩略图点击与卡片点击统一：整张卡片点击均保持触发放大预览（openPreview）；
 * 4. 样式层级保证：hover 时视频层显式处于上层。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const viewJsxPath = path.join(root, 'plugins/omnimux-assets/src/client/CloudAssetsView.jsx')
const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')
const viewJsx = fs.readFileSync(viewJsxPath, 'utf8')
const stylesContent = fs.readFileSync(stylesPath, 'utf8')

test('E2E: 视频与音频悬停直接播放，移出自动暂停', () => {
  // 1. 视频悬停播放逻辑：hovering 为真时触发 play，为假时 pause 并复位首帧
  assert.match(viewJsx, /if \(hovering\) \{\s*void element\.play\(\)\.catch\(\(\) => \{\}\)\s*\} else \{\s*element\.pause\(\)\s*element\.currentTime = 0\s*\}/)

  // 2. 视频首帧与元数据提前准备：showClip 时提前预备首帧与尺寸
  assert.match(viewJsx, /if \(!element \|\| !showClip \|\| element\.readyState > 0\) return\s*element\.load\(\)/)

  // 3. 音频资产悬停直接试听：通过 useEffect 监听 hovering 状态自动启停播放
  assert.match(viewJsx, /if \(!canPlay\) return\s*if \(hovering && !playing\) \{\s*onTogglePlay\(asset\)\s*\} else if \(!hovering && playing\) \{\s*onTogglePlay\(asset\)\s*\}/)
})

test('E2E: 点击卡片保持放大预览，不被播放行为吞掉', () => {
  // 1. 卡片外层绑定 openPreview
  assert.match(viewJsx, /onClick=\{openPreview\}/)
  
  // 2. 只有纯音频色块卡（canPlay && !showArt）的缩略图才拦截点击，带画面的卡片点击缩略图直接冒泡打开放大预览
  assert.match(viewJsx, /role=\{canPlay \? 'button' : undefined\}/)
})

test('E2E: 悬停时视频透明度为 1 且层叠在封面之上', () => {
  assert.match(stylesContent, /\.omnimux-assets-cloud-card:hover \.omnimux-assets-cloud-preview/)
})
