/**
 * 资产中心整页滚动与视频播放图标悬停呈现 — 端到端契约（Issue #2011）
 *
 * 断言打在真实产物样式规则上：
 * 1. 滚动物理死锁消除：.omnimux-assets-body 与 .omnimux-assets-main 不得限制 flex: 1 或 overflow: hidden，
 *    确保内容真实高度能自然撑开外部的 .omx-stage-scroll；
 * 2. 媒体卡播放图标克制呈现：有封面/画面的卡片默认隐藏播放图标（opacity: 0），hover、focus 或播放激活时才浮现；
 * 3. 纯音频卡片不受影响，维持常显。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')
const stylesContent = fs.readFileSync(stylesPath, 'utf8')

test('E2E: 资产中心消除 flex 与 overflow:hidden 截断，恢复整页滚动', () => {
  // 1. .omnimux-assets-body 不得包含 flex: 1 或 overflow: hidden，否则高度被锁死在视口内
  const bodyRuleMatch = /\.omnimux-assets-body\s*\{([^}]+)\}/.exec(stylesContent)
  assert.ok(bodyRuleMatch, '必须包含 .omnimux-assets-body 规则')
  const bodyStyle = bodyRuleMatch[1]
  assert.doesNotMatch(bodyStyle, /overflow:\s*hidden/, '.omnimux-assets-body 绝不能设置 overflow: hidden')
  assert.doesNotMatch(bodyStyle, /flex:\s*1\b/, '.omnimux-assets-body 绝不能设置 flex: 1 导致无法自适应撑高')

  // 2. .omnimux-assets-main 不得限制 flex: 1
  const mainRuleMatch = /\.omnimux-assets-main\s*\{([^}]+)\}/.exec(stylesContent)
  assert.ok(mainRuleMatch, '必须包含 .omnimux-assets-main 规则')
  const mainStyle = mainRuleMatch[1]
  assert.doesNotMatch(mainStyle, /flex:\s*1\b/, '.omnimux-assets-main 绝不能设置 flex: 1')

  // 3. .omnimux-assets-cloud 不得限制 flex: 1
  const cloudRuleMatch = /\.omnimux-assets-cloud\s*\{([^}]+)\}/.exec(stylesContent)
  assert.ok(cloudRuleMatch, '必须包含 .omnimux-assets-cloud 规则')
  const cloudStyle = cloudRuleMatch[1]
  assert.doesNotMatch(cloudStyle, /flex:\s*1\b/, '.omnimux-assets-cloud 绝不能设置 flex: 1')
})

test('E2E: 媒体卡播放图标默认隐藏，悬停/聚焦/正在播放时淡入', () => {
  // 1. 媒体卡默认透明度为 0，避免遮挡立绘与封面
  const mediaPlayMatch = /\.omnimux-assets-cloud-card--media\s+\.omnimux-assets-cloud-play\s*\{([^}]+)\}/.exec(stylesContent)
  assert.ok(mediaPlayMatch, '必须包含媒体卡播放图标规则')
  assert.match(mediaPlayMatch[1], /opacity:\s*0/, '媒体卡播放图标默认必须 opacity: 0 隐藏')

  // 2. hover、focus-within、正在播放（aria-pressed="true"）时透明度为 1
  assert.match(
    stylesContent,
    /\.omnimux-assets-cloud-card--media:hover\s+\.omnimux-assets-cloud-play/,
    '必须支持 :hover 时显示播放图标'
  )
  assert.match(
    stylesContent,
    /\.omnimux-assets-cloud-card--media:focus-within\s+\.omnimux-assets-cloud-play/,
    '必须支持 :focus-within 时显示播放图标'
  )
  assert.match(
    stylesContent,
    /aria-pressed="true"[^{]*\.omnimux-assets-cloud-play/,
    '必须支持正在播放时显示播放图标'
  )
})
