// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  readExportOutcome,
  sendTiktokShortcut,
} from '../src/content/tiktok-scene/transport.ts'
import { TIKTOK_RUNTIME_MESSAGE } from '../src/content/tiktok-scene/messages.ts'

const POST = 'https://www.tiktok.com/@cleanlife/video/7412345678901234567'

describe('后台回执解析', () => {
  it('取出后台带来的结果', () => {
    expect(readExportOutcome({ ok: true, result: { ok: true, code: 'exported', filename: 'a.mp4' } }))
      .toEqual({ ok: true, code: 'exported', filename: 'a.mp4' })
  })

  it('后台没回结果时按连不上处理，而不是当成内容问题', () => {
    expect(readExportOutcome(undefined)).toEqual({ ok: false, code: 'unreachable' })
    expect(readExportOutcome(null)).toEqual({ ok: false, code: 'unreachable' })
    expect(readExportOutcome({ ok: false, error: { code: 'invalid-media' } }))
      .toEqual({ ok: false, code: 'unreachable' })
  })

  it('结果形状不对时同样按连不上处理，不把脏数据渲染出去', () => {
    expect(readExportOutcome({ ok: true, result: {} })).toEqual({ ok: false, code: 'unreachable' })
    expect(readExportOutcome({ ok: true, result: { ok: 'yes', code: 7 } }))
      .toEqual({ ok: false, code: 'unreachable' })
  })

  it('后台给出的失败原因原样带出', () => {
    expect(readExportOutcome({ ok: true, result: { ok: false, code: 'rejected', detail: '地区受限' } }))
      .toEqual({ ok: false, code: 'rejected', detail: '地区受限' })
  })
})

describe('快捷操作的投递', () => {
  it('下载类操作带上作品地址与类型', async () => {
    const sent: Array<Record<string, unknown>> = []
    const outcome = await sendTiktokShortcut('video', POST, async (message) => {
      sent.push(message as Record<string, unknown>)
      return { ok: true, result: { ok: true, code: 'exported', filename: 'a.mp4' } }
    })

    expect(sent).toEqual([{
      type: TIKTOK_RUNTIME_MESSAGE.fetchMedia,
      payload: { url: POST, kind: 'video' },
    }])
    expect(outcome).toEqual({ ok: true, code: 'exported', filename: 'a.mp4' })
  })

  it('原声走同一个下载通道，但类型是音频', async () => {
    const sent: Array<Record<string, unknown>> = []
    await sendTiktokShortcut('audio', POST, async (message) => {
      sent.push(message as Record<string, unknown>)
      return { ok: true, result: { ok: true, code: 'exported', filename: 'a.m4a' } }
    })

    expect((sent[0].payload as { kind: string }).kind).toBe('audio')
  })

  it('存灵感库走入库通道，不夹带下载类型', async () => {
    const sent: Array<Record<string, unknown>> = []
    await sendTiktokShortcut('save', POST, async (message) => {
      sent.push(message as Record<string, unknown>)
      return { ok: true, result: { ok: true, code: 'saved' } }
    })

    expect(sent).toEqual([{
      type: TIKTOK_RUNTIME_MESSAGE.saveToInspiration,
      payload: { url: POST },
    }])
  })

  it('后台不可达时回答连不上，而不是抛异常到界面上', async () => {
    const outcome = await sendTiktokShortcut('video', POST, async () => {
      throw new Error('Receiving end does not exist')
    })
    expect(outcome).toEqual({ ok: false, code: 'unreachable' })
  })
})
