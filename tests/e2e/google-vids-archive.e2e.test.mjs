/**
 * @file tests/e2e/google-vids-archive.e2e.test.mjs
 * @description Google Vids 下线 + 剪辑回退的端到端契约（Issue #3209）。
 *
 * 真机证据：`node scripts/worktree-app-qa.mjs --journey=scripts/qa/google-vids-archive.mjs`
 * 在任务工作树内起完整应用，验证剪辑窗口恢复纯剪辑（三列 + 时间线可见）、
 * 全应用不再有生成面板节点/属性/文案（截图 01-clip-without-generate.png）。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

const repoFile = (rel) => new URL(`../../${rel}`, import.meta.url)

const read = (rel) => {
  const url = repoFile(rel)
  return existsSync(url) ? readFileSync(url, 'utf8') : ''
}

const ARCHIVE = 'archive/google-vids'

test('E2E-AC5: 归档目录保留全部 Google Vids 源码与说明', () => {
  assert.equal(existsSync(repoFile(`${ARCHIVE}/README.md`)), true, '缺少归档说明')
  const readme = read(`${ARCHIVE}/README.md`)
  for (const topic of ['归档范围', '还原步骤', '相关提交', '遗留项']) {
    assert.equal(readme.includes(topic), true, `归档说明缺少：${topic}`)
  }
  const mustKeep = [
    'plugins/omnimux-video/src/client/GoogleVidsStage.jsx',
    'plugins/omnimux-video/src/http/veo-routes.js',
    'plugins/omnimux-video/src/driver/hubVidsGenerator.js',
    'plugins/omnimux-video/src/shared/veoTaskSpec.js',
    'plugins/omnimux/src/media/local-vids.js',
    'plugins/omnimux-clip/src/client/openreel/web/components/editor/EditorInterface.tsx',
    'scripts-qa-generate-in-clip-acceptance.mjs',
  ]
  for (const rel of mustKeep) {
    assert.equal(existsSync(repoFile(`${ARCHIVE}/${rel}`)), true, `归档缺少源码：${rel}`)
  }
  // 构建产物不入归档（仓库禁止提交产物）。
  assert.equal(existsSync(repoFile(`${ARCHIVE}/plugins/omnimux-video/lib/client.js`)), false, '归档不应包含构建产物')
})

test('E2E-AC2: 生成插件已无 Google Vids 客户端面与生成通道', () => {
  assert.equal(existsSync(repoFile('plugins/omnimux-video/src/client/GoogleVidsStage.jsx')), false, '生成面板仍在')
  assert.equal(existsSync(repoFile('plugins/omnimux-video/src/http/veo-routes.js')), false, '生成 HTTP 路由仍在')
  assert.equal(existsSync(repoFile('plugins/omnimux-video/scripts/build-client.mjs')), false, '客户端构建脚本仍在')
  const indexSrc = read('plugins/omnimux-video/src/index.js')
  assert.equal(/createVeoDispatcher|registerVeoRoutes|createHubVidsGenerator|generateVideoSilently/.test(indexSrc), false, '仍注册生成通道')
  assert.equal(indexSrc.includes("'veoTasks'"), false, '仍对外提供生成任务查询')
})

test('E2E-AC3: 视频拆解/处理能力仍在注册（未被误删）', () => {
  const indexSrc = read('plugins/omnimux-video/src/index.js')
  for (const tool of ['video_process', 'video_depth', 'video_analyze', 'video_reverse_prompt']) {
    assert.equal(indexSrc.includes(tool), true, `能力被误删：${tool}`)
  }
  for (const kept of ['src/understand/analyze.js', 'src/engine/ffmpeg.js', 'src/config.js']) {
    assert.equal(existsSync(repoFile(`plugins/omnimux-video/${kept}`)), true, `保留项被误删：${kept}`)
  }
})

test('E2E-AC4: 剪辑窗口已回退到集成前（无生成列）', () => {
  const editor = read('plugins/omnimux-clip/src/client/openreel/web/components/editor/EditorInterface.tsx')
  assert.equal(/--generate-w|DEFAULT_GENERATE_W|MIN_GENERATE_W/.test(editor), false, '剪辑窗口仍保留生成列')
  assert.equal(editor.includes('"generate"'), false, '仍存在生成列拖拽目标')
  assert.equal(existsSync(repoFile('scripts/qa/generate-in-clip-acceptance.mjs')), false, '集成期的验收旅程未清理')
})

test('E2E-AC7: 真机旅程覆盖剪辑纯化与无生成面', () => {
  const journey = read('scripts/qa/google-vids-archive.mjs')
  for (const probe of [
    'ac1-stage-visible',
    'ac1-media-visible',
    'ac1-timeline-visible',
    'ac2-no-gvids-dom',
    'ac2-no-vids-attrs',
    'ac3-no-google-vids-text',
    'ac3-no-generate-panel-text',
  ]) {
    assert.equal(journey.includes(probe), true, `真机旅程缺少断言：${probe}`)
  }
  assert.match(journey, /01-clip-without-generate/, '必须留存剪辑纯化截图')
})
