import assert from 'node:assert/strict'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'
import { generateCliSpeech } from './cli-speech.js'
import { OmnimuxError } from './errors.js'

describe('generateCliSpeech', () => {
  const mockGuardPlan = {
    modelId: 'gemini-3.8-flash-tts',
    operationId: 'text_to_speech',
    prompt: '测试语音生成',
    byok: true,
  }

  it('generates speech successfully with mocked runner', async () => {
    const tempDir = join(tmpdir(), `test-cli-speech-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
    const dest = join(tempDir, 'output.wav')

    const mockRunner = async (bin, args, options) => {
      assert.equal(bin, 'opencli')
      assert.deepEqual(args.slice(0, 2), ['gemini', 'tts'])
      assert.equal(args[2], '测试语音生成')
      assert.equal(args[3], '--output')
      assert.equal(args[4], dest)
      assert.equal(args[5], '-f')
      assert.equal(args[6], 'json')

      // Simulate opencli writing the output wav file
      await writeFile(dest, Buffer.from('RIFF mock wav data 1234567890'))

      return {
        stdout: JSON.stringify([
          {
            Status: 'Success',
            Character: 'Nika',
            Duration: '3.5s',
            Size: '30 bytes',
            OutputPath: dest,
            Text: '测试语音生成',
          },
        ]),
        stderr: '',
      }
    }

    const res = await generateCliSpeech({
      route: { modelId: 'gemini-3.8-flash-tts' },
      guardPlan: mockGuardPlan,
      payload: { input: '测试语音生成' },
      dest,
      runner: mockRunner,
    })

    assert.equal(res.mode, 'live')
    assert.equal(res.model, 'gemini-3.8-flash-tts')
    assert.equal(res.duration, 3.5)
    assert.equal(res.dest, dest)

    await rm(tempDir, { recursive: true, force: true })
  })

  it('rejects empty text prompt', async () => {
    await assert.rejects(
      () =>
        generateCliSpeech({
          route: { modelId: 'gemini-3.8-flash-tts' },
          guardPlan: { ...mockGuardPlan, prompt: '' },
          payload: { input: '   ' },
          dest: '/tmp/noop.wav',
        }),
      (err) => err instanceof OmnimuxError && err.code === 'omnimux-invalid-request',
    )
  })

  it('fails if destination file was not created by CLI', async () => {
    const mockRunner = async () => ({
      stdout: JSON.stringify([{ Status: 'Success', Duration: '2.0s' }]),
      stderr: '',
    })

    await assert.rejects(
      () =>
        generateCliSpeech({
          route: { modelId: 'gemini-3.8-flash-tts' },
          guardPlan: mockGuardPlan,
          payload: { input: 'hello' },
          dest: '/tmp/nonexistent-cli-test-file.wav',
          runner: mockRunner,
        }),
      (err) => err instanceof OmnimuxError && err.code === 'omnimux-request-failed',
    )
  })

  it('handles ENOENT gracefully when opencli is missing', async () => {
    const mockRunner = async () => {
      const err = new Error('spawn opencli ENOENT')
      err.code = 'ENOENT'
      throw err
    }

    await assert.rejects(
      () =>
        generateCliSpeech({
          route: { modelId: 'gemini-3.8-flash-tts' },
          guardPlan: mockGuardPlan,
          payload: { input: 'hello' },
          dest: '/tmp/output.wav',
          runner: mockRunner,
        }),
      (err) =>
        err instanceof OmnimuxError &&
        err.message.includes('opencli executable not found'),
    )
  })

  it('handles signal abortion', async () => {
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      () =>
        generateCliSpeech({
          route: { modelId: 'gemini-3.8-flash-tts' },
          guardPlan: mockGuardPlan,
          payload: { input: 'hello' },
          dest: '/tmp/output.wav',
          signal: controller.signal,
        }),
      (err) => err instanceof OmnimuxError && err.code === 'omnimux-aborted',
    )
  })
})
