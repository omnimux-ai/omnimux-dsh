// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { SessionEventView } from '../src/panel/events.ts'
import {
  producedMediaFromToolResult,
  producedMediaKey,
  producedMediaKind,
  producedMediaResponseDataUrl,
  toolResultCallId,
  type ProducedMediaRef,
} from '../src/panel/produced-media.ts'

/** 构造符合真实 SessionEvent 形状（{ type, data }）的事件，载荷永远落在 data 里。 */
function event(type: string, data: Record<string, unknown>): SessionEventView {
  return { type, data }
}

/** 一条合法 DisplayValue meta.path 产物的最小形状。 */
const META_PATH = {
  path: '/var/out/a.png',
  mediaType: 'image/png',
  kind: 'image',
  bytes: 12,
  inContext: false,
}

/** 一条合法 media attachment（mediaType 放宽到 video/audio）。 */
const MEDIA_ATTACHMENT = {
  attachmentId: 'att-1',
  mediaType: 'video/mp4',
  bytes: 99,
  width: 640,
  height: 360,
  name: 'clip.mp4',
}

const PATH_REF: ProducedMediaRef = {
  source: 'path',
  path: '/tmp/m.mp4',
  mediaType: 'video/mp4',
  kind: 'video',
  name: 'm.mp4',
}

describe('producedMediaFromToolResult — 产线1 data.meta', () => {
  it('meta.image 合法时产出 attachment 源一条，不再继续看 path', () => {
    const image = {
      attachmentId: 'img-1',
      mediaType: 'image/png',
      bytes: 4,
      width: 2,
      height: 2,
      name: 'out.png',
    }
    const data = {
      meta: { ...META_PATH, image },
      message: { content: [{ type: 'text', text: '<path>/elsewhere/x.mp4</path><media>video/mp4</media>' }] },
    }
    // meta.image 命中 attachment 源后，content 里的信封条目仍独立产出（产线不互斥）。
    const produced = producedMediaFromToolResult(event('tool/result', data))
    expect(produced.length).toBe(2)
    expect(produced).toEqual([
      { source: 'attachment', ...image },
      { source: 'path', path: '/elsewhere/x.mp4', mediaType: 'video/mp4', kind: 'video', name: 'x.mp4' },
    ])
  })

  it('meta.image 非法时清空整条产线（不再回落到 meta.path）', () => {
    const data = {
      meta: { ...META_PATH, image: { attachmentId: '' } },
    }
    expect(producedMediaFromToolResult(event('tool/result', data))).toEqual([])
  })

  it('meta.path 合法时产出 path 源，name 取 basename', () => {
    expect(producedMediaFromToolResult(event('tool/result', { meta: META_PATH }))).toEqual([
      {
        source: 'path',
        path: '/var/out/a.png',
        mediaType: 'image/png',
        kind: 'image',
        bytes: 12,
        name: 'a.png',
      },
    ])
  })

  it('缺 inContext / kind 非法 / path 非绝对路径 都判空', () => {
    const { inContext: _drop, ...noInContext } = META_PATH
    expect(producedMediaFromToolResult(event('tool/result', { meta: noInContext }))).toEqual([])
    expect(producedMediaFromToolResult(event('tool/result', { meta: { ...META_PATH, kind: 'vector' } }))).toEqual([])
    expect(producedMediaFromToolResult(event('tool/result', { meta: { ...META_PATH, path: 'relative/a.png' } }))).toEqual([])
  })

  it('bytes/mediaType 残缺同样判空', () => {
    expect(producedMediaFromToolResult(event('tool/result', { meta: { ...META_PATH, bytes: -1 } }))).toEqual([])
    expect(producedMediaFromToolResult(event('tool/result', { meta: { ...META_PATH, mediaType: 'not-a-type' } }))).toEqual([])
  })
})

describe('producedMediaFromToolResult — 产线2 message.content attachment 块', () => {
  it('image 块携带合法 attachment → attachment 源', () => {
    const data = { message: { content: [{ type: 'image', attachment: MEDIA_ATTACHMENT }] } }
    expect(producedMediaFromToolResult(event('tool/result', data))).toEqual([
      { source: 'attachment', ...MEDIA_ATTACHMENT },
    ])
  })

  it('attachment 非法或非 image 块不出产物', () => {
    const bad = { message: { content: [{ type: 'image', attachment: { attachmentId: 'x' } }] } }
    expect(producedMediaFromToolResult(event('tool/result', bad))).toEqual([])
    const nontext = { message: { content: [{ type: 'tool_use', name: 'x' }] } }
    expect(producedMediaFromToolResult(event('tool/result', nontext))).toEqual([])
  })
})

describe('producedMediaFromToolResult — 产线3 <path>/<media> 信封', () => {
  it('path+media 齐配 → path 源，kind 由 media type 决定', () => {
    const data = {
      message: {
        content: [{ type: 'text', text: '<path>/x/a.mp4</path><media>video/mp4</media>' }],
      },
    }
    expect(producedMediaFromToolResult(event('tool/result', data))).toEqual([
      { source: 'path', path: '/x/a.mp4', mediaType: 'video/mp4', kind: 'video', name: 'a.mp4' },
    ])
  })

  it('仅 <path> 无 <media> 时按扩展名推断 mediaType 与 kind', () => {
    const data = { message: { content: [{ type: 'text', text: '<path>/x/a.mp3</path>' }] } }
    expect(producedMediaFromToolResult(event('tool/result', data))).toEqual([
      { source: 'path', path: '/x/a.mp3', mediaType: 'audio/mpeg', kind: 'audio', name: 'a.mp3' },
    ])
  })

  it('未知扩展名退化为 application/octet-stream + file', () => {
    const data = { message: { content: [{ type: 'text', text: '<path>/x/a.bin</path>' }] } }
    expect(producedMediaFromToolResult(event('tool/result', data))).toEqual([
      { source: 'path', path: '/x/a.bin', mediaType: 'application/octet-stream', kind: 'file', name: 'a.bin' },
    ])
  })

  it('<type> 标签优先于 media/扩展名推断', () => {
    const data = {
      message: { content: [{ type: 'text', text: '<path>/x/a.pdf</path><type>pdf</type>' }] },
    }
    const produced = producedMediaFromToolResult(event('tool/result', data))
    expect(produced).toHaveLength(1)
    expect(produced[0]).toMatchObject({ kind: 'pdf', mediaType: 'application/pdf' })
  })

  it('相对路径或非字符串内容不进产物', () => {
    const data = { message: { content: [{ type: 'text', text: '<path>rel/a.mp4</path><media>video/mp4</media>' }] } }
    expect(producedMediaFromToolResult(event('tool/result', data))).toEqual([])
    expect(producedMediaFromToolResult(event('tool/result', { message: { content: 'plain' } }))).toEqual([])
  })

  it('同一文本块内多个 <path> 信封逐个产出', () => {
    const data = {
      message: {
        content: [{
          type: 'text',
          text: '<path>/x/a.png</path><path>/x/b.mp4</path>',
        }],
      },
    }
    const produced = producedMediaFromToolResult(event('tool/result', data))
    expect(produced).toEqual([
      { source: 'path', path: '/x/a.png', mediaType: 'image/png', kind: 'image', name: 'a.png' },
      { source: 'path', path: '/x/b.mp4', mediaType: 'video/mp4', kind: 'video', name: 'b.mp4' },
    ])
  })

  it('多个 <path> 与同序位的 <media>/<type> 逐个配对', () => {
    const data = {
      message: {
        content: [{
          type: 'text',
          text: '<path>/x/a.png</path><media>image/png</media><type>image</type>'
            + '<path>/x/b.wav</path><media>audio/wav</media><type>audio</type>',
        }],
      },
    }
    const produced = producedMediaFromToolResult(event('tool/result', data))
    expect(produced).toEqual([
      { source: 'path', path: '/x/a.png', mediaType: 'image/png', kind: 'image', name: 'a.png' },
      { source: 'path', path: '/x/b.wav', mediaType: 'audio/wav', kind: 'audio', name: 'b.wav' },
    ])
  })

  it('media/type 数量不齐时该 path 回落到扩展名推断', () => {
    const data = {
      message: {
        content: [{
          type: 'text',
          // 只有一个 <media>：第二个 path 按 .wav 扩展名兜底。
          text: '<path>/x/a.png</path><media>image/png</media><path>/x/b.wav</path>',
        }],
      },
    }
    const produced = producedMediaFromToolResult(event('tool/result', data))
    expect(produced).toEqual([
      { source: 'path', path: '/x/a.png', mediaType: 'image/png', kind: 'image', name: 'a.png' },
      { source: 'path', path: '/x/b.wav', mediaType: 'audio/wav', kind: 'audio', name: 'b.wav' },
    ])
  })

  it('中间的非法 path 不吞掉后续信封', () => {
    const data = {
      message: {
        content: [{
          type: 'text',
          text: '<path>rel/nope.png</path><media>image/png</media><path>/x/b.mp4</path><media>video/mp4</media>',
        }],
      },
    }
    const produced = producedMediaFromToolResult(event('tool/result', data))
    expect(produced).toEqual([
      { source: 'path', path: '/x/b.mp4', mediaType: 'video/mp4', kind: 'video', name: 'b.mp4' },
    ])
  })
})

describe('producedMediaFromToolResult — 产线4 omnimux_*_submit JSON result', () => {
  const submitResult = (payload: unknown): SessionEventView => event('tool/result', {
    message: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
  })

  it('omnimux_image_submit + mode:live + dest → path 源 kind=image', () => {
    const produced = producedMediaFromToolResult(
      submitResult({ mode: 'live', dest: '/d/x.png' }),
      'omnimux_image_submit',
    )
    expect(produced).toEqual([
      { source: 'path', path: '/d/x.png', mediaType: 'image/png', kind: 'image', name: 'x.png' },
    ])
  })

  it('video/audio 扩展名同样进 kind 白名单', () => {
    expect(producedMediaFromToolResult(submitResult({ mode: 'live', dest: '/d/v.mp4' }), 'omnimux_video_submit'))
      .toEqual([{ source: 'path', path: '/d/v.mp4', mediaType: 'video/mp4', kind: 'video', name: 'v.mp4' }])
    expect(producedMediaFromToolResult(submitResult({ mode: 'live', dest: '/d/a.wav' }), 'omnimux_audio_submit'))
      .toEqual([{ source: 'path', path: '/d/a.wav', mediaType: 'audio/wav', kind: 'audio', name: 'a.wav' }])
  })

  it("mode:'submitted' 判空；dest 缺失/相对路径判空", () => {
    expect(producedMediaFromToolResult(submitResult({ mode: 'submitted', dest: '/d/x.png' }), 'omnimux_image_submit')).toEqual([])
    expect(producedMediaFromToolResult(submitResult({ mode: 'live' }), 'omnimux_image_submit')).toEqual([])
    expect(producedMediaFromToolResult(submitResult({ mode: 'live', dest: 'd/x.png' }), 'omnimux_image_submit')).toEqual([])
  })

  it('非白名单 kind 扩展名（如 .txt）判空', () => {
    expect(producedMediaFromToolResult(submitResult({ mode: 'live', dest: '/d/notes.txt' }), 'omnimux_image_submit')).toEqual([])
  })

  it('toolName 未给或非白名单 → 该产线完全不触发', () => {
    const ev = submitResult({ mode: 'live', dest: '/d/x.png' })
    expect(producedMediaFromToolResult(ev)).toEqual([])
    expect(producedMediaFromToolResult(ev, 'browser_snapshot')).toEqual([])
    expect(producedMediaFromToolResult(ev, 'display_file')).toEqual([])
  })
})

describe('producedMediaFromToolResult — 通用闸门与去重', () => {
  it('message.isError=true 全空', () => {
    const data = {
      meta: META_PATH,
      message: { isError: true, content: [{ type: 'image', attachment: MEDIA_ATTACHMENT }] },
    }
    expect(producedMediaFromToolResult(event('tool/result', data))).toEqual([])
  })

  it('data.isError=true 也全空', () => {
    expect(producedMediaFromToolResult(event('tool/result', { isError: true, meta: META_PATH }))).toEqual([])
  })

  it('tool/result 以外的事件类型一律空', () => {
    expect(producedMediaFromToolResult(event('tool/call', { meta: META_PATH }))).toEqual([])
    expect(producedMediaFromToolResult(event('assistant/message', { meta: META_PATH }))).toEqual([])
  })

  it('同一 path 出现在 meta 与信封中只出一条（先到先得）', () => {
    const data = {
      meta: { ...META_PATH, path: '/d/x.png', kind: 'image' },
      message: { content: [{ type: 'text', text: '<path>/d/x.png</path><media>image/png</media>' }] },
    }
    const produced = producedMediaFromToolResult(event('tool/result', data))
    expect(produced).toHaveLength(1)
    expect(produced[0]).toMatchObject({ source: 'path', path: '/d/x.png', kind: 'image' })
  })

  it('attachmentId 与 path 的键互不碰撞', () => {
    const attachKey = producedMediaKey({ source: 'attachment', attachmentId: 'a', mediaType: 'image/png', bytes: 1, width: 1, height: 1 })
    const pathKey = producedMediaKey({ source: 'path', path: 'a', mediaType: 'image/png', kind: 'image' })
    expect(attachKey).not.toBe(pathKey)
    expect(attachKey).toBe('a:a')
    expect(pathKey).toBe('p:a')
  })
})

describe('producedMediaKind / toolResultCallId', () => {
  it('kind 按 mediaType 前缀推导（attachment）或直接采用声明 kind（path）', () => {
    expect(producedMediaKind({ source: 'attachment', attachmentId: 'a', mediaType: 'video/mp4', bytes: 1, width: 1, height: 1 })).toBe('video')
    expect(producedMediaKind({ source: 'attachment', attachmentId: 'a', mediaType: 'audio/mpeg', bytes: 1, width: 1, height: 1 })).toBe('audio')
    expect(producedMediaKind({ source: 'attachment', attachmentId: 'a', mediaType: 'application/pdf', bytes: 1, width: 1, height: 1 })).toBe('pdf')
    expect(producedMediaKind({ source: 'path', path: '/a.pdf', mediaType: 'application/pdf', kind: 'pdf' })).toBe('pdf')
  })

  it('toolResultCallId 依次读 data.callId → message.toolCallId → message.source.callId', () => {
    expect(toolResultCallId(event('tool/result', { callId: 'flat' }))).toBe('flat')
    expect(toolResultCallId(event('tool/result', { message: { toolCallId: 'mid' } }))).toBe('mid')
    expect(toolResultCallId(event('tool/result', { message: { source: { callId: 'nested' } } }))).toBe('nested')
    expect(toolResultCallId(event('tool/result', {}))).toBeNull()
  })
})

describe('producedMediaResponseDataUrl', () => {
  it('合法 {mediaType,bytes,data} → data URL', () => {
    expect(producedMediaResponseDataUrl(
      { mediaType: 'video/mp4', bytes: 4, data: 'AAAA' },
      PATH_REF,
    )).toBe('data:video/mp4;base64,AAAA')
  })

  it('响应 mediaType 缺失/非法时回落到引用声明的类型', () => {
    expect(producedMediaResponseDataUrl({ data: 'AAAA' }, PATH_REF))
      .toBe('data:video/mp4;base64,AAAA')
    expect(producedMediaResponseDataUrl({ mediaType: 'not-a-type', data: 'AAAA' }, PATH_REF))
      .toBe('data:video/mp4;base64,AAAA')
  })

  it('data 非 base64 / 非字符串 → null', () => {
    expect(producedMediaResponseDataUrl({ mediaType: 'video/mp4', data: '<script>' }, PATH_REF)).toBeNull()
    expect(producedMediaResponseDataUrl({ mediaType: 'video/mp4', data: 42 }, PATH_REF)).toBeNull()
    expect(producedMediaResponseDataUrl({ mediaType: 'video/mp4' }, PATH_REF)).toBeNull()
    expect(producedMediaResponseDataUrl(null, PATH_REF)).toBeNull()
  })

  it('attachment 源引用不走此路径', () => {
    const attachment: ProducedMediaRef = {
      source: 'attachment', attachmentId: 'a', mediaType: 'image/png', bytes: 1, width: 1, height: 1,
    }
    expect(producedMediaResponseDataUrl({ mediaType: 'image/png', data: 'AAAA' }, attachment)).toBeNull()
  })
})
