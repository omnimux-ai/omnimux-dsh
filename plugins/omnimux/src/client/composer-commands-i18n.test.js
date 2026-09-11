import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isZhLocale,
  getActiveLang,
  splitBilingualDescription,
  resolveCommandDescription,
  scoreCommandCandidate,
  enhanceCommandCandidates,
  wrapCommandUi,
  installCommandsI18n,
  COMMAND_I18N,
} from './composer-commands-i18n.js'

test('isZhLocale & getActiveLang', () => {
  assert.equal(isZhLocale(null), true)
  assert.equal(isZhLocale({}), true)
  assert.equal(isZhLocale({ getSnapshot: () => ({ active: 'zh-CN' }) }), true)
  assert.equal(isZhLocale({ getSnapshot: () => ({ active: 'zh' }) }), true)
  assert.equal(isZhLocale({ getSnapshot: () => ({ active: 'en-US' }) }), false)
  assert.equal(isZhLocale({ getSnapshot: () => ({ active: 'en' }) }), false)
  assert.equal(getActiveLang({ getSnapshot: () => ({ active: 'en' }) }), 'en')
  assert.equal(getActiveLang({ getSnapshot: () => ({ active: 'zh-Hans' }) }), 'zh')
})

test('splitBilingualDescription splits slash copy', () => {
  assert.equal(splitBilingualDescription('添加文件 / Add files', 'zh'), '添加文件')
  assert.equal(splitBilingualDescription('添加文件 / Add files', 'en'), 'Add files')
  assert.equal(splitBilingualDescription('从资产库添加 / Add from library', 'zh'), '从资产库添加')
  assert.equal(splitBilingualDescription('从资产库添加 / Add from library', 'en'), 'Add from library')
  assert.equal(splitBilingualDescription('纯中文描述', 'zh'), '纯中文描述')
  assert.equal(splitBilingualDescription('Pure English', 'en'), 'Pure English')
})

test('resolveCommandDescription localizes known and unknown commands', () => {
  const zhLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }
  const enLocale = { getSnapshot: () => ({ active: 'en-US' }) }

  // Known commands from dictionary
  assert.equal(resolveCommandDescription('add-file', '添加文件 / Add files', zhLocale), '添加文件')
  assert.equal(resolveCommandDescription('add-file', '添加文件 / Add files', enLocale), 'Add files')
  assert.equal(resolveCommandDescription('add-from-library', '从资产库添加 / Add from library', zhLocale), '从资产库添加')
  assert.equal(resolveCommandDescription('add-from-library', '从资产库添加 / Add from library', enLocale), 'Add from library')
  assert.equal(resolveCommandDescription('compact', 'Compact older conversation history', zhLocale), '压缩历史对话上下文')
  assert.equal(resolveCommandDescription('compact', 'Compact older conversation history', enLocale), 'Compact older conversation history')
  assert.equal(resolveCommandDescription('plan', 'Enter or leave plan mode', zhLocale), '进入或退出计划模式')
  assert.equal(resolveCommandDescription('plan', 'Enter or leave plan mode', enLocale), 'Enter or leave plan mode')
  assert.equal(resolveCommandDescription('goal', 'set or view the goal for a long-running task', zhLocale), '设定或查看长任务目标')

  // Unknown command with bilingual fallback
  assert.equal(resolveCommandDescription('custom-cmd', '自定义操作 / Custom action', zhLocale), '自定义操作')
  assert.equal(resolveCommandDescription('custom-cmd', '自定义操作 / Custom action', enLocale), 'Custom action')
})

test('scoreCommandCandidate handles exact, prefix, keyword and fuzzy queries', () => {
  const candidate = {
    name: 'add-file',
    description: '添加文件',
  }

  // Exact name
  assert.equal(scoreCommandCandidate(candidate, 'add-file', 'zh'), 1000)
  // Prefix
  assert(scoreCommandCandidate(candidate, 'add', 'zh') > 400)
  // Chinese keyword
  assert(scoreCommandCandidate(candidate, '文件', 'zh') > 0)
  assert(scoreCommandCandidate(candidate, '添加', 'zh') > 0)
  assert(scoreCommandCandidate(candidate, 'wenjian', 'zh') > 0)
  // Unmatched
  assert.equal(scoreCommandCandidate(candidate, 'xyz123', 'zh'), undefined)
})

test('enhanceCommandCandidates localizes all rows and filters by query', () => {
  const allRows = [
    { name: 'add-file', description: '添加文件 / Add files' },
    { name: 'add-from-library', description: '从资产库添加 / Add from library' },
    { name: 'compact', description: 'Compact older conversation history' },
    { name: 'plan', description: 'Enter or leave plan mode' },
  ]
  const zhLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }
  const enLocale = { getSnapshot: () => ({ active: 'en-US' }) }

  // Empty query -> full localized list in zh
  const zhList = enhanceCommandCandidates(allRows, { query: '' }, zhLocale)
  assert.equal(zhList.length, 4)
  assert.equal(zhList[0].description, '添加文件')
  assert.equal(zhList[1].description, '从资产库添加')
  assert.equal(zhList[2].description, '压缩历史对话上下文')
  assert.equal(zhList[3].description, '进入或退出计划模式')

  // Empty query -> full localized list in en
  const enList = enhanceCommandCandidates(allRows, { query: '' }, enLocale)
  assert.equal(enList.length, 4)
  assert.equal(enList[0].description, 'Add files')
  assert.equal(enList[1].description, 'Add from library')
  assert.equal(enList[2].description, 'Compact older conversation history')
  assert.equal(enList[3].description, 'Enter or leave plan mode')

  // Search by Chinese keyword "文件"
  const searchFile = enhanceCommandCandidates(allRows, { query: '文件' }, zhLocale)
  assert.equal(searchFile.length, 1)
  assert.equal(searchFile[0].name, 'add-file')
  assert.equal(searchFile[0].description, '添加文件')

  // Search by Chinese keyword "计划"
  const searchPlan = enhanceCommandCandidates(allRows, { query: '计划' }, zhLocale)
  assert.equal(searchPlan.length, 1)
  assert.equal(searchPlan[0].name, 'plan')
  assert.equal(searchPlan[0].description, '进入或退出计划模式')

  // Search by English prefix "com"
  const searchCom = enhanceCommandCandidates(allRows, { query: 'com' }, zhLocale)
  assert.equal(searchCom.length, 1)
  assert.equal(searchCom[0].name, 'compact')
})

test('wrapCommandUi hooks commandUi.candidates and cleans up', async () => {
  const rawRows = [
    { name: 'add-file', description: '添加文件 / Add files' },
    { name: 'compact', description: 'Compact older conversation history' },
  ]
  let calledWith = null
  const originalMethod = async (session, req) => {
    calledWith = req
    return rawRows
  }

  const fakeCommandUi = {
    candidates: originalMethod,
  }
  const fakeLocale = {
    getSnapshot: () => ({ active: 'zh-CN' }),
  }

  const dispose = wrapCommandUi(fakeCommandUi, fakeLocale)
  assert.notEqual(fakeCommandUi.candidates, originalMethod)

  // Invoke candidates
  const res = await fakeCommandUi.candidates({ sessionId: 's1' }, { query: '' })
  assert.equal(res[0].description, '添加文件')
  assert.equal(res[1].description, '压缩历史对话上下文')

  // Invoke with Chinese query
  const resSearch = await fakeCommandUi.candidates({ sessionId: 's1' }, { query: '文件' })
  assert.equal(resSearch.length, 1)
  assert.equal(resSearch[0].name, 'add-file')
  assert.equal(resSearch[0].description, '添加文件')

  // Dispose restores original
  dispose()
  assert.equal(fakeCommandUi.candidates, originalMethod)
})

test('installCommandsI18n registers effect with cordis context', () => {
  let injectedDeps = null
  let effectName = null
  let effectDisposed = false

  const fakeCommandUi = {
    candidates: async () => [],
  }
  const fakeLocale = {
    getSnapshot: () => ({ active: 'zh-CN' }),
  }

  const fakeInner = {
    commandUi: fakeCommandUi,
    locale: fakeLocale,
    effect(fn, name) {
      effectName = name
      const cleanup = fn()
      return () => {
        cleanup?.()
        effectDisposed = true
      }
    },
  }

  const fakeCtx = {
    inject(deps, cb) {
      injectedDeps = deps
      cb(fakeInner)
    },
  }

  installCommandsI18n(fakeCtx)
  assert.deepEqual(injectedDeps, ['commandUi', 'locale'])
  assert.equal(effectName, 'omnimux: command i18n & query enhancement')
})
