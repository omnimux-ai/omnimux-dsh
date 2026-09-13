import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReadableStream } from 'node:stream/web'
import {
  DOWNLOADS_DIR_ENV,
  EXPORT_KIND,
  audioExtractArgs,
  exportFilename,
  exportMediaFile,
  resolveDownloadsDir,
} from './media-export.js'

const PUBLIC_MP4 = 'https://v16-webapp.tiktokcdn.com/abc/video.mp4'

function streamResponse(chunks, headers = { 'content-type': 'video/mp4' }) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
        controller.close()
      },
    }),
  }
}

/** Offline `dns.lookup` stand-in: no test may resolve a real hostname. */
async function offlineResolver(hostname) {
  return [{ address: '93.184.216.34', family: 4, hostname }]
}

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'omnimux-export-'))
})

after(() => {
  rmSync(root, { recursive: true, force: true })
})

function dirs() {
  const downloads = join(root, 'Downloads')
  const work = join(root, 'work')
  return { downloads, work }
}

const TIKTOK_META = {
  text: '三秒钩子：这款拖把真的不用手洗',
  author: { name: '洁净生活家', handle: 'cleanlife' },
  video_url: PUBLIC_MP4,
  resolvedUrl: 'https://www.tiktok.com/@cleanlife/video/7412345678901234567',
}

describe('resolveDownloadsDir', () => {
  it('defaults to the platform Downloads folder under the home directory', () => {
    assert.equal(resolveDownloadsDir({}, '/Users/tester'), join('/Users/tester', 'Downloads'))
  })

  it('defaults to the real home directory when no home is injected', () => {
    assert.equal(resolveDownloadsDir({}), join(homedir(), 'Downloads'))
  })

  it('honours an explicit override and ignores a blank one', () => {
    assert.equal(resolveDownloadsDir({ [DOWNLOADS_DIR_ENV]: '/tmp/chosen' }, '/Users/tester'), '/tmp/chosen')
    assert.equal(resolveDownloadsDir({ [DOWNLOADS_DIR_ENV]: '   ' }, '/Users/tester'), join('/Users/tester', 'Downloads'))
  })
})

describe('exportFilename', () => {
  it('builds a recognisable stem from author, caption and post id', () => {
    const name = exportFilename(TIKTOK_META, EXPORT_KIND.video, '.mp4')
    assert.match(name, /^cleanlife-三秒钩子/)
    assert.match(name, /7412345678901234567\.mp4$/)
  })

  it('strips path separators and characters a filesystem would reject', () => {
    const name = exportFilename(
      { ...TIKTOK_META, text: 'a/b\\c:d*e?f"g<h>i|j\nk', author: { handle: 'x/y' } },
      EXPORT_KIND.video,
      '.mp4',
    )
    assert.doesNotMatch(name, /[/\\:*?"<>|\n]/)
  })

  it('caps the caption fragment so a long hook cannot exhaust the filename limit', () => {
    const name = exportFilename({ ...TIKTOK_META, text: '把'.repeat(200) }, EXPORT_KIND.audio, '.m4a')
    assert.ok(name.length <= 120, `filename too long: ${name.length}`)
    assert.ok(name.endsWith('.m4a'))
  })

  it('still answers with a usable name when the post carries no metadata', () => {
    const name = exportFilename({}, EXPORT_KIND.video, '.mp4')
    assert.match(name, /\.mp4$/)
    assert.ok(name.length > '.mp4'.length)
  })
})

describe('audioExtractArgs', () => {
  it('drops the picture and copies the audio stream without re-encoding', () => {
    const args = audioExtractArgs('/tmp/in.mp4', '/tmp/out.m4a')
    assert.ok(args.includes('-vn'))
    assert.ok(args.includes('/tmp/in.mp4'))
    assert.equal(args.at(-1), '/tmp/out.m4a')
    assert.ok(args.includes('copy'), 'a stream copy keeps the export instant')
  })

  it('overwrites without prompting, so a retry is never blocked on a stale file', () => {
    assert.ok(audioExtractArgs('/tmp/in.mp4', '/tmp/out.m4a').includes('-y'))
  })
})

describe('exportMediaFile — video', () => {
  it('downloads the watermark-free stream into the chosen folder', async () => {
    const { downloads, work } = dirs()
    const result = await exportMediaFile({
      videoUrl: PUBLIC_MP4,
      meta: TIKTOK_META,
      kind: EXPORT_KIND.video,
      downloadsDir: downloads,
      workDir: work,
      fetcher: async () => streamResponse([[1, 2, 3, 4], [5, 6]]),
      resolver: offlineResolver,
    })

    assert.equal(result.kind, EXPORT_KIND.video)
    assert.equal(result.bytes, 6)
    assert.ok(result.path.startsWith(downloads))
    assert.ok(existsSync(result.path), 'the exported file must exist on disk')
    assert.equal(readdirSync(downloads).length, 1)
  })

  it('never leaves a second file behind when the same post is exported twice', async () => {
    const { downloads, work } = dirs()
    const args = {
      videoUrl: PUBLIC_MP4,
      meta: TIKTOK_META,
      kind: EXPORT_KIND.video,
      downloadsDir: downloads,
      workDir: work,
      fetcher: async () => streamResponse([[9, 9]]),
      resolver: offlineResolver,
    }
    const first = await exportMediaFile(args)
    const second = await exportMediaFile(args)

    assert.notEqual(first.path, second.path, 'the second export must not overwrite the first')
    assert.equal(readdirSync(downloads).length, 2)
  })

  it('reports a download failure instead of leaving an empty file', async () => {
    const { downloads, work } = dirs()
    await assert.rejects(
      exportMediaFile({
        videoUrl: PUBLIC_MP4,
        meta: TIKTOK_META,
        kind: EXPORT_KIND.video,
        downloadsDir: downloads,
        workDir: work,
        fetcher: async () => ({ ok: false, status: 403, headers: new Headers(), body: null }),
        resolver: offlineResolver,
      }),
    )
    assert.equal(existsSync(downloads) ? readdirSync(downloads).length : 0, 0)
  })
})

describe('exportMediaFile — audio', () => {
  it('extracts the whole soundtrack into the downloads folder and clears the intermediate file', async () => {
    const { downloads, work } = dirs()
    const calls = []
    const runFfmpeg = async (inputPath, outputPath, args) => {
      calls.push({ inputPath, outputPath, args })
      writeFileSync(outputPath, Buffer.from([7, 7, 7]))
    }

    const result = await exportMediaFile({
      videoUrl: PUBLIC_MP4,
      meta: TIKTOK_META,
      kind: EXPORT_KIND.audio,
      downloadsDir: downloads,
      workDir: work,
      fetcher: async () => streamResponse([[1, 2, 3, 4]]),
      resolver: offlineResolver,
      runFfmpeg,
    })

    assert.equal(result.kind, EXPORT_KIND.audio)
    assert.equal(result.bytes, 3)
    assert.ok(result.path.endsWith('.m4a'), `expected an audio container, got ${result.path}`)
    assert.ok(result.path.startsWith(downloads))
    assert.ok(existsSync(result.path))
    assert.equal(calls.length, 1, 'ffmpeg runs exactly once per export')
    assert.ok(calls[0].args.includes('-vn'))
    assert.equal(readdirSync(downloads).length, 1, 'the source video must not land in Downloads')
    assert.equal(existsSync(work) ? readdirSync(work).length : 0, 0, 'the intermediate file must be removed')
  })

  it('discards a half-written audio file instead of leaving it in Downloads', async () => {
    const { downloads, work } = dirs()
    await assert.rejects(
      exportMediaFile({
        videoUrl: PUBLIC_MP4,
        meta: TIKTOK_META,
        kind: EXPORT_KIND.audio,
        downloadsDir: downloads,
        workDir: work,
        fetcher: async () => streamResponse([[1, 2, 3, 4]]),
        resolver: offlineResolver,
        // A real ffmpeg creates its output before it discovers the stream is bad,
        // so this shape leaves a file behind for the cleanup to remove — the other
        // failure case throws before writing anything and proves nothing.
        runFfmpeg: async (_input, output) => {
          writeFileSync(output, Buffer.from([1, 2, 3]))
          throw new Error('ffmpeg: invalid data found when processing input')
        },
      }),
      /invalid data/,
    )
    assert.equal(existsSync(downloads) ? readdirSync(downloads).length : 0, 0, 'no half-written file may stay')
    assert.equal(existsSync(work) ? readdirSync(work).length : 0, 0)
  })

  it('fails the export and clears the intermediate file when the audio track cannot be read', async () => {
    const { downloads, work } = dirs()
    await assert.rejects(
      exportMediaFile({
        videoUrl: PUBLIC_MP4,
        meta: TIKTOK_META,
        kind: EXPORT_KIND.audio,
        downloadsDir: downloads,
        workDir: work,
        fetcher: async () => streamResponse([[1, 2, 3, 4]]),
        resolver: offlineResolver,
        runFfmpeg: async () => { throw new Error('ffmpeg: no audio stream') },
      }),
      /no audio stream/,
    )
    assert.equal(existsSync(downloads) ? readdirSync(downloads).length : 0, 0)
    assert.equal(existsSync(work) ? readdirSync(work).length : 0, 0)
  })
})

describe('exportMediaFile — rejected input', () => {
  it('refuses an unknown export kind before touching the network', async () => {
    const { downloads, work } = dirs()
    let fetched = false
    await assert.rejects(
      exportMediaFile({
        videoUrl: PUBLIC_MP4,
        meta: TIKTOK_META,
        kind: 'gif',
        downloadsDir: downloads,
        workDir: work,
        fetcher: async () => { fetched = true; return streamResponse([[1]]) },
        resolver: offlineResolver,
      }),
      /gif/,
    )
    assert.equal(fetched, false)
  })

  it('refuses a private download target', async () => {
    const { downloads, work } = dirs()
    await assert.rejects(
      exportMediaFile({
        videoUrl: 'http://169.254.169.254/latest/meta-data/video.mp4',
        meta: TIKTOK_META,
        kind: EXPORT_KIND.video,
        downloadsDir: downloads,
        workDir: work,
        fetcher: async () => streamResponse([[1]]),
        resolver: async () => [{ address: '169.254.169.254', family: 4 }],
      }),
    )
    assert.equal(existsSync(downloads) ? readdirSync(downloads).length : 0, 0)
  })
})
