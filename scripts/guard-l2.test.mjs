import { after, describe, it } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decideL2Guard,
  loadGuardConfig,
  checkL2Status,
  UI_FILE_RE,
  SENSITIVE_COMMAND_RE,
} from './guard-l2.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = mkdtempSync(join(here, '.guard-l2-fixture-'))
after(() => rmSync(fixture, { recursive: true, force: true }))

const scriptPath = join(here, 'guard-l2.mjs')

function runHook(payload, cwd = fixture) {
  const res = spawnSync('node', [scriptPath], {
    cwd,
    encoding: 'utf8',
    input: JSON.stringify(payload),
  })
  assert.equal(res.status, 0, `guard-l2 exited with ${res.status}: ${res.stderr}`)
  return JSON.parse(res.stdout)
}

describe('guard-l2 基础规则判定', () => {
  it('正确识别 UI 文件路径', () => {
    assert.equal(UI_FILE_RE.test('plugins/omnimux/src/client/index.js'), true)
    assert.equal(UI_FILE_RE.test('plugins/omnimux-workflow/src/Stage.tsx'), true)
    assert.equal(UI_FILE_RE.test('plugins/omnimux-clip/src/web/editor.vue'), true)
    assert.equal(UI_FILE_RE.test('plugins/omnimux/src/styles/main.css'), true)
    assert.equal(UI_FILE_RE.test('plugins/omnimux/src/client.jsx'), true)

    // 非 UI 文件
    assert.equal(UI_FILE_RE.test('scripts/dev-doctor.sh'), false)
    assert.equal(UI_FILE_RE.test('docs/contracts/dev-pipeline.md'), false)
    assert.equal(UI_FILE_RE.test('plugins/omnimux/src/host/apply.js'), false)
    assert.equal(UI_FILE_RE.test('package.json'), false)
  })

  it('正确识别敏感代码提交与合并命令', () => {
    assert.equal(SENSITIVE_COMMAND_RE.test('git commit -m "feat: add button"'), true)
    assert.equal(SENSITIVE_COMMAND_RE.test('git push origin feat/button'), true)
    assert.equal(SENSITIVE_COMMAND_RE.test('gh pr create --title "feat"'), true)
    assert.equal(SENSITIVE_COMMAND_RE.test('./scripts/git-wt.sh finish my-task'), true)
    assert.equal(SENSITIVE_COMMAND_RE.test('pnpm wt finish my-task --skip-l2'), true)
    assert.equal(SENSITIVE_COMMAND_RE.test('pnpm wt finish my-task --skip-push'), true)

    // 非敏感命令
    assert.equal(SENSITIVE_COMMAND_RE.test('pnpm test'), false)
    assert.equal(SENSITIVE_COMMAND_RE.test('git status'), false)
    assert.equal(SENSITIVE_COMMAND_RE.test('git diff'), false)
    assert.equal(SENSITIVE_COMMAND_RE.test('ls -la'), false)
  })
})

describe('guard-l2 核心逻辑 decideL2Guard', () => {
  it('非敏感命令直接放行', () => {
    const res = decideL2Guard({
      command: 'pnpm test',
      cwd: fixture,
      filesOverride: ['plugins/omnimux-workflow/src/client/App.tsx'],
    })
    assert.equal(res.decision, 'allow')
    assert.equal(res.reason, 'non-sensitive-command')
  })

  it('纯后端与非 UI 文件改动，即使执行 git commit 也直接放行', () => {
    const res = decideL2Guard({
      command: 'git commit -m "feat: backend api"',
      cwd: fixture,
      filesOverride: ['plugins/omnimux/src/host/apply.js', 'docs/README.md'],
    })
    assert.equal(res.decision, 'allow')
    assert.equal(res.reason, 'no-ui-files')
  })

  it('存在合法 .l2-dev.env 时放行 UI 改动的提交', () => {
    const wtDir = join(fixture, 'wt-with-l2')
    mkdirSync(wtDir, { recursive: true })
    writeFileSync(
      join(wtDir, '.l2-dev.env'),
      'PORT=44201\nURL=http://127.0.0.1:44201/\nPLUGIN=omnimux-workflow\n'
    )

    const res = decideL2Guard({
      command: 'git commit -m "feat: new audio button"',
      cwd: wtDir,
      filesOverride: ['plugins/omnimux-workflow/src/client/Button.tsx'],
    })
    assert.equal(res.decision, 'allow')
    assert.equal(res.reason, 'l2-verified')
    assert.equal(res.l2Port, '44201')
  })

  describe('用户可控模式行为测试 (无 L2 独立环境时)', () => {
    const uiFiles = ['plugins/omnimux-workflow/src/client/Waveform.tsx']

    it('mode = "ask"：向用户提出确认请求 (permissionDecision: ask)', () => {
      const res = decideL2Guard({
        command: 'git commit -m "feat: waveform"',
        cwd: fixture,
        filesOverride: uiFiles,
        configOverride: { mode: 'ask' },
      })
      assert.equal(res.decision, 'ask')
      assert.match(res.message, /⚠️【OmniMux L2 独立测试前置提醒】/)
      assert.match(res.message, /是否确认放行此次提交？/)
    })

    it('mode = "warn"：终端输出警告并放行 (permissionDecision: allow, warning: true)', () => {
      const res = decideL2Guard({
        command: 'git commit -m "feat: waveform"',
        cwd: fixture,
        filesOverride: uiFiles,
        configOverride: { mode: 'warn' },
      })
      assert.equal(res.decision, 'allow')
      assert.equal(res.warning, true)
      assert.match(res.message, /⚠️【OmniMux L2 独立测试前置提醒】/)
    })

    it('mode = "deny"：严格阻断并给出引导 (permissionDecision: deny)', () => {
      const res = decideL2Guard({
        command: 'git commit -m "feat: waveform"',
        cwd: fixture,
        filesOverride: uiFiles,
        configOverride: { mode: 'deny' },
      })
      assert.equal(res.decision, 'deny')
      assert.match(res.message, /⚠️【OmniMux L2 独立测试前置提醒】/)
      assert.match(res.message, /pnpm wt dev/)
    })

    it('mode = "off"：完全静默放行', () => {
      const res = decideL2Guard({
        command: 'git commit -m "feat: waveform"',
        cwd: fixture,
        filesOverride: uiFiles,
        configOverride: { mode: 'off' },
      })
      assert.equal(res.decision, 'allow')
      assert.equal(res.reason, 'guard-off')
    })
  })

  it('针对 UI 改动试图使用 --skip-l2 绕过时的拦截行为', () => {
    const uiFiles = ['plugins/omnimux-workflow/src/client/AudioNode.tsx']
    const res = decideL2Guard({
      command: 'pnpm wt finish audio-node --skip-l2',
      cwd: fixture,
      filesOverride: uiFiles,
      configOverride: { mode: 'ask' },
    })
    assert.equal(res.decision, 'ask')
    assert.match(res.message, /⚠️【OmniMux L2 门禁安全警示】检测到命令试图使用 `--skip-l2` 跳过独立验证/)
    assert.match(res.message, /是否确认由人工授权跳过 L2 验证并继续执行？/)
  })
})

describe('端到端 JSON 协议测试 (dsh-hooks PreToolUse)', () => {
  it('接收标准 PreToolUse 输入并返回合法决策 JSON', () => {
    const payload = {
      hook_event_name: 'PreToolUse',
      tool_name: 'bash',
      tool_input: {
        command: 'pnpm test',
      },
      cwd: fixture,
    }

    const output = runHook(payload)
    assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse')
    assert.equal(output.hookSpecificOutput.permissionDecision, 'allow')
  })

  it('真实 Git 仓库场景：修改 UI 文件后尝试提交，实时阻断/询问；启动 L2 后自动放行', () => {
    // 1. 初始化一个真实的临时 Git 仓库
    const repo = join(fixture, 'real-git-repo')
    mkdirSync(repo, { recursive: true })
    spawnSync('git', ['init', '-b', 'main'], { cwd: repo })
    spawnSync('git', ['config', 'user.name', 'Tester'], { cwd: repo })
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })

    // 创建初始文件并提交
    writeFileSync(join(repo, 'README.md'), '# Initial\n')
    spawnSync('git', ['add', '.'], { cwd: repo })
    spawnSync('git', ['commit', '-m', 'chore: init'], { cwd: repo })

    // 2. 场景 A: 修改纯文档文件，尝试提交 -> 应该直接放行
    writeFileSync(join(repo, 'README.md'), '# Updated\n')
    const docCommitPayload = {
      hook_event_name: 'PreToolUse',
      tool_name: 'bash',
      tool_input: {
        command: 'git commit -m "docs: update readme"',
      },
      cwd: repo,
    }
    const docOut = runHook(docCommitPayload, repo)
    assert.equal(docOut.hookSpecificOutput.permissionDecision, 'allow')

    // 3. 场景 B: 修改前端 UI 文件，但未启动 L2 -> 默认触发 ask 模式向用户弹窗求证
    mkdirSync(join(repo, 'plugins/omnimux-workflow/src/client'), { recursive: true })
    writeFileSync(
      join(repo, 'plugins/omnimux-workflow/src/client/AudioWaveform.tsx'),
      'export const AudioWaveform = () => null\n'
    )
    spawnSync('git', ['add', '.'], { cwd: repo })

    const uiCommitPayload = {
      hook_event_name: 'PreToolUse',
      tool_name: 'bash',
      tool_input: {
        command: 'git commit -m "feat(audio): add waveform"',
      },
      cwd: repo,
    }
    const uiOut = runHook(uiCommitPayload, repo)
    assert.equal(uiOut.hookSpecificOutput.permissionDecision, 'ask')
    assert.match(uiOut.hookSpecificOutput.permissionDecisionReason, /OmniMux L2 独立测试前置提醒/)
    assert.match(uiOut.hookSpecificOutput.permissionDecisionReason, /AudioWaveform\.tsx/)

    // 4. 场景 C: 用户通过配置文件切换为 "deny" 严格拦截模式
    mkdirSync(join(repo, '.dsh'), { recursive: true })
    writeFileSync(
      join(repo, '.dsh', 'l2-guard.json'),
      JSON.stringify({ mode: 'deny' })
    )
    const denyOut = runHook(uiCommitPayload, repo)
    assert.equal(denyOut.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(denyOut.hookSpecificOutput.permissionDecisionReason, /OmniMux L2 独立测试前置提醒/)

    // 5. 场景 D: 模拟模型执行 `pnpm wt dev` 启动了独立 L2 环境，写入 .l2-dev.env
    writeFileSync(
      join(repo, '.l2-dev.env'),
      'PORT=44203\nURL=http://127.0.0.1:44203/\nTOPIC=waveform\n'
    )

    // 再次提交 UI 代码 -> 验证通过，直接放行！
    const passedOut = runHook(uiCommitPayload, repo)
    assert.equal(passedOut.hookSpecificOutput.permissionDecision, 'allow')
  })
})
