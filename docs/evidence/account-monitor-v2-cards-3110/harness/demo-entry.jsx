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
import { RivalPostPreviewModal } from '../../../../plugins/omnimux-inspiration/src/client/RivalPostPreviewModal.jsx'
import { toRivalCardRow } from '../../../../plugins/omnimux-inspiration/src/client/rival-filter.js'
import { rivalCardHeightPx, rivalHasPill, rivalWrapLines } from '../../../../plugins/omnimux-inspiration/src/client/rival-masonry.js'
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
  // R5-④: the wrap model must break after '-' like Chrome does (UAX#14).
  row('e4', ACCOUNTS.higgs, { type: 'text', title: 'Our state-of-the-art video-pipeline-for-vfx-shot-generation-workflow-chain-of-thought finally shipped today', velocity: { text: 'hot 5.1k/h', tier: 'hot' } }),
  // R5-④: CJK + ASCII mixed body text.
  row('e5', ACCOUNTS.higgs, { type: 'text', title: '发布 workflow 更新后 pipeline 依然稳定，output quality 反而更好，recommend everyone try the new state-of-the-art checkpoint 版本', velocity: { text: 'rising 900/h', tier: 'rising' } }),
  // R5-⑤: non-breaking spaces must not split a word (U+00A0 literals below).
  row('e6', ACCOUNTS.runway, { type: 'text', title: `word${' '}boundaries${' '}matter${' '}when${' '}you${' '}measure${' '}line${' '}wraps${' '}carefully${' '}indeed`, velocity: { text: 'watch 80/h', tier: 'watch' } }),
  // R5-④: follows e4 in the same column — with the old model's undercounted
  // e4 estimate this card's top lands inside e4's real bottom (overlap).
  row('e7', ACCOUNTS.higgs, { type: 'text', title: 'Short tail card — placement only', velocity: { text: 'watch 60/h', tier: 'watch' } }),
]

// R6-①: ?qa41=1 appends the wrap-rule stress set QA used for its 41-card
// fixture (r4/qa4-fixture-entry.jsx carried absolute paths and could not be
// rebuilt from HEAD; this is the same set, served by the repo harness).
const NBSP = ' '
const NNBSP = ' '
const QA41_POSTS = [
  row('w1', ACCOUNTS.higgs, { type: 'text', title: 'A cross-platform end-to-end state-of-the-art text-to-video-and-back-again pipeline benchmark writeup', velocity: { text: 'hot 3.1k/h', tier: 'hot' } }),
  row('w2', ACCOUNTS.runway, { type: 'text', title: 'Unicode hyphen case: state‐of‐the‐art image‐to‐image up‐scaling workflow notes', velocity: { text: 'watch 120/h', tier: 'watch' } }),
  row('w3', ACCOUNTS.runway, { type: 'text', title: 'Direct link: https://example.com/a/very/long/unbreakable/path/segment/that/keeps/going/and/going/until/it/exceeds/the/column/width/entirely?x=1', velocity: { text: 'watch 90/h', tier: 'watch' } }),
  row('w4', ACCOUNTS.higgs, { type: 'text', title: 'https://cdn.example.com/assets/2026/10/05/abcdefghijklmnopqrstuvwxyz0123456789/renders/final-master-v7-transcoded.mp4', velocity: {} }),
  row('w5', ACCOUNTS.ootd, { type: 'text', title: `${Array(10).fill('#ailookbook').join(' ')} ${Array(4).fill('#sustainablefashion').join(' ')}`, velocity: { text: 'rising 2.2k/h', tier: 'rising' } }),
  row('w6', ACCOUNTS.home, { type: 'text', title: '本周话题 #家居好物 与 #小户型改造 同时登上热榜，评论区还在吵 #收纳技巧 到底有没有用', velocity: { text: 'watch 140/h', tier: 'watch' } }),
  row('w7', ACCOUNTS.higgs, { type: 'text', title: '用 Gen-3 跑了一段 cinematic drone shot，prompt 里加了 slow push-in 和 shallow depth of field，成片质感明显提升', velocity: { text: 'hot 4.4k/h', tier: 'hot' } }),
  row('w8', ACCOUNTS.runway, { type: 'text', title: 'AI 视频工作流分享：先用 image-to-video 生成 draft，再靠 upscale 和 interpolation 补帧，最后统一调色', velocity: { text: 'watch 110/h', tier: 'watch' } }),
  row('w9', ACCOUNTS.pet, { type: 'text', title: `non${NBSP}breaking${NBSP}space${NBSP}run${NBSP}that${NBSP}should${NBSP}stay${NBSP}glued${NBSP}together${NBSP}as${NBSP}one${NBSP}very${NBSP}long${NBSP}word`, velocity: { text: 'watch 70/h', tier: 'watch' } }),
  row('w10', ACCOUNTS.fur, { type: 'text', title: `narrow${NNBSP}no${NNBSP}break${NNBSP}space${NNBSP}case${NNBSP}with${NNBSP}several${NNBSP}segments${NNBSP}joined${NNBSP}by${NNBSP}U202F`, velocity: { text: 'watch 55/h', tier: 'watch' } }),
  row('w11', ACCOUNTS.higgs, { type: 'text', title: `${Array(9).fill('abcdefghijkl').join(' ')} tail`, velocity: { text: 'hot 9.9k/h', tier: 'hot' } }),
  row('w12', ACCOUNTS.runway, { type: 'text', title: `${Array(11).fill('mnopqrstuvwx').join(' ')} ${Array(3).fill('#twelvechars').join(' ')}`, velocity: { text: 'watch 33/h', tier: 'watch' } }),
  row('u1', ACCOUNTS.higgs, { type: 'text', title: 'javascript: 协议的 source_url 必须置灰', url: 'javascript:alert(1)', velocity: { text: 'watch 11/h', tier: 'watch' } }),
  row('u2', ACCOUNTS.runway, { type: 'text', title: '相对路径 source_url 也必须置灰', url: '/relative/path', velocity: { text: 'watch 12/h', tier: 'watch' } }),
  row('u3', ACCOUNTS.meow, { type: 'text', title: '空 source_url 也必须保留置灰槽位', url: '', velocity: { text: 'watch 13/h', tier: 'watch' } }),
  row('u4', ACCOUNTS.pet, { type: 'text', title: '正常 https 的对照卡（按钮应可点）', url: 'https://example.com/ok', velocity: { text: 'watch 14/h', tier: 'watch' } }),
  row('v1', ACCOUNTS.higgs, { type: 'text', title: '中文　全角空格　分隔　的　一行　文本　是否　按　空格　断行', velocity: { text: 'watch 21/h', tier: 'watch' } }),
  row('v2', ACCOUNTS.runway, { type: 'text', title: 'em space separated words that should break like normal spaces do', velocity: { text: 'watch 22/h', tier: 'watch' } }),
  row('v3', ACCOUNTS.higgs, { type: 'text', title: 'zero​width​space​should​break​here​and​here​and​here​too', velocity: { text: 'watch 23/h', tier: 'watch' } }),
  row('v4', ACCOUNTS.runway, { type: 'text', title: 'thin space and hair space separated segments that render very wide', velocity: { text: 'watch 24/h', tier: 'watch' } }),
  row('v5', ACCOUNTS.higgs, { type: 'text', title: 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima', velocity: { text: 'watch 25/h', tier: 'watch' } }),
  row('v6', ACCOUNTS.runway, { type: 'text', title: 'onetwothree​fourfivesix​seveneightnine​teneleventwelve​thirteenfourteen​fifteensixteen', velocity: { text: 'watch 26/h', tier: 'watch' } }),
  // R7-①：含 ? 的 text-media（生产常态——X/threads 带媒体帖）；
  // 同内容放 text-media 才暴露 EX 缺口（text 型会被 144px 下限吞掉，
  // QA R5 已实证）。同 QA qa39 形态。
  row('q1', ACCOUNTS.higgs, { type: 'video', media_kind: 'video', title: 'Read more: https://example.com/interpolation/benchmark/cinematic?ref=qa', cover_src: SVG_COVER(260, 1280, 720), velocity: { text: 'watch 31/h', tier: 'watch' } }),
  row('q2', ACCOUNTS.runway, { type: 'video', media_kind: 'image', title: 'Pipeline notes + link https://example.com/blog/state-of-the-art-video?src=feed&campaign=oct', cover_src: SVG_COVER(300, 900, 900), ratio: 1, velocity: { text: 'watch 32/h', tier: 'watch' } }),
]

function App() {
  const [markDoneNote, setMarkDoneNote] = useState('')
  const [detailCard, setDetailCard] = useState(null)
  const posts = useMemo(() => {
    const q = new URLSearchParams(location.search)
    const list = q.get('edge') ? [...POSTS, ...EDGE_POSTS] : POSTS
    return q.get('qa41') ? [...list, ...QA41_POSTS] : list
  }, [])
  const cards = useMemo(() => posts.map((r) => {
    const card = toRivalCardRow(r)
    // The QA page mirrors the cover path into the served location so the media
    // element loads exactly like a real cover (hostMediaSrc whitelist already
    // passed the cover_src upstream in production). cover_src gets an absolute
    // http(s) form so the detail dialog's hostMediaSrc whitelist passes too.
    const file = card.cover_key ? card.cover_key.split('/').pop() : ''
    return {
      ...card,
      cover_key: file ? `covers/${file}` : '',
      cover_src: file ? new URL(`covers/${file}`, location.href).href : '',
    }
  }), [])
  useEffect(() => {
    injectRivalTokens()
    injectRivalStyles()
    document.documentElement.setAttribute('data-theme',
      new URLSearchParams(location.search).get('theme') || 'dark')
    // Measurement seam: the descriptors the grid rendered, so the CDP script
    // can estimate every card with the same function and data the layout used.
    window.__RIVAL_QA__.cards = cards
  }, [cards])
  return (
    <div className="qa-stage">
      {markDoneNote ? <div className="qa-note">{markDoneNote}</div> : null}
      <RivalMasonry
        cards={cards}
        t={t}
        containerWidth={Number(new URLSearchParams(location.search).get('width')) || undefined}
        onDetail={(card) => setDetailCard(card)}
        onReplicate={() => {}}
        onDeconstruct={() => {}}
        onMarkDone={(card) => setMarkDoneNote(`${t('rivalFeed.toast.markDone')} · ${card.id}`)}
      />
      {detailCard ? (
        <RivalPostPreviewModal
          row={detailCard}
          t={t}
          busy={false}
          onClose={() => setDetailCard(null)}
          onReplicate={() => setDetailCard(null)}
        />
      ) : null}
    </div>
  )
}

const root = createRoot(document.getElementById('app'))
root.render(<App />)

// Measurement seam for the CDP harness (no UI surface): the estimator the
// placements were computed with, so the script can compare
// getBoundingClientRect() against rivalCardHeightPx without re-deriving it.
window.__RIVAL_QA__ = { rivalCardHeightPx, rivalHasPill, rivalWrapLines }
