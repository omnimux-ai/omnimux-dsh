import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(here, name), 'utf8')

const saveJs = read('cloud-save.js')
const localFeedJs = read('use-assets-feed.js')
const cloudFeedJs = read('use-cloud-assets-feed.js')
const stageJsx = read('AssetsStage.jsx')

/**
 * The cloud -> local bridge has two halves that live in different feeds, and a
 * save is only "打通" when both of them are wired: the saver announces the new
 * library row on the window, and the local feed listens for that announcement
 * and re-reads the library. Neither half does anything on its own, so they are
 * asserted together.
 */
describe('cloud -> local bridge', () => {
  it('announces the new library row from the save path', () => {
    assert.match(saveJs, /import \{ notifyAssetsChanged \} from '\.\/assets-events\.js'/)
    assert.match(saveJs, /notifyAssetsChanged\(io\)/)
    // Only a save that actually landed is announced.
    assert.match(saveJs, /if \(!result \|\| result\.ok !== true\) \{[\s\S]*?return \{[\s\S]*?\}\n  \}/)
  })

  it('makes the local feed re-read the library when the announcement arrives', () => {
    assert.match(localFeedJs, /import \{ subscribeAssetsChanged \} from '\.\/assets-events\.js'/)
    assert.match(localFeedJs, /const unsubscribe = subscribeAssetsChanged\(\{ handler: refreshNow \}\)/)
    assert.match(localFeedJs, /unsubscribe\(\)/)
  })

  it('keeps one refresh per save even though the Hub bus relays the same event', () => {
    assert.match(localFeedJs, /export const REFRESH_GUARD_MS = 250/)
    assert.match(localFeedJs, /if \(now - lastRefresh < REFRESH_GUARD_MS\) return/)
    const hubBranch = localFeedJs.slice(localFeedJs.indexOf("hubEvents?.subscribe?.('*'"))
    assert.match(hubBranch, /refreshNow\(\)/)
    assert.doesNotMatch(hubBranch.slice(0, hubBranch.indexOf('} else {')), /void refreshState\(true\)/)
  })

  it('keeps the cloud grid off the save path entirely', () => {
    // 保存状态由 stage 经 props 注入；feed 不得自行持有控制器或保存状态。
    assert.doesNotMatch(cloudFeedJs, /useCloudSave/)
    assert.doesNotMatch(cloudFeedJs, /saveToLocal|savedIds|savingId/)
    assert.doesNotMatch(cloudFeedJs, /stageSave|ownSave/)
  })

  it('keeps one save controller on the stage, shared by the modal and the cards', () => {
    assert.match(stageJsx, /const cloudSave = useCloudSave\(\{ t \}\)/)
    // 卡片拿到的必须是窄接口（只读集合 + 一个回调），不是控制器整体。
    assert.match(stageJsx, /<CloudAssetsView[\s\S]*?savedIds=\{cloudSave\.savedIds\}/)
    assert.match(stageJsx, /<CloudAssetsView[\s\S]*?savingIds=\{cloudSave\.savingIds\}/)
    assert.match(stageJsx, /<CloudAssetsView[\s\S]*?onSave=\{cloudSave\.save\}/)
    assert.doesNotMatch(stageJsx, /<CloudAssetsView[^>]*\bcloudSave=\{cloudSave\}/)
    assert.match(stageJsx, /saved=\{previewCloudId !== '' && cloudSave\.savedIds\.has\(previewCloudId\)\}/)
    assert.match(stageJsx, /saving=\{previewCloudId !== '' && cloudSave\.savingIds\.has\(previewCloudId\)\}/)
    assert.match(stageJsx, /onSaveToLocal=\{previewCloudId !== '' \? savePreviewItem : undefined\}/)
    // 全插件只有一处控制器实例：卡片入口不得自建第二个。
    assert.equal((stageJsx.match(/useCloudSave\(/g) ?? []).length, 1)
  })

  it('translates a cloud row into a preview item that still knows its row id', () => {
    assert.match(stageJsx, /import \{ cloudAssetToPreviewItem \} from '\.\/cloud-preview\.js'/)
    assert.match(stageJsx, /const next = cloudAssetToPreviewItem\(asset\)/)
    assert.match(stageJsx, /void cloudSave\.save\(\{ id, name: String\(item\?\.title \?\? ''\) \}\)/)
  })
})
