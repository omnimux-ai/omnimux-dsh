import assert from 'node:assert/strict'
import test from 'node:test'
import { INSPIRATION_CSS } from '../../plugins/omnimux-inspiration/src/client/styles.js'

/**
 * Issue #3212 — 灵感社区舞台底色契约（端到端）。
 *
 * 回归的是一处**色块断层**：`.omnimux-inspiration-root` 曾自带
 * `var(--dsw-alias-bg-primary, var(--dsw-bg, #111215))`。宿主不提供
 * `--dsw-alias-bg-primary`，于是偏蓝的 `#111215` 生效，而外层
 * `.omnimux-inspiration-stage` 与 `PageHeader` 用的是中性的
 * `--dsw-alias-bg-base`；内容不足一屏时页面被切成
 * 「中性顶栏 → 偏蓝主体 → 中性留白」三段。
 *
 * 判据只钉**声明层契约**：jsdom 不解析 `var()`，对任何令牌背景都回报
 * `rgba(0,0,0,0)`，因此「计算样式等于某令牌真值」在旧代码上同样会通过
 * ——那是假绿。令牌的解析真值与「整列无断层」由真机浏览器量测承担
 * （docs/evidence/inspiration-bg-3212/），本文件负责把死令牌、偏蓝色与
 * 高度锁死这三类写法挡在门外，并用负向对照证明判据确有鉴别力。
 */

/** 取一条规则体（仅声明）。 */
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = INSPIRATION_CSS.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(match, `缺少选择器 ${selector}`)
  return match[1]
}

/**
 * 判据本体：一段声明是否满足「底色统一、不锁高」的契约。
 * 抽成纯函数是为了让负向对照能复用同一条判据。
 * @param {string} rootBody
 * @param {string} stageBody
 * @returns {string[]} 违规原因，空数组表示合规
 */
function backgroundContractViolations(rootBody, stageBody) {
  const problems = []
  if (/#111215/i.test(rootBody)) problems.push('root 硬编码了偏蓝暗色 #111215')
  if (/--dsw-alias-bg-primary/.test(rootBody)) problems.push('root 消费了宿主未定义的 --dsw-alias-bg-primary')
  if (!/background:\s*transparent/.test(rootBody)) problems.push('root 未声明为透明，会自铺一层底色')
  for (const [name, body] of [['root', rootBody], ['舞台主体', stageBody]]) {
    if (/flex:\s*none/.test(body)) problems.push(`${name} 锁死为 flex: none，内容偏少时会留下未覆盖区域`)
    if (!/flex:\s*[1-9][0-9]*\s/.test(body)) problems.push(`${name} 未声明可增长，撑不满舞台剩余高度`)
  }
  return problems
}

test('灵感社区舞台底色：root 不自铺底色且整体可增长', () => {
  const problems = backgroundContractViolations(
    ruleBody('.omnimux-inspiration-root'),
    ruleBody('.omnimux-inspiration-stage-body'),
  )
  assert.deepEqual(problems, [], `灵感社区底色契约被破坏：${problems.join('；')}`)
})

test('灵感社区舞台底色：吸顶栏与舞台只消费官方底色令牌', () => {
  const sticky = ruleBody('.omx-stage-sticky')
  const stage = ruleBody('.omnimux-inspiration-stage')
  assert.match(sticky, /background:\s*var\(--dsw-alias-bg-base/, '吸顶栏底色必须来自官方 --dsw-alias-bg-base')
  assert.match(stage, /background:\s*var\(--dsw-alias-bg-base/, '舞台底色必须来自官方 --dsw-alias-bg-base')
  assert.doesNotMatch(sticky, /#111215/i, '吸顶栏不得再硬编码偏蓝暗色 #111215')
  assert.doesNotMatch(stage, /#111215/i, '舞台不得再硬编码偏蓝暗色 #111215')
})

test('灵感社区舞台底色：判据对回归写法具备鉴别力（负向对照）', () => {
  // 修复前的原样写法：必须被判据拒绝，否则本用例就是假绿。
  const before = backgroundContractViolations(
    'flex: none; background: var(--dsw-alias-bg-primary, var(--dsw-bg, #111215));',
    'flex: none;',
  )
  assert.ok(before.length >= 3, `旧写法必须被拒绝，实际只命中 ${before.length} 项：${before.join('；')}`)
  assert.ok(before.some((p) => p.includes('#111215')), '旧写法必须因偏蓝硬编码被拒')
  assert.ok(before.some((p) => p.includes('--dsw-alias-bg-primary')), '旧写法必须因死令牌被拒')
  assert.ok(before.some((p) => p.includes('flex: none')), '旧写法必须因锁死高度被拒')

  // 修复后的写法：同一条判据必须放行。
  const after = backgroundContractViolations('flex: 1 0 auto; background: transparent;', 'flex: 1 0 auto;')
  assert.deepEqual(after, [], '修复后的写法必须被判据放行')
})
