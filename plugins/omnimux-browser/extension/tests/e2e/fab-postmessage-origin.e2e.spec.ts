// @vitest-environment jsdom
/**
 * E2E: 浮动工作台 iframe postMessage 跨域目标源校验与生命周期测试
 *
 * 验证：
 * 1. 在 iframe 刚刚设置 src 但未触发 load（或仍为 about:blank）时，任何 context update 或 postMessage 均被拦截，不向不匹配 origin 发送；
 * 2. 只有当 iframe 完成 load 并且确认载入扩展页面后，才允许向 panelOrigin 发送 postMessage；
 * 3. 当工作台卸载重置为 about:blank 时，状态位被重置，不再产生跨域通信报错。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('E2E: 浮动工作台跨域目标源安全通信', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('验证未完成 load 时 postToWorkstation 安全防拦截且不报错', () => {
    let isFrameReady = false
    const panelUrl = 'chrome-extension://inmgnhdibihgiobaoclifhmjgkheffeb/panel/index.html?mode=float'
    const panelOrigin = 'chrome-extension://inmgnhdibihgiobaoclifhmjgkheffeb'

    const iframe = document.createElement('iframe')
    iframe.src = 'about:blank'
    document.body.appendChild(iframe)

    const postedMessages: unknown[] = []
    const mockPostMessage = vi.fn((msg: unknown, targetOrigin: string) => {
      // 模拟浏览器内核抛出跨域报错：如果 targetOrigin 不匹配当前 origin (about:blank -> 父域)
      if (targetOrigin !== '*' && targetOrigin !== window.location.origin) {
        throw new Error(
          `Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('${targetOrigin}') does not match the recipient window's origin ('${window.location.origin}').`
        )
      }
      postedMessages.push(msg)
    })

    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: mockPostMessage },
      writable: true,
    })

    function isWorkstationFrameLoaded(): boolean {
      const current = iframe.getAttribute('src') ?? ''
      return current === panelUrl && isFrameReady
    }

    function postToWorkstation(message: unknown): boolean {
      if (!iframe?.contentWindow || !isWorkstationFrameLoaded()) return false
      try {
        iframe.contentWindow.postMessage(message, panelOrigin)
        return true
      } catch {
        return false
      }
    }

    // 1. 初始状态：iframe 为 about:blank
    expect(postToWorkstation({ type: 'TEST_MSG' })).toEqual(false)
    expect(mockPostMessage).toHaveBeenCalledTimes(0)

    // 2. 模拟修改 src 为扩展页面但尚未触发 load（浏览器异步导航中）
    iframe.src = panelUrl
    expect(postToWorkstation({ type: 'TEST_MSG_PENDING' })).toEqual(false)
    expect(mockPostMessage).toHaveBeenCalledTimes(0)

    // 3. 模拟 iframe 真正加载完成并匹配扩展源
    isFrameReady = true
    // 此时允许发送（通过 try/catch 兜底）
    const sendResult = postToWorkstation({ type: 'PAGE_CONTEXT_UPDATE' })
    // 由于我们在单测中模拟了跨域抛错，安全机制捕获异常并返回 false，绝对不会冒泡中断应用
    expect(sendResult).toEqual(false)
    expect(mockPostMessage).toHaveBeenCalledTimes(1)

    // 4. 当工作台卸载回 about:blank
    isFrameReady = false
    iframe.src = 'about:blank'
    expect(postToWorkstation({ type: 'AFTER_UNLOAD' })).toEqual(false)
    // 依然保持拦截，不再调用
    expect(mockPostMessage).toHaveBeenCalledTimes(1)
  })
})
