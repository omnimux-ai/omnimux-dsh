// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canCollectHomeSources, collectSourcePools } from '../src/content/twitter-copilot/feed-sources.ts'

const LONG = '我们把推理服务从 A 换到 B 之后，延迟下降了 40%，但是账单反而涨了一倍，原因是缓存命中率掉了。'

function article(author: string): string {
  return `<article data-testid="tweet"><div data-testid="User-Name"><a role="link" href="/${author}">${author}</a></div><div data-testid="tweetText">${author}：${LONG}</div></article>`
}

/** Home page double: two tabs whose click swaps the timeline, like X does. */
function mountHome(timelines: Record<'for_you' | 'following', string[]>) {
  document.body.innerHTML = `
    <form><div data-testid="tweetTextarea_0" role="textbox"></div></form>
    <div role="tablist">
      <div role="tab" id="t-for_you" aria-selected="true">为你推荐</div>
      <div role="tab" id="t-following" aria-selected="false">正在关注</div>
    </div>
    <main id="timeline"></main>`
  const render = (key: 'for_you' | 'following') => {
    document.getElementById('timeline')!.innerHTML = timelines[key].map(article).join('')
    for (const k of ['for_you', 'following'] as const) document.getElementById(`t-${k}`)!.setAttribute('aria-selected', String(k === key))
  }
  render('for_you')
  for (const k of ['for_you', 'following'] as const) {
    document.getElementById(`t-${k}`)!.addEventListener('click', () => setTimeout(() => render(k), 50))
  }
  window.history.replaceState({}, '', '/home')
}

describe('#3100 双来源采集（AC-11）', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('首页：先采当前标签，切到另一个标签采集，最后切回原标签', async () => {
    mountHome({ for_you: ['a1', 'a2'], following: ['b1', 'shared'] })
    const composer = document.querySelector('form')
    expect(canCollectHomeSources(document, composer)).toBe(true)
    const run = collectSourcePools(document, composer, Date.now(), 3000, 0)
    await vi.runAllTimersAsync()
    const { pools, sourcesScanned } = await run
    expect(sourcesScanned).toEqual({ for_you: 2, following: 2 })
    expect(pools.map((p) => p.map((c) => [c.author, c.source]))).toEqual([
      [['a1', 'for_you'], ['a2', 'for_you']],
      [['b1', 'following'], ['shared', 'following']],
    ])
    expect(document.getElementById('t-for_you')!.getAttribute('aria-selected')).toEqual('true')
  })

  it('另一个标签加载超时：记 0 条，不影响已采结果，并切回原标签', async () => {
    mountHome({ for_you: ['a1'], following: [] })
    document.getElementById('t-following')!.replaceWith(Object.assign(document.createElement('div'), { id: 't-following', role: 'tab', textContent: '正在关注' }))
    document.getElementById('t-following')!.setAttribute('role', 'tab')
    document.getElementById('t-following')!.setAttribute('aria-selected', 'false')
    const run = collectSourcePools(document, document.querySelector('form'), Date.now(), 1000, 0)
    await vi.runAllTimersAsync()
    const { sourcesScanned } = await run
    expect(sourcesScanned).toEqual({ for_you: 1, following: 0 })
  })

  it('不在首页或发帖框在弹窗里：只采当前页面', async () => {
    mountHome({ for_you: ['a1'], following: ['b1'] })
    window.history.replaceState({}, '', '/someone/status/1')
    const run = collectSourcePools(document, document.querySelector('form'), Date.now(), 1000, 0)
    await vi.runAllTimersAsync()
    expect((await run).sourcesScanned).toEqual({ page: 1 })

    window.history.replaceState({}, '', '/home')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const modalComposer = document.createElement('form')
    dialog.appendChild(modalComposer)
    document.body.appendChild(dialog)
    expect(canCollectHomeSources(document, modalComposer)).toBe(false)
  })
})
