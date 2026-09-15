/**
 * 「AI应用」清单数据源（appLibrary.js）的纯逻辑契约。
 *
 * 真实落点是浏览器 `localStorage['omnimux_apps_manifests']`；这里用内存
 * Storage 替身把「读坏数据不炸」「删失败不报成功」「反查所属项目」三条
 * 最容易假成功的路径钉死。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  APP_MANIFESTS_STORAGE_KEY,
  APP_TAB_ID_PREFIX,
  appCategoryLabelKey,
  appEntryMatchesQuery,
  appIdFromTabId,
  appIdOfOpenAppTab,
  appTabIdFor,
  forgetOpenAppTab,
  listPublishedApps,
  openAppTabIdFor,
  projectOwnsWorkspace,
  readAppManifestMap,
  registerOpenAppTab,
  removePublishedApp,
  resetOpenAppTabs,
  resolveAppEditTarget,
  resolveOwningProject,
  toPublishedAppEntry,
} from './appLibrary.js'

/** 内存 Storage 替身：只实现被测代码真正用到的 getItem / setItem。 */
function makeStorage(initial = {}, { failWrite = false } = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (failWrite) throw new Error('QuotaExceededError')
      map.set(key, String(value))
    },
    raw: map,
  }
}

const manifest = (appId, createdAt, extra = {}) => ({
  appId,
  version: '1.0.0',
  createdAt,
  metadata: { name: `应用 ${appId}`, category: 'video', description: '说明', coverUrl: '' },
  workflowBinding: { workspaceId: `ws_${appId}`, nodes: [], edges: [], ...(extra.binding || {}) },
  ...extra,
})

const storageWith = (rows) => makeStorage({
  [APP_MANIFESTS_STORAGE_KEY]: JSON.stringify(Object.fromEntries(rows.map((row) => [row.appId, row]))),
})

describe('appLibrary: 读取与列清单', () => {
  it('按 createdAt 倒序，最新发布的排最前', () => {
    const storage = storageWith([
      manifest('app_old', '2026-09-01T00:00:00.000Z'),
      manifest('app_new', '2026-09-10T00:00:00.000Z'),
      manifest('app_mid', '2026-09-05T00:00:00.000Z'),
    ])
    assert.deepEqual(
      listPublishedApps(storage).map((entry) => entry.appId),
      ['app_new', 'app_mid', 'app_old'],
    )
  })

  it('缺 createdAt 的条目排在最后，不会挤掉有时间的新应用', () => {
    const storage = storageWith([
      manifest('app_no_time', ''),
      manifest('app_dated', '2026-09-10T00:00:00.000Z'),
    ])
    assert.deepEqual(
      listPublishedApps(storage).map((entry) => entry.appId),
      ['app_dated', 'app_no_time'],
    )
  })

  it('非法 JSON / 数组 / 空串 / 无存储一律返回空清单且不抛异常', () => {
    const cases = [
      makeStorage({ [APP_MANIFESTS_STORAGE_KEY]: '{ not json' }),
      makeStorage({ [APP_MANIFESTS_STORAGE_KEY]: '[1,2,3]' }),
      makeStorage({ [APP_MANIFESTS_STORAGE_KEY]: '""' }),
      makeStorage({ [APP_MANIFESTS_STORAGE_KEY]: '   ' }),
      makeStorage({}),
      null,
      undefined,
      { getItem() { throw new Error('SecurityError') } },
    ]
    for (const storage of cases) {
      assert.deepEqual(listPublishedApps(storage), [], `存储形态：${JSON.stringify(storage)}`)
      assert.deepEqual(readAppManifestMap(storage), {})
    }
  })

  it('条目映射字段齐全，缺字段给安全缺省而不是 undefined', () => {
    const storage = storageWith([{ appId: 'app_bare', metadata: {} }])
    const [entry] = listPublishedApps(storage)
    assert.equal(entry.appId, 'app_bare')
    assert.equal(entry.name, 'app_bare', '缺 metadata.name 时回退为 appId，卡片不能空白')
    for (const field of ['category', 'description', 'coverUrl', 'iconSvg', 'version', 'createdAt', 'workspaceId', 'projectId', 'groupId']) {
      assert.equal(entry[field], '', `缺省字段 ${field} 必须是空串`)
      assert.notEqual(entry[field], undefined)
    }
  })

  it('映射键兜底：manifest 自己缺 appId 时用映射键，键也没有才丢弃', () => {
    const storage = makeStorage({
      [APP_MANIFESTS_STORAGE_KEY]: JSON.stringify({
        app_from_key: { metadata: { name: '来自键' } },
        app_orphan: null,
      }),
    })
    const entries = listPublishedApps(storage)
    assert.deepEqual(entries.map((entry) => entry.appId), ['app_from_key'])
    assert.equal(entries[0].name, '来自键')
    assert.equal(toPublishedAppEntry(null, 'app_x'), null)
    assert.equal(toPublishedAppEntry({}, ''), null)
  })

  it('从 workflowBinding 读出项目与工作组归属', () => {
    const storage = storageWith([
      manifest('app_a', '2026-09-10T00:00:00.000Z', {
        binding: { projectId: 'proj_1', sourceGroupId: 'group_9' },
      }),
    ])
    const [entry] = listPublishedApps(storage)
    assert.equal(entry.projectId, 'proj_1')
    assert.equal(entry.groupId, 'group_9')
    assert.equal(entry.workspaceId, 'ws_app_a')
  })
})

describe('appLibrary: 删除记录', () => {
  it('只移除目标键，其他条目原样保留', () => {
    const storage = storageWith([
      manifest('app_keep', '2026-09-10T00:00:00.000Z'),
      manifest('app_drop', '2026-09-11T00:00:00.000Z'),
    ])
    assert.deepEqual(removePublishedApp('app_drop', storage), { ok: true })
    const left = readAppManifestMap(storage)
    assert.deepEqual(Object.keys(left), ['app_keep'])
    assert.equal(left.app_keep.appId, 'app_keep')
  })

  it('记录不存在 / appId 为空 → 失败结果，不算删除成功', () => {
    const storage = storageWith([manifest('app_only', '2026-09-10T00:00:00.000Z')])
    assert.deepEqual(removePublishedApp('app_missing', storage), { ok: false, reason: 'not-found' })
    assert.deepEqual(removePublishedApp('', storage), { ok: false, reason: 'invalid-app-id' })
    assert.deepEqual(removePublishedApp(null, storage), { ok: false, reason: 'invalid-app-id' })
    assert.deepEqual(Object.keys(readAppManifestMap(storage)), ['app_only'], '失败时不得改动存储')
  })

  it('存储不可用 / 写盘抛错 → 失败结果且不报告成功', () => {
    assert.deepEqual(removePublishedApp('app_a', null), { ok: false, reason: 'storage-unavailable' })
    assert.deepEqual(removePublishedApp('app_a', { getItem: () => null }), { ok: false, reason: 'storage-unavailable' })

    const failing = storageWith([manifest('app_a', '2026-09-10T00:00:00.000Z')])
    failing.setItem = () => { throw new Error('QuotaExceededError') }
    assert.deepEqual(removePublishedApp('app_a', failing), { ok: false, reason: 'write-failed' })
    assert.equal(listPublishedApps(failing).length, 1, '写盘失败后原记录必须仍在')
  })
})

describe('appLibrary: 反查所属项目与编辑目标', () => {
  const projects = [
    { id: 'proj_direct', title: '直接命中', canvasWorkspaceIds: ['ws_other'] },
    { id: 'proj_by_ws', title: '按工作区命中', canvasWorkspaceIds: ['ws_app_legacy'] },
    { id: 'proj_by_page', title: '按创作页命中', canvasWorkspaceIds: [], pages: [{ canvasWorkspaceId: 'ws_app_paged' }] },
  ]

  it('优先按 manifest 记下的 projectId 命中', () => {
    const hit = resolveOwningProject(projects, { projectId: 'proj_direct', workspaceId: 'ws_app_legacy' })
    assert.equal(hit.id, 'proj_direct')
  })

  it('projectId 命中不到时，回落到 canvasWorkspaceIds / pages 反查（兼容旧记录）', () => {
    assert.equal(resolveOwningProject(projects, { projectId: 'proj_gone', workspaceId: 'ws_app_legacy' }).id, 'proj_by_ws')
    assert.equal(resolveOwningProject(projects, { workspaceId: 'ws_app_paged' }).id, 'proj_by_page')
  })

  it('都不命中 / 缺参 → null，不编造归属', () => {
    assert.equal(resolveOwningProject(projects, { projectId: 'nope', workspaceId: 'ws_nope' }), null)
    assert.equal(resolveOwningProject(projects, { workspaceId: '' }), null)
    assert.equal(resolveOwningProject(projects, null), null)
    assert.equal(resolveOwningProject(null, { workspaceId: 'ws_app_legacy' }), null)
    assert.equal(resolveOwningProject([], { workspaceId: 'ws_app_legacy' }), null)
  })

  it('projectOwnsWorkspace 认 canvasWorkspaceIds 与任一创作页', () => {
    assert.equal(projectOwnsWorkspace(projects[0], 'ws_other'), true)
    assert.equal(projectOwnsWorkspace(projects[2], 'ws_app_paged'), true)
    assert.equal(projectOwnsWorkspace(projects[2], 'ws_none'), false)
    assert.equal(projectOwnsWorkspace(projects[2], ''), false)
    assert.equal(projectOwnsWorkspace(null, 'ws_other'), false)
  })

  it('编辑目标给出项目/工作区/组三件套，缺归属时组 id 为空串', () => {
    assert.deepEqual(
      resolveAppEditTarget({ projectId: 'proj_1', workspaceId: 'ws_1', groupId: 'group_1' }),
      { projectId: 'proj_1', workspaceId: 'ws_1', groupId: 'group_1' },
    )
    assert.deepEqual(
      resolveAppEditTarget({ projectId: 'proj_1', workspaceId: 'ws_1' }),
      { projectId: 'proj_1', workspaceId: 'ws_1', groupId: '' },
      '旧记录没有组归属时必须显式给空串，调用方据此降级为「只打开画布」',
    )
    assert.deepEqual(resolveAppEditTarget(null), { projectId: '', workspaceId: '', groupId: '' })
  })
})

describe('appLibrary: 标签页 id 与卡片文案', () => {
  it('应用标签页 id 与 appId 双向换算，且与 openAppTab 约定一致', () => {
    assert.equal(APP_TAB_ID_PREFIX, 'app_')
    assert.equal(appTabIdFor('app_marketing_v1'), 'app_app_marketing_v1')
    assert.equal(appIdFromTabId('app_app_marketing_v1'), 'app_marketing_v1')
    assert.equal(appIdFromTabId('omnimux-workflow:canvas'), '')
    assert.equal(appTabIdFor(''), '')
    assert.equal(appIdFromTabId(''), '')
  })

  it('分类副标题走既有 i18n 键，未知分类不返回 undefined', () => {
    assert.equal(appCategoryLabelKey('video'), 'projects.appCategoryVideo')
    assert.equal(appCategoryLabelKey('image'), 'projects.appCategoryImage')
    assert.equal(appCategoryLabelKey('audio'), 'projects.appCategoryAudio')
    assert.equal(appCategoryLabelKey('whatever'), 'projects.appCategoryUnknown')
    assert.equal(appCategoryLabelKey(undefined), 'projects.appCategoryUnknown')
    assert.ok(appCategoryLabelKey(''), '空分类也要落到「未知」键')
  })

  it('搜索匹配应用名与描述，空搜索词不过滤', () => {
    const entry = { name: '营销短片', description: 'product promo' }
    assert.equal(appEntryMatchesQuery(entry, ''), true)
    assert.equal(appEntryMatchesQuery(entry, '  '), true)
    assert.equal(appEntryMatchesQuery(entry, '营销'), true)
    assert.equal(appEntryMatchesQuery(entry, 'PROMO'), true, '大小写不敏感')
    assert.equal(appEntryMatchesQuery(entry, '不存在'), false)
    assert.equal(appEntryMatchesQuery(null, '营销'), false)
  })

  // 宿主原生 surface 另发标签页 id（实测 tab6），插件在 openTab 时拿不到；
  // 「删除后关掉该应用的标签页」只能靠标签页组件登记回来的映射。
  describe('应用标签页登记表', () => {
    it('登记后可按 appId 反查宿主标签页 id，并按 id 忘掉', () => {
      resetOpenAppTabs()
      registerOpenAppTab('tab6', 'app_demo_video_001')
      assert.equal(appIdOfOpenAppTab('tab6'), 'app_demo_video_001')
      assert.equal(openAppTabIdFor('app_demo_video_001'), 'tab6')
      forgetOpenAppTab('tab6')
      assert.equal(appIdOfOpenAppTab('tab6'), '')
      assert.equal(openAppTabIdFor('app_demo_video_001'), '', '忘掉后不得再命中')
    })

    it('同一标签页换应用后反查跟着走，不会指向旧应用', () => {
      resetOpenAppTabs()
      registerOpenAppTab('tab6', 'app_demo_image_002')
      registerOpenAppTab('tab6', 'app_demo_video_001')
      assert.equal(openAppTabIdFor('app_demo_image_002'), '', '旧应用不得再命中这个标签页')
      assert.equal(openAppTabIdFor('app_demo_video_001'), 'tab6')
    })

    it('空 id / 空 appId 不写脏登记，查询也不返回 undefined', () => {
      resetOpenAppTabs()
      registerOpenAppTab('', 'app_demo_video_001')
      registerOpenAppTab('tab6', '')
      assert.equal(appIdOfOpenAppTab('tab6'), '')
      assert.equal(openAppTabIdFor('app_demo_video_001'), '', 'appId 为空的登记不得被当成命中')
      assert.equal(openAppTabIdFor(''), '')
      assert.equal(appIdOfOpenAppTab(undefined), '')
      assert.equal(openAppTabIdFor(undefined), '')
    })
  })
})
