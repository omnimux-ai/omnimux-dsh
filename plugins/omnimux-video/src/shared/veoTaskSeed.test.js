import test from 'node:test'
import assert from 'node:assert/strict'
import {
  seedVeoTask,
  veoTaskTitle,
  VEO_DEFAULT_DURATION_SEC,
  VEO_DEFAULT_RESOLUTION,
  VEO_UNTITLED,
} from './veoTaskSeed.js'

test('veoTaskTitle trims and truncates to 16 chars with untitled fallback', () => {
  assert.equal(veoTaskTitle('  hello world  '), 'hello world')
  assert.equal(veoTaskTitle('一二三四五六七八九十一二三四五六七八'), '一二三四五六七八九十一二三四五六')
  assert.equal(veoTaskTitle('   '), VEO_UNTITLED)
  assert.equal(veoTaskTitle(''), VEO_UNTITLED)
})

test('seedVeoTask owns title / duration / resolution defaults', () => {
  const seeded = seedVeoTask({
    id: 'task_veo_1',
    prompt: '  a cat running on grass  ',
    mode: 'create',
    status: 'queued',
    message: '任务已入队，准备启动无头沙箱…',
  })
  assert.equal(seeded.prompt, 'a cat running on grass')
  assert.equal(seeded.title, 'a cat running on')
  assert.equal(seeded.durationSec, VEO_DEFAULT_DURATION_SEC)
  assert.equal(seeded.resolution, VEO_DEFAULT_RESOLUTION)
  assert.equal(seeded.progress, 1)
  assert.equal(seeded.message, '任务已入队，准备启动无头沙箱…')
})

test('seedVeoTask passes through positive durationSec', () => {
  const seeded = seedVeoTask({
    id: 'task_veo_2',
    prompt: 'x',
    durationSec: 8,
  })
  assert.equal(seeded.durationSec, 8)
  assert.equal(seeded.title, 'x')
})
