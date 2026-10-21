import { targetBuild } from './vite.shared.ts'

/**
 * 抖音 MAIN-world 采集桥：独立 content script，document_start 注入页面主世界。
 * 产物 dist/capture-main.js 由 manifest 的第二个 content_scripts 条目加载。
 */
export default targetBuild('src/content/capture/douyin-main.ts', 'iife', 'capture-main.js', false)
