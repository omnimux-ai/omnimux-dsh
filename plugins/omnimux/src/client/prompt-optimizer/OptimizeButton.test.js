import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import {
  getPromptOptimizerConfigured,
  installOptimizeBridge,
  runPromptOptimize,
} from './optimize-bridge.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUTTON_PATH = resolve(HERE, 'OptimizeButton.jsx')
const STYLES_PATH = resolve(HERE, 'styles.js')
const INDEX_PATH = resolve(HERE, '..', 'index.js')
const LOCALES_PATH = resolve(HERE, '..', 'locales.js')

/** 装一个假 window（node 下没有），返回清场函数。 */
function useWindow(extra = {}) {
  const previous = globalThis.window
  globalThis.window = { ...extra }
  return () => { globalThis.window = previous }
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  }
}

function mockFetch(handler) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (path, opts) => {
    calls.push({ path, opts })
    return handler(path, opts)
  }
  return { calls, restore() { globalThis.fetch = original } }
}

/** 等配置探测（GET + json 解析）整条微任务链落地。 */
const settle = (ms = 10) => new Promise((r) => setTimeout(r, ms))

const cleanups = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()()
})

describe('installOptimizeBridge', () => {
  it('挂载后 window.__omnimuxPromptOptimizer 提供 optimize 与 configured=false 初始态', () => {
    const cleanupWin = useWindow()
    cleanups.push(cleanupWin)
    const dispose = installOptimizeBridge({})
    cleanups.push(dispose)
    const bridge = globalThis.window.__omnimuxPromptOptimizer
    assert.ok(bridge, '桥必须挂上 window')
    assert.equal(typeof bridge.optimize, 'function')
    assert.equal(bridge.configured, false)
  })

  it('GET 探测返回 configured:true → 桥配置态翻转为 true', async () => {
    const cleanupWin = useWindow()
    cleanups.push(cleanupWin)
    const mocked = mockFetch((path, opts) => {
      assert.equal(path, '/omnimux/prompt-optimizer')
      assert.equal(opts?.method, 'GET', '探测必须是 GET')
      return jsonResponse({ configured: true })
    })
    cleanups.push(() => mocked.restore())
    const dispose = installOptimizeBridge({})
    cleanups.push(dispose)
    await settle()
    assert.equal(globalThis.window.__omnimuxPromptOptimizer.configured, true)
    assert.equal(getPromptOptimizerConfigured(), true)
  })

  it('fetch 抛错 / 探测失败 → configured 保持 false，不抛异常', async () => {
    const cleanupWin = useWindow()
    cleanups.push(cleanupWin)
    const mocked = mockFetch(() => { throw new Error('network down') })
    cleanups.push(() => mocked.restore())
    const dispose = installOptimizeBridge({})
    cleanups.push(dispose)
    await settle()
    assert.equal(globalThis.window.__omnimuxPromptOptimizer.configured, false)
  })

  it('GET 未配置字段 → configured 为 false', async () => {
    const cleanupWin = useWindow()
    cleanups.push(cleanupWin)
    const mocked = mockFetch(() => jsonResponse({}))
    cleanups.push(() => mocked.restore())
    const dispose = installOptimizeBridge({})
    cleanups.push(dispose)
    await settle()
    assert.equal(getPromptOptimizerConfigured(), false)
  })

  it('optimize() POST /omnimux/prompt-optimizer 且只回传契约字段', async () => {
    const cleanupWin = useWindow()
    cleanups.push(cleanupWin)
    const mocked = mockFetch((path, opts) => {
      if (opts?.method === 'POST') {
        assert.equal(path, '/omnimux/prompt-optimizer')
        assert.equal(opts.headers['Content-Type'], 'application/json')
        assert.equal(JSON.parse(opts.body).text, '写个周报')
        return jsonResponse({ ok: true, prompt: '优化后的提示词', templateId: 'generic-optimize', matched: true, extra: 'drop' })
      }
      return jsonResponse({ configured: true })
    })
    cleanups.push(() => mocked.restore())
    const dispose = installOptimizeBridge({})
    cleanups.push(dispose)
    const res = await globalThis.window.__omnimuxPromptOptimizer.optimize('写个周报')
    assert.deepEqual(res, { ok: true, prompt: '优化后的提示词', templateId: 'generic-optimize', matched: true })
  })

  it('optimize() 在 fetch 失败时安静回 ok:false，不抛', async () => {
    const cleanupWin = useWindow()
    cleanups.push(cleanupWin)
    const mocked = mockFetch((path, opts) => {
      if (opts?.method === 'POST') throw new Error('timeout')
      return jsonResponse({ configured: true })
    })
    cleanups.push(() => mocked.restore())
    const dispose = installOptimizeBridge({})
    cleanups.push(dispose)
    const res = await globalThis.window.__omnimuxPromptOptimizer.optimize('x')
    assert.equal(res.ok, false)
    assert.equal(res.prompt, '')
  })

  it('ctx.effect 在时把清理交给宿主生命周期；dispose 后桥被删除', async () => {
    const cleanupWin = useWindow()
    cleanups.push(cleanupWin)
    const mocked = mockFetch(() => jsonResponse({ configured: false }))
    cleanups.push(() => mocked.restore())
    let unregister = null
    const ctx = { effect: (fn) => { unregister = fn } }
    installOptimizeBridge(ctx)
    assert.equal(typeof unregister, 'function', 'ctx.effect 必须收到清理函数')
    assert.ok(globalThis.window.__omnimuxPromptOptimizer)
    await settle()
    // 宿主 effect 清理约定：执行注册时给出的函数本身即完成清理（该函数返回 dispose）。
    unregister()()
    assert.equal(globalThis.window.__omnimuxPromptOptimizer, undefined)
  })
})

describe('runPromptOptimize（按钮点击链路的单一实现）', () => {
  it('草稿为空 → skipped，不发请求不写草稿', async () => {
    const cleanupWin = useWindow({
      __omnimuxPromptOptimizer: { configured: true, optimize: async () => { throw new Error('must not call') } },
    })
    cleanups.push(cleanupWin)
    let wrote = false
    const outcome = await runPromptOptimize({
      readDraft: () => '   ',
      writeDraft: () => { wrote = true; return true },
    })
    assert.equal(outcome, 'skipped')
    assert.equal(wrote, false)
  })

  it('桥未挂载 → skipped', async () => {
    const cleanupWin = useWindow()
    cleanups.push(cleanupWin)
    const outcome = await runPromptOptimize({ readDraft: () => '草稿' })
    assert.equal(outcome, 'skipped')
  })

  it('未配置 → skipped（与禁用态口径一致，不弹失败提示）', async () => {
    let called = false
    const cleanupWin = useWindow({
      __omnimuxPromptOptimizer: { configured: false, optimize: async () => { called = true; return { ok: true, prompt: 'p' } } },
    })
    cleanups.push(cleanupWin)
    const outcome = await runPromptOptimize({ readDraft: () => '草稿' })
    assert.equal(outcome, 'skipped')
    assert.equal(called, false)
  })

  it('成功：传 trim 后的草稿、写回 prompt 并聚焦 → applied', async () => {
    const got = []
    let focused = false
    const cleanupWin = useWindow({
      __omnimuxPromptOptimizer: {
        configured: true,
        optimize: async (text) => { got.push(text); return { ok: true, prompt: '优化后', templateId: 't', matched: true } },
      },
    })
    cleanups.push(cleanupWin)
    const outcome = await runPromptOptimize({
      readDraft: () => '  原始草稿  ',
      writeDraft: (text) => { got.push(`write:${text}`); return true },
      focusComposerEditor: () => { focused = true; return true },
    })
    assert.equal(outcome, 'applied')
    assert.deepEqual(got, ['原始草稿', 'write:优化后'])
    assert.equal(focused, true)
  })

  it('host 回 ok:false → failed（草稿不动）', async () => {
    const cleanupWin = useWindow({
      __omnimuxPromptOptimizer: { configured: true, optimize: async () => ({ ok: false }) },
    })
    cleanups.push(cleanupWin)
    let wrote = false
    const outcome = await runPromptOptimize({
      readDraft: () => '草稿',
      writeDraft: () => { wrote = true; return true },
    })
    assert.equal(outcome, 'failed')
    assert.equal(wrote, false)
  })

  it('ok 但 prompt 缺失 → failed', async () => {
    const cleanupWin = useWindow({
      __omnimuxPromptOptimizer: { configured: true, optimize: async () => ({ ok: true, prompt: '' }) },
    })
    cleanups.push(cleanupWin)
    const outcome = await runPromptOptimize({ readDraft: () => '草稿', writeDraft: () => true })
    assert.equal(outcome, 'failed')
  })

  it('optimize 抛错 → failed，不外抛', async () => {
    const cleanupWin = useWindow({
      __omnimuxPromptOptimizer: { configured: true, optimize: async () => { throw new Error('boom') } },
    })
    cleanups.push(cleanupWin)
    const outcome = await runPromptOptimize({ readDraft: () => '草稿', writeDraft: () => true })
    assert.equal(outcome, 'failed')
  })

  it('writeDraft 回 false（宿主没接住）→ failed，不聚焦', async () => {
    let focused = false
    const cleanupWin = useWindow({
      __omnimuxPromptOptimizer: { configured: true, optimize: async () => ({ ok: true, prompt: 'p' }) },
    })
    cleanups.push(cleanupWin)
    const outcome = await runPromptOptimize({
      readDraft: () => '草稿',
      writeDraft: () => false,
      focusComposerEditor: () => { focused = true },
    })
    assert.equal(outcome, 'failed')
    assert.equal(focused, false)
  })
})

describe('OptimizeButton 组件契约（源码断言）', () => {
  it('图标按钮形态：单按钮、32px、禁用态与 running 防重入', async () => {
    const src = await readFile(BUTTON_PATH, 'utf8')
    assert.match(src, /<button/, '必须渲染一枚按钮')
    assert.match(src, /className="omx-optimize-btn"/)
    assert.match(src, /exempt-ui01/, '原生按钮必须携带 UI01 豁免说明')
    assert.match(src, /disabled=\{disabled\}/)
    assert.match(src, /running \|\| emptyDraft \|\| !configured/, '禁用口径 = running ∪ 空草稿 ∪ 未配置')
    assert.match(src, /inFlight\.current\) return/, 'running 态必须禁重入')
    const styles = await readFile(STYLES_PATH, 'utf8')
    assert.match(styles, /width:\s*32px/, 'design.md 32px 控件高基准')
    assert.match(styles, /height:\s*32px/)
    assert.match(styles, /border-radius:\s*8px/)
    assert.match(styles, /omx-optimize-spinner/)
    assert.match(styles, /prefers-reduced-motion/)
  })

  it('文案只走 promptOptimize.* 白名单键，不出现私货', async () => {
    const src = await readFile(BUTTON_PATH, 'utf8')
    for (const key of ['promptOptimize.tooltip', 'promptOptimize.noKey']) {
      assert.ok(src.includes(`'${key}'`), `缺键 ${key}`)
    }
    assert.ok(src.includes('"promptOptimize.failed"'), '缺键 promptOptimize.failed')
    assert.doesNotMatch(src, /Badge|badge|优化中|[\u{1F300}-\u{1FAFF}]/u, '禁 Badge 与 emoji')
  })

  it('失败出口复用 QuickWriteNotice，不自造 toast', async () => {
    const src = await readFile(BUTTON_PATH, 'utf8')
    assert.match(src, /<QuickWriteNotice/)
    assert.match(src, /messageKey="promptOptimize\.failed"/)
    assert.match(src, /useQuickWriteNotice/)
  })
})

describe('注册与文案接线', () => {
  it('conversation.input.right 槽位注册 OptimizeButton，order 10，带桥挂载', async () => {
    const src = await readFile(INDEX_PATH, 'utf8')
    assert.match(src, /ctx\.slots\.inject\('conversation\.input\.right',[\s\S]*?id: 'omnimux-prompt-optimizer',[\s\S]*?order: 10,[\s\S]*?\}, OptimizeButton\)\)/)
    assert.match(src, /installOptimizeBridge\(ctx\)/)
    assert.match(src, /import \{ OptimizeButton \} from '\.\/prompt-optimizer\/OptimizeButton\.jsx'/)
    assert.match(src, /import \{ installOptimizeBridge \} from '\.\/prompt-optimizer\/optimize-bridge\.js'/)
  })

  it('locales 按白名单逐字收录中英文案', async () => {
    const src = await readFile(LOCALES_PATH, 'utf8')
    assert.match(src, /'promptOptimize\.tooltip': '优化提示词'/)
    assert.match(src, /'promptOptimize\.noKey': '配置 API Key 后可用'/)
    assert.match(src, /'promptOptimize\.failed': '优化失败，请重试'/)
    assert.match(src, /'promptOptimize\.tooltip': 'Optimize prompt'/)
    assert.match(src, /'promptOptimize\.noKey': 'Requires API key'/)
    assert.match(src, /'promptOptimize\.failed': "Couldn't optimize\. Try again\."/)
  })
})
