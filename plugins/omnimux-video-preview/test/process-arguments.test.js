import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = resolve(testDir, '../../../.agent-reports/video-process-arguments')
const runner = join(testDir, 'fixtures/process-arguments-runner.mjs')
const sampleLimit = 20 * 1024 * 1024

// Executable fixtures record the real OS argument vector and produce only local
// placeholder outputs. If a shell is reintroduced, marker commands run in the
// same disposable directory and the literal-argument assertions fail.
const executableFixture = `#!${process.execPath}
import fs from 'node:fs'
import path from 'node:path'
const args = process.argv.slice(2)
const command = path.basename(process.argv[1])
const phase = command === 'ffprobe' ? 'probe'
  : args.includes('-vframes') ? 'cover'
  : args.includes('fps=1/3,scale=360:-2') ? 'sample' : 'scenes'
fs.appendFileSync(process.env.VIDEO_PROCESS_TRACE, JSON.stringify({ command, args, phase }) + '\\n')
if (process.env.VIDEO_PROCESS_FAIL.split(',').includes(phase)) process.exit(1)
if (phase === 'probe') process.stdout.write('12.8\\n')
else if (phase === 'scenes') process.stderr.write('pts_time:4.0\\npts_time:8.0\\n')
else {
  const output = args.at(-1)
  if (!output.startsWith(process.cwd() + path.sep)) process.exit(2)
  fs.writeFileSync(output, 'local fixture output')
}
`

function runCase(t, config = {}) {
  mkdirSync(fixtureRoot, { recursive: true })
  const dir = mkdtempSync(join(fixtureRoot, 'case-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  if (!config.missingPrograms) {
    for (const name of ['ffmpeg', 'ffprobe']) {
      writeFileSync(join(bin, name), executableFixture, { mode: 0o755 })
    }
  }
  const videoPath = join(dir, config.filename || 'ordinary clip 中文.mp4')
  mkdirSync(dirname(videoPath), { recursive: true })
  writeFileSync(videoPath, 'local input fixture')
  truncateSync(videoPath, config.size ?? sampleLimit + 1)
  const trace = join(dir, 'trace.jsonl')
  const output = execFileSync(process.execPath, [runner, JSON.stringify({ ...config, videoPath })], {
    cwd: dir,
    env: {
      ...process.env,
      PATH: config.missingPrograms ? bin : `${bin}:${process.env.PATH || ''}`,
      VIDEO_PROCESS_TRACE: trace,
      VIDEO_PROCESS_FAIL: (config.fail || []).join(','),
    },
    encoding: 'utf8',
    timeout: 15000,
  })
  const processes = existsSync(trace)
    ? readFileSync(trace, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    : []
  return { ...JSON.parse(output), processes, videoPath, dir }
}

function expectedConversionCalls(videoPath) {
  return [
    {
      file: 'ffmpeg',
      args: ['-v', 'error', '-y', '-ss', '00:00:01', '-i', videoPath, '-vframes', '1', videoPath.replace(/\.mp4$/i, '_cover.jpg')],
      options: { timeout: 5000 },
    },
    {
      file: 'ffmpeg',
      args: ['-v', 'error', '-y', '-i', videoPath, '-vf', 'fps=1/3,scale=360:-2', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', '-an', videoPath.replace(/\.mp4$/i, '_sample.mp4')],
      options: { timeout: 15000 },
    },
    {
      file: 'ffprobe',
      args: ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
      options: { timeout: 5000, encoding: 'utf8' },
    },
  ]
}

for (const filename of [
  'video$(touch marker-dollar).mp4',
  'video`touch marker-backtick`.mp4',
  'video"; touch marker-quote; #.mp4',
  'directory$(touch marker-directory)/video.mp4',
  'ordinary 中文 \'single\' "double" clip.MP4',
]) {
  test(`passes literal cover, sample, and probe paths for ${filename}`, (t) => {
    const run = runCase(t, { filename })
    const expected = expectedConversionCalls(run.videoPath)
    assert.deepEqual(run.calls, expected)
    assert.deepEqual(run.processes.slice(0, 3).map(({ command, args }) => ({ file: command, args })),
      expected.map(({ file, args }) => ({ file, args })))
    assert.deepEqual(run.processes[3].args,
      ['-v', 'info', '-i', run.videoPath, '-map', '0:v:0', '-vf', 'select=gt(scene\\,0.35),showinfo', '-vsync', 'vfr', '-f', 'null', '-'])
    for (const marker of ['marker-dollar', 'marker-backtick', 'marker-quote', 'marker-directory']) {
      assert.equal(existsSync(join(run.dir, marker)), false, `${marker} must not execute`)
    }
    assert.deepEqual(run.analysisVideos, [run.videoPath.replace(/\.mp4$/i, '_sample.mp4')])
    assert.equal(run.results[0].video.cover_url,
      `/omnimux/video-preview/stream?path=${encodeURIComponent(run.videoPath.replace(/\.mp4$/i, '_cover.jpg'))}`)
    assert.equal(run.results[0].is_video_breakdown, true)
  })
}

test('reuses cached cover and sample without re-running conversion', (t) => {
  const run = runCase(t, { repeat: 2 })
  assert.deepEqual(run.processes.map(({ phase }) => phase), ['cover', 'sample', 'probe', 'scenes', 'probe', 'scenes'])
  assert.deepEqual(run.analysisVideos, [run.videoPath.replace(/\.mp4$/, '_sample.mp4'), run.videoPath.replace(/\.mp4$/, '_sample.mp4')])
  assert.equal(run.results[0].video.cover_url, run.results[1].video.cover_url)
})

for (const size of [1024, sampleLimit]) {
  test(`analyzes the original video without sampling at ${size} bytes`, (t) => {
    const run = runCase(t, { size })
    assert.deepEqual(run.processes.map(({ phase }) => phase), ['cover', 'probe', 'scenes'])
    assert.deepEqual(run.analysisVideos, [run.videoPath])
  })
}

test('retains original input and fallback cover after conversion failures', (t) => {
  const run = runCase(t, { fail: ['cover', 'sample'] })
  assert.deepEqual(run.calls, expectedConversionCalls(run.videoPath))
  assert.deepEqual(run.analysisVideos, [run.videoPath])
  assert.equal(run.results[0].video.cover_url, 'fallback-cover.jpg')
  assert.equal(run.results[0].is_video_breakdown, true)
})

test('uses probed duration and scene-filter cut points', (t) => {
  const run = runCase(t, { mode: 'scenes' })
  assert.deepEqual(run.results[0].map(({ startSec, endSec }) => [startSec, endSec]), [[0, 4], [4, 8], [8, 13]])
})

test('retains duration fallback when the probe fails', (t) => {
  const run = runCase(t, { mode: 'scenes', fail: ['probe'] })
  assert.deepEqual(run.results[0].map(({ startSec, endSec }) => [startSec, endSec]), [[0, 4], [4, 8], [8, 11]])
})

test('retains a single duration interval when scene filtering fails', (t) => {
  const run = runCase(t, { mode: 'scenes', fail: ['scenes'] })
  assert.deepEqual(run.results[0].map(({ startSec, endSec }) => [startSec, endSec]), [[0, 13]])
})

test('still prefers professional scene results while probing the literal path', (t) => {
  const run = runCase(t, { mode: 'scenes', filename: 'video$(touch marker-service).mp4', serviceScenes: [{ start: 3 }, { start: 7 }] })
  assert.deepEqual(run.processes.map(({ phase }) => phase), ['probe'])
  assert.equal(run.processes[0].args.at(-1), run.videoPath)
  assert.equal(existsSync(join(run.dir, 'marker-service')), false)
  assert.equal(run.sceneInputs[0].videoUrl, run.videoPath)
  assert.deepEqual(run.results[0].map(({ startSec, endSec }) => [startSec, endSec]), [[0, 3], [3, 7], [7, 13]])
})

test('preserves breakdown fallback when media programs are absent', (t) => {
  const run = runCase(t, { missingPrograms: true })
  assert.deepEqual(run.processes, [])
  assert.deepEqual(run.analysisVideos, [run.videoPath])
  assert.equal(run.results[0].video.cover_url, 'fallback-cover.jpg')
  assert.equal(run.results[0].is_video_breakdown, true)
})
