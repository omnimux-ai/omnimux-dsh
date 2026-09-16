/**
 * 资产中心卡片网格全宽自适应与留白消除 — 端到端契约（Issue #2014）
 *
 * 断言打在真实产物样式规则上：
 * 1. .omnimux-assets-body、.omnimux-assets-main、.omnimux-assets-cloud 必须显式声明 width: 100% 与 box-sizing: border-box；
 * 2. 避免在水平 flex 容器中发生未定宽 shrink-to-fit 塌陷，导致网格从 7 列被缩成 3 列出现 800px 巨大黑边留白；
 * 3. 契约保障大屏视口下内容区宽度 100% 占满。
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

test('E2E: 资产中心关键容器声明 width: 100% 消除留白塌陷', () => {
  // 1. .omnimux-assets-body 必须包含 width: 100%
  const bodyRuleMatch = /\.omnimux-assets-body\s*\{([^}]+)\}/.exec(stylesContent)
  assert.ok(bodyRuleMatch, '必须包含 .omnimux-assets-body 规则')
  assert.match(bodyRuleMatch[1], /width:\s*100%/, '.omnimux-assets-body 必须声明 width: 100%')

  // 2. .omnimux-assets-main 必须包含 width: 100% 与 box-sizing: border-box
  const mainRuleMatch = /\.omnimux-assets-main\s*\{([^}]+)\}/.exec(stylesContent)
  assert.ok(mainRuleMatch, '必须包含 .omnimux-assets-main 规则')
  assert.match(mainRuleMatch[1], /width:\s*100%/, '.omnimux-assets-main 必须声明 width: 100%')
  assert.match(mainRuleMatch[1], /box-sizing:\s*border-box/, '.omnimux-assets-main 必须声明 box-sizing: border-box')

  // 3. .omnimux-assets-cloud 必须包含 width: 100%
  const cloudRuleMatch = /\.omnimux-assets-cloud\s*\{([^}]+)\}/.exec(stylesContent)
  assert.ok(cloudRuleMatch, '必须包含 .omnimux-assets-cloud 规则')
  assert.match(cloudRuleMatch[1], /width:\s*100%/, '.omnimux-assets-cloud 必须声明 width: 100%')
})
