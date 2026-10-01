import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickAspectBucket,
  resolveDeclaredRatio,
  ASPECT_PORTRAIT,
  ASPECT_SQUARE,
  ASPECT_LANDSCAPE,
} from '../src/client/viewer/breakdownDataUtils.js'

test('pickAspectBucket 按宽高比分档', async (t) => {
  await t.test('竖屏与非法输入归入竖屏', () => {
    assert.equal(pickAspectBucket(9 / 16), ASPECT_PORTRAIT)
    assert.equal(pickAspectBucket(0.79), ASPECT_PORTRAIT)
    assert.equal(pickAspectBucket(null), ASPECT_PORTRAIT)
    assert.equal(pickAspectBucket(undefined), ASPECT_PORTRAIT)
    assert.equal(pickAspectBucket(0), ASPECT_PORTRAIT)
    assert.equal(pickAspectBucket(NaN), ASPECT_PORTRAIT)
  })

  await t.test('方形区间归入 1:1', () => {
    assert.equal(pickAspectBucket(1), ASPECT_SQUARE)
    assert.equal(pickAspectBucket(0.8), ASPECT_SQUARE)
    assert.equal(pickAspectBucket(1.25), ASPECT_SQUARE)
    assert.equal(pickAspectBucket(4 / 5), ASPECT_SQUARE)
  })

  await t.test('横屏归入 16:9', () => {
    assert.equal(pickAspectBucket(16 / 9), ASPECT_LANDSCAPE)
    assert.equal(pickAspectBucket(1.26), ASPECT_LANDSCAPE)
    assert.equal(pickAspectBucket(2.35), ASPECT_LANDSCAPE)
  })
})

test('resolveDeclaredRatio 读取落库宽高', async (t) => {
  await t.test('有效宽高返回比值', () => {
    assert.equal(resolveDeclaredRatio({ width: 1920, height: 1080 }), 1920 / 1080)
    assert.equal(resolveDeclaredRatio({ width: 720, height: 1280 }), 720 / 1280)
  })

  await t.test('缺失或非法字段返回 null', () => {
    assert.equal(resolveDeclaredRatio({}), null)
    assert.equal(resolveDeclaredRatio(null), null)
    assert.equal(resolveDeclaredRatio({ width: 0, height: 1080 }), null)
    assert.equal(resolveDeclaredRatio({ width: '1920', height: '1080' }), null)
    assert.equal(resolveDeclaredRatio({ width: 1920 }), null)
  })
})
