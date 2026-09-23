import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { agentTextCommand, isSafeAgentModel, probeAgentBin, runAgentText, scanLocalAgents } from './local.js'

describe('scanLocalAgents', () => {
  it('marks only the binaries that answer --version as installed', async () => {
    const rows = await scanLocalAgents(async (bin) => {
      if (bin === 'claude') return { stdout: 'claude 2.1.0\n', stderr: '' }
      throw new Error('spawn not found')
    })
    const claude = rows.find((row) => row.id === 'claude')
    const codex = rows.find((row) => row.id === 'codex')
    assert.equal(claude.installed, true)
    assert.equal(claude.version, 'claude 2.1.0')
    assert.ok(Array.isArray(claude.models) && claude.models.includes('claude-3-7-sonnet'))
    assert.equal(codex.installed, false)
    assert.ok(Array.isArray(codex.models) && codex.models.includes('gpt-4o'))
    assert.equal(codex.models.includes('claude-3-7-sonnet'), false, 'codex must not include claude models')
    assert.deepEqual(codex.models, ['gpt-4o', 'o3-mini', 'o1', 'gpt-4.5-preview'])
    assert.equal(rows.length, 4)
  })

  it('never guesses: a failed probe is simply not installed', async () => {
    const probe = await probeAgentBin('definitely-missing', async () => { throw new Error('nope') })
    assert.deepEqual(probe, { installed: false, version: '' })
  })
})

describe('agentTextCommand', () => {
  it('returns one declarative command per CLI, with -- ending option parsing', () => {
    assert.deepEqual(agentTextCommand('claude', 'hi'), { bin: 'claude', args: ['-p', '--output-format', 'text', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('claude', 'hi', 'claude-3-7-sonnet'), { bin: 'claude', args: ['-p', '--output-format', 'text', '--model', 'claude-3-7-sonnet', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('codex', 'hi'), { bin: 'codex', args: ['exec', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('codex', 'hi', 'gpt-4o'), { bin: 'codex', args: ['exec', '-m', 'gpt-4o', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('kimi', 'hi'), { bin: 'kimi', args: ['-p', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('kimi', 'hi', 'kimi-latest'), { bin: 'kimi', args: ['-p', '-m', 'kimi-latest', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('qwen', 'hi'), { bin: 'qwen', args: ['-p', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('qwen', 'hi', 'qwen-max'), { bin: 'qwen', args: ['-p', '-m', 'qwen-max', '--', 'hi'] })
    assert.equal(agentTextCommand('nope', 'hi'), null)
  })

  it('a prompt starting with a dash stays data, never a flag', () => {
    for (const id of ['claude', 'codex', 'kimi', 'qwen']) {
      const command = agentTextCommand(id, '-v follow up')
      const separator = command.args.indexOf('--')
      assert.ok(separator >= 0, `${id} must separate options from the prompt`)
      assert.equal(command.args[separator + 1], '-v follow up')
    }
  })

  it('safely validates model parameter and ignores injection risks or invalid names', () => {
    // Leading dashes (flags/injections)
    assert.deepEqual(agentTextCommand('codex', 'hi', '-m'), { bin: 'codex', args: ['exec', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('claude', 'hi', '--version'), { bin: 'claude', args: ['-p', '--output-format', 'text', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('kimi', 'hi', '-bad-flag'), { bin: 'kimi', args: ['-p', '--', 'hi'] })

    // Non-string or whitespace or special characters
    assert.deepEqual(agentTextCommand('qwen', 'hi', ''), { bin: 'qwen', args: ['-p', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('qwen', 'hi', '   '), { bin: 'qwen', args: ['-p', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('qwen', 'hi', 'model; rm -rf'), { bin: 'qwen', args: ['-p', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('codex', 'hi', 'model with spaces'), { bin: 'codex', args: ['exec', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('claude', 'hi', null), { bin: 'claude', args: ['-p', '--output-format', 'text', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('claude', 'hi', undefined), { bin: 'claude', args: ['-p', '--output-format', 'text', '--', 'hi'] })

    // Helper function validation
    assert.equal(isSafeAgentModel('gpt-4o'), true)
    assert.equal(isSafeAgentModel('claude-3-7-sonnet'), true)
    assert.equal(isSafeAgentModel('moonshot/v1:latest'), true)
    assert.equal(isSafeAgentModel('-v'), false)
    assert.equal(isSafeAgentModel('--flag'), false)
    assert.equal(isSafeAgentModel(''), false)
    assert.equal(isSafeAgentModel('   '), false)
    assert.equal(isSafeAgentModel(null), false)
  })
})

describe('runAgentText', () => {
  it('returns the trimmed stdout', async () => {
    const text = await runAgentText({
      id: 'claude',
      prompt: 'hi',
      run: async () => ({ stdout: '  hello there \n', stderr: '' }),
    })
    assert.equal(text, 'hello there')
  })

  it('rejects an unknown agent', async () => {
    await assert.rejects(
      () => runAgentText({ id: 'nope', prompt: 'hi', run: async () => ({ stdout: 'x' }) }),
      (error) => error.code === 'unknown-agent',
    )
  })

  it('rejects empty output instead of pretending a completion happened', async () => {
    await assert.rejects(
      () => runAgentText({ id: 'claude', prompt: 'hi', run: async () => ({ stdout: '  ' }) }),
      (error) => error.code === 'agent-empty',
    )
  })

  it('surfaces the CLI error text without falling back', async () => {
    await assert.rejects(
      () => runAgentText({
        id: 'claude',
        prompt: 'hi',
        run: async () => { throw Object.assign(new Error('boom'), { stderr: 'please login first' }) },
      }),
      (error) => error.code === 'agent-failed' && /please login first/.test(error.message),
    )
  })
})
