import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { launchAgentLogin, probeAgentAuth } from './auth.js'

const HOME = '/home/test'

/**
 * execFile-shaped rejection: a non-zero exit surfaces as an error carrying the
 * numeric exit code, exactly what `promisify(execFile)` produces.
 * @param {number} code
 * @param {{ stdout?: string, stderr?: string }} [output]
 */
function exitError(code, { stdout = '', stderr = '' } = {}) {
  const error = new Error(`Command failed with exit code ${code}`)
  error.code = code
  error.stdout = stdout
  error.stderr = stderr
  return error
}

/**
 * A read-only `node:fs` stand-in over an in-memory file map, so credential
 * probing never touches the developer machine's real home directory.
 * @param {Array<[string, string]>} entries
 */
function virtualFs(entries) {
  const files = new Map(entries)
  const dirs = new Set()
  for (const file of files.keys()) {
    let dir = path.dirname(file)
    while (dir && dir !== path.dirname(dir)) {
      dirs.add(dir)
      dir = path.dirname(dir)
    }
  }
  const existsSync = (target) => files.has(String(target)) || dirs.has(String(target))
  const readFileSync = (target) => {
    const key = String(target)
    if (!files.has(key)) throw Object.assign(new Error(`ENOENT: no such file '${key}'`), { code: 'ENOENT' })
    return files.get(key)
  }
  const readdirSync = (target, options) => {
    const dir = String(target)
    const names = [...files.keys()]
      .filter((file) => path.dirname(file) === dir)
      .map((file) => path.basename(file))
    if (!dirs.has(dir) && names.length === 0) {
      throw Object.assign(new Error(`ENOENT: no such directory '${dir}'`), { code: 'ENOENT' })
    }
    if (options && options.withFileTypes) {
      return names.map((name) => ({ name, isFile: () => true, isDirectory: () => false }))
    }
    return names
  }
  return {
    existsSync,
    readFileSync,
    readdirSync,
    statSync: (target) => ({
      isFile: () => files.has(String(target)),
      isDirectory: () => dirs.has(String(target)),
    }),
    promises: {
      readFile: async (target) => readFileSync(target),
      readdir: async (target, options) => readdirSync(target, options),
    },
  }
}

const KIMI_CREDENTIALS = path.join(HOME, '.kimi-code', 'credentials', 'kimi-code.json')
const QWEN_CREDENTIALS = path.join(HOME, '.qwen', 'oauth_creds.json')

describe('probeAgentAuth · claude (command probe)', () => {
  it('reports signed-in on exit 0', async () => {
    const calls = []
    const result = await probeAgentAuth('claude', {
      home: HOME,
      run: async (bin, args, opts) => {
        calls.push({ bin, args, opts })
        return { stdout: '{"loggedIn":true,"authMethod":"oauth"}\n', stderr: '' }
      },
    })
    assert.deepEqual(result, { state: 'signed-in', method: 'command' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].bin, 'claude')
    assert.deepEqual(calls[0].args, ['auth', 'status'])
    assert.equal(calls[0].opts.timeout, 5000, 'the command probe must time out at 5 s')
  })

  it('honours an explicit timeoutMs', async () => {
    const calls = []
    await probeAgentAuth('claude', {
      home: HOME,
      timeoutMs: 1234,
      run: async (bin, args, opts) => {
        calls.push({ bin, args, opts })
        return { stdout: '{"loggedIn":true}', stderr: '' }
      },
    })
    assert.equal(calls[0].opts.timeout, 1234)
  })

  it('reports signed-out on exit 1', async () => {
    const result = await probeAgentAuth('claude', {
      home: HOME,
      run: async () => {
        throw exitError(1, { stderr: 'Not logged in. Run claude auth login to authenticate.' })
      },
    })
    assert.deepEqual(result, { state: 'signed-out', method: 'command' })
  })

  it('reports unknown — never signed-out — when the process cannot be spawned', async () => {
    const result = await probeAgentAuth('claude', {
      home: HOME,
      run: async () => {
        throw Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })
      },
    })
    assert.equal(result.state, 'unknown')
    assert.equal(result.method, 'command')
    assert.notEqual(result.state, 'signed-out', 'a spawn failure is not proof of being signed out')
  })

  it('reports unknown — never signed-out — on a timeout', async () => {
    const result = await probeAgentAuth('claude', {
      home: HOME,
      run: async () => {
        throw Object.assign(new Error('Command failed: ETIMEDOUT'), {
          code: 'ETIMEDOUT',
          killed: true,
          signal: 'SIGTERM',
        })
      },
    })
    assert.equal(result.state, 'unknown')
    assert.notEqual(result.state, 'signed-out', 'a timeout is not proof of being signed out')
  })

  it('reports unknown for an exit code that is neither 0 nor 1', async () => {
    const result = await probeAgentAuth('claude', {
      home: HOME,
      run: async () => {
        throw exitError(2, { stderr: 'unexpected failure' })
      },
    })
    assert.equal(result.state, 'unknown')
    assert.notEqual(result.state, 'signed-out')
  })
})

describe('probeAgentAuth · codex (exit code is the only verdict)', () => {
  it('reports signed-in on exit 0 with empty stdout', async () => {
    const calls = []
    const result = await probeAgentAuth('codex', {
      home: HOME,
      run: async (bin, args) => {
        calls.push({ bin, args })
        return { stdout: '', stderr: 'Logged in using ChatGPT\n' }
      },
    })
    assert.deepEqual(result, { state: 'signed-in', method: 'command' })
    assert.equal(calls[0].bin, 'codex')
    assert.deepEqual(calls[0].args, ['login', 'status'])
  })

  it('reports signed-out on exit 1 with empty stdout', async () => {
    const result = await probeAgentAuth('codex', {
      home: HOME,
      run: async () => {
        throw exitError(1, { stderr: 'Not logged in\n' })
      },
    })
    assert.deepEqual(result, { state: 'signed-out', method: 'command' })
  })

  it('never parses stdout: a loggedIn:false payload on exit 0 stays signed-in', async () => {
    const result = await probeAgentAuth('codex', {
      home: HOME,
      run: async () => ({ stdout: '{"loggedIn":false}', stderr: '' }),
    })
    assert.equal(result.state, 'signed-in', 'codex has no JSON verdict; only the exit code decides')
  })
})

describe('probeAgentAuth · kimi (file probe)', () => {
  it('reports signed-in when both token keys are non-empty', async () => {
    const fsImpl = virtualFs([[
      KIMI_CREDENTIALS,
      JSON.stringify({ access_token: 'access-value', refresh_token: 'refresh-value' }),
    ]])
    const result = await probeAgentAuth('kimi', { home: HOME, fsImpl })
    assert.deepEqual(result, { state: 'signed-in', method: 'file' })
  })

  it('reports signed-out when the credentials file is missing', async () => {
    const result = await probeAgentAuth('kimi', { home: HOME, fsImpl: virtualFs([]) })
    assert.deepEqual(result, { state: 'signed-out', method: 'file' })
  })

  it('reports unknown — never signed-out — for malformed JSON', async () => {
    const fsImpl = virtualFs([[KIMI_CREDENTIALS, '{ this is not json']])
    const result = await probeAgentAuth('kimi', { home: HOME, fsImpl })
    assert.equal(result.state, 'unknown')
    assert.equal(result.method, 'file')
    assert.notEqual(result.state, 'signed-out', 'an unreadable credential file is not a signed-out verdict')
  })

  it('reports signed-out when a required token is present but empty', async () => {
    const fsImpl = virtualFs([[
      KIMI_CREDENTIALS,
      JSON.stringify({ access_token: '', refresh_token: 'refresh-value' }),
    ]])
    const result = await probeAgentAuth('kimi', { home: HOME, fsImpl })
    assert.deepEqual(result, { state: 'signed-out', method: 'file' })
  })
})

describe('probeAgentAuth · qwen (file probe)', () => {
  it('reports signed-out when oauth_creds.json is missing', async () => {
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl: virtualFs([]) })
    assert.deepEqual(result, { state: 'signed-out', method: 'file' })
  })

  it('reports signed-in when access_token is non-empty', async () => {
    const fsImpl = virtualFs([[QWEN_CREDENTIALS, JSON.stringify({ access_token: 'qwen-access' })]])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl })
    assert.deepEqual(result, { state: 'signed-in', method: 'file' })
  })
})

describe('probeAgentAuth · unknown agent', () => {
  it('answers unknown/none without running or reading anything', async () => {
    let ran = false
    const result = await probeAgentAuth('nope', {
      home: HOME,
      run: async () => {
        ran = true
        return { stdout: '', stderr: '' }
      },
      fsImpl: virtualFs([]),
    })
    assert.deepEqual(result, { state: 'unknown', method: 'none' })
    assert.equal(ran, false)
  })
})

describe('probeAgentAuth · token secrecy', () => {
  const SENTINEL = 'sk-ant-SENTINEL-TOKEN-DO-NOT-LEAK-4f9c2b7e'

  it('never echoes a token read from a credential file', async () => {
    const fsImpl = virtualFs([[
      KIMI_CREDENTIALS,
      JSON.stringify({ access_token: SENTINEL, refresh_token: `${SENTINEL}-refresh` }),
    ]])
    const result = await probeAgentAuth('kimi', { home: HOME, fsImpl })
    assert.equal(result.state, 'signed-in')
    const serialized = JSON.stringify(result)
    assert.equal(serialized.includes(SENTINEL), false, 'the token value must never reach the result')
    assert.equal(serialized.includes('access_token'), false, 'credential key names must not be echoed')
    assert.equal(serialized.includes('refresh_token'), false, 'credential key names must not be echoed')
  })

  it('never echoes a token printed by a command probe', async () => {
    const result = await probeAgentAuth('claude', {
      home: HOME,
      run: async () => ({ stdout: JSON.stringify({ loggedIn: true, accessToken: SENTINEL }), stderr: '' }),
    })
    assert.equal(result.state, 'signed-in')
    assert.equal(JSON.stringify(result).includes(SENTINEL), false, 'the token value must never reach the result')
  })
})

describe('launchAgentLogin', () => {
  it('refuses a non-darwin platform without running anything', async () => {
    let ran = false
    const result = await launchAgentLogin('claude', {
      platform: 'linux',
      home: HOME,
      run: async () => {
        ran = true
        return { stdout: '', stderr: '' }
      },
    })
    assert.deepEqual(result, { ok: false, error: 'unsupported-platform' })
    assert.equal(ran, false)
  })

  it('refuses an agent that has no account login entry point', async () => {
    let ran = false
    const result = await launchAgentLogin('qwen', {
      platform: 'darwin',
      home: HOME,
      run: async () => {
        ran = true
        return { stdout: '', stderr: '' }
      },
    })
    assert.deepEqual(result, { ok: false, error: 'login-unsupported' })
    assert.equal(ran, false)
  })

  it('refuses an unknown agent id', async () => {
    const result = await launchAgentLogin('nope', {
      platform: 'darwin',
      home: HOME,
      run: async () => ({ stdout: '', stderr: '' }),
    })
    assert.deepEqual(result, { ok: false, error: 'unknown-agent' })
  })

  it('opens a terminal on darwin with a script built only from the capability table', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimux-agent-login-'))
    // Anything a request body could smuggle in must never reach the script.
    const HOSTILE = 'rm -rf / #request-supplied'
    try {
      const calls = []
      const result = await launchAgentLogin('claude', {
        platform: 'darwin',
        home: HOME,
        scriptDir: dir,
        run: async (bin, args, opts) => {
          calls.push({ bin, args, opts })
          return { stdout: '', stderr: '' }
        },
        bin: HOSTILE,
        args: [HOSTILE],
        command: HOSTILE,
        body: { id: 'claude', args: [HOSTILE] },
      })
      assert.deepEqual(result, { ok: true, launched: true, mode: 'terminal' })

      const opener = calls.find((call) => call.bin === 'open')
      assert.ok(opener, 'darwin launch must use the `open` platform opener')
      assert.ok(opener.args.includes('Terminal'), 'the opener must target a real Terminal window')
      assert.ok(
        opener.args.some((arg) => String(arg).includes(dir)),
        'the opener must point at the generated login script',
      )

      const script = fs.readdirSync(dir)
        .map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
        .join('\n')
      assert.match(script, /claude/, 'the script must invoke the CLI login binary')
      assert.match(script, /auth\s+login/, 'the script must carry the CLI login arguments')
      assert.equal(script.includes('rm -rf'), false, 'the script is assembled from server constants only')
      assert.equal(
        opener.args.some((arg) => String(arg).includes('rm -rf')),
        false,
        'request-supplied data must never reach the opener',
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      assert.equal(fs.existsSync(dir), false, 'temporary directory must be cleaned up')
    }
  })
})
