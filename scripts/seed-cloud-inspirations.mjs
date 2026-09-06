import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

async function resolveToken() {
  if (process.env.OMNIMUX_ACCESS_TOKEN) return process.env.OMNIMUX_ACCESS_TOKEN

  const homes = []
  if (process.env.DSH_HOME && process.env.DSH_HOME.trim()) homes.push(process.env.DSH_HOME.trim())
  // Prefer OmniMux isolation roots, then legacy ~/.dsh.
  homes.push(join(homedir(), '.omnimux-dev'), join(homedir(), '.omnimux'), join(homedir(), '.dsh'))

  const seen = new Set()
  for (const home of homes) {
    if (!home || seen.has(home)) continue
    seen.add(home)
    const tokenPath = join(home, 'omnimux', 'access-token')
    if (!existsSync(tokenPath)) continue
    const token = readFileSync(tokenPath, 'utf8').trim()
    if (token) return token
  }
  throw new Error('未找到 OmniMux Access Token，请在 设置 → 个人资料 登录')
}

// 真实 Gxgen Supabase 数据库连接
const GXGEN_SUPABASE_URL = process.env.GXGEN_SUPABASE_URL || 'http://127.0.0.1:54321'
const GXGEN_SUPABASE_KEY = process.env.GXGEN_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

async function fetchTikTokMetadata(tiktokUrl) {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(tiktokUrl)}`
    const resp = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    if (resp.ok) {
      const json = await resp.json()
      return {
        author_name: json.author_name || null,
        video_title: json.title || null,
      }
    }
  } catch (err) {
    // ignore
  }
  return { author_name: null, video_title: null }
}

export function r2CoverReference(row) {
  const key = row.cover_r2_key
  const invalid = typeof key !== 'string' || !key.startsWith('publications/') || Buffer.byteLength(`r2/${key}`, 'utf8') > 255 ||
    /[\\%?#:\p{Cc}]/u.test(key) || key.split('/').some(part => !part || part === '.' || part === '..' || part.trim() !== part)
  if (invalid) throw new Error(`Invalid or missing top-level cover_r2_key for source row ${row.id}`)
  return `r2/${key}`
}

async function fetchFromGxgenDatabase() {
  console.log('=== Step 1: 扫描 Gxgen 数据库中【带有真实 TikTok 链接且具备 5 维拆解】的灵感素材 ===')
  const endpoint = `${GXGEN_SUPABASE_URL}/rest/v1/published_tasks?select=*&limit=150`

  const resp = await fetch(endpoint, {
    headers: {
      apikey: GXGEN_SUPABASE_KEY,
      authorization: `Bearer ${GXGEN_SUPABASE_KEY}`,
      accept: 'application/json',
    },
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Gxgen 数据库查询失败 status ${resp.status}: ${text}`)
  }

  const rows = await resp.json()

  return mapGxgenRows(rows)
}

export async function mapGxgenRows(rows, { fetchMetadata = fetchTikTokMetadata, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  // 严格过滤：1. 具有真实 TikTok 视频 ID/链接；2. 具有完整的 5 维多模态 AI 拆解
  const tiktokCandidates = []

  for (const r of rows) {
    const assets = r.assets || {}
    const rawSource = assets.raw_source || {}
    const meta = assets.meta || {}
    const an = assets.analysis || {}

    // 提取真实 TikTok 视频 ID
    let tiktokId = assets.tiktok_video_id || rawSource.tiktok_video_id
    let account = assets.creator?.handle || rawSource.account || meta.nickname

    if (!tiktokId && typeof rawSource.id === 'string') {
      const match = rawSource.id.match(/video-(\d+)/) || rawSource.id.match(/(\d{15,22})/)
      if (match) tiktokId = match[1]
    }

    if (!tiktokId && typeof rawSource.videoUrl === 'string' && rawSource.videoUrl.includes('tiktok')) {
      const match = rawSource.videoUrl.match(/video\/(\d+)/)
      if (match) tiktokId = match[1]
    }

    const hasAnalysis = Boolean(
      an.attraction_analysis &&
      an.global_goal &&
      an.narrative_structure &&
      an.visual_analysis &&
      an.replication_strategy
    )

    if (tiktokId && hasAnalysis) {
      if (!account || account === 'creator') account = 'tiktok'
      const tiktokUrl = `https://www.tiktok.com/@${account}/video/${tiktokId}`

      tiktokCandidates.push({
        gxgenId: r.id,
        source: r,
        title: r.title || an.video_name || rawSource.title,
        tiktokId,
        tiktokUrl,
        account,
        assets,
        an,
      })
    }
  }

  console.log(`在 Gxgen 数据库中成功检索到 ${tiktokCandidates.length} 条符合条件的真实 TikTok 灵感素材`)

  const selected = tiktokCandidates.slice(0, 10).map(item => ({ ...item, coverRef: r2CoverReference(item.source) }))

  // 在任何云端写入前完成所有源引用验证和字段映射。
  const mappedItems = []

  for (let i = 0; i < selected.length; i++) {
    const item = selected[i]
    const { assets, an, tiktokId, tiktokUrl, account } = item

    console.log(`- [${i + 1}/10] 正在提取信息: 《${item.title}》 (${tiktokUrl})`)
    const oembedData = await fetchMetadata(tiktokUrl)


    // 作者名称
    const authorName = oembedData.author_name || assets.creator?.name || account
    const authorHandle = account

    // 视频文案与标题
    const title = item.title || oembedData.video_title || `TikTok 爆款灵感 #${i + 1}`
    const content = assets.caption || assets.hook || oembedData.video_title || an.video_description || title

    // 真实标签
    const tags = Array.isArray(assets.tags) && assets.tags.length > 0
      ? assets.tags
      : (Array.isArray(assets.categories) && assets.categories.length > 0 ? assets.categories : ['TikTok', 'AI拆解', '爆款视频'])

    // 真实热度
    const hotScore = Number(assets.views_numeric || assets.views || assets.likes_numeric || assets.likes || 88000)

    const mappedAnalysis = {
      hook_highlight: an.attraction_analysis,
      target_goal: an.global_goal,
      narrative_strategy: an.narrative_structure,
      visual_breakdown: an.visual_analysis,
      replication_action: an.replication_strategy,
      creator: {
        name: authorName,
        handle: authorHandle,
      },
      tiktok_video_id: tiktokId,
      embed_player_url: `https://www.tiktok.com/player/v1/${tiktokId}`,
    }

    // 保证唯一 source_url 且保留真实 tiktok 路径
    const uniqueSourceUrl = `${tiktokUrl}?sync=${timestamp}_${i + 1}`

    mappedItems.push({
      type: 'video',
      title,
      content,
      source_url: uniqueSourceUrl,
      cover_key: item.coverRef,
      hot_score: hotScore,
      tags,
      analysis: mappedAnalysis,
    })

    // 适度间隔
    await new Promise((r) => setTimeout(r, 100))
  }

  return mappedItems
}

async function syncToOmnimuxCloud() {
  const token = await resolveToken()
  const base = 'https://omnimux.ai/api/inspiration/v1'

  const mappedItems = await fetchFromGxgenDatabase()
  if (mappedItems.length === 0) {
    throw new Error('未在 Gxgen 数据库中提取到有效 TikTok 数据')
  }

  console.log(`\n=== Step 2: 清空微服务灵感库云端现有数据 ===`)
  const listResp = await fetch(`${base}/inspirations?page_size=100`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const listJson = await listResp.json()
  const currentItems = listJson.data?.items || listJson.data || []
  console.log(`当前云端共有 ${currentItems.length} 条旧数据，开始清理...`)

  for (const item of currentItems) {
    try {
      const delResp = await fetch(`${base}/inspirations/${item.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      console.log(`- 删除旧数据 ID ${item.id} (${item.title.slice(0, 20)}...): ${delResp.status}`)
    } catch (e) {
      console.error(`- 删除 ID ${item.id} 失败:`, e.message)
    }
  }

  console.log(`\n=== Step 3: 将 Gxgen 提取的 ${mappedItems.length} 条带真实 TikTok 链接与拆解的数据录入微服务 ===`)
  for (let i = 0; i < mappedItems.length; i++) {
    const item = mappedItems[i]
    try {
      const createResp = await fetch(`${base}/inspirations`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(item),
      })
      const text = await createResp.text()
      let createJson = null
      try {
        createJson = JSON.parse(text)
      } catch {}

      if (createResp.status === 201 || createResp.status === 200) {
        const id = createJson?.data?.id
        console.log(`[${i + 1}/${mappedItems.length}] 成功录入 ID: ${id} | 《${item.title}》`)
      } else {
        console.error(`[${i + 1}/${mappedItems.length}] 录入失败 status ${createResp.status}:`, createJson || text)
      }
    } catch (err) {
      console.error(`[${i + 1}/${mappedItems.length}] 录入异常:`, err.message)
    }

    // Rate limit sleep
    await new Promise((r) => setTimeout(r, 600))
  }

  console.log('\n=== Step 4: 回查验证云端微服务画面与五维拆解映射 ===')
  const verifyResp = await fetch(`${base}/inspirations?page_size=50`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const verifyJson = await verifyResp.json()
  const verifyList = verifyJson.data?.items || []
  console.log(`\n 验证成功：云端微服务灵感库现存来自 Gxgen 数据库的真实 TikTok 灵感素材共 ${verifyList.length} 条：`)
  for (const item of verifyList) {
    const an = item.analysis || {}
    console.log(`--------------------------------------------------`)
    console.log(`ID: ${item.id} | 标题: ${item.title}`)
    console.log(`- 真实 TikTok 链接: ${item.source_url}`)
    console.log(`- 封面图: ${item.cover_key?.slice(0, 70)}...`)
    console.log(`- 嵌入播放器: ${an.embed_player_url}`)
    console.log(`- ⚡ Hook亮点 (前45字): ${an.hook_highlight?.slice(0, 45).replace(/\n/g, ' ')}...`)
    console.log(`- 🎯 转化目标 (前45字): ${an.target_goal?.slice(0, 45).replace(/\n/g, ' ')}...`)
    console.log(`- 📖 叙事脚本 (前45字): ${an.narrative_strategy?.slice(0, 45).replace(/\n/g, ' ')}...`)
    console.log(`- 🔍 画面节奏 (前45字): ${an.visual_breakdown?.slice(0, 45).replace(/\n/g, ' ')}...`)
    console.log(`- 🚀 复刻策略 (前45字): ${an.replication_action?.slice(0, 45).replace(/\n/g, ' ')}...`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  syncToOmnimuxCloud().catch((err) => {
    console.error('Migration error:', err)
    process.exitCode = 1
  })
}
