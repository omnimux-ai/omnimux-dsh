import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { agentTextCommand, probeAgentBin, runAgentText, scanLocalAgents } from './local.js'

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
    assert.equal(codex.installed, false)
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
    assert.deepEqual(agentTextCommand('codex', 'hi'), { bin: 'codex', args: ['exec', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('kimi', 'hi'), { bin: 'kimi', args: ['-p', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('qwen', 'hi'), { bin: 'qwen', args: ['-p', '--', 'hi'] })
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
