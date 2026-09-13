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

  it('exposes the shared controller through the cloud feed as saveToLocal', () => {
    assert.match(cloudFeedJs, /const saver = stageSave \?\? ownSave/)
    assert.match(cloudFeedJs, /saveToLocal: saver\.save/)
    assert.match(cloudFeedJs, /savedIds: saver\.savedIds/)
    assert.match(cloudFeedJs, /savingId: saver\.savingId/)
  })

  it('shares one save controller between the cloud grid and the preview modal', () => {
    assert.match(stageJsx, /const cloudSave = useCloudSave\(\{ t \}\)/)
    assert.match(stageJsx, /<CloudAssetsView t=\{t\} open=\{visible\} onPreview=\{onCloudPreview\} save=\{cloudSave\} \/>/)
    assert.match(stageJsx, /saved=\{previewCloudId !== '' && cloudSave\.savedIds\.has\(previewCloudId\)\}/)
    assert.match(stageJsx, /saving=\{previewCloudId !== '' && cloudSave\.savingId === previewCloudId\}/)
    assert.match(stageJsx, /onSaveToLocal=\{previewCloudId !== '' \? savePreviewItem : undefined\}/)
  })

  it('translates a cloud row into a preview item that still knows its row id', () => {
    assert.match(stageJsx, /import \{ cloudAssetToPreviewItem \} from '\.\/cloud-preview\.js'/)
    assert.match(stageJsx, /const next = cloudAssetToPreviewItem\(asset\)/)
    assert.match(stageJsx, /void cloudSave\.save\(\{ id, name: String\(item\?\.title \?\? ''\) \}\)/)
  })
})
