import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_TAB_ID, openAppTab, bindBetterSidebar } from './projectCanvas.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('AppTab and AI App Workflow integration', () => {
  it('AppTab.jsx: 源码契约验证工作台双栏布局与关键控件几何', () => {
    const src = readFileSync(join(here, 'AppTab.jsx'), 'utf8')
    const stylesSrc = readFileSync(join(here, '../styles.js'), 'utf8')
    // 导出 AppTab 组件
    assert.match(src, /export function AppTab/)
    // 读取 seed.extra?.manifest 或 localStorage
    assert.match(src, /readCachedManifest/)
    assert.match(src, /omnimux_apps_manifests/)
    // 左表单 448px 几何与 398px 可用宽
    assert.match(stylesSrc, /448px/)
    assert.match(stylesSrc, /398px/)
    // 44px 主按钮「立即生成」
    assert.match(src, /立即生成/)
    assert.match(stylesSrc, /height:\s*44px/)
    // 右侧任务状态与产物输出
    assert.match(src, /任务记录/)
    assert.match(src, /示例演示/)
    assert.match(src, /mediaUrl/)
    // 调用执行接口
    assert.match(src, /__OMNIMUX_APPS_EXECUTE__|\/executions/)
  })

  it('index.js: 源码契约向 betterSidebar 注册 APP_TAB_ID', () => {
    const src = readFileSync(join(here, '../index.js'), 'utf8')
    assert.match(src, /APP_TAB_ID/)
    assert.match(src, /registerAppTab/)
    assert.match(src, /order:\s*6/)
    assert.match(src, /single:\s*false/)
    assert.match(src, /component:\s*\(props\)\s*=>\s*createElement\(AppTab/)
  })

  it('PublishWizardModal.tsx: 源码契约在发布成功后调度打开 AppTab', () => {
    const modalPath = join(here, '../../canvas/editor/components/publish/PublishWizardModal.tsx')
    const src = readFileSync(modalPath, 'utf8')
    assert.match(src, /__omnimuxOpenAppTab/)
    assert.match(src, /__omnimuxBetterSidebar/)
  })

  it('openAppTab coordinates with betterSidebar to open APP_TAB_ID', () => {
    const opened = []
    const mockSidebar = {
      openTab(seed, scope) {
        opened.push({ seed, scope })
        return true
      },
    }

    bindBetterSidebar(mockSidebar)

    const manifest = {
      appId: 'app_marketing_v1',
      version: '1.0.0',
      metadata: {
        name: '营销文案视频生成器',
        category: 'video',
      },
    }

    const res = openAppTab(manifest, { scope: { sessionId: 'sess_123' } })
    assert.equal(res, true)
    assert.equal(opened.length, 1)
    assert.equal(opened[0].seed.type, APP_TAB_ID)
    assert.equal(opened[0].seed.id, 'app_app_marketing_v1')
    assert.equal(opened[0].seed.title, '营销文案视频生成器')
    assert.equal(opened[0].seed.path, 'app://app_marketing_v1')
    assert.deepEqual(opened[0].seed.extra.manifest, manifest)
    assert.equal(opened[0].scope.sessionId, 'sess_123')

    bindBetterSidebar(null)
  })
})
