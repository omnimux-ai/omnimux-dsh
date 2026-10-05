import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  createUpdateChecker,
  detectInstallShape,
  isNewerVersion,
  npmPathForBin,
  parseVersion,
  runAgentUpdate,
} from './updates.js'

const NPM_CLAUDE = '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude'
const BREW_CLAUDE = '/opt/homebrew/Cellar/claude-code/2.1.223/bin/claude'
const KIMI_NATIVE = '/Users/test/.kimi-code/bin/kimi'
const PLAIN_CLAUDE = '/usr/local/bin/claude'

/** A registry response shaped like the npm registry's `/latest` document. */
function registryLatest(version) {
  const body = JSON.stringify({ 'dist-tags': { latest: version } })
  return {
    ok: true,
    status: 200,
    async json() { return JSON.parse(body) },
    async text() { return body },
  }
}

function registryNotFound() {
  return {
    ok: false,
    status: 404,
    async json() { return {} },
    async text() { return '{}' },
  }
}

function registryGarbage() {
  return {
    ok: true,
    status: 200,
    async json() { throw new SyntaxError('Unexpected token < in JSON') },
    async text() { return '<html>registry unavailable</html>' },
  }
}

/** The checker only reads `id`, `installed` and `version` off a scanned row. */
function agentRow(overrides = {}) {
  return { id: 'claude', installed: true, version: '2.1.223 (Claude Code)', ...overrides }
}

const BIN_BY_AGENT = {
  claude: NPM_CLAUDE,
  codex: BREW_CLAUDE,
  kimi: KIMI_NATIVE,
  qwen: PLAIN_CLAUDE,
}

/** No release ledger anywhere: a self-updating CLI simply has nothing to report. */
const NO_LEDGER_FS = {
  readFileSync() {
    throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
  },
}

/**
 * Checker options with every machine-specific seam injected: nothing here reads
 * the developer machine's PATH, home directory or network.
 */
function checkerOptions(overrides = {}) {
  return {
    now: () => 1_760_000_000_000,
    ttlMs: 6 * 60 * 60 * 1000,
    cache: new Map(),
    home: '/home/test',
    fsImpl: NO_LEDGER_FS,
    resolveBin: (bin) => BIN_BY_AGENT[bin] || '',
    ...overrides,
  }
}

/**
 * Put one executable on PATH inside a throwaway directory. `runAgentUpdate`
 * derives the npm to call from PATH itself, so a hermetic test has to own PATH.
 * @param {string} relativeDir
 * @param {string} bin
 * @param {(binPath: string) => Promise<void>} fn
 */
async function withFakeBin(relativeDir, bin, fn) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omnimux-agent-bin-')))
  const originalPath = process.env.PATH
  try {
    const dir = path.join(root, relativeDir)
    fs.mkdirSync(dir, { recursive: true })
    const binPath = path.join(dir, bin)
    fs.writeFileSync(binPath, '#!/bin/sh\nexit 0\n')
    fs.chmodSync(binPath, 0o755)
    process.env.PATH = dir
    return await fn({ root, dir, binPath })
  } finally {
    process.env.PATH = originalPath
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe('parseVersion', () => {
  it('parses the four version strings these CLIs actually print', () => {
    assert.deepEqual(parseVersion('2.1.223 (Claude Code)'), { major: 2, minor: 1, patch: 223 })
    assert.deepEqual(parseVersion('codex-cli 0.159.3'), { major: 0, minor: 159, patch: 3 })
    assert.deepEqual(parseVersion('0.34.0'), { major: 0, minor: 34, patch: 0 })
    assert.deepEqual(parseVersion('1.2.3+abc123'), { major: 1, minor: 2, patch: 3 })
  })

  it('returns null for text without three numeric segments', () => {
    for (const text of ['', '   ', 'unknown', 'latest', 'no version here', '1.2']) {
      assert.equal(parseVersion(text), null, `parseVersion(${JSON.stringify(text)}) must be null`)
    }
  })
})

describe('isNewerVersion', () => {
  it('compares the three numeric segments', () => {
    assert.equal(isNewerVersion('2.1.289', '2.1.223'), true)
    assert.equal(isNewerVersion('2.1.223', '2.1.223'), false)
    assert.equal(isNewerVersion('2.1.100', '2.1.223'), false)
    assert.equal(isNewerVersion('0.159.3', '0.34.0'), true, 'minor versions compare numerically, not as text')
  })

  it('is false whenever either side is unparseable', () => {
    assert.equal(isNewerVersion('nope', '2.1.223'), false)
    assert.equal(isNewerVersion('2.1.289', 'nope'), false)
    assert.equal(isNewerVersion('', ''), false)
  })
})

describe('detectInstallShape', () => {
  it('classifies npm, homebrew and native installs', () => {
    assert.equal(detectInstallShape(NPM_CLAUDE), 'npm')
    assert.equal(detectInstallShape('/opt/homebrew/Cellar/claude-code/2.1.223/bin/claude'), 'homebrew')
    assert.equal(detectInstallShape('/opt/homebrew/Caskroom/claude/2.1.223/claude'), 'homebrew')
    assert.equal(detectInstallShape(KIMI_NATIVE), 'native')
  })

  it('refuses to guess for anything else', () => {
    assert.equal(detectInstallShape(PLAIN_CLAUDE), 'unknown')
    assert.equal(detectInstallShape('claude'), 'unknown')
    assert.equal(detectInstallShape(''), 'unknown')
  })
})

describe('npmPathForBin', () => {
  // Contract adjudicated by the spec owner (spec §7, Issue #3178): npm is derived
  // from the node_modules tree that owns the binary, so a native or Homebrew
  // binary can never be "upgraded" into an npm prefix by mistake. The earlier
  // `<prefix>/bin/<name>` example in the task text was wrong and is superseded.
  it('derives the npm from the prefix that owns the node_modules tree', () => {
    assert.equal(
      npmPathForBin('/Users/x/.nvm/versions/node/v25.8.0/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe'),
      '/Users/x/.nvm/versions/node/v25.8.0/bin/npm',
    )
    assert.equal(npmPathForBin('/usr/local/node_modules/@openai/codex/bin/codex.js'), '/usr/local/bin/npm')
  })

  it('returns null for anything not installed through a node_modules tree', () => {
    assert.equal(npmPathForBin('/x/bin/claude'), null)
    assert.equal(npmPathForBin('/Users/test/.kimi-code/bin/kimi'), null)
    assert.equal(npmPathForBin('/opt/homebrew/Cellar/claude-code/1.0/bin/claude'), null)
    assert.equal(npmPathForBin('/usr/local/claude'), null)
    assert.equal(npmPathForBin('claude'), null)
    assert.equal(npmPathForBin(''), null)
  })
})

describe('createUpdateChecker', () => {
  it('reports available when the registry latest is newer', async () => {
    const seen = []
    const checker = createUpdateChecker(checkerOptions({
      fetchImpl: async (url, options) => {
        seen.push({ url, options })
        return registryLatest('2.1.289')
      },
    }))
    const payload = await checker.check([agentRow()])
    assert.equal(typeof payload.checkedAt, 'number')
    const update = payload.updates.claude
    assert.equal(update.state, 'available')
    assert.equal(update.latest, '2.1.289')
    assert.match(String(update.current), /2\.1\.223/)
    assert.equal(update.channel, 'npm')
    assert.equal(update.installShape, 'npm')
    assert.equal(update.supported, true)
    assert.equal(seen.length, 1)
    assert.match(seen[0].url, /^https:\/\/registry\.npmjs\.org\//)
    assert.match(seen[0].url, /claude-code/)
    assert.match(seen[0].url, /\/latest$/)
  })

  it('reports current when the registry latest is equal or older', async () => {
    const equal = createUpdateChecker(checkerOptions({ fetchImpl: async () => registryLatest('2.1.223') }))
    assert.equal((await equal.check([agentRow()])).updates.claude.state, 'current')

    const older = createUpdateChecker(checkerOptions({ fetchImpl: async () => registryLatest('2.1.100') }))
    assert.equal((await older.check([agentRow()])).updates.claude.state, 'current')
  })

  it('reports unknown — never current — for every unusable registry answer', async () => {
    const cases = {
      'fetch throws': async () => { throw new Error('getaddrinfo ENOTFOUND registry.npmjs.org') },
      'fetch times out': async () => {
        throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
      },
      'non-200 response': async () => registryNotFound(),
      'unparseable body': async () => registryGarbage(),
      'unusable latest value': async () => registryLatest('not-a-version'),
    }
    for (const [name, fetchImpl] of Object.entries(cases)) {
      const checker = createUpdateChecker(checkerOptions({ fetchImpl }))
      const update = (await checker.check([agentRow()])).updates.claude
      assert.equal(update.state, 'unknown', `${name} must be reported as unknown`)
      assert.notEqual(update.state, 'current', `${name} must never render as up to date`)
    }
  })

  it('reports unknown — never current — when the installed version cannot be parsed', async () => {
    const checker = createUpdateChecker(checkerOptions({ fetchImpl: async () => registryLatest('2.1.289') }))
    const update = (await checker.check([agentRow({ version: 'unknown' })])).updates.claude
    assert.equal(update.state, 'unknown', 'an impossible comparison is not "already up to date"')
    assert.notEqual(update.state, 'current')
  })

  it('does not fetch again inside the TTL, expires the cache, and honours refresh', async () => {
    let calls = 0
    let clock = 1_000_000
    const cache = new Map()
    const checker = createUpdateChecker(checkerOptions({
      now: () => clock,
      ttlMs: 6 * 60 * 60 * 1000,
      cache,
      fetchImpl: async () => {
        calls += 1
        return registryLatest('2.1.289')
      },
    }))

    const first = await checker.check([agentRow()])
    assert.equal(calls, 1)
    assert.equal(first.updates.claude.state, 'available')

    clock += 60 * 60 * 1000
    const second = await checker.check([agentRow()])
    assert.equal(calls, 1, 'a second call inside the TTL must not fetch again')
    assert.equal(second.updates.claude.state, 'available', 'the cached verdict must survive')

    clock += 6 * 60 * 60 * 1000
    await checker.check([agentRow()])
    assert.equal(calls, 2, 'the cache must expire once the TTL has passed')

    await checker.check([agentRow()], { refresh: true })
    assert.equal(calls, 3, 'refresh must force a fresh fetch')
  })

  it('never fetches for an agent that is not installed', async () => {
    let calls = 0
    const checker = createUpdateChecker(checkerOptions({
      fetchImpl: async () => {
        calls += 1
        return registryLatest('2.1.289')
      },
    }))
    const payload = await checker.check([agentRow({ installed: false, version: '' })])
    assert.equal(calls, 0, 'an uninstalled agent must not trigger a registry request')
    assert.equal(payload.updates.claude.state, 'unknown')
    assert.equal(payload.updates.claude.supported, false)
  })

  it('queries the registry with a 5 s abort signal', async () => {
    const originalTimeout = AbortSignal.timeout
    const seen = []
    let budget = null
    AbortSignal.timeout = function patched(ms) {
      budget = ms
      return originalTimeout.call(AbortSignal, ms)
    }
    try {
      const checker = createUpdateChecker(checkerOptions({
        fetchImpl: async (url, options) => {
          seen.push(options)
          return registryLatest('2.1.289')
        },
      }))
      await checker.check([agentRow()])
    } finally {
      AbortSignal.timeout = originalTimeout
    }
    assert.equal(budget, 5000, 'the registry request must use AbortSignal.timeout(5000)')
    assert.equal(seen.length, 1)
    assert.ok(seen[0].signal instanceof AbortSignal, 'fetch must be handed an abort signal')
  })

  it('never queries npm for a self-distributed CLI', async () => {
    let calls = 0
    const checker = createUpdateChecker(checkerOptions({
      fetchImpl: async () => {
        calls += 1
        return registryLatest('9.9.9')
      },
    }))
    const payload = await checker.check([agentRow({ id: 'kimi', version: '0.34.0' })])
    assert.equal(calls, 0, 'kimi ships natively; npm must never be queried for its version')
    const update = payload.updates.kimi
    assert.equal(update.channel, 'self')
    assert.equal(update.installShape, 'native')
    assert.equal(update.supported, true)
    assert.equal(update.state, 'unknown', 'an unavailable check must not read as up to date')
    assert.notEqual(update.state, 'available')
  })

  it('gates supported on the update channel plus the detected install shape', async () => {
    const checker = createUpdateChecker(checkerOptions({ fetchImpl: async () => registryLatest('2.1.289') }))
    const payload = await checker.check([
      agentRow({ id: 'claude' }),
      agentRow({ id: 'codex', version: '0.159.3' }),
      agentRow({ id: 'qwen', version: '0.12.0' }),
      agentRow({ id: 'kimi', version: '0.34.0' }),
    ])
    assert.equal(payload.updates.claude.supported, true, 'npm channel + npm install shape is upgradeable')
    assert.equal(payload.updates.codex.supported, false, 'a homebrew install is never upgraded through npm')
    assert.equal(payload.updates.qwen.supported, false, 'an unknown install shape is never upgraded')
    assert.equal(payload.updates.kimi.supported, true, 'self channel + native install shape is upgradeable')
  })
})

describe('runAgentUpdate', () => {
  it('npm shape installs the package through the sibling npm binary', async () => {
    await withFakeBin('node_modules/@anthropic-ai/claude-code/bin', 'claude', async ({ root }) => {
      const calls = []
      const probed = []
      const result = await runAgentUpdate('claude', {
        shape: 'npm',
        home: '/home/test',
        run: async (bin, args, opts) => {
          calls.push({ bin, args, opts })
          return { stdout: 'added 1 package in 4s', stderr: '' }
        },
        probeVersion: async (bin) => {
          probed.push(bin)
          return { installed: true, version: '2.1.289 (Claude Code)' }
        },
      })
      assert.equal(calls.length, 1)
      assert.match(calls[0].bin, /\/bin\/npm$/, 'the npm that owns the binary must be used')
      assert.ok(calls[0].bin.startsWith(root), 'npm must come from the prefix that installed the binary')
      assert.notEqual(calls[0].bin, 'npm', 'a bare PATH lookup is not the npm that owns the binary')
      assert.deepEqual(calls[0].args, ['install', '-g', '@anthropic-ai/claude-code@latest'])
      assert.equal(calls[0].opts.cwd, '/home/test', 'npm must run from the user home, not a project directory')
      assert.deepEqual(probed, ['claude'], 'the version must be re-probed after the upgrade')
      assert.equal(result.ok, true)
      assert.equal(result.version, '2.1.289 (Claude Code)')
    })
  })

  it('self shape runs the constant self-update command', async () => {
    const calls = []
    const result = await runAgentUpdate('kimi', {
      shape: 'native',
      home: '/home/test',
      run: async (bin, args, opts) => {
        calls.push({ bin, args, opts })
        return { stdout: 'upgraded', stderr: '' }
      },
      probeVersion: async () => ({ installed: true, version: '0.35.0' }),
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].bin, 'kimi')
    assert.deepEqual(calls[0].args, ['upgrade'])
    assert.equal(calls[0].opts.cwd, '/home/test')
    assert.equal(result.ok, true)
    assert.equal(result.version, '0.35.0')
  })

  it('refuses an install shape it cannot upgrade', async () => {
    let ran = false
    const result = await runAgentUpdate('claude', {
      shape: 'unknown',
      home: '/home/test',
      run: async () => {
        ran = true
        return { stdout: '', stderr: '' }
      },
    })
    assert.equal(result.ok, false)
    assert.equal(result.error, 'update-unsupported')
    assert.equal(ran, false, 'an unsupported shape must not run anything')
  })

  it('reports update-failed with a credential-free detail', async () => {
    await withFakeBin('node_modules/@anthropic-ai/claude-code/bin', 'claude', async () => {
      const leaky = [
        'npm ERR! code EACCES',
        'npm ERR! https://deploy:secretpass@registry.example.com/ denied',
        'npm ERR! //user:pass@registry.example.com/ denied',
        'npm ERR! :_authToken=npm_AbCdEf1234567890token',
      ].join('\n')
      const result = await runAgentUpdate('claude', {
        shape: 'npm',
        home: '/home/test',
        run: async () => {
          throw Object.assign(new Error(leaky), { stdout: leaky, stderr: leaky })
        },
        probeVersion: async () => ({ installed: true, version: '2.1.223' }),
      })
      assert.equal(result.ok, false)
      assert.equal(result.error, 'update-failed')
      assert.equal(typeof result.detail, 'string')
      assert.ok(result.detail.length > 0, 'a failure must carry a readable reason')
      assert.ok(result.detail.length <= 300, 'the failure detail must stay bounded')
      assert.equal(result.detail.includes('secretpass'), false, 'the URL password must be stripped')
      assert.equal(result.detail.includes('deploy'), false, 'the URL userinfo must be stripped')
      assert.equal(result.detail.includes('npm_AbCdEf1234567890token'), false, 'the npm token must be stripped')
      assert.equal(/_authToken=(?!\*)/.test(result.detail), false, 'the auth token value must be stripped')
      assert.equal(/npm_[A-Za-z0-9]{8,}/.test(result.detail), false, 'no npm token fragment may survive')
    })
  })
})
