/**
 * T01 gates: URL classification (four platforms × homepage / channel / content),
 * path resolution for the data+media trees, and the tolerant payload mappers.
 *
 * These are the fixtures the module treats as "unknown shape": empty objects,
 * missing fields and malformed arrays must answer `null`, never `0` or `''`.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { join } from 'node:path'
import { detectInputKind, parseRivalIdentity, rivalIdentityValue, rivalProfileUrl } from './rival-identity.js'
import {
  isEmptyPayload,
  mapRivalPosts,
  mapRivalUser,
  normalizeRivalPost,
  parsePostedAt,
  unwrapRivalPostRows,
} from './rival-parsers.js'
import { hashId, rivalMediaFilename, rivalMediaSubpath, rivalMediaUrl, resolveRivalPaths } from './rival-paths.js'
import {
  BACKOFF_MINUTES,
  LIMIT_CALLS_PER_ACCOUNT_CYCLE,
  REFRESH_INTERVAL_CHOICES,
  RIVAL_PLATFORMS,
} from './constants.js'

describe('rival-identity: homepage URLs of all four platforms', () => {
  const cases = [
    ['https://www.tiktok.com/@foo', 'tiktok', '@foo', 'username'],
    ['https://www.youtube.com/@foo', 'youtube', '@foo', 'handle-unverified'],
    ['https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', 'youtube', 'UCabcdefghijklmnopqrstuv', 'channel_id'],
    ['https://www.youtube.com/c/foo', 'youtube', '@foo', 'handle-unverified'],
    ['https://www.youtube.com/user/foo', 'youtube', '@foo', 'handle-unverified'],
    ['https://www.instagram.com/foo/', 'instagram', '@foo', 'username'],
    ['https://x.com/foo', 'x', '@foo', 'username'],
    ['https://twitter.com/foo', 'x', '@foo', 'username'],
  ]

  for (const [url, platform, externalId, kind] of cases) {
    it(`classifies ${url}`, () => {
      const result = detectInputKind(url)
      assert.equal(result.kind, 'account')
      assert.equal(result.platform, platform)
      assert.equal(result.identity.external_id, externalId)
      assert.equal(result.identity.external_id_kind, kind)
      assert.ok(result.identity.profile_url.startsWith('http'))
    })
  }

  it('stores one identity whether or not the pasted handle carries an @', () => {
    // Regression (requirement 3): instagram/x stored the bare name while
    // tiktok/youtube stored `@name`, so `x.com/@bar` and `x.com/bar` produced
    // two rows for one account. One stored form is written for all four now.
    const withAt = detectInputKind('https://x.com/@bar')
    const withoutAt = detectInputKind('https://x.com/bar')
    assert.equal(withAt.kind, 'account')
    assert.equal(withoutAt.kind, 'account')
    assert.equal(withAt.identity.external_id, '@bar')
    assert.equal(withAt.identity.external_id, withoutAt.identity.external_id)
    assert.equal(
      detectInputKind('https://www.instagram.com/@bar').identity.external_id,
      detectInputKind('https://www.instagram.com/bar').identity.external_id,
    )
    // Idempotent: the prefixed form is already canonical, so re-normalizing a
    // stored value cannot produce `@@bar`.
    assert.equal(detectInputKind('https://x.com/@@bar').identity.external_id, '@bar')
  })

  it('marks a YouTube @handle unverified and a /channel/UC form verified', () => {
    assert.equal(parseRivalIdentity('https://www.youtube.com/@foo').external_id_kind, 'handle-unverified')
    assert.equal(
      parseRivalIdentity('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv').external_id_kind,
      'channel_id',
    )
  })
})

describe('rival-identity: content URLs stay with the existing pipeline', () => {
  const contentUrls = [
    'https://www.tiktok.com/@foo/video/7321234567890123456',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.instagram.com/reel/CxYz123ab/',
    'https://www.instagram.com/p/CxYz123ab/',
    'https://x.com/foo/status/1234567890123456789',
  ]

  for (const url of contentUrls) {
    it(`returns content for ${url}`, () => {
      assert.equal(detectInputKind(url).kind, 'content')
      assert.equal(parseRivalIdentity(url), null)
    })
  }

  it('returns unknown (not content) for an unparseable value', () => {
    assert.equal(detectInputKind('').kind, 'unknown')
    assert.equal(detectInputKind('not a url').kind, 'unknown')
    assert.equal(detectInputKind('ftp://x.com/foo').kind, 'unknown')
  })

  it('rejects reserved Youtube pages instead of reading them as handles', () => {
    assert.equal(detectInputKind('https://www.youtube.com/feed/subscriptions').kind, 'content')
    assert.equal(detectInputKind('https://www.youtube.com/results?search_query=x').kind, 'content')
  })

  it('never reads a youtu.be short link as a profile', () => {
    // Regression: `youtu.be/<code>` has one path segment, so the legacy
    // `youtube.com/<name>` branch used to claim it as a handle.
    assert.equal(detectInputKind('https://youtu.be/dQw4w9WgXcQ').kind, 'content')
    assert.equal(detectInputKind('https://youtu.be/dQw4w9WgXcQ').identity, undefined)
  })

  it('accepts a legacy youtube.com/<name> custom URL', () => {
    const result = detectInputKind('https://www.youtube.com/somecreator')
    assert.equal(result.kind, 'account')
    assert.equal(result.identity.external_id_kind, 'handle-unverified')
  })

  it('refuses a host outside the four platforms instead of calling it content', () => {
    // Regression (requirement 2): facebook/threads/any other domain used to fall
    // through to `kind: 'content'`, so the refusal was never reached and the
    // content import was attempted for a link this pipeline has no parser for.
    for (const url of [
      'https://www.facebook.com/somepage',
      'https://fb.watch/abc123/',
      'https://www.threads.net/@someone',
      'https://www.threads.com/@someone',
      'https://example.com/@someone',
    ]) {
      const result = detectInputKind(url)
      assert.equal(result.kind, 'unknown', url)
      // The refusal carries no locale key of its own: `classifyInput` turns an
      // `unknown` into a 400 and the dialog renders that error's `body.error`,
      // so a key returned here could never be read. This asserts the value stays
      // empty rather than that a key was renamed.
      assert.equal(result.hint_key, undefined, url)
      assert.equal(parseRivalIdentity(url), null, url)
    }
  })

  it('still sends the four platforms\u2019 content links to the existing pipeline', () => {
    for (const url of [
      'https://www.tiktok.com/@foo/video/7321234567890123456',
      'https://www.instagram.com/reel/CxYz123ab/',
      'https://x.com/foo/status/1700000000000000000',
      'https://twitter.com/foo/status/1700000000000000000',
    ]) {
      const result = detectInputKind(url)
      assert.equal(result.kind, 'content', url)
      assert.notEqual(result.platform, 'unknown', url)
    }
  })
})

describe('rival-identity: identity value and profile url', () => {
  it('prefers the canonical id once a refresh has proven it', () => {
    assert.equal(rivalIdentityValue({ external_id: '@foo' }), '@foo')
    assert.equal(
      rivalIdentityValue({ external_id: '@foo', external_id_canonical: 'UCabcdefghijklmnopqrstuv' }),
      'UCabcdefghijklmnopqrstuv',
    )
    assert.equal(rivalIdentityValue({ external_id_canonical: '   ' }), '')
  })

  it('rebuilds a profile url from the platform when none was stored', () => {
    assert.equal(
      rivalProfileUrl({ platform: 'youtube', external_id: '@foo' }),
      'https://www.youtube.com/@foo',
    )
    assert.equal(rivalProfileUrl({ platform: 'youtube', external_id: '' }), '')
  })
})

describe('rival-paths: data and media trees', () => {
  const paths = resolveRivalPaths({ paths: { dir: '/tmp/home/omnimux/inspirations', mediaDir: '/tmp/home/omnimux/inspirations/media' } })

  it('keeps rival data under the inspirations data root', () => {
    assert.equal(paths.dir, '/tmp/home/omnimux/inspirations/rival-accounts')
    assert.equal(paths.accountsFile, '/tmp/home/omnimux/inspirations/rival-accounts/accounts.json')
    assert.equal(paths.postsDir, '/tmp/home/omnimux/inspirations/rival-accounts/posts')
  })

  it('places media inside the existing mediaDir so the shipped stream route serves it', () => {
    assert.equal(paths.mediaDir, join('/tmp/home/omnimux/inspirations/media', 'rival-accounts'))
    assert.ok(paths.coversDir.startsWith('/tmp/home/omnimux/inspirations/media/'))
    assert.equal(rivalMediaSubpath('covers', 'rival-abc.jpg'), 'rival-accounts/covers/rival-abc.jpg')
    assert.equal(
      rivalMediaUrl('covers', 'rival-abc.jpg'),
      '/omnimux/inspiration/local/media/rival-accounts/covers/rival-abc.jpg',
    )
  })

  it('never lets a crafted filename climb out of the media root', () => {
    assert.equal(rivalMediaUrl('covers', '../../etc/passwd'), '')
    assert.equal(rivalMediaUrl('videos', 'a/b.mp4'), '/omnimux/inspiration/local/media/rival-accounts/videos/b.mp4')
  })

  it('derives a stable per-post filename so a second click reuses the file', () => {
    const first = rivalMediaFilename('7321234567890123456')
    assert.equal(first, rivalMediaFilename('7321234567890123456'))
    assert.match(first, /^rival-[0-9a-f]{8}\.jpg$/)
    assert.equal(hashId('7321234567890123456'), hashId('7321234567890123456'))
  })
})

describe('rival-parsers: tolerant extraction never invents values', () => {
  it('answers null for an empty object', () => {
    const post = normalizeRivalPost({}, { platform: 'tiktok' })
    assert.equal(post, null)
  })

  it('answers null for a row with no id, and for a non-object row', () => {
    assert.equal(normalizeRivalPost({ title: 'x' }, { platform: 'tiktok' }), null)
    assert.equal(normalizeRivalPost(null, { platform: 'tiktok' }), null)
    assert.equal(normalizeRivalPost([], { platform: 'tiktok' }), null)
  })

  it('keeps a real 0 distinct from an unknown count', () => {
    const zero = normalizeRivalPost({ id: 'a', view_count: 0 }, { platform: 'tiktok' })
    assert.equal(zero.stats.views, 0)
    const unknown = normalizeRivalPost({ id: 'b' }, { platform: 'tiktok' })
    assert.equal(unknown.stats.views, null)
    assert.equal(unknown.stats.likes, null)
  })

  it('accepts stringified counters but refuses objects', () => {
    const post = normalizeRivalPost({ id: 'a', play_count: '12,345', digg_count: { n: 1 } }, { platform: 'tiktok' })
    assert.equal(post.stats.views, 12345)
    assert.equal(post.stats.likes, null)
  })

  it('reports the key that fired, and null for a miss', () => {
    const post = normalizeRivalPost({ id: 'a', play_count: 5 }, { platform: 'tiktok' })
    assert.equal(post.field_probe.views, 'play_count')
    assert.equal(post.field_probe.likes, null)
    assert.equal(post.field_probe.id, 'id')
  })

  it('reads only http(s) media urls', () => {
    const post = normalizeRivalPost(
      { id: 'a', cover_url: 'file:///etc/passwd', video_url: 'javascript:alert(1)' },
      { platform: 'tiktok' },
    )
    assert.equal(post.cover_url, '')
    assert.equal(post.video_url, '')
  })

  it('parses seconds, milliseconds and ISO timestamps, and refuses nonsense', () => {
    assert.equal(parsePostedAt(1_700_000_000), '2023-11-14T22:13:20.000Z')
    assert.equal(parsePostedAt(1_700_000_000_000), '2023-11-14T22:13:20.000Z')
    assert.equal(parsePostedAt('2023-11-14T22:13:20.000Z'), '2023-11-14T22:13:20.000Z')
    assert.equal(parsePostedAt('2023-11-14'), '2023-11-14T00:00:00.000Z')
    assert.equal(parsePostedAt(0), null)
    assert.equal(parsePostedAt(''), null)
    assert.equal(parsePostedAt('yesterday-ish'), null)
    assert.equal(parsePostedAt(null), null)
  })

  it('synthesizes a post url only from a well-formed platform id', () => {
    assert.equal(
      normalizeRivalPost({ id: '7321234567890123456' }, { platform: 'tiktok' }).url,
      'https://www.tiktok.com/video/7321234567890123456',
    )
    assert.equal(normalizeRivalPost({ id: 'dQw4w9WgXcQ' }, { platform: 'youtube' }).url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    assert.equal(normalizeRivalPost({ id: 'junk-id' }, { platform: 'tiktok' }).url, '')
    assert.equal(normalizeRivalPost({ id: 'p1' }, { platform: 'facebook' }).url, '')
    // An explicit permalink always wins over the synthesized one.
    assert.equal(
      normalizeRivalPost({ id: '7321234567890123456', url: 'https://vm.tiktok.com/x/' }, { platform: 'tiktok' }).url,
      'https://vm.tiktok.com/x/',
    )
  })

  it('leaves posted_at null instead of inventing "now"', () => {
    const post = normalizeRivalPost({ id: 'a' }, { platform: 'tiktok' })
    assert.equal(post.posted_at, null)
  })
})

describe('rival-parsers: list unwrapping is bounded', () => {
  it('reads the known containers', () => {
    assert.equal(unwrapRivalPostRows({ items: [{ id: 1 }] }).length, 1)
    assert.equal(unwrapRivalPostRows({ aweme_list: [{ aweme_id: '1' }] }).length, 1)
    assert.equal(unwrapRivalPostRows({ data: { items: [{ id: 1 }, { id: 2 }] } }).length, 2)
    assert.equal(unwrapRivalPostRows({ edges: [{ node: { id: 'a' } }] }).length, 1)
  })

  it('does not mistake an unrelated array for the post list', () => {
    assert.deepEqual(unwrapRivalPostRows({ hashtags: ['a', 'b'] }), [])
    assert.deepEqual(unwrapRivalPostRows({}), [])
    assert.deepEqual(unwrapRivalPostRows(null), [])
  })

  it('treats a malformed array as no rows', () => {
    assert.deepEqual(unwrapRivalPostRows({ items: [null, 3, 'x'] }), [])
  })

  it('reaches a nested list instead of reading its wrapper as one row', () => {
    // Regression: `rowsOf` used to accept any non-empty object as a single row,
    // so `{ data: { items: [...] } }` produced one id-less row and the refresh
    // stored nothing at all.
    const rows = unwrapRivalPostRows({ data: { items: [{ id: 'a' }, { id: 'b' }] } })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].id, 'a')
    assert.deepEqual(unwrapRivalPostRows({ result: { aweme_list: [{ aweme_id: 'x' }] } }), [{ aweme_id: 'x' }])
  })
})

describe('rival-parsers: user mapping', () => {
  it('maps a flat account answer and probes each key', () => {
    const { profile, field_probe } = mapRivalUser({
      nickname: 'Foo',
      follower_count: 1234,
      avatar_url: 'https://cdn.example.com/a.jpg',
      subscriber_count: 9,
    })
    assert.equal(profile.nickname, 'Foo')
    assert.equal(profile.followers, 1234)
    assert.equal(profile.avatar_url, 'https://cdn.example.com/a.jpg')
    assert.equal(field_probe.followers, 'follower_count')
  })

  it('unwraps a nested user layer without inventing values', () => {
    const { profile } = mapRivalUser({ data: { user: { name: 'Bar', fans: '7' } } })
    assert.equal(profile.nickname, 'Bar')
    assert.equal(profile.followers, 7)
    assert.equal(profile.bio, '')
    assert.equal(profile.posts_count, null)
  })

  it('extracts a canonical channel id only when it has the UC shape', () => {
    assert.equal(
      mapRivalUser({ channel_id: 'UCabcdefghijklmnopqrstuv' }).profile.external_id_canonical,
      'UCabcdefghijklmnopqrstuv',
    )
    assert.equal(mapRivalUser({ channel_id: '@foo' }).profile.external_id_canonical, null)
    assert.equal(mapRivalUser({}).profile.external_id_canonical, null)
  })

  it('tolerates an empty answer', () => {
    const { profile } = mapRivalUser({})
    assert.equal(profile.nickname, '')
    assert.equal(profile.followers, null)
  })
})

describe('rival-parsers: fixed TikTok userInfo profile', () => {
  const fixture = {
    userInfo: {
      user: { nickname: 'Fixture Creator', signature: 'Fixture biography', avatarLarger: 'https://example.com/avatar.jpg' },
      stats: { followerCount: 0, videoCount: 2 },
    },
  }
  const map = (data) => mapRivalUser(data, { platform: 'tiktok' })

  it('consumes the five observed leaves from user and its sibling stats', () => {
    const mapped = map(fixture)
    assert.equal(mapped.recognized, true)
    assert.deepEqual(mapped.profile, {
      nickname: 'Fixture Creator', bio: 'Fixture biography', avatar_url: 'https://example.com/avatar.jpg',
      followers: 0, posts_count: 2, external_id_canonical: null,
    })
    assert.deepEqual(mapped.field_probe, {
      nickname: 'userInfo.user.nickname', bio: 'userInfo.user.signature', avatar_url: 'userInfo.user.avatarLarger',
      followers: 'userInfo.stats.followerCount', posts_count: 'userInfo.stats.videoCount', external_id_canonical: null,
    })
  })

  for (const platform of [undefined, 'x', 'instagram', 'youtube']) {
    it(`does not enable the wrapper for ${platform || 'an unspecified platform'}`, () => {
      assert.equal(mapRivalUser(fixture, { platform }).recognized, false)
    })
  }

  const invalidContainers = [
    ['missing user', { stats: { followerCount: 0 } }],
    ['missing stats', { user: { nickname: 'Fixture Creator' } }],
    ['null user', { user: null, stats: { followerCount: 0 } }],
    ['array user', { user: [], stats: { followerCount: 0 } }],
    ['string stats', { user: { nickname: 'Fixture Creator' }, stats: 'stats' }],
    ['array stats', { user: { nickname: 'Fixture Creator' }, stats: [] }],
  ]
  for (const [name, userInfo] of invalidContainers) {
    it(`does not recognize ${name} as the fixed wrapper`, () => {
      assert.equal(map({ userInfo }).recognized, false)
      assert.equal(map({ nickname: 'Old profile', userInfo }).profile.nickname, 'Old profile')
    })
  }

  for (const userInfo of [null, [], 'profile', {}]) {
    it(`rejects wrapper type ${JSON.stringify(userInfo)}`, () => {
      assert.equal(map({ userInfo }).recognized, false)
    })
  }

  const validLeaves = [
    [{ nickname: ' Fixture Creator ' }, {}, 'nickname', 'Fixture Creator'],
    [{ signature: ' Fixture biography ' }, {}, 'bio', 'Fixture biography'],
    [{ avatarLarger: 'https://example.com/avatar.jpg' }, {}, 'avatar_url', 'https://example.com/avatar.jpg'],
    [{ avatarLarger: 'HTTPS://example.com/avatar.jpg' }, {}, 'avatar_url', 'HTTPS://example.com/avatar.jpg'],
    [{}, { followerCount: 0 }, 'followers', 0],
    [{}, { videoCount: 0 }, 'posts_count', 0],
  ]
  for (const [user, stats, field, expected] of validLeaves) {
    it(`recognizes ${field} alone without inventing missing counters`, () => {
      const { recognized, profile } = map({ userInfo: { user, stats } })
      assert.equal(recognized, true)
      assert.equal(profile[field], expected)
      if (field !== 'followers') assert.equal(profile.followers, null)
      if (field !== 'posts_count') assert.equal(profile.posts_count, null)
    })
  }

  const invalidLeaves = [
    [{}, {}],
    [{ nickname: ' ', signature: '\t', avatarLarger: 'file:///private/avatar.jpg' }, {}],
    [{ nickname: 123, signature: false, avatarLarger: 'https://' }, {}],
    [{ avatarLarger: 'https:///example.com/avatar.jpg' }, {}],
    [{ avatarLarger: 'https://invalid host/avatar.jpg' }, {}],
    [{}, { followerCount: -1, videoCount: -2 }],
    [{}, { followerCount: NaN, videoCount: Infinity }],
    [{}, { followerCount: '0', videoCount: '2' }],
    [{ followerCount: 0, videoCount: 2 }, {}],
    [{ name: 'Not an observed leaf' }, { video_count: 2 }],
  ]
  for (const [index, [user, stats]] of invalidLeaves.entries()) {
    it(`does not recognize unusable or misplaced leaves ${index + 1}`, () => {
      const { recognized, profile } = map({ userInfo: { user, stats } })
      assert.equal(recognized, false)
      assert.equal(profile.followers, null)
      assert.equal(profile.posts_count, null)
    })
  }

  it('keeps invalid counters unknown even when a separate valid leaf recognizes the profile', () => {
    const { profile } = map({ userInfo: { user: { nickname: 'Fixture Creator' }, stats: { followerCount: -1, videoCount: '2' } } })
    assert.equal(profile.nickname, 'Fixture Creator')
    assert.equal(profile.followers, null)
    assert.equal(profile.posts_count, null)
    const statsOnly = map({ userInfo: { user: {}, stats: { followerCount: -1, videoCount: 2 } } })
    assert.equal(statsOnly.recognized, true)
    assert.equal(statsOnly.profile.followers, null)
    assert.equal(statsOnly.profile.posts_count, 2)
  })

  it('keeps old valid layers first and does not search deeper wrappers', () => {
    assert.equal(map({ ...fixture, user: { nickname: 'Old profile', fans: '7' } }).profile.nickname, 'Old profile')
    assert.equal(map({ ...fixture, nickname: 'Old flat profile' }).profile.nickname, 'Old flat profile')
    assert.equal(map({ data: fixture }).recognized, false)
    assert.equal(map({ result: fixture }).recognized, false)
  })
})

describe('rival-parsers: post mapping', () => {
  it('maps a posts answer and merges per-field probes', () => {
    const { rows, field_probe } = mapRivalPosts(
      { items: [{ id: 'p1', play_count: 10 }, { aweme_id: 'p2', digg_count: 3 }] },
      { platform: 'tiktok' },
    )
    assert.equal(rows.length, 2)
    assert.equal(rows[0].id, 'p1')
    assert.equal(rows[1].id, 'p2')
    assert.equal(field_probe.views, 'play_count')
    assert.equal(field_probe.likes, 'digg_count')
    assert.equal(field_probe.comments, null)
  })

  it('skips rows that carry no identity instead of fabricating one', () => {
    const { rows } = mapRivalPosts({ items: [{ title: 'no id' }, { id: 'ok' }] }, { platform: 'tiktok' })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, 'ok')
  })

  it('derives type from the stream or the image list', () => {
    assert.equal(
      normalizeRivalPost({ id: 'a', video_url: 'https://cdn/x.mp4' }, { platform: 'tiktok' }).type,
      'video',
    )
    assert.equal(
      normalizeRivalPost({ id: 'a', images: ['https://cdn/x.jpg'] }, { platform: 'instagram' }).type,
      'image',
    )
    assert.equal(normalizeRivalPost({ id: 'a', text: 'hi' }, { platform: 'x' }).type, 'text')
  })

  it('falls back to the first image when no cover field exists', () => {
    const post = normalizeRivalPost({ id: 'a', images: ['https://cdn/x.jpg'] }, { platform: 'instagram' })
    assert.equal(post.cover_url, 'https://cdn/x.jpg')
  })
})

describe('X direct timeline uses only the existing post-row rules', () => {
  // Synthetic rows shared with the cloud validator; no live row values or
  // additional field aliases are implied by the observed array container.
  const timeline = [
    { id: 'fixture-parent', node: { id: 'fixture-child' } },
    { node: { tweet_id: 'fixture-node' } },
    null,
    {},
  ]

  it('recognizes the direct X array and keeps parent identity ahead of node', () => {
    const mapped = mapRivalPosts({ timeline }, { platform: 'x' })
    assert.equal(mapped.recognized, true)
    assert.equal(mapped.source_count, 4)
    assert.deepEqual(mapped.rows.map((row) => row.id), ['fixture-parent', 'fixture-node'])
    assert.equal(mapped.field_probe.id, 'id')
    assert.equal(mapped.rows.every((row) => row.posted_at === null && row.cover_url === '' && row.video_url === ''), true)
  })

  it('retains the existing string and finite numeric identity rule', () => {
    const mapped = mapRivalPosts({ timeline: [{ id: 'fixture-id' }, { rest_id: 0 }] }, { platform: 'x' })
    assert.deepEqual(mapped.rows.map((row) => row.id), ['fixture-id', '0'])
  })

  it('keeps an explicitly empty direct array separate from unusable nonempty rows', () => {
    const empty = mapRivalPosts({ timeline: [] }, { platform: 'x' })
    assert.equal(empty.recognized, true)
    assert.equal(empty.source_count, 0)
    assert.deepEqual(empty.rows, [])
    const unusable = mapRivalPosts({ timeline: [{}, null, false, 'text'] }, { platform: 'x' })
    assert.equal(unusable.recognized, true)
    assert.equal(unusable.source_count, 4)
    assert.deepEqual(unusable.rows, [])
  })

  for (const items of [[], [{}], [{ id: 'old-post' }]]) {
    it(`does not replace the previously recognized items ${JSON.stringify(items)}`, () => {
      const mapped = mapRivalPosts({ items, timeline }, { platform: 'x' })
      assert.equal(mapped.recognized, true)
      assert.equal(mapped.source_count, items.length)
      assert.deepEqual(mapped.rows.map((row) => row.id), items[0]?.id ? ['old-post'] : [])
    })
  }

  for (const platform of ['tiktok', 'instagram', 'youtube', 'unknown']) {
    it(`does not add a timeline container to ${platform}`, () => {
      const mapped = mapRivalPosts({ timeline }, { platform })
      assert.equal(mapped.recognized, false)
      assert.deepEqual(mapped.rows, [])
    })
  }

  const unsupported = [
    ['the unobserved timeline_v2 array', { timeline_v2: timeline }],
    ['an object timeline', { timeline: { items: [{ id: 'not-a-direct-array' }] } }],
    ['a nested data timeline', { data: { timeline } }],
    ['a nested user timeline', { user: { timeline } }],
    ['a bare array', timeline],
    ['a null timeline', { timeline: null }],
    ['a string timeline', { timeline: 'not-an-array' }],
    ['an unknown legacy identity', { timeline: [{ legacy: { id: 'not-a-new-alias' } }] }],
    ['a deeper node identity', { timeline: [{ node: { node: { id: 'not-a-new-path' } } }] }],
  ]
  for (const [name, data] of unsupported) {
    it(`does not consume ${name}`, () => {
      assert.deepEqual(mapRivalPosts(data, { platform: 'x' }).rows, [])
    })
  }

  it('keeps the platform-independent container helper unchanged', () => {
    assert.deepEqual(unwrapRivalPostRows({ timeline }), [])
  })

  it('requires an explicit X context without breaking an omitted context', () => {
    assert.equal(mapRivalPosts({ timeline }).recognized, false)
    assert.equal(mapRivalPosts({}, null).recognized, false)
  })
})

describe('rival-parsers: empty sentinel detection', () => {
  it('flags the hub sentinel, an empty answer and an empty list answer', () => {
    assert.equal(isEmptyPayload({ text: null }), true)
    assert.equal(isEmptyPayload({}), true)
    assert.equal(isEmptyPayload(null), true)
    // An empty list answer carries no content either: `posts` stores zero rows
    // and `user` is reported as `no-content` (see rival-remote.js).
    assert.equal(isEmptyPayload({ items: [] }), true)
    assert.equal(isEmptyPayload({ data: { items: [] } }), true)
  })

  it('does not flag an answer with content', () => {
    assert.equal(isEmptyPayload({ text: 'hello' }), false)
    assert.equal(isEmptyPayload({ items: [{ id: 'a' }] }), false)
    assert.equal(isEmptyPayload({ items: [{}] }), false)
    assert.equal(isEmptyPayload({ play_count: 0 }), false)
  })
})

describe('T01 completion criteria: constants are the single source of truth', () => {
  it('exports the cost contract and cadence constants', () => {
    assert.equal(LIMIT_CALLS_PER_ACCOUNT_CYCLE, 2)
    assert.deepEqual([...BACKOFF_MINUTES], [5, 15, 60])
    assert.deepEqual([...REFRESH_INTERVAL_CHOICES], [24, 12, 48, 0])
    assert.deepEqual([...RIVAL_PLATFORMS], ['tiktok', 'instagram', 'youtube', 'x'])
  })
})
