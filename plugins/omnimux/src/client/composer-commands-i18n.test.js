import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isZhLocale,
  getActiveLang,
  splitBilingualDescription,
  resolveCommandDisplayName,
  resolveCommandDescription,
  resolveRawCommandName,
  scoreCommandCandidate,
  enhanceCommandCandidates,
  wrapCommandUi,
  installCommandsI18n,
  COMMAND_I18N,
  ZH_NAME_TO_RAW,
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

test('resolveCommandDisplayName localizes command names on the left', () => {
  const zhLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }
  const enLocale = { getSnapshot: () => ({ active: 'en-US' }) }

  // Chinese locale: left names become Chinese
  assert.equal(resolveCommandDisplayName('add-file', zhLocale), '添加文件')
  assert.equal(resolveCommandDisplayName('add-from-library', zhLocale), '从资产库添加')
  assert.equal(resolveCommandDisplayName('compact', zhLocale), '压缩历史')
  assert.equal(resolveCommandDisplayName('feedback', zhLocale), '会话反馈')
  assert.equal(resolveCommandDisplayName('permission', zhLocale), '权限预设')
  assert.equal(resolveCommandDisplayName('plan', zhLocale), '计划模式')
  assert.equal(resolveCommandDisplayName('goal', zhLocale), '任务目标')
  assert.equal(resolveCommandDisplayName('export', zhLocale), '导出日志')

  // English locale: left names stay canonical English
  assert.equal(resolveCommandDisplayName('add-file', enLocale), 'add-file')
  assert.equal(resolveCommandDisplayName('compact', enLocale), 'compact')
  assert.equal(resolveCommandDisplayName('plan', enLocale), 'plan')

  // Unknown command fallbacks to raw name
  assert.equal(resolveCommandDisplayName('unknown-cmd', zhLocale), 'unknown-cmd')
})

test('resolveRawCommandName reverses Chinese name to canonical name', () => {
  assert.equal(resolveRawCommandName('添加文件'), 'add-file')
  assert.equal(resolveRawCommandName('从资产库添加'), 'add-from-library')
  assert.equal(resolveRawCommandName('压缩历史'), 'compact')
  assert.equal(resolveRawCommandName('计划模式'), 'plan')
  assert.equal(resolveRawCommandName('add-file'), 'add-file')
  assert.equal(resolveRawCommandName('compact'), 'compact')
})

test('resolveCommandDescription localizes known and unknown commands', () => {
  const zhLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }
  const enLocale = { getSnapshot: () => ({ active: 'en-US' }) }

  // Known commands from dictionary
  assert.equal(resolveCommandDescription('add-file', '添加文件 / Add files', zhLocale), '从本地选择文件或图片')
  assert.equal(resolveCommandDescription('add-file', '添加文件 / Add files', enLocale), 'Add files')
  assert.equal(resolveCommandDescription('add-from-library', '从资产库添加 / Add from library', zhLocale), '从统一资产库选择素材')
  assert.equal(resolveCommandDescription('add-from-library', '从资产库添加 / Add from library', enLocale), 'Add from library')
  assert.equal(resolveCommandDescription('compact', 'Compact older conversation history', zhLocale), '压缩较早的历史对话上下文')
  assert.equal(resolveCommandDescription('compact', 'Compact older conversation history', enLocale), 'Compact older conversation history')
  assert.equal(resolveCommandDescription('plan', 'Enter or leave plan mode', zhLocale), '开启或退出长任务计划模式')
  assert.equal(resolveCommandDescription('plan', 'Enter or leave plan mode', enLocale), 'Enter or leave plan mode')

  // Unknown command with bilingual fallback
  assert.equal(resolveCommandDescription('custom-cmd', '自定义操作 / Custom action', zhLocale), '自定义操作')
  assert.equal(resolveCommandDescription('custom-cmd', '自定义操作 / Custom action', enLocale), 'Custom action')
})

test('scoreCommandCandidate handles Chinese name, English rawName, prefix, keyword and fuzzy queries', () => {
  const candidate = {
    name: '添加文件',
    rawName: 'add-file',
    description: '从本地选择文件或图片',
  }

  // Exact Chinese name
  assert.equal(scoreCommandCandidate(candidate, '添加文件', 'zh'), 1000)
  // Exact English rawName
  assert.equal(scoreCommandCandidate(candidate, 'add-file', 'zh'), 1000)
  // Chinese prefix
  assert(scoreCommandCandidate(candidate, '添加', 'zh') > 500)
  // English prefix
  assert(scoreCommandCandidate(candidate, 'add', 'zh') > 400)
  // Keywords
  assert(scoreCommandCandidate(candidate, '文件', 'zh') > 0)
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

  // Empty query -> full localized list in zh with Chinese names on left
  const zhList = enhanceCommandCandidates(allRows, { query: '' }, zhLocale)
  assert.equal(zhList.length, 4)
  assert.equal(zhList[0].name, '添加文件')
  assert.equal(zhList[0].rawName, 'add-file')
  assert.equal(zhList[0].description, '从本地选择文件或图片')
  assert.equal(zhList[1].name, '从资产库添加')
  assert.equal(zhList[1].rawName, 'add-from-library')
  assert.equal(zhList[1].description, '从统一资产库选择素材')
  assert.equal(zhList[2].name, '压缩历史')
  assert.equal(zhList[2].rawName, 'compact')
  assert.equal(zhList[3].name, '计划模式')
  assert.equal(zhList[3].rawName, 'plan')

  // Empty query -> full localized list in en with English names on left
  const enList = enhanceCommandCandidates(allRows, { query: '' }, enLocale)
  assert.equal(enList.length, 4)
  assert.equal(enList[0].name, 'add-file')
  assert.equal(enList[0].description, 'Add files')
  assert.equal(enList[1].name, 'add-from-library')
  assert.equal(enList[1].description, 'Add from library')
  assert.equal(enList[2].name, 'compact')
  assert.equal(enList[2].description, 'Compact older conversation history')
  assert.equal(enList[3].name, 'plan')
  assert.equal(enList[3].description, 'Enter or leave plan mode')

  // Search by Chinese keyword "文件"
  const searchFile = enhanceCommandCandidates(allRows, { query: '文件' }, zhLocale)
  assert.equal(searchFile.length, 1)
  assert.equal(searchFile[0].name, '添加文件')
  assert.equal(searchFile[0].rawName, 'add-file')

  // Search by Chinese keyword "计划"
  const searchPlan = enhanceCommandCandidates(allRows, { query: '计划' }, zhLocale)
  assert.equal(searchPlan.length, 1)
  assert.equal(searchPlan[0].name, '计划模式')
  assert.equal(searchPlan[0].rawName, 'plan')

  // Search by English token "com"
  const searchCom = enhanceCommandCandidates(allRows, { query: 'com' }, zhLocale)
  assert.equal(searchCom.length, 1)
  assert.equal(searchCom[0].name, '压缩历史')
  assert.equal(searchCom[0].rawName, 'compact')
})

test('wrapCommandUi hooks candidates, dispatch, matchSpace, matchEnter and unwraps names', async () => {
  const rawRows = [
    { name: 'add-file', description: '添加文件 / Add files' },
    { name: 'compact', description: 'Compact older conversation history' },
    { name: 'plan', description: 'Enter or leave plan mode' },
  ]
  let dispatchedPick = null
  let matchedSpaceToken = null
  let matchedEnterLine = null

  const fakeCommandUi = {
    candidates: async (session, req) => rawRows,
    dispatch: (pick) => {
      dispatchedPick = pick
      return 'handled'
    },
    matchSpace: (session, token) => {
      matchedSpaceToken = token
      return { claim: token }
    },
    matchEnter: async (session, line) => {
      matchedEnterLine = line
      return 'handled'
    },
  }
  const fakeLocale = {
    getSnapshot: () => ({ active: 'zh-CN' }),
  }

  const dispose = wrapCommandUi(fakeCommandUi, fakeLocale)

  // 1. Test candidates yield Chinese names on left
  const res = await fakeCommandUi.candidates({ sessionId: 's1' }, { query: '' })
  assert.equal(res[0].name, '添加文件')
  assert.equal(res[0].rawName, 'add-file')
  assert.equal(res[1].name, '压缩历史')
  assert.equal(res[1].rawName, 'compact')

  // 2. Test dispatch unwraps Chinese name to rawName
  fakeCommandUi.dispatch({
    candidate: res[0], // name: "添加文件", rawName: "add-file"
    session: { sessionId: 's1' },
  })
  assert.equal(dispatchedPick.candidate.name, 'add-file')

  // 3. Test matchSpace maps "/添加文件 " to "/add-file"
  fakeCommandUi.matchSpace({ sessionId: 's1' }, '/添加文件')
  assert.equal(matchedSpaceToken, '/add-file')

  // 4. Test matchEnter maps "/计划模式 off" to "/plan off"
  await fakeCommandUi.matchEnter({ sessionId: 's1' }, '/计划模式 off')
  assert.equal(matchedEnterLine, '/plan off')

  // 5. Test dispose restores original methods
  dispose()
  assert.equal(fakeCommandUi.dispatch({ candidate: { name: '添加文件' } }), 'handled')
  assert.equal(dispatchedPick.candidate.name, '添加文件')
})
