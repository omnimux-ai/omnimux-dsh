import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// 生成能力并入剪辑窗口（Issue #3196）后的座位契约：视频插件不再声明 slots、
// 不再注册产品舞台，而是通过具名宿主容器把生成面板挂进剪辑窗口左列。
// 真机证据见任务工作树 `.workbuddy/evidence/app-qa/<run>/`（四区几何与面板同框）。

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(resolve(__dirname, name), 'utf8')

test('video client no longer declares slots and keeps locale + layout', () => {
  const code = read('index.js')
  assert.match(code, /export\s+const\s+inject\s*=\s*\[[^\]]*'locale'[^\]]*\]/, 'inject must include locale')
  assert.match(code, /export\s+const\s+inject\s*=\s*\[[^\]]*'layout'[^\]]*\]/, 'inject must include layout')
  assert.doesNotMatch(
    code,
    /export\s+const\s+inject\s*=\s*\[[^\]]*'slots'[^\]]*\]/,
    'the generation panel is mounted into a named host container, not a host slot',
  )
})

test('video client mounts the generation panel into the editor host container', () => {
  const index = read('index.js')
  assert.doesNotMatch(index, /slots\.inject\('main'/, 'no product-stage slot registration')
  assert.match(index, /mountGeneratePanel/, 'index must wire the host-container mount')

  const hostMount = read('host-mount.js')
  assert.match(hostMount, /clip\.editor\.generate/, 'the host container name is part of the contract')
  assert.match(hostMount, /MutationObserver/, 'the mount follows the container lifecycle')
})
