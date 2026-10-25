/**
 * Issue #3715 端到端验收：rc.3 依赖树下 viewer 工具卡片的真实浏览器渲染。
 *
 * 为什么需要它：这次迁移改的是界面源码（`src/client/**`），而卡片本身没有任何
 * 页面入口——它经 `ctx.slots.register('tool.call.toolview', …)` 注册。浏览器证据
 * 由 `node scripts/worktree-web-qa.mjs viewer-card` 生成：把插件客户端半边连同
 * React 一起编译，在真实 Chrome 内核里 `apply()`、注册、渲染，再读 DOM 断言，
 * 截图与报告落在 `docs/evidence/viewer-card-qa-report.json` / `viewer-card-qa.png`。
 *
 * 本文件只裁决那份证据（与 `flow-alignment.e2e.test.js` 同一约定），不自己起浏览器。
 *
 * 断言的是迁移过的那条路径：rc.3 把运行中的调用按 `phase` 分成 preparing /
 * start，只有 `start` 带原始参数。若迁移写错，卡片头部的路径会消失。
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..')
const REPORT_PATH = join(REPO_ROOT, 'docs', 'evidence', 'viewer-card-qa-report.json')
const SCREENSHOT_PATH = join(REPO_ROOT, 'docs', 'evidence', 'viewer-card-qa.png')

/** 与 `scripts/viewer-card-qa-entry.mjs` 的验收块保持一致。 */
const EXPECTED_PATH = '/tmp/qa-viewer-card.mp4'
const EXPECTED_KEYS = ['display_file', 'read_image']

test('rc.3 树下 viewer 工具卡片在真实浏览器里渲染运行中调用的路径', () => {
  assert.equal(
    existsSync(REPORT_PATH),
    true,
    `必须存在本轮浏览器证据 report.json（先跑 node scripts/worktree-web-qa.mjs viewer-card）: ${REPORT_PATH}`,
  )
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'))
  const byName = new Map(report.assertions.map((entry) => [entry.name, entry]))

  assert.equal(report.scenario, 'viewer-card')
  assert.equal(report.plugin, 'omnimux-viewer')
  assert.equal(report.errors.length, 0, `验收报告有错误: ${report.errors.join('; ')}`)
  assert.equal(report.pass, true, 'viewer 卡片验收未通过')

  assert.equal(byName.get('bundle-viewer-card-page')?.pass, true, '客户端半边未编译出产物')
  assert.equal(byName.get('viewer-client-apply')?.pass, true, '客户端半边 apply 失败')

  assert.deepEqual(
    byName.get('toolview-registrations')?.keys,
    EXPECTED_KEYS,
    '工具卡片注册键不符',
  )

  const pathAssertion = byName.get('running-call-shows-path')
  assert.equal(pathAssertion?.pass, true, `运行中的调用未渲染出路径 ${EXPECTED_PATH}`)
  assert.ok(
    String(pathAssertion?.text).includes(EXPECTED_PATH),
    `卡片文本缺少路径: ${pathAssertion?.text}`,
  )

  const shot = byName.get('screenshot-png-verified')
  assert.equal(shot?.pass, true, '未留存截图证据')
  assert.ok(shot?.dimensions?.width > 0 && shot?.dimensions?.height > 0, '截图尺寸为空')
  assert.ok(existsSync(SCREENSHOT_PATH), `截图未生成: ${SCREENSHOT_PATH}`)
})
