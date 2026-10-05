/**
 * QA harness for Issue #3110 — mounts the real RivalMasonry + RivalPostCard +
 * rival-styles + rival-tokens with the spec §9.4 demo data, so a real browser
 * can verify the five shapes, the waterfall layout, the minimal default state
 * and the processed retreat in both themes.
 *
 * Query params: ?theme=light|dark  ?width=<px>
 */

import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import { RivalMasonry } from '../../../../plugins/omnimux-inspiration/src/client/RivalMasonry.jsx'
import { toRivalCardRow } from '../../../../plugins/omnimux-inspiration/src/client/rival-filter.js'
import { injectRivalStyles } from '../../../../plugins/omnimux-inspiration/src/client/rival-styles.js'
import { injectRivalTokens } from '../../../../plugins/omnimux-inspiration/src/client/rival-tokens.js'
import { zh, en } from '../../../../plugins/omnimux-inspiration/src/client/locales.js'

const t = (key) => ((new URLSearchParams(location.search).get('locale') === 'en' ? en : zh)[key] || key)

const SVG_COVER = (hue, w, h) => {
  const files = {
    '200-720-1280': 'c1', '30-1280-720': 'c2', '120-800-1000': 'c3', '260-1280-720': 'c4',
    '10-720-1280': 'c5', '180-1280-720': 'c6', '300-900-900': 'c7', '50-720-1280': 'c8',
    '90-1280-720': 'c9', '150-800-1000': 'c10', '220-720-1280': 'c11', '320-1280-720': 'c12',
  }
  return `covers/${files[`${hue}-${w}-${h}`] || 'c1'}.svg`
}

const ACCOUNTS = {
  meow: { id: 'ra_1', nickname: '喵星日常', handle: '@meow_daily', platform: 'tiktok' },
  pet: { id: 'ra_2', nickname: '宠物品鉴所', handle: '@pet_review', platform: 'youtube' },
  home: { id: 'ra_3', nickname: '家居灵感库', handle: '@home_inspo', platform: 'instagram' },
  higgs: { id: 'ra_4', nickname: 'Higgsfield AI', handle: '@higgsfield_ai', platform: 'x' },
  runway: { id: 'ra_5', nickname: 'Runway', handle: '@runwayml', platform: 'x' },
  fur: { id: 'ra_6', nickname: '毛孩子食堂', handle: '@fur_kitchen', platform: 'tiktok' },
  ootd: { id: 'ra_7', nickname: '穿搭研究所', handle: '@ootd_lab', platform: 'instagram' },
}

const row = (id, account, extra) => ({
  id,
  row_id: `${account.id}:${id}`,
  account_id: account.id,
  account,
  stats: { views: 128000, likes: 8640, comments: 214, shares: 96 },
  source_platform: account.platform,
  url: `https://${account.platform}.example/${account.handle}/${id}`,
  posted_at: '2026-10-05T08:12:00.000Z',
  ...extra,
})

const POSTS = [
  row('p1', ACCOUNTS.meow, { type: 'video', title: '猫咪饮水机实测：三只猫一周后还喝吗', cover_src: SVG_COVER(200, 720, 1280), velocity: { text: '爆款 23k/h', tier: 'hot' }, match: { label: '高契合' } }),
  row('p2', ACCOUNTS.pet, { type: 'video', title: '2026 十款智能喂食器横评', cover_src: SVG_COVER(30, 1280, 720), velocity: { text: '爆款 42k/h', tier: 'hot' }, match: { label: '可参考' }, interacted_at: '2026-10-05T09:12:00.000Z' }),
  row('p3', ACCOUNTS.home, { type: 'image', title: '小户型猫爬架一体收纳方案', cover_src: SVG_COVER(120, 800, 1000), ratio: 0.8, velocity: { text: '飙升 3.4k/h', tier: 'rising' }, match: { label: '高契合' } }),
  row('p11', ACCOUNTS.higgs, { type: 'text', title: '做了三个月 AI 视效，最大的体会是：镜头语言比模型更重要。同一段提示词，加上「低机位缓推」和「焦点从前景移到人物」，成片质感直接上一个台阶。很多人卡在画面抖、主体漂，其实是没给运动加约束。下周把团队内部在用的 12 种运镜模板整理出来，评论区告诉我你最想先看哪一种。', velocity: { text: '飙升 2.6k/h', tier: 'rising' }, match: { label: '可参考' } }),
  row('p4', ACCOUNTS.higgs, { type: 'video', title: '电影级推拉镜头拆解：同一个人物，三种运镜节奏，情绪完全不同。提示词和参数都放在视频最后。', cover_src: SVG_COVER(260, 1280, 720), in_library: true, inspiration_id: 'insp_1', velocity: { text: '飙升 1.2k/h', tier: 'rising' }, match: { label: '可参考' } }),
  row('p5', ACCOUNTS.fur, { type: 'video', title: '生骨肉配比入门：一周备餐流程', cover_src: SVG_COVER(10, 720, 1280), velocity: { text: '均速 1.8k/h', tier: 'average' } }),
  row('p6', ACCOUNTS.runway, { type: 'video', title: 'Gen-3 运动笔刷实战：沙、烟、水花三种粒子，笔刷方向决定轨迹，强度决定扩散范围。', cover_src: SVG_COVER(180, 1280, 720), velocity: { text: '观察 480/h', tier: 'watch' }, interacted_at: '2026-10-04T22:05:00.000Z' }),
  row('p12', ACCOUNTS.runway, { type: 'text', title: '角色一致性终于不用靠抽卡了：一张参考图，跨镜头保持同一张脸。', velocity: { text: '观察 260/h', tier: 'watch' }, interacted_at: '2026-10-05T10:36:00.000Z' }),
  row('p7', ACCOUNTS.ootd, { type: 'image', title: '通勤胶囊衣橱：7 件单品 21 套', cover_src: SVG_COVER(300, 900, 900), ratio: 1, velocity: { text: '观察 320/h', tier: 'watch' } }),
  row('p8', ACCOUNTS.meow, { type: 'video', title: '半夜跑酷实录：监控视角全程', cover_src: SVG_COVER(50, 720, 1280), velocity: { text: '该号 4.2x', tier: 'relative' } }),
  row('p9', ACCOUNTS.pet, { type: 'video', title: '猫砂盆除臭终极方案对比', cover_src: SVG_COVER(90, 1280, 720), in_library: true, inspiration_id: 'insp_2', velocity: { text: '飙升 6.8k/h', tier: 'rising' }, match: { label: '高契合' } }),
  row('p10', ACCOUNTS.home, { type: 'image', title: '阳台改造：宠物友好绿植角', cover_src: SVG_COVER(150, 800, 1000), ratio: 0.8, velocity: { text: '爆款 21k/h', tier: 'hot' }, match: { label: '可参考' } }),
]

// R4: ?edge=1 appends the cases the §9.4 fixture cannot reach — English text
// with hashtags/URLs (word-boundary wrap) and a velocity object with empty
// text (must render no pill row at all).
const EDGE_POSTS = [
  row('e1', ACCOUNTS.higgs, { type: 'text', title: `Shipping our new video pipeline today — benchmark notes inside. ${Array(8).fill('#sundayfunday').join(' ')}`, velocity: { text: 'rising 1.9k/h', tier: 'rising' } }),
  row('e2', ACCOUNTS.runway, { type: 'text', title: 'Read the full thread here: https://x.com/runwayml/status/1928374650111222334?ref_src=twsrc%5Etfw%7Ctwcamp%7Ctwgr', velocity: { text: 'watch 210/h', tier: 'watch' } }),
  row('e3', ACCOUNTS.runway, { type: 'text', title: 'Upstream rows may ship a velocity object without text. The empty pill row must not render — an empty row still costs 36px and would push the card past its estimate, overlapping whatever lands below it in the same column.', velocity: {} }),
]

function App() {
  const [markDoneNote, setMarkDoneNote] = useState('')
  const posts = useMemo(() => (
    new URLSearchParams(location.search).get('edge') ? [...POSTS, ...EDGE_POSTS] : POSTS
  ), [])
  const cards = useMemo(() => posts.map((r) => {
    const card = toRivalCardRow(r)
    // The QA page mirrors the cover path into the served location so the media
    // element loads exactly like a real cover (hostMediaSrc whitelist already
    // passed the cover_src upstream in production).
    return { ...card, cover_key: card.cover_key ? `covers/${card.cover_key.split('/').pop()}` : '' }
  }), [])
  useEffect(() => {
    injectRivalTokens()
    injectRivalStyles()
    document.documentElement.setAttribute('data-theme',
      new URLSearchParams(location.search).get('theme') || 'dark')
  }, [])
  return (
    <div className="qa-stage">
      {markDoneNote ? <div className="qa-note">{markDoneNote}</div> : null}
      <RivalMasonry
        cards={cards}
        t={t}
        containerWidth={Number(new URLSearchParams(location.search).get('width')) || undefined}
        onDetail={() => {}}
        onReplicate={() => {}}
        onDeconstruct={() => {}}
        onMarkDone={(card) => setMarkDoneNote(`${t('rivalFeed.toast.markDone')} · ${card.id}`)}
      />
    </div>
  )
}

const root = createRoot(document.getElementById('app'))
root.render(<App />)
