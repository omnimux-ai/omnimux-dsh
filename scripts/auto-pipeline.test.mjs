import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { liveEvidence, tinyPng } from './test-fixtures/live-evidence.mjs'
import { transitionIssue } from './auto-pipeline-github.mjs'
import {
  assessAdmission,
  assessAuthorization,
  assessRuntimeAuthorization,
  classifyRisk,
  resolveDeliveryChannel,
  handoffToAgent,
  finishMergedDelivery,
  parseArgs,
  parseFrontmatter,
  slugifyTopic,
} from './auto-pipeline.mjs'
import {
  acquireIssueLock,
  makeRunKey,
  readState,
  transitionState,
  writeState,
} from './pipeline-state.mjs'
import { isScannableSourceFile, validateBrowserEvidence } from './auto-qa-gate.mjs'
import { evaluateVerdict } from './ci-verdict.mjs'
import { deriveImpactMatrix, postMergeAcceptance } from './impact-matrix.mjs'
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
describe('OmniMux 自动化交付流水线与质量门禁套件', () => {
  it('auto-qa-gate.mjs 脚本存在且支持 JSON 输出模式与五维指标', () => {
    const qaScript = join(here, 'auto-qa-gate.mjs')
    assert.ok(existsSync(qaScript), 'auto-qa-gate.mjs 必须存在')
    const out = execSync(`node "${qaScript}" "${repoRoot}/plugins/omnimux-accounts" --json`, {
      encoding: 'utf8',
    })
    const report = JSON.parse(out)
    assert.ok(report.timestamp, '报告必须包含 timestamp')
    assert.ok(report.dimensions, '报告必须包含五维指标')
    assert.ok('syntax' in report.dimensions)
    assert.ok('lifecycle' in report.dimensions)
    assert.ok('security' in report.dimensions)
    assert.ok('tokens' in report.dimensions)
    assert.ok('guards' in report.dimensions)
    assert.equal(typeof report.pass, 'boolean')
  })
  it('L0 不扫描已删除或不入库的 omnimux-workflow 生成物', () => {
    const missing = join(repoRoot, 'plugins/omnimux-workflow/dist/index.js')
    const canvas = join(repoRoot, 'plugins/omnimux-workflow/lib/canvas.js')
    const source = join(repoRoot, 'plugins/omnimux-workflow/src/client/CanvasBridge.jsx')
    assert.equal(isScannableSourceFile(repoRoot, missing), false)
    assert.equal(isScannableSourceFile(repoRoot, canvas), false)
    assert.equal(isScannableSourceFile(repoRoot, source), true)
  })
  it('auto-pipeline.mjs 支持 dry-run 完整链路校验', () => {
    const pipelineScript = join(here, 'auto-pipeline.mjs')
    assert.ok(existsSync(pipelineScript), 'auto-pipeline.mjs 必须存在')
    const out = execSync(`node "${pipelineScript}" 999 --plugin omnimux-accounts --topic dry-test --dry-run`, {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    assert.ok(out.includes('启动 OmniMux 无人值守全自动交付流水线'), '必须包含启动横幅')
    assert.ok(out.includes('[1/6] 解析 Issue #999 元数据'), '必须包含阶段1')
    assert.ok(out.includes('[2/6] 创建独立 Worktree 物理沙箱'), '必须包含阶段2')
    assert.ok(out.includes('[3/6] 执行 L1 敏捷自动化测试'), '必须包含阶段3')
    assert.ok(out.includes('[4/6] 执行严过关五维自动化质检门禁'), '必须包含阶段4')
    assert.ok(out.includes('[5/6] 自动提交、发起 PR 并按风险决定合入'), '必须包含阶段5')
    assert.ok(out.includes('[6/6] 合入确认后按需交接 Dev 验收或收尾'), '必须包含阶段6')
    assert.ok(out.includes('无人值守全自动流水线执行完毕（dry-run，未修改远端）'), '必须包含完成提示')
  })
  it('omnimux CLI 正确挂载 qa:gate 与 auto:run 命令', () => {
    const omnimuxCli = join(here, 'omnimux.mjs')
    const helpOut = execSync(`node "${omnimuxCli}" help`, { encoding: 'utf8' })
    assert.ok(helpOut.includes('qa:gate'), 'help 必须包含 qa:gate')
    assert.ok(helpOut.includes('auto:run'), 'help 必须包含 auto:run')
  })
  it('parseFrontmatter 正确解析 YAML frontmatter', () => {
    const body = `---
track: Track B
risk-tier: R2
pre-authorized: true
allow-skips: false
---
### 需求正文
`
    const fm = parseFrontmatter(body)
    assert.equal(fm.track, 'Track B')
    assert.equal(fm['risk-tier'], 'R2')
    assert.equal(fm['pre-authorized'], true)
    assert.equal(fm['allow-skips'], false)
  })
  it('assessAuthorization 正确识别有效与无效的自动合入授权', () => {
    const maintainers = new Set(['boss-user'])
    const validIssue = {
      body: '---\nrisk-tier: R2\npre-authorized: true\n---\n',
      labels: [{ name: 'status:ready-to-run' }, { name: 'risk:R2' }],
      comments: [{ author: { login: 'boss-user' }, body: '/auto-approve risk:R2' }],
    }
    const validAuth = assessAuthorization(validIssue, maintainers)
    assert.equal(validAuth.eligible, true, '合法 R2 授权必须通过')
    const revokedIssue = {
      ...validIssue,
      comments: [
        { author: { login: 'boss-user' }, body: '/auto-approve risk:R2' },
        { author: { login: 'boss-user' }, body: '/revoke 取消授权' },
      ],
    }
    const revokedAuth = assessAuthorization(revokedIssue, maintainers)
    assert.equal(revokedAuth.eligible, false, '被 /revoke 后必须拒绝自动合入')
    const mismatchedIssue = {
      body: '---\nrisk-tier: R1\npre-authorized: true\n---\n',
      labels: [{ name: 'status:ready-to-run' }, { name: 'risk:R1' }],
      comments: [{ author: { login: 'boss-user' }, body: '/auto-approve risk:R1' }],
    }
    const mismatchedAuth = assessAuthorization(mismatchedIssue, maintainers)
    assert.equal(mismatchedAuth.eligible, false, 'R1 严禁被判定为自动合入授权')
  })
  it('classifyRisk 识别 R1 契约路径与跨插件变更', () => {
    const issue = { body: '---\nrisk-tier: R2\n---\n', labels: [{ name: 'risk:R2' }] }
    const r1Files = ['AGENTS.md', 'plugins/omnimux-clip/src/index.js']
    const classifiedR1 = classifyRisk(issue, r1Files)
    assert.equal(classifiedR1.tier, 'R1')
    assert.equal(classifiedR1.automaticAllowed, false)
    const crossPluginFiles = ['plugins/omnimux-clip/src/index.js', 'plugins/omnimux-assets/src/index.js']
    const classifiedCross = classifyRisk(issue, crossPluginFiles)
    assert.equal(classifiedCross.tier, 'R1')
    const r2Files = ['plugins/omnimux-accounts/src/client/view.js']
    const classifiedR2 = classifyRisk(issue, r2Files)
    assert.equal(classifiedR2.tier, 'R2')
    assert.equal(classifiedR2.automaticAllowed, true)
  })
  it('pipeline-state 排他锁与原子状态机工作正常', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'pipeline-state-'))
    try {
      const lock1 = acquireIssueLock(tmpRoot, '888')
      assert.ok(lock1.lock, '锁路径有效')
      assert.throws(() => acquireIssueLock(tmpRoot, '888'), /已有流水线运行锁/)
      const state1 = transitionState(tmpRoot, '888', null, 'preflight', { runKey: '888@abc' })
      assert.equal(state1.state, 'preflight')
      const read1 = readState(tmpRoot, '888')
      assert.equal(read1.state, 'preflight')
      assert.equal(read1.runKey, '888@abc')
      lock1.release()
      // 释放后应能再次上锁
      const lock2 = acquireIssueLock(tmpRoot, '888')
      lock2.release()
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
  it('validateBrowserEvidence 正确核验证据完整性', () => {
    const tmpEvidence = mkdtempSync(join(tmpdir(), 'pipeline-evidence-'))
    try {
      const shotFile = join(tmpEvidence, 'assets.png')
      writeFileSync(shotFile, tinyPng())
      const { request, report: validReport } = liveEvidence(repoRoot, tmpEvidence)
      writeFileSync(join(tmpEvidence, 'live-qa-report.json'), JSON.stringify(validReport))
      writeFileSync(join(tmpEvidence, 'ego-browser-qa-request.json'), JSON.stringify(request))
      const expected = { root: repoRoot, runId: request.runId, stage: request.stage, target: request.target }
      const validResult = validateBrowserEvidence(tmpEvidence, expected)
      assert.equal(validResult.pass, true, '合法证据必须放行')
      const invalidReport = { ...validReport, pass: false, errors: ['页面崩溃'] }
      writeFileSync(join(tmpEvidence, 'live-qa-report.json'), JSON.stringify(invalidReport))
      const invalidResult = validateBrowserEvidence(tmpEvidence, expected)
      assert.equal(invalidResult.pass, false, 'FAIL 证据必须拦截')
      for (const mutation of [
        { tool: 'codex-iab' },
        { taskSpaceId: null },
        { browserIdentity: { before: { taskSpaceId: 77, tabId: 'other' }, after: { taskSpaceId: 77, tabId: 'other' } } },
        { profile: 'another-profile' },
        { target: 'l2' },
        { commitSha: 'stale' },
        { actualUrl: 'http://127.0.0.1:44202/' },
        { targets: [], probe: { ...validReport.probe, targets: [] }, screenshots: [] },
        { runtimeProof: { before: {}, after: {} } },
      ]) {
        writeFileSync(join(tmpEvidence, 'live-qa-report.json'), JSON.stringify({ ...validReport, ...mutation }))
        assert.equal(validateBrowserEvidence(tmpEvidence, expected).pass, false, `伪造证据必须拒绝: ${JSON.stringify(mutation)}`)
      }
      const mutateProofBundles = (mutate) => {
        const report = structuredClone(validReport)
        for (const proof of [report.runtimeProof.before, report.runtimeProof.after]) mutate(proof.bundles[0])
        return report
      }
      const newHashFields = [
        'bundleRegistrationSha256',
        'bundleCodeSha256',
        'loadedScriptCodeSha256',
        'loadedRegistrationSha256',
        'loadedRegistrationCodeSha256',
      ]
      const normalizedMatch = mutateProofBundles((bundle) => {
        bundle.loadedRegistrationSha256 = 'a'.repeat(64)
        bundle.match = 'normalized-registration'
      })
      writeFileSync(join(tmpEvidence, 'live-qa-report.json'), JSON.stringify(normalizedMatch))
      assert.equal(validateBrowserEvidence(tmpEvidence, expected).pass, true, '注释差异的 normalized registration 证据必须放行')
      const oldShape = mutateProofBundles((bundle) => {
        for (const field of newHashFields) delete bundle[field]
        delete bundle.match
        delete bundle.matchingRegistrationCount
        bundle.matchingScriptCount = 1
      })
      writeFileSync(join(tmpEvidence, 'live-qa-report.json'), JSON.stringify(oldShape))
      assert.equal(validateBrowserEvidence(tmpEvidence, expected).pass, false, '旧 runtime proof shape 必须拒绝')
      for (const field of ['bundleSha256', ...newHashFields, 'loadedScriptSha256']) {
        const missingHash = mutateProofBundles((bundle) => { delete bundle[field] })
        writeFileSync(join(tmpEvidence, 'live-qa-report.json'), JSON.stringify(missingHash))
        assert.equal(validateBrowserEvidence(tmpEvidence, expected).pass, false, `缺少 ${field} 必须拒绝`)
      }
      for (const [name, mutate] of [
        ['malformed hash', bundle => { bundle.loadedScriptSha256 = 'not-a-sha256' }],
        ['registration code mismatch', bundle => { bundle.loadedRegistrationCodeSha256 = '0'.repeat(64) }],
        ['raw registration mismatch', bundle => { bundle.loadedRegistrationSha256 = '0'.repeat(64) }],
        ['invalid match mode', bundle => { bundle.match = 'normalized-code' }],
        ['duplicate registrations', bundle => { bundle.matchingRegistrationCount = 2 }],
      ]) {
        const invalidProof = mutateProofBundles(mutate)
        writeFileSync(join(tmpEvidence, 'live-qa-report.json'), JSON.stringify(invalidProof))
        assert.equal(validateBrowserEvidence(tmpEvidence, expected).pass, false, `${name} 必须拒绝`)
      }
    } finally {
      rmSync(tmpEvidence, { recursive: true, force: true })
    }
  })
  it('evaluateVerdict only certifies pre-merge static/tests and leaves UI acceptance pending', () => {
    const passQa = { pass: true, summary: 'L0 PASS', changedFiles: ['docs/guide.md'] }
    assert.equal(evaluateVerdict(passQa).pass, true)
    assert.equal(evaluateVerdict({ ...passQa, pass: false }).pass, false)
    const ui = evaluateVerdict({ ...passQa, changedFiles: ['plugins/a/client/index.js'] })
    assert.equal(ui.pass, true)
    assert.equal(ui.dimensions.browser.status, 'pending')
    assert.equal(ui.dimensions.browser.pass, null)
    assert.equal(evaluateVerdict({ pass: true }).pass, false)
  })
  it('准入后真实状态迁移剥除 ready，运行时复验通过且撤销/升级熔断', () => {
    const maintainers = new Set(['boss-user'])
    const issue = {
      body: '---\nrisk-tier: R2\npre-authorized: true\n---\n', state: 'OPEN',
      labels: ['status:ready-to-run', 'risk:R2'],
      comments: [{ author: { login: 'boss-user' }, body: '/auto-approve risk:R2' }],
    }
    assert.equal(assessAdmission(issue, maintainers).eligible, true)
    const options = { execCommand(command, args) {
      assert.equal(command, 'gh')
      const labels = new Set(issue.labels)
      for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--add-label') labels.add(args[++i])
        else if (args[i] === '--remove-label') labels.delete(args[++i])
      }
      issue.labels = [...labels]
      return { status: 0 }
    } }
    for (const status of ['status:pipeline-running', 'status:in-progress', 'status:qa-review', 'status:auto-merge-pending']) {
      transitionIssue(606, status, options)
      assert.equal(issue.labels.includes('status:ready-to-run'), false)
      assert.equal(assessRuntimeAuthorization(issue, maintainers, 'R2').valid, true)
    }
    const risk = classifyRisk(issue, ['docs/contracts/plugin-qa.md'])
    assert.equal(risk.tier, 'R1')
    assert.equal(assessRuntimeAuthorization(issue, maintainers, risk.tier).valid, false)
    issue.comments.push({ author: { login: 'boss-user' }, body: '/revoke' })
    assert.equal(assessRuntimeAuthorization(issue, maintainers, 'R2').valid, false)
  })
  it('入口调用 admission，等待 CI 后在合入前调用 runtime', () => {
    const source = readFileSync(join(here, 'auto-pipeline.mjs'), 'utf8')
    assert.match(source, /assessAdmission\(issue, maintainers\)/)
    assert.match(source, /await waitForCi[\s\S]*assessRuntimeAuthorization\(latestIssue, maintainers, risk\.tier\)[\s\S]*await requestAndConfirmMerge/)
    assert.doesNotMatch(source, /assessAuthorization\(latestIssue/)
  })
  it('unauthorized machine runs fail closed even for R0/R1; manual remains an Agent handoff', () => {
    for (const tier of ['R0', 'R1', 'R2', 'R3']) {
      const risk = classifyRisk({ body: `---\nrisk-tier: ${tier}\n---\n` })
      const denied = { eligible: false, reasons: ['missing trusted authorization'] }
      assert.throws(() => resolveDeliveryChannel(risk, denied, {}), /机器预授权不足/)
      assert.equal(resolveDeliveryChannel(risk, denied, { manual: true }), 'agent')
      const approved = { eligible: true, reasons: [] }
      assert.equal(resolveDeliveryChannel(risk, approved, { manual: true }), 'agent')
      if (['R2', 'R3'].includes(tier)) assert.equal(resolveDeliveryChannel(risk, approved, {}), 'auto')
      else assert.throws(() => resolveDeliveryChannel(risk, approved, {}), /机器预授权不足/)
    }
  })
  it('R0 is not downgraded by contract or cross-plugin paths', () => {
    for (const paths of [['docs/contracts/plugin-git-pr.md'], ['plugins/a/file.ts', 'plugins/b/file.ts']]) {
      assert.equal(classifyRisk({ body: '---\nrisk-tier: R0\n---\n' }, paths).tier, 'R0')
    }
  })
  it('handoff preserves recovery evidence and no-merge scope without invoking merge or materialization', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-handoff-'))
    try {
      for (const [noMerge, materialize] of [[false, true], [true, true], [false, false], [true, false]]) {
        writeState(root, '840', { state: 'pr', runKey: 'run', baseSha: 'base', worktree: '/task', branch: 'task' })
        const calls = []
        const evidence = { commit: { headSha: 'head' }, pr: { number: 841 }, reports: { qa: { pass: true } }, risk: { tier: 'R1' } }
        const result = handoffToAgent(root, '840', evidence, {
          noMerge, materialize, execCommand: (command, args) => { calls.push([command, args]); return { status: 0 } },
        })
        assert.equal(result.state, 'ready-for-agent')
        assert.equal(result.handoff.owner, 'coordinating-agent')
        assert.equal(result.handoff.mergeProhibited, noMerge)
        assert.equal(result.handoff.materializeProhibited, !materialize)
        assert.equal(result.baseSha, 'base')
        assert.equal(result.worktree, '/task')
        assert.equal(result.commit.headSha, 'head')
        assert.deepEqual(readState(root, '840'), result)
        assert.equal(calls.length, 1)
        assert.equal(calls[0][0], 'gh')
        assert.deepEqual(calls[0][1].slice(0, 3), ['issue', 'edit', '840'])
        assert.ok(calls[0][1].includes('status:qa-review'))
        if (noMerge) assert.match(result.handoff.nextAction, /do not merge or materialize/)
        else {
          assert.match(result.handoff.nextAction, /revocation.*required static\/test checks/)
          if (!materialize) assert.match(result.handoff.nextAction, /do not materialize/)
        }
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('post-merge UI/runtime delivery retains the worktree and pending Dev without materialization or success', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-dev-handoff-'))
    try {
      for (const files of [['plugins/a/client/View.js'], ['plugins/a/src/server.js']]) {
        for (const materialize of [true, false]) {
          writeState(root, '866', { state: 'merged-confirmed', runKey: 'run', worktree: '/task' })
          const reports = postMergeAcceptance(deriveImpactMatrix(files))
          const evidence = { issueId: '866', plugin: 'a', topic: 'task', reports, risk: { tier: 'R2' }, pr: { number: 867 }, merged: { state: 'MERGED', mergedAt: 'now', mergeCommit: { oid: 'merge' } } }
          const calls = []
          const result = finishMergedDelivery(root, { wtDir: '/task' }, evidence, {
            materialize, execCommand: (command, args) => { calls.push([command, args]); return { status: 0 } },
          }, () => { throw new Error('must not materialize or clean before Dev acceptance') })
          assert.equal(result.state, 'ready-for-agent')
          assert.equal(result.handoff.fromPhase, 'merged-confirmed')
          assert.equal(result.handoff.phase, 'post-merge-dev')
          assert.equal(result.handoff.materializeProhibited, !materialize)
          assert.equal(result.materialized, false)
          assert.equal(result.reports.dev.status, 'pending')
          assert.equal(result.reports.dev.pass, null)
          assert.equal(result.worktree, '/task')
          assert.equal(result.merged.mergeCommit.oid, 'merge')
          assert.match(result.handoff.nextAction, /do not claim succeeded or clean up/)
          if (!materialize) assert.match(result.handoff.nextAction, /Do not materialize/)
          assert.equal(calls.length, 1)
          assert.ok(calls[0][1].includes('status:qa-review'))
        }
      }
      writeState(root, '866', { state: 'merged-confirmed' })
      assert.throws(() => handoffToAgent(root, '866', { merged: { state: 'OPEN' } }, {}, 'merged-confirmed'), /confirmed MERGED/)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('docs-only merged delivery can finish without claiming Dev materialization', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-docs-finish-'))
    try {
      writeState(root, '866', { state: 'merged-confirmed' })
      const reports = postMergeAcceptance(deriveImpactMatrix(['docs/guide.md']))
      let cleaned = false
      const result = finishMergedDelivery(root, {}, { issueId: '866', reports, risk: { tier: 'R3' }, pr: { number: 867 }, merged: { state: 'MERGED', mergedAt: 'now', mergeCommit: { oid: 'merge' } } }, { materialize: true, execCommand: () => ({ status: 0 }) }, (_wt, _plugin, _topic, _issue, _pr, options) => {
        cleaned = true; assert.equal(options.materialize, false)
      })
      assert.equal(cleaned, true)
      assert.equal(result.state, 'succeeded')
      assert.equal(result.materialized, false)
      assert.equal(result.reports.dev.status, 'not-applicable')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('obsolete pre-merge browser CLI options are rejected without affecting risk or scope options', () => {
    for (const option of ['--l2-url', '--expected-text', '--browser-run-id', '--browser-stage', '--browser-target']) {
      assert.throws(() => parseArgs(['866', option, 'value']), /未知参数/)
    }
    const options = parseArgs(['866', '--manual', '--no-merge', '--no-materialize'])
    assert.equal(options.manual, true)
    assert.equal(options.noMerge, true)
    assert.equal(options.materialize, false)
  })
  it('slugifyTopic 截断长度且保留有效字符', () => {
    const slug = slugifyTopic('feat(clip): Support Multi-Track Video Timeline Editing & Export!', '42')
    assert.ok(slug.length <= 40, 'Topic 长度必须不超过 40 字符')
    assert.ok(!/[^a-z0-9-]/.test(slug), 'Topic 只能包含小写字母、数字和中划线')
  })
})
