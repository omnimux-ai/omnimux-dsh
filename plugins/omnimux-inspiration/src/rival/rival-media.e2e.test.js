import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRivalAccountsStore } from './rival-accounts-store.js'
import { createRivalAccountsService } from './rival-accounts-service.js'
import { createRivalRefreshScheduler } from './rival-refresh.js'
import { createRivalRemote, SOCIAL_DATA_TOOL } from './rival-remote.js'
import { resolveRivalPaths } from './rival-paths.js'

/**
 * End-to-end gate for #3428 on the host side: the raw platform envelope the
 * cloud returns must survive the real refresh cycle (remote → parser → store)
 * and reach the aggregated feed row with its cover, type, duration, ratio and
 * interaction counters.
 *
 * Only the cloud tool is a stand-in; the scheduler, remote, parser, store and
 * feed aggregation are the production modules wired exactly the way
 * `src/index.js` wires them. The client half of the same issue is covered by
 * the render gates (`rival-post-card.test.js`, `account-monitor-feed-render.test.js`).
 */

const FIXED_NOW = Date.parse('2026-10-20T00:00:00.000Z')

const USER = {
  nickname: "Judy's Family Cafe",
  avatar_url: 'https://cdn.example.com/avatar.jpg',
  signature: 'cafe',
  follower_count: 3498,
  video_count: 31,
}

const TIKTOK_POSTS = {
  item_list: [
    {
      aweme_id: '7698442056158465294',
      desc: 'For the whole family',
      create_time: 1_700_000_000,
      share_url: 'https://www.tiktok.com/@judysfamilycafe/video/7698442056158465294',
      aweme_type: 0,
      video: {
        cover: { url_list: ['https://p16-sign.example.com/cover.jpg'] },
        play_addr: { url_list: ['https://v16-webapp.example.com/play.mp4'] },
        duration: 15_000,
        width: 720,
        height: 1280,
      },
      statistics: { play_count: 12_345, digg_count: 678, comment_count: 90, share_count: 12 },
    },
    {
      aweme_id: '7698016920141860110',
      desc: 'No cover post',
      create_time: 1_699_000_000,
      aweme_type: 0,
    },
  ],
}

const X_POSTS = {
  timeline: [
    {
      tweet_id: '2112335003086643577',
      text: 'video tweet',
      created_at: '2026-10-19T10:00:00.000Z',
      views: 6378,
      media: [
        {
          media_url_https: 'https://pbs.twimg.com/media/poster.jpg',
          original_info: { width: 1280, height: 720 },
          video_info: {
            duration_millis: 8000,
            variants: [
              { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x.m3u8' },
              { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/x-832.mp4' },
            ],
          },
        },
      ],
    },
  ],
}

const sandboxes = []
after(() => {
  for (const root of sandboxes) rmSync(root, { recursive: true, force: true })
})

/**
 * Boot the production wiring with one fake cloud answer per capability.
 * @param {string} platform
 * @param {unknown} postsData raw envelope the gateway returns for `posts`
 */
function makeWorld(platform, postsData) {
  const root = mkdtempSync(join(tmpdir(), 'rival-media-e2e-'))
  sandboxes.push(root)
  const paths = resolveRivalPaths({ paths: { dir: join(root, 'inspirations'), mediaDir: join(root, 'inspirations', 'media') } })
  const store = createRivalAccountsStore({ paths, now: () => FIXED_NOW })
  const cloud = {
    getTool(name) {
      if (name !== SOCIAL_DATA_TOOL) return undefined
      return {
        async execute(args) {
          if (args.capability === 'user') {
            return { platform: args.platform, capability: 'user', model: 'user', field: 'id', value: args.id, data: USER }
          }
          return { platform: args.platform, capability: 'posts', model: 'posts', field: 'id', value: args.id, data: postsData }
        },
      }
    },
  }
  const remote = createRivalRemote({ getTool: cloud.getTool, now: () => FIXED_NOW })
  let service = null
  const scheduler = createRivalRefreshScheduler({
    store,
    remote,
    now: () => FIXED_NOW,
    runCycle: (input) => service.runCycle(input),
  })
  service = createRivalAccountsService({ store, remote, scheduler, paths })
  const account = store.addAccount({ platform, external_id: '@alice' })
  return { root, store, service, account }
}

describe('refresh cycles carry the nested platform media into the feed row (#3428)', () => {
  it('serves the TikTok cover, type, duration, ratio and counters through listFeed', async () => {
    const world = makeWorld('tiktok', TIKTOK_POSTS)
    const result = await world.service.runCycle({ account: world.account })
    assert.equal(result.ok, true)
    assert.equal(result.calls_used, 2)

    const feed = world.service.listFeed({ accounts: world.account.id })
    assert.equal(feed.items.length, 2)
    const row = feed.items.find((item) => item.title === 'For the whole family')
    assert.equal(row.cover_key, 'https://p16-sign.example.com/cover.jpg')
    assert.equal(row.cover_url, 'https://p16-sign.example.com/cover.jpg')
    assert.equal(row.type, 'video')
    assert.equal(row.duration, 15)
    assert.equal(row.ratio, 720 / 1280)
    assert.equal(row.stats.views, 12_345)
    assert.equal(row.stats.likes, 678)
    assert.equal(row.stats.comments, 90)
    assert.equal(row.stats.shares, 12)
  })

  it('keeps a media-less TikTok post as an empty cover and the -1 sort sentinel', async () => {
    const world = makeWorld('tiktok', TIKTOK_POSTS)
    await world.service.runCycle({ account: world.account })
    const feed = world.service.listFeed({ accounts: world.account.id })
    const row = feed.items.find((item) => item.title === 'No cover post')
    assert.equal(row.cover_key, '')
    assert.equal(row.type, 'text')
    assert.equal(row.stats.views, -1)
  })

  it('serves the X poster/stream and the flat view counter through listFeed', async () => {
    const world = makeWorld('x', X_POSTS)
    await world.service.runCycle({ account: world.account })
    const feed = world.service.listFeed({ accounts: world.account.id })
    assert.equal(feed.items.length, 1)
    const row = feed.items[0]
    assert.equal(row.cover_key, 'https://pbs.twimg.com/media/poster.jpg')
    assert.equal(row.type, 'video')
    assert.equal(row.duration, 8)
    assert.equal(row.ratio, 16 / 9)
    assert.equal(row.stats.views, 6378)
  })
})
