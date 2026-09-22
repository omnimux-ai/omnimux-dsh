import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  INSPIRATION_TABS,
  defaultFetchInspirations,
  hostMediaSrc,
  mapInspirationRow,
  pickCoverSrc,
  pickVideoSrc,
} from './picker-model.js'

const pickerSource = readFileSync(new URL('./InspirationPicker.jsx', import.meta.url), 'utf8')
const cardSource = readFileSync(new URL('./InspirationPickerCard.jsx', import.meta.url), 'utf8')
const modalSource = readFileSync(new URL('../../composer-add/InspirationPickerModal.jsx', import.meta.url), 'utf8')
const installSource = readFileSync(new URL('../../composer-add/install.js', import.meta.url), 'utf8')

test('inspiration tabs start with 全部 and exclude rival accounts', () => {
  assert.equal(INSPIRATION_TABS[0].id, 'all')
  assert.equal(INSPIRATION_TABS[0].labelKey, 'inspirationPicker.tab.all')
  assert.deepEqual(INSPIRATION_TABS.map((row) => row.id), ['all', 'local', 'public'])
})

test('InspirationPicker reuses the shared picker dialog contract', () => {
  assert.match(pickerSource, /pickerDialogClassName\('inspiration'\)/)
  assert.match(pickerSource, /PickerHeaderTabs/)
  assert.match(pickerSource, /PickerToolbar/)
  assert.match(pickerSource, /PickerSearchInput/)
  assert.match(pickerSource, /PickerFooter/)
  assert.match(pickerSource, /PickerEmpty/)
  assert.match(pickerSource, /ModalCloseButton/)
  assert.match(pickerSource, /grid-template-columns: repeat\(6/)
  assert.doesNotMatch(pickerSource, /from ['"]omnimux-inspiration/)
})

test('picker cards follow the cover ratio and hide idle chrome', () => {
  assert.doesNotMatch(cardSource, /omx-inspiration-pick-card__badge/)
  assert.doesNotMatch(pickerSource, /typeLabel=/)
  assert.match(pickerSource, /INSPIRATION_CARD_CSS/)
  assert.doesNotMatch(cardSource, /\.omx-inspiration-pick-card__thumb\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/)
  assert.match(cardSource, /\.omx-inspiration-pick-card__img\s*\{[^}]*height:\s*auto/)
  assert.match(cardSource, /\.omx-inspiration-pick-card__check\s*\{[^}]*display:\s*none/)
  assert.match(
    cardSource,
    /\.omx-inspiration-pick-card:hover \.omx-inspiration-pick-card__check[\s\S]*display:\s*inline-flex/,
  )
  assert.match(cardSource, /\[data-selected="true"\] \.omx-inspiration-pick-card__check/)
  assert.match(cardSource, /data-ratio=/)
})

test('InspirationPickerModal remains a thin reusable adapter while composer-add opens the page browser', () => {
  assert.match(modalSource, /InspirationPicker/)
  assert.match(modalSource, /omnimux-inspiration:library/)
  assert.match(installSource, /LibraryBrowser/)
  assert.doesNotMatch(installSource, /InspirationPickerModal/)
})

test('cover mapping never invents filesystem media routes', () => {
  assert.equal(hostMediaSrc('/omnimux/inspiration/local/media/covers/a.jpg'), '/omnimux/inspiration/local/media/covers/a.jpg')
  assert.equal(pickCoverSrc({ cover_url: '/omnimux/inspiration/media/covers/a.jpg' }), '/omnimux/inspiration/media/covers/a.jpg')
  assert.equal(pickVideoSrc({ media_urls: ['videos/v.mp4'] }), '/omnimux/inspiration/media/videos/v.mp4')
  assert.equal(pickVideoSrc({ media_urls: ['https://example.com/v.mp4'] }), 'https://example.com/v.mp4')
  const mapped = mapInspirationRow({ id: 'insp-1', title: '晨间闺蜜', cover_url: '/omnimux/inspiration/media/covers/a.jpg', media_urls: ['/omnimux/inspiration/local/media/videos/v.mp4'] }, true)
  assert.equal(mapped.id, 'insp-1')
  assert.equal(mapped.kind, 'video')
  assert.equal(mapped.is_local, true)
})

test('defaultFetchInspirations throws on network errors in all tab rather than masking as empty', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async (url) => {
      if (url.includes('/local')) {
        return { ok: false, status: 500, json: async () => ({ error: 'Local db failure' }) }
      }
      return { ok: true, status: 200, json: async () => ({ data: { items: [] } }) }
    }
    await assert.rejects(
      defaultFetchInspirations({ tab: 'all' }),
      /Local db failure/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
