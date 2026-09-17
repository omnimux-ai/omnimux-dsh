import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GUIDE_CSS } from './styles.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('UrlToVideoModal 苹果极简全画幅卡片 E2E 几何与样式规范验收', () => {
  it('验证 CSS 规范：满版无黑边、底部渐变浮层、纯白文字微阴影与毛玻璃徽标', () => {
    // 1. 卡片媒体满版绝对定位以彻底消除黑边
    assert.match(
      GUIDE_CSS,
      /\.omnimux-u2v-card-media\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/,
      '卡片媒体必须采用满版绝对定位以彻底消除黑边'
    )

    // 2. 底部信息栏为悬浮渐变浮层（无 border-top 分割线）
    assert.match(
      GUIDE_CSS,
      /\.omnimux-u2v-card-info\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*0;[\s\S]*?border-top:\s*none;/,
      '卡片底部信息栏必须为悬浮渐变层且取消顶部分割线'
    )

    // 3. 标题纯白且带有苹果质感层次文本阴影
    assert.match(
      GUIDE_CSS,
      /\.omnimux-u2v-card-title\s*\{[\s\S]*?color:\s*var\(--dsw-static-neutral-00\);[\s\S]*?text-shadow:/,
      '卡片标题必须使用纯白并配置文本立体微阴影'
    )

    // 4. 毛玻璃胶囊徽标
    assert.match(
      GUIDE_CSS,
      /\.omnimux-u2v-card-badge\s*\{[\s\S]*?backdrop-filter:\s*blur\(16px\);/,
      '示例胶囊徽标必须具备高斯模糊磨砂毛玻璃质感'
    )

    // 5. 描述行彻底被隐藏消除
    assert.match(
      GUIDE_CSS,
      /\.omnimux-u2v-card-desc\s*\{[\s\S]*?display:\s*none;/,
      '样式层必须防御性隐藏描述行'
    )
  })

  it('验证组件源码契约：彻底移除描述节点，仅保留单行标题', () => {
    const modalSrc = readFileSync(resolve(__dirname, 'UrlToVideoModal.jsx'), 'utf-8')

    // 验证包含标题
    assert.ok(
      modalSrc.includes('omnimux-u2v-card-title'),
      'UrlToVideoModal 必须渲染卡片标题'
    )

    // 验证彻底去除了描述节点
    assert.ok(
      !modalSrc.includes('omnimux-u2v-card-desc'),
      'UrlToVideoModal JSX 中必须彻底移除描述节点，仅保留单行标题'
    )
  })

  it('验证客户端打包产物：已包含苹果极简卡片与文本微阴影', () => {
    const bundlePath = resolve(__dirname, '../../../lib/client.js')
    const bundleSrc = readFileSync(bundlePath, 'utf-8')

    assert.ok(
      bundleSrc.includes('omnimux-u2v-card-media') && bundleSrc.includes('inset:0'),
      '打包产物必须包含满画幅铺满样式'
    )
    assert.ok(
      bundleSrc.includes('text-shadow') && bundleSrc.includes('omnimux-u2v-card-title'),
      '打包产物必须包含纯白标题与文本微阴影'
    )
  })
})
