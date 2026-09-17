import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractGeneratedMedia,
  mountGenerationIngest,
  GENERATION_INGEST_TOOLS,
} from './generation-ingest.js'

describe('Generation Ingest: extractGeneratedMedia', () => {
  it('ignores non-generation tools or error results', () => {
    assert.equal(extractGeneratedMedia({ name: 'read_file' }, { isError: false }), null)
    assert.equal(
      extractGeneratedMedia({ name: 'video_generate' }, { isError: true, content: [{ text: 'error' }] }),
      null
    )
    assert.equal(extractGeneratedMedia(null, null), null)
  })

  it('extracts video path from video_generate output text', () => {
    const exec = {
      name: 'video_generate',
      arguments: { prompt: 'A soaring eagle over mountains', model: 'kling' },
      agent: { name: 'VideoExpert', session: { id: 'sess_123' } },
    }
    const result = {
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Saved video to /Users/test/videos/out.mp4 (5.0s)\nTemporary provider URL: https://example.com/out.mp4',
        },
      ],
    }

    const item = extractGeneratedMedia(exec, result)
    assert.ok(item)
    assert.equal(item.filePath, '/Users/test/videos/out.mp4')
    assert.equal(item.title, 'A soaring eagle over mountains')
    assert.equal(item.source.model, 'kling')
    assert.equal(item.source.agent, 'VideoExpert')
    assert.equal(item.source.session_id, 'sess_123')
  })

  it('extracts image path from image_generate output text', () => {
    const exec = {
      name: 'image_generate',
      arguments: { prompt: 'Cyberpunk street in rain', provider: 'gpt' },
    }
    const result = {
      isError: false,
      content: [{ type: 'text', text: 'Saved image to /Users/test/images/out.png' }],
    }

    const item = extractGeneratedMedia(exec, result)
    assert.ok(item)
    assert.equal(item.filePath, '/Users/test/images/out.png')
    assert.equal(item.title, 'Cyberpunk street in rain')
    assert.equal(item.source.channel, 'image')
  })

  it('extracts path from JSON result text or arguments.dest fallback', () => {
    const exec = {
      name: 'omnimux_image_submit',
      arguments: { prompt: 'Ceramic mug', dest: '/Users/test/images/dest.png' },
    }
    const result = {
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ mode: 'live', path: '/Users/test/images/dest.png' }) }],
    }

    const item = extractGeneratedMedia(exec, result)
    assert.ok(item)
    assert.equal(item.filePath, '/Users/test/images/dest.png')
    assert.equal(item.title, 'Ceramic mug')
  })
})

describe('Generation Ingest: mountGenerationIngest lifecycle', () => {
  it('reports generated media to artifactStore when file exists', () => {
    const reported = []
    const mockArtifacts = {
      report: (filePath, source, title) => {
        reported.push({ filePath, source, title })
      },
    }
    const mockFs = {
      statSync: (p) => ({
        isFile: () => p.endsWith('.png') || p.endsWith('.mp4'),
      }),
    }

    let handler
    const mockCtx = {
      on: (event, fn) => {
        if (event === 'tools/result') handler = fn
        return () => { handler = null }
      },
    }

    const unmount = mountGenerationIngest(mockCtx, { artifacts: mockArtifacts, fs: mockFs })
    assert.equal(typeof handler, 'function')

    // 模拟一次成功执行
    handler(
      {
        name: 'video_generate',
        arguments: { prompt: 'Sunset wave' },
      },
      {
        isError: false,
        content: [{ type: 'text', text: 'Saved video to /mock/sunset.mp4' }],
      }
    )

    assert.equal(reported.length, 1)
    assert.equal(reported[0].filePath, '/mock/sunset.mp4')
    assert.equal(reported[0].title, 'Sunset wave')

    // 注销后不再监听
    unmount()
    assert.equal(handler, null)
  })
})
