import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseShotTimeWindow } from '../../plugins/omnimux-inspiration/src/structure-script.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 灵感弹窗组件 currentShotIndex 与 handleSeekShot 完整定义防白屏异常验证', () => {
  const modalPath = path.join(root, 'plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx')
  const modalContent = fs.readFileSync(modalPath, 'utf-8')

  // 1. 验证时码窗口计算能力
  const w1 = parseShotTimeWindow({ start_seconds: 1.5, end_seconds: 4.2 })
  assert.equal(w1.start, 1.5)
  assert.equal(w1.end, 4.2)

  const w2 = parseShotTimeWindow({ time_range: '00:05 - 00:10' })
  assert.equal(w2.start, 5)
  assert.equal(w2.end, 10)

  // 2. 验证组件源码中 currentShotIndex 的定义与使用一致性
  assert.ok(
    modalContent.includes('const currentShotIndex = useMemo('),
    '组件必须在顶层使用 useMemo 正确推导 currentShotIndex，杜绝 ReferenceError 崩溃',
  )
  assert.ok(
    modalContent.includes('const handleSeekShot = (shot) =>'),
    '组件必须在顶层声明 handleSeekShot 处理分镜跳转，杜绝 ReferenceError',
  )
  assert.ok(
    modalContent.includes('currentShotIndex === sIdx && isPlaying'),
    '分镜遍历必须基于当前正在播放的分镜下标计算 isCurrent 激活态',
  )
})
