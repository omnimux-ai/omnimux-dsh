/**
 * nativeFilePicker seam: JXA/AppKit chooser contract.
 * The runner and platform are injected so no test ever runs real osascript.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PICKER_DEFAULT_PROMPTS,
  PickerError,
  createNativeFilePicker,
  parsePickedPaths,
  pickNativePath,
} from './native-picker.js'

function runOk(stdout) {
  return async (command, argv) => {
    assert.equal(command, 'osascript')
    return { stdout, stderr: '' }
  }
}

function runFail(message, stderr = '') {
  return async () => {
    const error = new Error(message)
    error.stderr = stderr
    throw error
  }
}

describe('parsePickedPaths', () => {
  it('parses the JSON path array and preserves newlines, tabs and trailing spaces', () => {
    const paths = [
      '/Users/x/a.png',
      '/Users/x/with\nnewline.png',
      '/Users/x/trailing space ',
      '/Users/x/tab\tname.png',
    ]
    assert.deepEqual(parsePickedPaths(JSON.stringify(paths)), paths)
    assert.deepEqual(parsePickedPaths(`${JSON.stringify(paths)}\n`), paths)
  })

  it('treats empty or whitespace-only output as cancellation', () => {
    assert.deepEqual(parsePickedPaths(''), [])
    assert.deepEqual(parsePickedPaths('\n\n'), [])
  })

  it('rejects non-JSON or invalid payloads instead of treating them as cancel', () => {
    assert.throws(() => parsePickedPaths('/tmp/a.png\n/tmp/b.png'), /non-JSON/)
    assert.throws(() => parsePickedPaths('{"paths":[]}'), /invalid/)
    assert.throws(() => parsePickedPaths('["/a", 42]'), /invalid/)
  })

  it('rejects non-string helper output explicitly', () => {
    assert.throws(() => parsePickedPaths(undefined), /non-string/)
    assert.throws(() => parsePickedPaths(Buffer.from('[]')), /non-string/)
  })
})

describe('pickNativePath kind and platform gates', () => {
  it('rejects an unknown kind before touching the platform', async () => {
    for (const kind of ['folder', 'dir', '', undefined, null, 42]) {
      await assert.rejects(
        () => pickNativePath(kind, { platform: 'darwin', run: runOk('/tmp/x\n') }),
        (error) => error instanceof PickerError && error.code === 'picker-invalid-kind',
        `kind=${JSON.stringify(kind)} should be rejected`,
      )
    }
  })

  it('throws picker-unsupported on non-darwin platforms without invoking the runner', async () => {
    for (const platform of ['linux', 'win32', 'freebsd']) {
      let called = false
      const run = async () => {
        called = true
        return { stdout: '', stderr: '' }
      }
      await assert.rejects(
        () => pickNativePath('file', { platform, run }),
        (error) => error instanceof PickerError && error.code === 'picker-unsupported',
        `platform=${platform} should be unsupported`,
      )
      assert.equal(called, false)
    }
  })
})

describe('pickNativePath macOS JXA script', () => {
  it('runs osascript JXA with an accessory NSOpenPanel and no Apple Events', async () => {
    let seen = null
    const result = await pickNativePath('file', {
      platform: 'darwin',
      run: async (command, argv) => {
        seen = { command, argv }
        return { stdout: `${JSON.stringify(['/Users/x/a.png', '/Users/x/b.jpg'])}\n`, stderr: '' }
      },
    })
    assert.equal(seen.command, 'osascript')
    assert.deepEqual(seen.argv.slice(0, 3), ['-l', 'JavaScript', '-e'])
    const script = seen.argv[3]
    assert.match(script, /NSOpenPanel/)
    assert.match(script, /NSApplicationActivationPolicyAccessory/)
    assert.match(script, /setCanChooseFiles\(true\)/)
    assert.match(script, /setCanChooseDirectories\(false\)/)
    assert.match(script, /setAllowsMultipleSelection\(true\)/)
    assert.match(script, /Number\(panel\.runModal\) !== 1/)
    assert.match(script, /return JSON\.stringify\(picked\)/)
    assert.doesNotMatch(script, /picked\.join/)
    assert.match(script, new RegExp(PICKER_DEFAULT_PROMPTS.file))
    assert.doesNotMatch(script, /System Events/)
    assert.doesNotMatch(script, /choose file/)
    assert.deepEqual(result, { path: '/Users/x/a.png', paths: ['/Users/x/a.png', '/Users/x/b.jpg'] })
  })

  it('selects directories only and honours the caller prompt', async () => {
    let script = ''
    const result = await pickNativePath('directory', {
      platform: 'darwin',
      prompt: '选择要添加的文件夹',
      run: async (_command, argv) => {
        script = argv[3]
        return { stdout: `${JSON.stringify(['/Users/x/project'])}\n`, stderr: '' }
      },
    })
    assert.match(script, /setCanChooseFiles\(false\)/)
    assert.match(script, /setCanChooseDirectories\(true\)/)
    assert.match(script, /选择要添加的文件夹/)
    assert.deepEqual(result, { path: '/Users/x/project', paths: ['/Users/x/project'] })
  })

  it('treats empty stdout as cancellation and only osascript -128 execution errors as legacy cancel', async () => {
    const cancelled = await pickNativePath('file', { platform: 'darwin', run: runOk('\n') })
    assert.deepEqual(cancelled, { path: null, paths: [] })

    const legacyCancel = Object.assign(new Error('osascript exited with code 1'), {
      code: 1,
      stderr: 'execution error: User canceled. (-128)',
    })
    const legacy = await pickNativePath('file', {
      platform: 'darwin',
      run: async () => { throw legacyCancel },
    })
    assert.deepEqual(legacy, { path: null, paths: [] })
  })

  it('does not treat arbitrary -128 text as a cancellation', async () => {
    const messageOnly = Object.assign(new Error('User canceled. (-128)'), { code: 1, stderr: '' })
    await assert.rejects(
      () => pickNativePath('file', { platform: 'darwin', run: async () => { throw messageOnly } }),
      (error) => error instanceof PickerError && error.code === 'picker-failed',
    )

    const unrelatedStderr = Object.assign(new Error('osascript exited with code 1'), {
      code: 1,
      stderr: 'helper failed with status -128 while decoding',
    })
    await assert.rejects(
      () => pickNativePath('file', { platform: 'darwin', run: async () => { throw unrelatedStderr } }),
      (error) => error instanceof PickerError && error.code === 'picker-failed',
    )

    const nonNumericCode = Object.assign(new Error('open failed'), {
      code: 'EACCES',
      stderr: 'execution error: User canceled. (-128)',
    })
    await assert.rejects(
      () => pickNativePath('file', { platform: 'darwin', run: async () => { throw nonNumericCode } }),
      (error) => error instanceof PickerError && error.code === 'picker-failed',
    )

    const otherAppleScriptError = Object.assign(new Error('osascript exited with code 1'), {
      code: 1,
      stderr: 'execution error: Something went wrong. (-2700)',
    })
    await assert.rejects(
      () => pickNativePath('file', { platform: 'darwin', run: async () => { throw otherAppleScriptError } }),
      (error) => error instanceof PickerError && error.code === 'picker-failed',
    )
  })

  it('maps invalid picker output to picker-failed and keeps the raw stdout diagnosis', async () => {
    await assert.rejects(
      () => pickNativePath('file', { platform: 'darwin', run: runOk('not a json payload') }),
      (error) => error instanceof PickerError
        && error.code === 'picker-failed'
        && /non-JSON/.test(error.message)
        && error.stdout === 'not a json payload',
    )
  })

  it('maps non-string helper output to picker-failed instead of cancel', async () => {
    await assert.rejects(
      () => pickNativePath('file', {
        platform: 'darwin',
        run: async () => ({ stdout: undefined, stderr: '' }),
      }),
      (error) => error instanceof PickerError
        && error.code === 'picker-failed'
        && /non-string/.test(error.message)
        && error.stdout === undefined,
    )
  })

  it('keeps stdout from a non-zero helper exit as the picker-failed diagnosis', async () => {
    await assert.rejects(
      () => pickNativePath('file', {
        platform: 'darwin',
        run: async () => {
          const failure = new Error('osascript exited with code 1')
          failure.stderr = 'syntax error near line 3'
          failure.stdout = 'partial-payload'
          throw failure
        },
      }),
      (error) => error instanceof PickerError
        && error.code === 'picker-failed'
        && /syntax error/.test(error.message)
        && error.stdout === 'partial-payload',
    )
  })

  it('truncates the stdout diagnosis to 500 characters', async () => {
    const long = 'x'.repeat(600)
    await assert.rejects(
      () => pickNativePath('file', { platform: 'darwin', run: runOk(long) }),
      (error) => error instanceof PickerError
        && error.code === 'picker-failed'
        && error.stdout.length === 500,
    )
  })

  it('maps runner failures to picker-failed', async () => {
    await assert.rejects(
      () => pickNativePath('file', {
        platform: 'darwin',
        run: runFail('osascript exited with code 1', 'syntax error'),
      }),
      (error) => error instanceof PickerError
        && error.code === 'picker-failed'
        && /syntax error/.test(error.message),
    )
  })
})

describe('picker failure diagnostics', () => {
  it('logs one line with code, stdout length and a sample on picker-failed', async () => {
    const logs = []
    await assert.rejects(
      () => pickNativePath('file', {
        platform: 'darwin',
        run: runOk('not a json payload'),
        log: (message) => logs.push(message),
      }),
      (error) => error instanceof PickerError && error.code === 'picker-failed',
    )
    assert.equal(logs.length, 1)
    assert.match(logs[0], /\[nativeFilePicker\] picker-failed stdout=18chars/)
    assert.match(logs[0], /sample="not a json payload"/)
  })

  it('truncates the logged sample to 200 characters while keeping the full length', async () => {
    const logs = []
    const long = 'x'.repeat(600)
    await assert.rejects(
      () => pickNativePath('file', {
        platform: 'darwin',
        run: runOk(long),
        log: (message) => logs.push(message),
      }),
      (error) => error instanceof PickerError && error.code === 'picker-failed',
    )
    assert.equal(logs.length, 1)
    assert.match(logs[0], /stdout=600chars/)
    const sample = /sample=(.+)$/.exec(logs[0])
    assert.ok(sample)
    assert.equal(JSON.parse(sample[1]).length, 200)
  })

  it('logs a zero-length stdout for a non-string helper payload', async () => {
    const logs = []
    await assert.rejects(
      () => pickNativePath('file', {
        platform: 'darwin',
        run: async () => ({ stdout: undefined, stderr: '' }),
        log: (message) => logs.push(message),
      }),
      (error) => error instanceof PickerError && error.code === 'picker-failed',
    )
    assert.equal(logs.length, 1)
    assert.match(logs[0], /stdout=0chars/)
  })

  it('stays silent on success and cancellation', async () => {
    const logs = []
    const picked = await pickNativePath('file', {
      platform: 'darwin',
      run: runOk(JSON.stringify(['/tmp/a.png'])),
      log: (message) => logs.push(message),
    })
    assert.deepEqual(picked, { path: '/tmp/a.png', paths: ['/tmp/a.png'] })
    const cancelled = await pickNativePath('file', {
      platform: 'darwin',
      run: runOk(''),
      log: (message) => logs.push(message),
    })
    assert.deepEqual(cancelled, { path: null, paths: [] })
    assert.deepEqual(logs, [])
  })
})

describe('createNativeFilePicker seam', () => {
  it('forwards kind, prompt and result through a single shared implementation', async () => {
    const calls = []
    const seam = createNativeFilePicker({
      platform: 'darwin',
      run: async (_command, argv) => {
        calls.push(argv[3])
        return { stdout: `${JSON.stringify(['/tmp/hero.png'])}\n`, stderr: '' }
      },
    })
    const result = await seam.pick('file', { prompt: '选择要挂到产品的文件' })
    assert.deepEqual(result, { path: '/tmp/hero.png', paths: ['/tmp/hero.png'] })
    assert.equal(calls.length, 1)
    assert.match(calls[0], /选择要挂到产品的文件/)
  })

  it('answers picker-unsupported on non-darwin for every call', async () => {
    const seam = createNativeFilePicker({ platform: 'linux' })
    await assert.rejects(
      () => seam.pick('file'),
      (error) => error instanceof PickerError && error.code === 'picker-unsupported',
    )
  })
})
