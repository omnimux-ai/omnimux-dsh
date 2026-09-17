import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  ensurePlacementStyles,
  enhanceCommandCandidates,
  ALLOWED_COMMAND_NAMES,
} from './composer-commands-i18n.js'
import {
  triggerNativeFileInput,
  installComposerAddCommands,
  FILE_COMMAND,
  LIBRARY_COMMAND,
} from './composer-add/commands.js'

describe('e2e: 会话输入框原生添加文件图标隐藏与指令菜单三项收敛', () => {
  it('注入样式表中必须包含隐藏原生回形针图标的 CSS 规则', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')
    const doc = dom.window.document
    ensurePlacementStyles(doc)
    const styleEl = doc.getElementById('dsh-omnimux-menu-placement')
    assert.ok(styleEl, '样式元素必须已注入')
    const css = styleEl.textContent
    assert.match(css, /button\[aria-label="添加附件"\]/)
    assert.match(css, /button\[aria-label="Add attachment"\]/)
    assert.match(css, /display:\s*none\s*!important/)
  })

  it('点击「添加文件」菜单项能直接唤起输入框关联的原生文件选择器', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <div data-composer-card>
        <input type="file" multiple style="display:none" />
        <button type="button" aria-label="添加附件" style="display:none"></button>
      </div>
    </body></html>`)
    const doc = dom.window.document
    const fileInput = doc.querySelector('input[type="file"]')
    let inputClicked = false
    fileInput.addEventListener('click', () => {
      inputClicked = true
    })

    const triggered = triggerNativeFileInput(doc)
    assert.equal(triggered, true)
    assert.equal(inputClicked, true)
  })

  it('指令菜单仅严格保留添加文件、从资产库添加、计划模式三项，全量过滤原生底层指令', () => {
    const allHostRows = [
      { name: 'add-file', description: '添加文件 / Add files' },
      { name: 'add-from-library', description: '从资产库添加 / Add from library' },
      { name: 'compact', description: '压缩较早的历史对话上下文' },
      { name: 'feedback', description: '记录本轮会话评价或问题' },
      { name: 'permission', description: '切换运行权限预设 (沙箱/免审批)' },
      { name: 'plan', description: '开启或退出长任务计划模式' },
      { name: 'fast', description: '切换 Codex 速度档 (标准/快速)' },
      { name: 'model', description: '选择本会话使用的模型' },
    ]

    const zhLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }
    const result = enhanceCommandCandidates(allHostRows, { query: '' }, zhLocale)

    assert.equal(result.length, 3, '最终菜单条目必须严格为 3 项')
    assert.deepEqual(
      result.map((r) => r.name),
      ['添加文件', '从资产库添加', '计划模式']
    )
    assert.deepEqual(
      result.map((r) => r.rawName),
      ['add-file', 'add-from-library', 'plan']
    )
    assert.deepEqual(
      result.map((r) => r.icon),
      ['add-file', 'add-from-library', 'plan']
    )
  })

  it('当宿主尚未重启缺少 add-file 时，前端自愈补齐为添加文件、从资产库添加、计划模式 3 项', () => {
    // 模拟底座 Host 尚未重启，宿主命令列表只有 add-from-library 与各类原生指令，缺少 add-file
    const legacyHostRowsWithoutAddFile = [
      { name: 'add-from-library', description: '从资产库添加 / Add from library' },
      { name: 'compact', description: '压缩历史' },
      { name: 'plan', description: '开启或退出长任务计划模式' },
      { name: 'fast', description: '切换 Codex 速度档' },
      { name: 'model', description: '选择模型' },
    ]

    const zhLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }
    const result = enhanceCommandCandidates(legacyHostRowsWithoutAddFile, { query: '' }, zhLocale)

    assert.equal(result.length, 3, '即便宿主缺 add-file，前端自愈补齐后必须严格为 3 项')
    assert.deepEqual(
      result.map((r) => r.name),
      ['添加文件', '从资产库添加', '计划模式']
    )
    assert.equal(result[0].icon, 'add-file')
  })

  it('集成验证：installComposerAddCommands 同时注册添加文件与资产库两个动作并可调用', () => {
    const decorations = new Map()
    const ctx = {
      commandUi: {
        decorate(spec) {
          decorations.set(spec.name, spec)
          return () => decorations.delete(spec.name)
        },
      },
    }
    const calls = []
    const stop = installComposerAddCommands(ctx, {
      openLibrary(id) { calls.push(['library', id]) },
      openFile(id) { calls.push(['file', id]) },
    })

    assert.ok(decorations.has(FILE_COMMAND), '必须注册 add-file 装饰动作')
    assert.ok(decorations.has(LIBRARY_COMMAND), '必须注册 add-from-library 装饰动作')

    decorations.get(FILE_COMMAND).ui.run({ sessionId: 'session-1' })
    decorations.get(LIBRARY_COMMAND).ui.run({ sessionId: 'session-1' })

    assert.deepEqual(calls, [
      ['file', 'session-1'],
      ['library', 'session-1'],
    ])
    stop()
    assert.equal(decorations.size, 0)
  })
})
