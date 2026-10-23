#!/usr/bin/env node
/**
 * scripts/attest-test-review.mjs
 *
 * 独立评审会话用它登记一次「旧测试标准变更」的存证，然后才能落笔改写既有断言。
 *
 * 身份只取 process.env.DSH_SESSION_ID —— 不接受 --session 覆盖，
 * 因此主会话无法伪造成另一个会话的存证。
 *
 * 用法：
 *   node scripts/attest-test-review.mjs \
 *     --file plugins/<plugin>/src/.../x.test.js \
 *     --after /tmp/我的候选内容.js \
 *     --spec specs/<本任务规格>.md \
 *     [--evidence docs/evidence/<实测证据>.md]
 *
 * 之后用 edit/write 把候选内容写进 --file，hook 会校验存证后放行该次期待值变更。
 */

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'

import {
  writeAttestation,
  verifyAttestation,
  treeRootOf,
  sessionAuthoredBusinessSource,
  digestText,
} from './test-review-provenance.mjs'

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    after: { type: 'string' },
    spec: { type: 'string' },
    evidence: { type: 'string' },
    session: { type: 'string' },
  },
})

function fail(message) {
  console.error(`attest-test-review: ${message}`)
  process.exit(2)
}

if (values.session) fail('不接受 --session：身份只来自 DSH_SESSION_ID，禁止自报身份')
if (!values.file) fail('缺少 --file <仓库相对路径的测试文件>')
if (!values.after) fail('缺少 --after <包含拟写入完整内容的文件路径>')
if (!values.spec) fail('缺少 --spec <仓库相对路径的规格文件>')

const sessionId = process.env.DSH_SESSION_ID
if (!sessionId) fail('环境里没有 DSH_SESSION_ID，无法证明评审身份')

const root = treeRootOf(resolve(process.cwd(), values.file))
if (!root) fail(`找不到 ${values.file} 所在的 git 工作树根`)

const fileAbs = resolve(root, values.file)
let beforeText
try {
  beforeText = readFileSync(fileAbs, 'utf8')
} catch (error) {
  fail(`读取目标测试文件失败：${error.code || error.message}`)
}

let afterText
try {
  afterText = readFileSync(resolve(process.cwd(), values.after), 'utf8')
} catch (error) {
  fail(`读取 --after 候选内容失败：${error.code || error.message}`)
}

if (beforeText === afterText) fail('候选内容与现状完全一致，没有可评审的标准变更')

let specText = null
try {
  specText = readFileSync(resolve(root, values.spec), 'utf8')
} catch (error) {
  fail(`读取 --spec 规格失败：${error.code || error.message}`)
}

let evidenceText = null
if (values.evidence) {
  try {
    evidenceText = readFileSync(resolve(root, values.evidence), 'utf8')
  } catch (error) {
    fail(`读取 --evidence 证据失败：${error.code || error.message}`)
  }
}

if (sessionAuthoredBusinessSource(root, sessionId)) {
  fail('本会话已写过业务源码，属于行为作者，不能自审（换一个未改过业务源码的会话）')
}

const result = writeAttestation({
  root,
  reviewerSessionId: sessionId,
  relFile: values.file,
  beforeText,
  afterText,
  specPath: values.spec,
  specText,
  evidencePath: values.evidence || null,
  evidenceText,
})

const check = verifyAttestation({
  root,
  relFile: values.file,
  beforeText,
  afterText,
  sessionId,
})

console.log(JSON.stringify({
  root,
  reviewerSessionId: sessionId,
  file: values.file,
  beforeDigest: digestText(beforeText).slice(0, 16),
  afterDigest: digestText(afterText).slice(0, 16),
  spec: values.spec,
  evidence: values.evidence || null,
  attestationId: result.record.id,
  usableNow: check.ok,
  usableReason: check.ok ? null : check.reason,
}, null, 2))
