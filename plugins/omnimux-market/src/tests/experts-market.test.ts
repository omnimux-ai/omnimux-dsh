import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { beforeEach, afterEach } from 'node:test'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dshHome, withDefaults } from '../config-store.js'
import { handleApi, DEFAULT_MARKET_EXPERTS, materializeEnabledMarketExperts, healAgentPresetCordis, healInstalledAgentPresets, setAgentPresetsNotify, reconcileMarketExperts } from '../local-api.js'

function cleanRetiredTestExperts() {
  const home = dshHome()
  const retired = join(home, '.agent-presets', '.retired')
  if (existsSync(retired)) {
    try {
      const files = readdirSync(retired)
      for (const f of files) {
        if (DEFAULT_MARKET_EXPERTS.some((exp) => f === exp.id || f.startsWith(`${exp.id}-`))) {
          rmSync(join(retired, f), { recursive: true, force: true })
        }
      }
    } catch {}
  }
}

beforeEach(() => {
  cleanRetiredTestExperts()
})

afterEach(() => {
  cleanRetiredTestExperts()
})

function mockReq(method: string, url: string, headers: Record<string, string> = {}, body?: unknown): IncomingMessage {
  const bodyStr = body !== undefined ? JSON.stringify(body) : ''
  const stream = new Readable({
    read() {
      if (bodyStr) this.push(Buffer.from(bodyStr))
      this.push(null)
    },
  }) as unknown as IncomingMessage
  stream.method = method
  stream.url = url
  stream.headers = {
    host: '127.0.0.1:3080',
    ...headers,
  }
  return stream
}

function mockRes(): ServerResponse & { _status: number, _body: string, _json: any } {
  const res = {
    statusCode: 200,
    _status: 200,
    _body: '',
    _json: null,
    setHeader() {},
    end(chunk?: string | Buffer) {
      this._status = this.statusCode
      this._body = chunk == null ? '' : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      try {
        this._json = JSON.parse(this._body)
      } catch {
        this._json = null
      }
    },
  }
  return res as unknown as ServerResponse & { _status: number, _body: string, _json: any }
}

test('DEFAULT_MARKET_EXPERTS defines 5 streamlined ecommerce experts', () => {
  assert.equal(DEFAULT_MARKET_EXPERTS.length, 5)
  const ids = DEFAULT_MARKET_EXPERTS.map(e => e.id)
  assert.deepEqual(ids, [
    'shopee-ops-expert',
    'youtube-creator-expert',
    'amazon-operations-expert',
    'tiktok-ecommerce-expert',
    'media-creator',
  ])
  for (const exp of DEFAULT_MARKET_EXPERTS) {
    assert.ok(exp.name, `${exp.id} has name`)
    assert.ok(exp.nameEn, `${exp.id} has nameEn`)
    assert.ok(exp.description, `${exp.id} has description`)
    assert.ok(exp.avatar, `${exp.id} has avatar`)
  }
})

test('expertMarketList returns streamlined items with status', async () => {
  const cfg = withDefaults({})
  const req = mockReq('POST', '/api', {
    origin: 'http://127.0.0.1:3080',
    'sec-fetch-site': 'same-origin',
  }, { method: 'expertMarketList' })
  const res = mockRes()
  await handleApi(req, res, cfg)

  assert.equal(res._status, 200)
  assert.equal(res._json?.ok, true)
  assert.ok(res._json?.items?.length >= 5)
  const items = res._json.items
  const shopee = items.find((it: any) => it.id === 'shopee-ops-expert')
  assert.ok(shopee)
  assert.equal(shopee.status, 'enabled')
  const amazonOps = items.find((it: any) => it.id === 'amazon-operations-expert')
  assert.ok(amazonOps)
  assert.equal(amazonOps.status, 'enabled')
  const tiktokEcom = items.find((it: any) => it.id === 'tiktok-ecommerce-expert')
  assert.ok(tiktokEcom)
  assert.equal(tiktokEcom.status, 'enabled')
  const mediaCreator = items.find((it: any) => it.id === 'media-creator')
  assert.ok(mediaCreator)
  assert.equal(mediaCreator.status, 'available')
  assert.ok(!items.some((it: any) => it.id === 'html-generator'), 'html-generator must be removed')
})

test('amazon-operations-expert and tiktok-ecommerce-expert install with specialized presets', async () => {
  const cfg = withDefaults({})
  const req = mockReq('POST', '/api', {
    origin: 'http://127.0.0.1:3080',
    'sec-fetch-site': 'same-origin',
  }, { method: 'expertMarketInstall', id: 'amazon-operations-expert' })
  const res = mockRes()
  await handleApi(req, res, cfg)
  assert.equal(res._status, 200)
  assert.equal(res._json?.status, 'enabled')

  // Clean up
  const reqDis = mockReq('POST', '/api', {
    origin: 'http://127.0.0.1:3080',
    'sec-fetch-site': 'same-origin',
  }, { method: 'expertMarketDisable', id: 'amazon-operations-expert' })
  const resDis = mockRes()
  await handleApi(reqDis, resDis, cfg)
  assert.equal(resDis._json?.status, 'disabled')
})

test('expertMarketInstall and expertMarketDisable toggle preset lifecycle with media-creator', async () => {
  const cfg = withDefaults({})
  const testId = 'media-creator'

  // Install
  const reqInstall = mockReq('POST', '/api', {
    origin: 'http://127.0.0.1:3080',
    'sec-fetch-site': 'same-origin',
  }, { method: 'expertMarketInstall', id: testId })
  const resInstall = mockRes()
  await handleApi(reqInstall, resInstall, cfg)
  assert.equal(resInstall._status, 200)
  assert.equal(resInstall._json?.ok, true)
  assert.equal(resInstall._json?.status, 'enabled')

  // Verify list reflects enabled
  const reqList1 = mockReq('POST', '/api', {
    origin: 'http://127.0.0.1:3080',
    'sec-fetch-site': 'same-origin',
  }, { method: 'expertMarketList' })
  const resList1 = mockRes()
  await handleApi(reqList1, resList1, cfg)
  const itemAfterInstall = resList1._json?.items?.find((it: any) => it.id === testId)
  assert.equal(itemAfterInstall?.status, 'enabled')

  // Disable
  const reqDisable = mockReq('POST', '/api', {
    origin: 'http://127.0.0.1:3080',
    'sec-fetch-site': 'same-origin',
  }, { method: 'expertMarketDisable', id: testId })
  const resDisable = mockRes()
  await handleApi(reqDisable, resDisable, cfg)
  assert.equal(resDisable._status, 200)
  assert.equal(resDisable._json?.ok, true)
  assert.equal(resDisable._json?.status, 'disabled')

  // Verify list reflects disabled (已离职)
  const reqList2 = mockReq('POST', '/api', {
    origin: 'http://127.0.0.1:3080',
    'sec-fetch-site': 'same-origin',
  }, { method: 'expertMarketList' })
  const resList2 = mockRes()
  await handleApi(reqList2, resList2, cfg)
  const itemAfterDisable = resList2._json?.items?.find((it: any) => it.id === testId)
  assert.equal(itemAfterDisable?.status, 'disabled')

  // Re-install after disabled
  const reqReinstall = mockReq('POST', '/api', {
    origin: 'http://127.0.0.1:3080',
    'sec-fetch-site': 'same-origin',
  }, { method: 'expertMarketInstall', id: testId })
  const resReinstall = mockRes()
  await handleApi(reqReinstall, resReinstall, cfg)
  assert.equal(resReinstall._status, 200)
  assert.equal(resReinstall._json?.status, 'enabled')
})

test('i18n and UI contracts for 技能/专家 and 专家市场', () => {
  const i18n = readFileSync(new URL('../../src/client/i18n.js', import.meta.url), 'utf8')
  assert.match(i18n, /"plaza\.title": "技能\/专家"/)
  assert.match(i18n, /"plaza\.title": "Skills (&|\/) Experts"/)
  assert.match(i18n, /"workshop\.tabExpertsMarket": "专家市场"/)
  assert.match(i18n, /"workshop\.tabExpertsMarket": "Experts Market"/)
  assert.match(i18n, /"expertMarket\.title": "专家市场"/)
  assert.match(i18n, /"expertMarket\.title": "Experts Market"/)
  assert.match(i18n, /"expertMarket\.searchPlaceholder": "搜索全部专家"/)
  assert.match(i18n, /"expertMarket\.searchPlaceholder": "Search all experts\.\.\."/)
  assert.match(i18n, /"expertMarket\.createExpert": "创建专家"/)
  assert.match(i18n, /"expertMarket\.createExpert": "Create Expert"/)
  assert.match(i18n, /"expertMarket\.enabled": "已入职"/)
  assert.match(i18n, /"expertMarket\.enabled": "Employed"/)
  assert.match(i18n, /"expertMarket\.available": "可聘用"/)
  assert.match(i18n, /"expertMarket\.available": "Hireable"/)
  assert.match(i18n, /"expertMarket\.disabled": "已离职"/)
  assert.match(i18n, /"expertMarket\.disabled": "Resigned"/)
  assert.match(i18n, /"workshop\.title": "技能\/专家"/)
  assert.match(i18n, /"workshop\.title": "Skills (&|\/) Experts"/)

  const plaza = readFileSync(new URL('../../src/client/skill-plaza.js', import.meta.url), 'utf8')
  assert.match(plaza, /mainTab === "experts-market"/)
  assert.match(plaza, /introHeading/)
  assert.match(plaza, /workshop-intro/)
  assert.match(plaza, /btn-create/)
  assert.match(plaza, /expertMarket\.createExpert/)
  assert.match(plaza, /expert-market-grid/)
  assert.match(plaza, /expert-card/)
  assert.match(plaza, /expert-pill-btn/)
  assert.match(plaza, /expertMarket\.disabled/)

  const css = readFileSync(new URL('../../src/client/css.js', import.meta.url), 'utf8')
  assert.match(css, /\.expert-market-grid/)
  assert.match(css, /\.expert-card/)
  assert.match(css, /\.expert-card-avatar-wrap/)
  assert.match(css, /\.expert-pill-btn/)
  assert.match(css, /\.expert-card-status\.disabled/)

  const apply = readFileSync(new URL('../../src/client/apply.js', import.meta.url), 'utf8')
  assert.doesNotMatch(apply, /plazaRemote\s*=\s*ctx\.remote/, 'must not synchronously access ctx.remote without inject')
  assert.match(apply, /ctx\.inject\(\["remote"\],/, 'must safely inject remote service')
})

test('all 8 experts define crisp deterministic pixel avatars', () => {
  for (const exp of DEFAULT_MARKET_EXPERTS) {
    assert.ok(exp.avatar, `${exp.id} has avatar`)
    assert.match(exp.avatar, /^data:image\/svg\+xml/, `${exp.id} avatar is svg data uri`)
    assert.match(decodeURIComponent(exp.avatar), /shape-rendering="crispEdges"/, `${exp.id} has pixel art rendering tag`)
    assert.match(decodeURIComponent(exp.avatar), /viewBox="0 0 16 16"/, `${exp.id} is 16x16 pixel grid`)
  }
})

test('materializeEnabledMarketExperts 启动物化：enabled 初值专家幂等落盘', () => {
  const home = mkdtempSync(join(tmpdir(), 'omx-expert-materialize-'))
  try {
    const first = materializeEnabledMarketExperts(home)
    assert.deepEqual(first.sort(), [
      'amazon-operations-expert',
      'shopee-ops-expert',
      'tiktok-ecommerce-expert',
      'youtube-creator-expert',
    ])
    for (const id of first) {
      assert.ok(existsSync(join(home, '.agent-presets', id, 'preset.yml')), `${id} preset.yml 落盘`)
      assert.ok(existsSync(join(home, '.agent-presets', id, 'agent.cordis.yml')), `${id} agent.cordis.yml 落盘`)
      const cordis = readFileSync(join(home, '.agent-presets', id, 'agent.cordis.yml'), 'utf8')
      assert.ok(cordis.includes('sampleOverCapGlobResults: false'), `${id} tool-fs-search 必须包含 sampleOverCapGlobResults`)
      assert.ok(cordis.includes('provider: spawn'), `${id} tool-subagent 必须包含 provider: spawn`)
      assert.ok(cordis.includes('provider: fork'), `${id} tool-subagent-fork 必须包含 provider: fork`)
    }
    // initialStatus 为 available 的专家不被物化
    assert.ok(!existsSync(join(home, '.agent-presets', 'media-creator')))
    assert.ok(!existsSync(join(home, '.agent-presets', 'html-generator')))
    // 幂等：第二次物化无新增
    assert.deepEqual(materializeEnabledMarketExperts(home), [])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('healInstalledAgentPresets 自动修复缺失 sampleOverCapGlobResults 和 provider 的存量预设', () => {
  const home = mkdtempSync(join(tmpdir(), 'omx-expert-heal-'))
  try {
    const dir = join(home, '.agent-presets', 'media-creator')
    mkdirSync(dir, { recursive: true })
    const legacy = `# media-creator Agent Preset
- id: persona
  name: '@deepseek-ai/dsh-persona'
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
- id: tool-subagent-fork
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: fork
    toolName: subagent_fork
    backgroundMode: continuable
`
    writeFileSync(join(dir, 'agent.cordis.yml'), legacy, 'utf8')
    const healed = healInstalledAgentPresets(home)
    assert.equal(healed.length, 1)
    const fixed = readFileSync(join(dir, 'agent.cordis.yml'), 'utf8')
    assert.ok(fixed.includes('sampleOverCapGlobResults: false'))
    assert.ok(fixed.includes('provider: spawn'))
    assert.ok(fixed.includes('provider: fork'))
    // 再次自愈幂等
    assert.deepEqual(healInstalledAgentPresets(home), [])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('healAgentPresetCordis 支持 CRLF 跨平台换行与已有部分 config 字段自愈合并', () => {
  // 1. CRLF 格式且已有部分 config（但缺少必填字段）
  const legacyCrlf = [
    '# media-creator Agent Preset',
    '- id: persona',
    '  name: \'@deepseek-ai/dsh-persona\'',
    '- id: tool-fs-search',
    '  name: \'@deepseek-ai/dsh-tool-fs-search\'',
    '  config:',
    '    timeoutMs: 5000',
    '- id: tool-subagent',
    '  name: \'@deepseek-ai/dsh-tool-subagent\'',
    '  config:',
    '    customHeader: true',
  ].join('\r\n')

  const healed = healAgentPresetCordis(legacyCrlf)
  assert.ok(healed.includes('\r\n'), '输出必须保留 CRLF 换行')
  assert.ok(healed.includes('sampleOverCapGlobResults: false'), 'tool-fs-search 在已有 config 下成功插入缺失必填字段')
  assert.ok(healed.includes('timeoutMs: 5000'), '保留已有 config 内容')
  assert.ok(healed.includes('provider: spawn'), 'tool-subagent 在已有 config 下成功插入 provider: spawn')
  assert.ok(healed.includes('customHeader: true'), '保留已有 subagent config')

  // 幂等自愈
  assert.equal(healAgentPresetCordis(healed), healed, '已自愈内容再次调用保持完全一致')
})

test('materializeEnabledMarketExperts 尊重用户禁用：.retired 标记不复活', () => {
  const home = mkdtempSync(join(tmpdir(), 'omx-expert-materialize-retired-'))
  try {
    mkdirSync(join(home, '.agent-presets', '.retired'), { recursive: true })
    writeFileSync(join(home, '.agent-presets', '.retired', `shopee-ops-expert-${Date.now()}`), '', 'utf8')
    const installed = materializeEnabledMarketExperts(home)
    assert.equal(installed.length, 3)
    assert.ok(!installed.includes('shopee-ops-expert'))
    assert.ok(!existsSync(join(home, '.agent-presets', 'shopee-ops-expert')))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('expertMarketInstall/Disable 触发 Agent 预设列表变更广播钩子', async () => {
  const cfg = withDefaults({})
  let calls = 0
  setAgentPresetsNotify(() => { calls += 1 })
  try {
    const reqInstall = mockReq('POST', '/api', {
      origin: 'http://127.0.0.1:3080',
      'sec-fetch-site': 'same-origin',
    }, { method: 'expertMarketInstall', id: 'media-creator' })
    const resInstall = mockRes()
    await handleApi(reqInstall, resInstall, cfg)
    assert.equal(resInstall._json?.ok, true)
    assert.equal(calls, 1)

    const reqDisable = mockReq('POST', '/api', {
      origin: 'http://127.0.0.1:3080',
      'sec-fetch-site': 'same-origin',
    }, { method: 'expertMarketDisable', id: 'media-creator' })
    const resDisable = mockRes()
    await handleApi(reqDisable, resDisable, cfg)
    assert.equal(resDisable._json?.ok, true)
    assert.equal(calls, 2)
  } finally {
    setAgentPresetsNotify(null)
  }
})

test('reconcileMarketExperts aggregates official system presets and custom agents', () => {
  const home = mkdtempSync(join(tmpdir(), 'omx-expert-reconcile-'))
  try {
    const officialMocks = [
      { id: 'standard', trust: 'system', name: '代码开发' },
      { id: 'tiktok-agent', trust: 'system', name: 'TikTok运营专家团' },
      { id: 'my-custom-agent', trust: 'user', name: '我的私有助手', description: '专属定制助手' },
    ]
    const items = reconcileMarketExperts(home, officialMocks as any)
    assert.ok(items.length >= 8)
    const standard = items.find((it: any) => it.id === 'standard')
    assert.ok(standard)
    assert.equal(standard.group, 'system')
    assert.equal(standard.status, 'enabled')

    const custom = items.find((it: any) => it.id === 'my-custom-agent')
    assert.ok(custom)
    assert.equal(custom.group, 'custom')
    assert.equal(custom.name, '我的私有助手')
    assert.equal(custom.status, 'enabled')

    // 出海专精专家必须存在
    const tkEcom = items.find((it: any) => it.id === 'tiktok-ecommerce-expert')
    assert.ok(tkEcom)
    assert.equal(tkEcom.group, 'ecommerce')

    // 绝对不存在 html-generator
    assert.ok(!items.some((it: any) => it.id === 'html-generator'))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('host apply 接入启动物化与预设列表广播（源码契约）', () => {
  const host = readFileSync(new URL('../../src/host.ts', import.meta.url), 'utf8')
  assert.match(host, /materializeEnabledMarketExperts\(dshHome\(\)\)/, '激活时必须启动物化已入职专家')
  assert.match(host, /setAgentPresetsNotify\(/, '激活时必须注入预设列表广播钩子')
  assert.match(host, /ctx\.emit\('settings\/document-updated' as any, 'agent-presets'/, '广播必须复用官方转发白名单事件')
})
