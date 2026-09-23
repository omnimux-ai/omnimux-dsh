import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { writeDraft } from './dom.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const COMPONENT_PATH = resolve(HERE, 'ComposerQuickShortcuts.jsx')
const NOTICE_PATH = resolve(HERE, 'notice.jsx')
const BRIDGE_PATH = resolve(HERE, '..', 'composer-add', 'AttachmentSubmitBridge.jsx')
const TRAY_PATH = resolve(HERE, '..', 'attachments', 'AttachmentTray.tsx')
const LOCALES_PATH = resolve(HERE, '..', 'locales.js')

/** 装一个假宿主桥，返回清场函数（node 下 `window` 不存在，测试里临时挂上）。 */
function useBridge(actions) {
  const previous = globalThis.window
  globalThis.window = actions ? { __omnimuxComposerActions: actions } : {}
  return () => { globalThis.window = previous }
}

describe('writeDraft 的返回值来自桥的回执', () => {
  it('桥不存在 → false（拿不到宿主能力时安静失败）', () => {
    const cleanup = useBridge(null)
    try {
      assert.equal(writeDraft('提示语'), false)
    } finally {
      cleanup()
    }
  })

  it('桥在、但 inputActions.setDraft 缺失 → false（这正是「守卫形同虚设」的那条）', () => {
    const cleanup = useBridge({ getDraft: () => '' })
    try {
      assert.equal(writeDraft('提示语'), false)
    } finally {
      cleanup()
    }
  })

  it('setDraft 回 false（宿主没接住）→ false', () => {
    const cleanup = useBridge({ setDraft: () => false, getDraft: () => '' })
    try {
      assert.equal(writeDraft('提示语'), false)
    } finally {
      cleanup()
    }
  })

  it('setDraft 抛错 → false', () => {
    const cleanup = useBridge({
      setDraft: () => {
        throw new Error('editor disposed')
      },
    })
    try {
      assert.equal(writeDraft('提示语'), false)
    } finally {
      cleanup()
    }
  })

  it('setDraft 回 true → true，且写进去的是同一条草稿', () => {
    const written = []
    const cleanup = useBridge({ setDraft: (text) => { written.push(text); return true } })
    try {
      assert.equal(writeDraft('提示语\n\n[视频]'), true)
    } finally {
      cleanup()
    }
    assert.deepEqual(written, ['提示语\n\n[视频]'])
  })

  it('非字符串一律按空草稿写，不强转', () => {
    const written = []
    const cleanup = useBridge({ setDraft: (text) => { written.push(text); return true } })
    try {
      assert.equal(writeDraft(null), true)
      assert.equal(writeDraft({}), true)
    } finally {
      cleanup()
    }
    assert.deepEqual(written, ['', ''])
  })
})

describe('内联控件与外部入口分离（Issue #2592）', () => {
  it('控件挂在左侧扩展座，四入口仍留在外部停靠座', async () => {
    const source = await readFile(resolve(HERE, '..', 'index.js'), 'utf8')
    assert.match(source, /ctx\.slots\.inject\('conversation\.input\.left',[\s\S]*?id: 'omnimux-quick-shortcut-controls',[\s\S]*?\}, ComposerQuickShortcutControls\)\)/)
    assert.match(source, /ctx\.slots\.inject\('conversation\.input\.dock',[\s\S]*?id: 'omnimux-quick-shortcuts',[\s\S]*?\}, ComposerQuickShortcuts\)\)/)
    const component = await readFile(COMPONENT_PATH, 'utf8')
    const outside = component.slice(component.indexOf('export function ComposerQuickShortcuts('))
    assert.doesNotMatch(outside, /<QuickShortcutModelControls|<MediaConfigControls/, '外部四入口不得再渲染视频配置')
    const controls = component.slice(component.indexOf('export function ComposerQuickShortcutControls('), component.indexOf('export function ComposerQuickShortcuts('))
    assert.match(controls, /state\.activeId !== 'clone' && state\.activeId !== 'selling'\) return null/)
    assert.match(controls, /<QuickShortcutModelControls key=\{sessionId\} sessionId=\{sessionId\}/, '切换会话必须使用对应身份')
    assert.match(controls, /store\.subscribe\(sessionId, listener\)/)
    assert.match(controls, /store\.getSnapshot\(sessionId\)/)
    assert.doesNotMatch(component, /showModelSummary/, '视频名称不可再显示第二份摘要')
  })
})

describe('桥的回执契约与消费方的守卫', () => {
  it('桥的 setDraft 在两条失败分支上都回 false，成功才回 true', async () => {
    const source = await readFile(BRIDGE_PATH, 'utf8')
    const start = source.indexOf('setDraft: (text) =>')
    const end = source.indexOf('getDraft:')
    assert.ok(start !== -1 && end > start, '桥必须仍然发布 setDraft / getDraft')
    const body = source.slice(start, end)
    assert.match(body, /typeof actions\.setDraft !== 'function'/, 'inputActions.setDraft 缺失必须走显式失败分支（不再用可选链静默跳过）')
    assert.match(body, /return false/, '失败分支必须回 false')
    assert.match(body, /return true/, '成功分支必须回 true')
  })

  it('每次改 store 之前先确认草稿真的写进去了', async () => {
    const source = await readFile(COMPONENT_PATH, 'utf8')
    const start = source.indexOf('const handlePick =')
    const end = source.indexOf('}, [store, sessionId, labels, t, notifyWriteFailed, dismissNotice]);', start)
    assert.ok(start !== -1 && end > start, '必须定位完整的 handlePick 回调，不能依赖已迁移的控件显示变量')
    const body = source.slice(start, end)

    const guards = body.split('if (!writeDraft(').length - 1
    const mutations = body.split('store.set(').length - 1
    assert.equal(guards, 2, '选中与撤回两条分支都必须有 writeDraft 守卫')
    assert.equal(mutations, 2, '两条分支各改一次 store')

    let cursor = 0
    for (let i = 0; i < mutations; i += 1) {
      const guardAt = body.indexOf('if (!writeDraft(', cursor)
      const mutateAt = body.indexOf('store.set(', cursor)
      assert.ok(guardAt !== -1 && guardAt < mutateAt, '写草稿失败时不得继续改 store')
      const guardEnd = body.indexOf('}', guardAt)
      assert.ok(guardEnd < mutateAt)
      assert.match(body.slice(guardAt, guardEnd), /notifyWriteFailed\(\);\s*return;/, '草稿失败分支必须提示并提前返回，而不是只检查回执后继续写 store')
      cursor = mutateAt + 1
    }
  })

  it('写失败时给出轻提示，中英文案都在字典里', async () => {
    const component = await readFile(COMPONENT_PATH, 'utf8')
    assert.match(component, /<QuickWriteNotice/, '组件必须渲染这条轻提示')

    // 提示本体（文案键 + 读屏播报）落在共用的 `notice.jsx`：快捷方式与素材卡槽行共用同一条。
    const notice = await readFile(NOTICE_PATH, 'utf8')
    assert.match(notice, /quickShortcuts\.notice\.writeFailed/, '轻提示必须消费这条文案')
    assert.match(notice, /role="status"/, '提示必须可被读屏播报')

    const locales = await readFile(LOCALES_PATH, 'utf8')
    assert.match(locales, /'quickShortcuts\.notice\.writeFailed': '输入框未就绪，请重试'/, '中文文案缺失')
    assert.match(locales, /'quickShortcuts\.notice\.writeFailed': 'Input not ready, please retry'/, '英文文案缺失')
  })

  it('素材卡槽行插不进胶囊时复用同一条轻提示，绝不静默', async () => {
    const tray = await readFile(TRAY_PATH, 'utf8')
    assert.match(tray, /if \(!insertQuickLinkChip\(/, '必须读插入通道的回执，不能丢弃')
    assert.match(tray, /notifyWriteFailed\(\)/, '插不进去必须给轻提示')
    assert.match(tray, /<QuickWriteNotice/, '渲染的必须是同一条轻提示')
  })
})
