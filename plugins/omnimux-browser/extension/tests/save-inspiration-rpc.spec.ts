// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { submitInspirationSave, inspirationSaveLabel, type InspirationSaveTask } from '../src/shared/inspiration-save.ts'

afterEach(() => vi.unstubAllGlobals())
const task: InspirationSaveTask = { taskId: 'save-1', host: 'http://127.0.0.1:43120', sourceUrl: 'https://x.com/test/status/1', state: 'saving', updatedAt: 1 }

describe('panel save receipt transport', () => {
  it('delegates to the background without treating the accepted task as saved', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, task }))
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    expect(await submitInspirationSave({ targetUrl: task.sourceUrl, capture: { url: task.sourceUrl, text: '正文' } })).toEqual(task)
    expect(sendMessage).toHaveBeenCalledWith({ type: 'DSH_SAVE_INSPIRATION_PANEL', payload: { targetUrl: task.sourceUrl, capture: { url: task.sourceUrl, text: '正文' } } })
    expect(inspirationSaveLabel(task)).toBe('保存中')
  })
  it('rejects cached or HTTP-like success without a durable task receipt', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: async () => ({ ok: true, hostSaved: false, result: { ok: true } }) } })
    await expect(submitInspirationSave({ targetUrl: task.sourceUrl })).rejects.toThrow('待确认')
  })
  it('renders the six actual save states without erasing partial or pending results', () => {
    expect(['saving', 'saved', 'partial', 'duplicate', 'pending', 'failed'].map((state) => inspirationSaveLabel({ state: state as InspirationSaveTask['state'] })))
      .toEqual(['保存中', '已保存', '部分保存', '已在灵感库', '结果待确认', '保存失败'])
  })
  it('host routes retain Private Network Access preflights', () => {
    const routes = readFileSync(resolve(__dirname, '../../../omnimux-inspiration/src/http-routes.js'), 'utf8')
    expect(routes.includes("'Access-Control-Allow-Private-Network': 'true'")).toBe(true)
  })
})
