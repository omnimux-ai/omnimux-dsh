import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { agentTextCommand, isSafeAgentModel, probeAgentBin, probeAgentModels, runAgentText, scanLocalAgents } from './local.js'

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
    assert.ok(Array.isArray(codex.models) && codex.models.includes('gpt-6-astra'))
    assert.equal(codex.models.includes('claude-3-7-sonnet'), false, 'codex must not include claude models')
    assert.ok(codex.models.includes('gpt-6-sol'))
    assert.equal(rows.length, 4)
  })

  it('never guesses: a failed probe is simply not installed', async () => {
    const probe = await probeAgentBin('definitely-missing', async () => { throw new Error('nope') })
    assert.deepEqual(probe, { installed: false, version: '' })
  })

  it('probeAgentModels returns dynamic models from local cache/config', () => {
    const codexModels = probeAgentModels('codex')
    assert.ok(Array.isArray(codexModels) && codexModels.includes('gpt-6-astra'))
    assert.equal(codexModels.includes('codex-auto-review'), false, 'hidden models must be excluded')

    const kimiModels = probeAgentModels('kimi')
    assert.ok(Array.isArray(kimiModels) && kimiModels.includes('kimi-code/k3'))

    const claudeModels = probeAgentModels('claude')
    assert.ok(Array.isArray(claudeModels) && claudeModels.includes('claude-3-7-sonnet'))
  })
})

describe('agentTextCommand', () => {
  it('returns one declarative command per CLI, with -- ending option parsing', () => {
    assert.deepEqual(agentTextCommand('claude', 'hi'), { bin: 'claude', args: ['-p', '--output-format', 'text', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('claude', 'hi', 'claude-3-7-sonnet'), { bin: 'claude', args: ['-p', '--output-format', 'text', '--model', 'claude-3-7-sonnet', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('codex', 'hi'), { bin: 'codex', args: ['exec', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('codex', 'hi', 'gpt-6-astra'), { bin: 'codex', args: ['exec', '-m', 'gpt-6-astra', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('kimi', 'hi'), { bin: 'kimi', args: ['-p', '--', 'hi'] })
    assert.deepEqual(agentTextCommand('kimi', 'hi', 'kimi-code/k3'), { bin: 'kimi', args: ['-p', '-m', 'kimi-code/k3', '--', 'hi'] })
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

describe('probeAgentModels isolated file coverage', () => {
  it('correctly extracts visibility === "list" models and filters out "hide" models', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimux-codex-test-'))
    const tempCodexPath = path.join(tempDir, 'models_cache.json')
    try {
      const mockData = {
        models: [
          { id: 'gpt-test-listed', visibility: 'list' },
          { id: 'gpt-test-implicit', slug: 'gpt-test-implicit' },
          { id: 'gpt-test-hidden', visibility: 'hide' },
          { id: 'codex-internal-eval', visibility: 'hide', slug: 'codex-internal-eval' },
          { id: '-unsafe-model', visibility: 'list' },
          { id: 'gpt-test-whitespace', visibility: 'list', slug: '  gpt-test-whitespace  ' },
          null,
        ],
      }
      fs.writeFileSync(tempCodexPath, JSON.stringify(mockData, null, 2), 'utf8')

      const result = probeAgentModels('codex', { codexPath: tempCodexPath })
      assert.deepEqual(result, ['gpt-test-listed', 'gpt-test-whitespace'])
      assert.equal(result.includes('gpt-test-implicit'), false, 'implicit models without visibility=list must be excluded')
      assert.equal(result.includes('gpt-test-hidden'), false)
      assert.equal(result.includes('codex-internal-eval'), false)
      assert.equal(result.includes('-unsafe-model'), false)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      assert.equal(fs.existsSync(tempDir), false, 'temporary directory must be cleaned up')
    }
  })

  it('correctly parses models from kimi toml [models."..."] sections', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimux-kimi-test-'))
    const tempKimiPath = path.join(tempDir, 'config.toml')
    try {
      const mockToml = `
[models."kimi-code/k3-test"]
provider = "moonshot"
max_tokens = 4096

[models."kimi-custom-coding"]
provider = "moonshot"

[models."-unsafe-flag-model"]
provider = "moonshot"

[general]
theme = "dark"
`
      fs.writeFileSync(tempKimiPath, mockToml, 'utf8')

      const result = probeAgentModels('kimi', { kimiPath: tempKimiPath })
      assert.deepEqual(result, ['kimi-code/k3-test', 'kimi-custom-coding'])
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      assert.equal(fs.existsSync(tempDir), false, 'temporary directory must be cleaned up')
    }
  })

  it('smoothly falls back to known preset models when config file is missing or corrupted', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimux-fallback-test-'))
    const missingCodex = path.join(tempDir, 'missing_codex.json')
    const corruptCodex = path.join(tempDir, 'corrupt_codex.json')
    const corruptKimi = path.join(tempDir, 'corrupt_kimi.toml')
    const emptyArrayCodex = path.join(tempDir, 'empty_codex.json')
    const allHiddenCodex = path.join(tempDir, 'all_hidden_codex.json')

    try {
      fs.writeFileSync(corruptCodex, '{ invalid: json syntax ...', 'utf8')
      fs.writeFileSync(corruptKimi, '[models."   "]\nfoo = bar\n[invalid toml syntax', 'utf8')
      fs.writeFileSync(emptyArrayCodex, JSON.stringify({ models: [] }), 'utf8')
      fs.writeFileSync(allHiddenCodex, JSON.stringify({ models: [{ id: 'secret', visibility: 'hide' }] }), 'utf8')

      // Missing file fallback
      const missingResult = probeAgentModels('codex', { codexPath: missingCodex })
      assert.ok(Array.isArray(missingResult) && missingResult.includes('gpt-6-astra'))
      assert.ok(missingResult.includes('gpt-6-sol'))

      // Corrupted JSON fallback
      const corruptResult = probeAgentModels('codex', { codexPath: corruptCodex })
      assert.ok(Array.isArray(corruptResult) && corruptResult.includes('gpt-6-astra'))

      // Empty models array fallback
      const emptyResult = probeAgentModels('codex', { codexPath: emptyArrayCodex })
      assert.ok(Array.isArray(emptyResult) && emptyResult.includes('gpt-6-astra'))

      // All hidden models fallback
      const allHiddenResult = probeAgentModels('codex', { codexPath: allHiddenCodex })
      assert.ok(Array.isArray(allHiddenResult) && allHiddenResult.includes('gpt-6-astra'))

      // Missing kimi config fallback
      const missingKimiResult = probeAgentModels('kimi', { kimiPath: path.join(tempDir, 'missing.toml') })
      assert.ok(Array.isArray(missingKimiResult) && missingKimiResult.includes('kimi-code/k3'))

      // Corrupted kimi config fallback
      const corruptKimiResult = probeAgentModels('kimi', { kimiPath: corruptKimi })
      assert.ok(Array.isArray(corruptKimiResult) && corruptKimiResult.includes('kimi-code/k3'))
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      assert.equal(fs.existsSync(tempDir), false, 'temporary directory must be cleaned up')
    }
  })
})
