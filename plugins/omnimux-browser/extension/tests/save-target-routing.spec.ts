// @vitest-environment jsdom
//
// 测试断言使用 node:assert/strict：仓库的 guard-anti-cheat 只放行既有风险的
// vitest expect 调用，新写入的断言必须使用可静态判定的 assert 形式。
import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  readAccountImportOutcome,
  readSaveTargetClassification,
  saveTargetFromClassification,
  saveTargetFromKind,
} from '../src/background/save-target.ts'
import {
  accountHandleLabel,
  saveButtonLabel,
  saveFailureToast,
  saveSuccessToast,
} from '../src/panel/save-target-copy.ts'

const ACCOUNT_PLATFORMS = ['x', 'tiktok', 'youtube', 'instagram', 'douyin', 'xiaohongshu']

describe('保存目标分流：host 分类 → 账号监控 / 灵感库 (#3454)', () => {
  describe('纯函数分流', () => {
    it('account 分类写入账号监控', () => {
      for (const platform of ACCOUNT_PLATFORMS) {
        assert.equal(saveTargetFromClassification({ kind: 'account', platform }), 'account', platform)
      }
    })

    it('content / unknown 按作品处理，回退灵感库', () => {
      assert.equal(saveTargetFromClassification({ kind: 'content', platform: 'tiktok' }), 'inspiration')
      assert.equal(saveTargetFromClassification({ kind: 'unknown', platform: 'unknown' }), 'inspiration')
    })

    it('分类失败（null / undefined）回退灵感库，不阻断保存', () => {
      assert.equal(saveTargetFromClassification(null), 'inspiration')
      assert.equal(saveTargetFromClassification(undefined), 'inspiration')
    })

    it('未知 kind 永不误入账号监控', () => {
      for (const kind of ['ACCOUNT', 'profile', '', 'undefined', 0, null, undefined]) {
        assert.equal(saveTargetFromKind(kind), 'inspiration', String(kind))
      }
    })
  })

  describe('host 响应解析', () => {
    it('解包 { data } 并保留 kind/platform/handle', () => {
      assert.deepEqual(
        readSaveTargetClassification({
          data: { kind: 'account', platform: 'tiktok', external_id: '@foo', handle: '@foo' },
        }),
        { kind: 'account', platform: 'tiktok', handle: '@foo' },
      )
    })

    it('也接受已解包的裸对象', () => {
      assert.deepEqual(
        readSaveTargetClassification({ kind: 'content', platform: 'youtube' }),
        { kind: 'content', platform: 'youtube' },
      )
    })

    it('缺 kind / kind 超出契约为 null，调用方按分类失败回退', () => {
      assert.equal(readSaveTargetClassification(null), null)
      assert.equal(readSaveTargetClassification({}), null)
      assert.equal(readSaveTargetClassification({ data: {} }), null)
      assert.equal(readSaveTargetClassification({ data: { kind: 'weird' } }), null)
      assert.deepEqual(
        readSaveTargetClassification({ data: { kind: 'account' } }),
        { kind: 'account', platform: 'unknown' },
      )
    })

    it('账号导入响应解析去重标记与 handle', () => {
      assert.deepEqual(readAccountImportOutcome({ data: { handle: '@foo' } }), { existing: false, handle: '@foo' })
      assert.deepEqual(
        readAccountImportOutcome({ data: { handle: '@foo' }, existing: true }),
        { existing: true, handle: '@foo' },
      )
      assert.deepEqual(
        readAccountImportOutcome({ data: { handle: '@foo' }, is_duplicate: true }),
        { existing: true, handle: '@foo' },
      )
      // host 的账号行可能只有 external_id；handle 缺失时用它来展示。
      assert.deepEqual(
        readAccountImportOutcome({ data: { external_id: '@bar' } }),
        { existing: false, handle: '@bar' },
      )
    })

    it('账号导入响应不可解析时仍算成功（2xx 是成功证据），只是没有 handle', () => {
      assert.deepEqual(readAccountImportOutcome(null), { existing: false })
      assert.deepEqual(readAccountImportOutcome({ data: null }), { existing: false })
    })
  })

  describe('按钮文案 zh/en', () => {
    it('灵感库 idle 保持原动作文案', () => {
      assert.equal(saveButtonLabel({ target: 'inspiration', status: 'idle', locale: 'zh' }), '保存到灵感库')
      assert.equal(saveButtonLabel({ target: 'inspiration', status: 'idle', locale: 'en' }), 'Save to Inspiration Library')
    })

    it('账号主页 idle 写明去向', () => {
      assert.equal(saveButtonLabel({ target: 'account', status: 'idle', locale: 'zh' }), '保存账号到监控')
      assert.equal(saveButtonLabel({ target: 'account', status: 'idle', locale: 'en' }), 'Save account to monitor')
    })

    it('保存中两处共用进行中文案', () => {
      assert.equal(saveButtonLabel({ target: 'inspiration', status: 'saving', locale: 'zh' }), '保存中...')
      assert.equal(saveButtonLabel({ target: 'account', status: 'saving', locale: 'en' }), 'Saving...')
    })

    it('账号成功态说明已加入账号监控', () => {
      assert.equal(saveButtonLabel({ target: 'account', status: 'saved', locale: 'zh' }), '✓ 已加入账号监控')
      assert.equal(saveButtonLabel({ target: 'account', status: 'saved', locale: 'en' }), '✓ Added to monitor')
    })

    it('灵感库成功态维持作品语义', () => {
      assert.equal(saveButtonLabel({ target: 'inspiration', status: 'saved', locale: 'zh' }), '✓ 已保存到灵感库')
      assert.equal(
        saveButtonLabel({ target: 'inspiration', status: 'saved', locale: 'en' }),
        '✓ Saved to Inspiration Library',
      )
    })

    it('失败态回到动作文案，绝不显示成功态', () => {
      const accountZhFailed = saveButtonLabel({ target: 'account', status: 'failed', locale: 'zh' })
      const accountEnFailed = saveButtonLabel({ target: 'account', status: 'failed', locale: 'en' })
      const inspirationZhFailed = saveButtonLabel({ target: 'inspiration', status: 'failed', locale: 'zh' })
      const inspirationEnFailed = saveButtonLabel({ target: 'inspiration', status: 'failed', locale: 'en' })
      // 失败态必须回到可重试的动作文案。
      assert.equal(accountZhFailed, '保存账号到监控')
      assert.equal(accountEnFailed, 'Save account to monitor')
      assert.equal(inspirationZhFailed, '保存到灵感库')
      assert.equal(inspirationEnFailed, 'Save to Inspiration Library')
      assert.ok(!accountZhFailed.includes('✓'))
      assert.ok(!accountEnFailed.includes('✓'))
      assert.ok(!inspirationZhFailed.includes('✓'))
      assert.ok(!inspirationEnFailed.includes('✓'))
      assert.notEqual(accountZhFailed, saveButtonLabel({ target: 'account', status: 'saved', locale: 'zh' }))
      assert.notEqual(accountEnFailed, saveButtonLabel({ target: 'account', status: 'saved', locale: 'en' }))
      assert.notEqual(inspirationZhFailed, saveButtonLabel({ target: 'inspiration', status: 'saved', locale: 'zh' }))
      assert.notEqual(inspirationEnFailed, saveButtonLabel({ target: 'inspiration', status: 'saved', locale: 'en' }))
    })
  })

  describe('成功/失败 toast 文案 zh/en', () => {
    it('账号新增：带单个 @ 前缀的 handle', () => {
      assert.equal(saveSuccessToast({ target: 'account', handle: '@foo' }, 'zh'), '已加入账号监控：@foo')
      assert.equal(saveSuccessToast({ target: 'account', handle: 'foo' }, 'zh'), '已加入账号监控：@foo')
      assert.equal(
        saveSuccessToast({ target: 'account', handle: '@foo' }, 'en'),
        'Added to account monitor: @foo',
      )
      assert.equal(
        saveSuccessToast({ target: 'account', handle: 'foo' }, 'en'),
        'Added to account monitor: @foo',
      )
    })

    it('抖音/小红书只有不透明 uid：toast 不拼 @id，只说明去向', () => {
      const uid = 'MS4wLjABAAAAabcdefghijklmnopqrstuvwxyz0123456789'
      for (const platform of ['douyin', 'xiaohongshu']) {
        assert.equal(saveSuccessToast({ target: 'account', handle: uid, platform }, 'zh'), '已加入账号监控')
        assert.equal(saveSuccessToast({ target: 'account', handle: uid, platform }, 'en'), 'Added to account monitor')
      }
      assert.equal(
        saveSuccessToast({ target: 'account', handle: '@foo', platform: 'tiktok' }, 'zh'),
        '已加入账号监控：@foo',
      )
    })

    it('账号新增但 host 没给 handle：说明去向，不拼 @undefined', () => {
      for (const handle of [undefined, '', '   ']) {
        assert.equal(saveSuccessToast({ target: 'account', handle }, 'zh'), '已加入账号监控')
        assert.equal(saveSuccessToast({ target: 'account', handle }, 'en'), 'Added to account monitor')
      }
    })

    it('账号已存在：明说不重复新增', () => {
      assert.equal(
        saveSuccessToast({ target: 'account', handle: '@foo', existing: true }, 'zh'),
        '该账号已在账号监控中',
      )
      assert.equal(
        saveSuccessToast({ target: 'account', handle: '@foo', existing: true }, 'en'),
        'Already in account monitor',
      )
    })

    it('灵感库沿用现有成功文案', () => {
      assert.equal(saveSuccessToast({ target: 'inspiration' }, 'zh'), '已保存到 OmniMux 灵感素材库！')
      assert.equal(saveSuccessToast({ target: 'inspiration' }, 'en'), 'Saved to Inspiration Library!')
    })

    it('431 与普通失败各有明确文案', () => {
      assert.ok(saveFailureToast('local-header-overflow', 'zh').includes('127.0.0.1'))
      assert.ok(saveFailureToast('local-header-overflow', 'en').includes('127.0.0.1'))
      assert.equal(saveFailureToast('save-failed', 'zh'), '保存失败，请检查 OmniMux 运行状态')
      assert.equal(saveFailureToast('save-failed', 'en'), 'Failed to save (check OmniMux server)')
    })

    it('失败文案不冒充任何成功文案', () => {
      const successes = [
        saveSuccessToast({ target: 'account', handle: '@foo' }, 'zh'),
        saveSuccessToast({ target: 'account', handle: '@foo' }, 'en'),
        saveSuccessToast({ target: 'account', existing: true }, 'zh'),
        saveSuccessToast({ target: 'account', existing: true }, 'en'),
        saveSuccessToast({ target: 'inspiration' }, 'zh'),
        saveSuccessToast({ target: 'inspiration' }, 'en'),
      ]
      assert.equal(successes.indexOf(saveFailureToast('local-header-overflow', 'zh')), -1)
      assert.equal(successes.indexOf(saveFailureToast('local-header-overflow', 'en')), -1)
      assert.equal(successes.indexOf(saveFailureToast('save-failed', 'zh')), -1)
      assert.equal(successes.indexOf(saveFailureToast('save-failed', 'en')), -1)
      assert.equal(successes.indexOf(saveFailureToast(undefined, 'zh')), -1)
      assert.equal(successes.indexOf(saveFailureToast(undefined, 'en')), -1)
    })

    it('handle 展示规整为单个 @ 前缀', () => {
      assert.equal(accountHandleLabel('@foo'), '@foo')
      assert.equal(accountHandleLabel('foo'), '@foo')
      assert.equal(accountHandleLabel('  @@foo  '), '@foo')
      assert.equal(accountHandleLabel(''), '')
      assert.equal(accountHandleLabel(undefined), '')
    })
  })
})

describe('后台 / 面板调用路径文本契约 (#3454)', () => {
  const extensionRoot = resolve(__dirname, '..')
  const backgroundCode = readFileSync(resolve(extensionRoot, 'src/background/index.ts'), 'utf8')
  const backgroundRoutingCode = readFileSync(resolve(extensionRoot, 'src/background/save-target.ts'), 'utf8')
  const appCode = readFileSync(resolve(extensionRoot, 'src/panel/App.tsx'), 'utf8')
  const copyCode = readFileSync(resolve(extensionRoot, 'src/panel/save-target-copy.ts'), 'utf8')

  const classifyBranchIndex = backgroundCode.indexOf("m?.type === 'DSH_CLASSIFY_SAVE_TARGET'")
  const saveBranchIndex = backgroundCode.indexOf("m?.type === 'DSH_SAVE_INSPIRATION_PANEL'")

  it('后台新增 DSH_CLASSIFY_SAVE_TARGET 消息，调用 host classify 路由', () => {
    assert.ok(classifyBranchIndex > -1, '缺少分类消息分支')
    assert.ok(classifyBranchIndex < saveBranchIndex, '分类消息应排在保存消息之前')

    const classifyBranch = backgroundCode.slice(classifyBranchIndex, saveBranchIndex)
    assert.ok(classifyBranch.includes('readSaveTargetProbeUrl'))
    assert.ok(classifyBranch.includes('resolveHostCandidatePorts'))
    assert.ok(classifyBranch.includes('classifySaveTargetOnHost'))
    assert.ok(classifyBranch.includes('kind: classified.classification.kind'))
    assert.ok(classifyBranch.includes('platform: classified.classification.platform'))
    assert.ok(classifyBranch.includes('ok: false'))
  })

  it('分类与账号导入都走 host 既有 rival-accounts 路由', () => {
    assert.ok(backgroundCode.includes(
      "const RIVAL_CLASSIFY_PATH = '/omnimux/inspiration/local/rival-accounts/classify'",
    ))
    assert.ok(backgroundCode.includes(
      "const RIVAL_ACCOUNTS_PATH = '/omnimux/inspiration/local/rival-accounts'",
    ))

    const classifyHelper = backgroundCode.slice(
      backgroundCode.indexOf('async function classifySaveTargetOnHost'),
      backgroundCode.indexOf('async function importRivalAccountOnHost'),
    )
    assert.ok(classifyHelper.includes('RIVAL_CLASSIFY_PATH'))
    assert.ok(classifyHelper.includes('readSaveTargetClassification'))
    assert.ok(classifyHelper.includes('signal: AbortSignal.timeout'))

    const importHelper = backgroundCode.slice(
      backgroundCode.indexOf('async function importRivalAccountOnHost'),
      backgroundCode.indexOf('function readSaveTargetProbeUrl'),
    )
    assert.ok(importHelper.includes('RIVAL_ACCOUNTS_PATH'))
    assert.ok(importHelper.includes('JSON.stringify({ url, background: true })'))
    assert.ok(importHelper.includes('readAccountImportOutcome'))
  })

  it('保存消息先分类再分流：account → 账号导入；分类失败 → 原灵感库流程', () => {
    const saveBranch = backgroundCode.slice(saveBranchIndex)
    const classifyAt = saveBranch.indexOf('classifySaveTargetOnHost(targetUrl, candidatePorts)')
    const accountAt = saveBranch.indexOf('importRivalAccountOnHost(targetUrl, candidatePorts)')
    const inspirationAt = saveBranch.indexOf('/omnimux/inspiration/local/import-url')

    assert.ok(classifyAt > -1, '保存前应先分类')
    assert.ok(classifyAt < accountAt, '分类应早于账号导入')
    assert.ok(accountAt < inspirationAt, '账号导入应早于灵感库兜底')

    // 分类失败时 saveTargetFromClassification(null) 返回 inspiration，落到原流程。
    assert.ok(saveBranch.includes(
      'saveTargetFromClassification(classified.ok ? classified.classification : null)',
    ))
    assert.ok(saveBranch.includes("if (saveTarget === 'account') {"))
    assert.ok(backgroundRoutingCode.includes(
      "if (classification === null || classification === undefined) return 'inspiration'",
    ))
  })

  it('account 成功响应带 target/handle/existing 且不写灵感缓存；inspiration 成功响应带 target', () => {
    const saveBranch = backgroundCode.slice(saveBranchIndex)
    const accountTargetAt = saveBranch.indexOf("target: 'account'")
    const cacheAt = saveBranch.indexOf('appendMediaInspiration({')
    const inspirationTargetAt = saveBranch.indexOf("target: 'inspiration'")

    assert.ok(accountTargetAt > -1)
    assert.ok(inspirationTargetAt > -1)
    assert.ok(accountTargetAt < cacheAt, '账号分支必须在写媒体缓存前结束')

    const accountResponse = saveBranch.slice(accountTargetAt, cacheAt)
    assert.ok(accountResponse.includes('return'))
    assert.ok(accountResponse.includes('handle: accountResult.handle'))
    assert.ok(accountResponse.includes('existing: accountResult.existing'))
  })

  it('失败语义沿用 431 与 save-failed', () => {
    const saveBranch = backgroundCode.slice(saveBranchIndex)
    assert.ok(saveBranch.includes('if (res?.status === 431) headerOverflow = true'))
    assert.ok(saveBranch.includes("code: headerOverflow ? 'local-header-overflow' : 'save-failed'"))
  })

  it('面板按 pageScene.url 去抖分类并驱动两处按钮文案', () => {
    assert.ok(appCode.includes("type: 'DSH_CLASSIFY_SAVE_TARGET'"))
    assert.ok(appCode.includes('pageScene?.url'))
    assert.ok(appCode.includes('setClassifiedSaveTarget'))
    assert.ok(appCode.includes('}, 300)'))
    assert.ok(appCode.includes('savedSaveTarget'))
    // sticky bar 与 hero 药丸共用同一个文案函数。
    const buttonLabelCalls = appCode.match(/saveButtonLabel\(\{/g) || []
    assert.equal(buttonLabelCalls.length, 2)
    assert.ok(appCode.includes('saveSuccessToast('))
    assert.ok(appCode.includes('saveFailureToast('))
    // 文案已抽到可测模块，JSX 里不再内联成功文案。
    assert.ok(!appCode.includes("locale === 'en' ? 'Saved to Inspiration Library!'"))
    assert.ok(copyCode.includes('Saved to Inspiration Library!'))
  })

  it('面板成功/失败反馈按后台返回的 target 区分，而不是按分类猜测', () => {
    const saveFnBlock = appCode.slice(
      appCode.indexOf('const handleSaveToInspiration'),
      appCode.indexOf('const updateThemeSetting'),
    )
    assert.ok(saveFnBlock.includes("if (bgRes.target === 'account') savedTarget = 'account'"))
    assert.ok(saveFnBlock.includes('savedHandle = bgRes.handle'))
    assert.ok(saveFnBlock.includes('savedExisting = bgRes.existing === true'))
    assert.ok(saveFnBlock.includes('setSavedSaveTarget(savedTarget)'))
    assert.ok(saveFnBlock.includes('saveSuccessToast('))
    assert.ok(saveFnBlock.includes('saveFailureToast('))
  })
})
