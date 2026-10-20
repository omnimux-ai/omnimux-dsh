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
  it('splits one POSIX path per line and drops empty rows', () => {
    assert.deepEqual(parsePickedPaths('/Users/x/a.png\n/Users/x/b.jpg\n'), [
      '/Users/x/a.png',
      '/Users/x/b.jpg',
    ])
    assert.deepEqual(parsePickedPaths(''), [])
    assert.deepEqual(parsePickedPaths('\n\n'), [])
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
        return { stdout: '/Users/x/a.png\n/Users/x/b.jpg\n', stderr: '' }
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
        return { stdout: '/Users/x/project\n', stderr: '' }
      },
    })
    assert.match(script, /setCanChooseFiles\(false\)/)
    assert.match(script, /setCanChooseDirectories\(true\)/)
    assert.match(script, /选择要添加的文件夹/)
    assert.deepEqual(result, { path: '/Users/x/project', paths: ['/Users/x/project'] })
  })

  it('treats empty stdout as cancellation and keeps the -128 compatibility arm', async () => {
    const cancelled = await pickNativePath('file', { platform: 'darwin', run: runOk('\n') })
    assert.deepEqual(cancelled, { path: null, paths: [] })

    const legacy = await pickNativePath('file', {
      platform: 'darwin',
      run: runFail('User canceled. (-128)'),
    })
    assert.deepEqual(legacy, { path: null, paths: [] })
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

describe('createNativeFilePicker seam', () => {
  it('forwards kind, prompt and result through a single shared implementation', async () => {
    const calls = []
    const seam = createNativeFilePicker({
      platform: 'darwin',
      run: async (_command, argv) => {
        calls.push(argv[3])
        return { stdout: '/tmp/hero.png\n', stderr: '' }
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
