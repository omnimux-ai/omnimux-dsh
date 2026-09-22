/**
 * E2E：技能页「去对话中试试」挂当前会话临时加载（Issue 2166）。
 * 不启动浏览器：用真实源码覆盖可见合同（当前会话、不安装、系统提示、引导路径保留）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const sessionCreateSrc = readFileSync(join(root, 'src/client/session-create.js'), 'utf8')
const plazaUtilsSrc = readFileSync(join(root, 'src/client/plaza/plazaUtils.js'), 'utf8')
const featuredSrc = readFileSync(join(root, 'src/client/plaza/FeaturedCard.jsx'), 'utf8')
const hostSrc = readFileSync(join(root, 'src/host.ts'), 'utf8')

test('E2E 精选卡「去对话中试试」接到当前会话试用，不安装', () => {
  assert.match(featuredSrc, /onTryClick/)
  assert.match(featuredSrc, /workshop\.try/)
  assert.match(plazaUtilsSrc, /fromWindow/)
  assert.match(sessionCreateSrc, /window\.trySkillInSession\s*=\s*trySkillInSession/)
  assert.match(sessionCreateSrc, /api\(["']tryAttach["']/)
  assert.match(sessionCreateSrc, /currentPlazaSessionId/)
  const tryFn = sessionCreateSrc.slice(sessionCreateSrc.indexOf('async function trySkillInSession'))
  const nonGuide = tryFn.slice(tryFn.indexOf('activateSharedToolSkill({ ...skill, slug })'))
  assert.doesNotMatch(nonGuide, /api\(["']install["']/)
})

test('E2E 系统提示段会注入临时技能且引导安装路径仍在', () => {
  assert.match(hostSrc, /plaza:trial-skill/)
  assert.match(hostSrc, /renderAttachedTrialSection/)
  assert.match(sessionCreateSrc, /installFlow === ["']session-guide["']/)
})

test('E2E 试用后联动展开会话栏并聚焦输入框，消除无响应感 (Issue 2201)', () => {
  const tryFn = sessionCreateSrc.slice(sessionCreateSrc.indexOf('async function trySkillInSession'))
  assert.match(tryFn, /ensureConversationVisible/)
  assert.match(tryFn, /setFocus\?\.\(["']split["']\)/)
  assert.match(tryFn, /findComposer\(\)/)
  assert.match(tryFn, /findComposer\(\)\?\.focus/)
})

test('E2E 技能试用只点亮技能按钮，不往输入框写斜杠指令', () => {
  const tryFn = sessionCreateSrc.slice(sessionCreateSrc.indexOf('async function trySkillInSession'))
  const nonGuide = tryFn.slice(tryFn.indexOf('activateSharedToolSkill({ ...skill, slug })'))
  assert.doesNotMatch(nonGuide, /applySkillPrefillToComposer/)
  assert.match(nonGuide, /text:\s*""/)
})
