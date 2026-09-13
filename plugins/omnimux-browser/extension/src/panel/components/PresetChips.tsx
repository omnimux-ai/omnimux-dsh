import React, { memo } from 'react'
import type { PageSceneInfo } from './SceneBadge.tsx'
import {
  RocketIcon,
  QuoteIcon,
  GlobeIcon,
  SparklesIcon,
  FileTextIcon,
  FlameIcon,
  ChartIcon,
  ZapIcon,
  VideoIcon,
  LightbulbIcon,
  ScissorsIcon,
  RetweetIcon,
  TargetIcon
} from './icons.tsx'

export interface PresetChipItem {
  id: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  labelZh: string
  labelEn: string
  promptTemplateZh: (scene: PageSceneInfo) => string
  promptTemplateEn: (scene: PageSceneInfo) => string
}

export const PRESET_LIBRARY: Record<string, PresetChipItem[]> = {
  'twitter:status': [
    {
      id: 'tw_high_reply',
      icon: RocketIcon,
      labelZh: '高赞神评',
      labelEn: 'Viral Reply',
      promptTemplateZh: (s) =>
        `请针对当前推文${s.author ? `（作者：@${s.author}）` : ''}${s.postText ? `（内容：“${s.postText}”）` : ''}，运用高赞截流公式（信息增量 × 情绪共鸣 × 表达清晰度），撰写 3 条不同风格的优质回复（数据补充型、反向思考型、幽默共鸣型），语言接地气、不讲套话、坚决杜绝机械AI味。`,
      promptTemplateEn: (s) =>
        `Please craft 3 high-impact, engaging replies to this tweet${s.author ? ` by @${s.author}` : ''}${s.postText ? `: "${s.postText}"` : ''}. Balance unique information value with emotional resonance. Concise, witty, and native-sounding without robotic AI tone.`
    },
    {
      id: 'tw_insight',
      icon: LightbulbIcon,
      labelZh: '干货洞察',
      labelEn: 'Key Insights',
      promptTemplateZh: (s) =>
        `请深度提炼并补充当前推文${s.postText ? `（“${s.postText}”）` : ''}背后的行业干货与关键数据，给出独到的专业增量见解。`,
      promptTemplateEn: (s) =>
        `Extract deep industry insights and supplemental data for this tweet${s.postText ? ` ("${s.postText}")` : ''} with authoritative perspective.`
    },
    {
      id: 'tw_rewrite',
      icon: ScissorsIcon,
      labelZh: '洗帖二创',
      labelEn: 'Viral Rewrite',
      promptTemplateZh: (s) =>
        `请根据当前推文${s.postText ? `（“${s.postText}”）` : ''}的主题与逻辑骨架，结合最新全网视角，重构并改写为一篇文风鲜明、短句留白的原创爆款推文，严禁同质化抄袭感。`,
      promptTemplateEn: (s) =>
        `Rewrite and reframe this tweet's core angle${s.postText ? ` ("${s.postText}")` : ''} into a punchy, original viral post with high retention.`
    },
    {
      id: 'tw_quote_retweet',
      icon: RetweetIcon,
      labelZh: '引用转推',
      labelEn: 'Quote Retweet',
      promptTemplateZh: (s) =>
        `请提炼当前推文${s.postText ? `（“${s.postText}”）` : ''}的核心爆点，撰写 2 条有深度、有独特见解的引用转推文案。`,
      promptTemplateEn: (s) =>
        `Synthesize the breakthrough insight of this tweet${s.postText ? ` ("${s.postText}")` : ''} and generate 2 thought-provoking quote retweets.`
    }
  ],
  'twitter:profile': [
    {
      id: 'tw_dm_collab',
      icon: FileTextIcon,
      labelZh: '商务私信',
      labelEn: 'Outreach DM',
      promptTemplateZh: (s) =>
        `结合博主${s.author ? `@${s.author}` : ''}的定位与主页风格，撰写 3 种语气的商务合作私信（真诚赞美型、利益共赢型、直接利落型），简短高效，拒绝营销垃圾感。`,
      promptTemplateEn: (s) =>
        `Draft 3 tailored collaboration DMs for creator ${s.author ? `@${s.author}` : 'this profile'} (authentic praise, win-win value, concise direct pitch). High conversion rate, zero spam vibe.`
    },
    {
      id: 'tw_author_audit',
      icon: ZapIcon,
      labelZh: '人设拆解',
      labelEn: 'Profile Deep Dive',
      promptTemplateZh: (s) =>
        `请分析该博主${s.author ? `@${s.author}` : ''}的内容矩阵、互动特征与人设定位，评估其内容策略与核心受众偏好。`,
      promptTemplateEn: (s) =>
        `Analyze the content strategy, engagement patterns, and niche positioning of ${s.author ? `@${s.author}` : 'this profile'}, summarizing core audience traits.`
    },
    {
      id: 'tw_rival_track',
      icon: TargetIcon,
      labelZh: '加入对标',
      labelEn: 'Track Creator',
      promptTemplateZh: (s) =>
        `请将当前博主${s.author ? `@${s.author}` : ''}加入我的对标账号库，并分析其近期表现最佳的爆款选题与互动模型。`,
      promptTemplateEn: (s) =>
        `Add creator ${s.author ? `@${s.author}` : 'this profile'} to my benchmark tracking list and analyze top-performing posts and angles.`
    },
    {
      id: 'tw_style_imitation',
      icon: SparklesIcon,
      labelZh: '文风仿写',
      labelEn: 'Style Remix',
      promptTemplateZh: (s) =>
        `请深度分析博主${s.author ? `@${s.author}` : ''}的发帖排版风格、语气语调与结构特点，按照其文风为我生成 3 条高原创度的全新推文。`,
      promptTemplateEn: (s) =>
        `Analyze the voice, tone, and pacing of ${s.author ? `@${s.author}` : 'this creator'}, crafting 3 original viral posts imitating this signature style.`
    }
  ],
  'twitter:home': [
    {
      id: 'tw_home_imitation',
      icon: FlameIcon,
      labelZh: '热点发帖',
      labelEn: 'Trending Post',
      promptTemplateZh: () =>
        `请结合当前社交网络讨论热点，为我的个人主页撰写 3 条高互动潜力的首发推文，排版采用一段一句、适度留白、富有网感。`,
      promptTemplateEn: () =>
        `Identify top trending talking points in the current feed and draft 3 high-virality posts for my personal profile. One sentence per line, crisp formatting.`
    },
    {
      id: 'tw_viral_rewrite',
      icon: ScissorsIcon,
      labelZh: '爆款二创',
      labelEn: 'Viral Remix',
      promptTemplateZh: () =>
        `请提取当前视野中最具爆款潜质推文的核心开头钩子与情绪逻辑，在保持核心事实不变的前提下，复刻生成一篇更具传播力的原创推文。`,
      promptTemplateEn: () =>
        `Deconstruct the psychological hook and emotional pacing of the top viral post in view, remixing it into an original high-performing post.`
    },
    {
      id: 'tw_feed_filter',
      icon: ChartIcon,
      labelZh: '信息流快筛',
      labelEn: 'Feed Scanner',
      promptTemplateZh: () =>
        `请提取当前视口内前 10 条推文的作者、发布时间、互动量（转/评/赞）及核心要点，整理为互动率降序排列的结构化 Markdown 表格。`,
      promptTemplateEn: () =>
        `Extract author, engagement, and core thesis of the top 10 tweets in viewport, formatting them into an engagement-ranked table.`
    },
    {
      id: 'tw_reply_follow',
      icon: RocketIcon,
      labelZh: '破冰互关',
      labelEn: 'Peer Networking',
      promptTemplateZh: () =>
        `请识别当前信息流中的同行与高价值博主，针对其推文生成 3 条真诚、专业、具有高信息增量的破冰互动回复，促进深度交流与互关。`,
      promptTemplateEn: () =>
        `Generate 3 thoughtful, value-add replies to peers in the current feed that naturally foster mutual connection and discussions.`
    }
  ],
  'tiktok:profile': [
    {
      id: 'tt_profile_diagnose',
      icon: ChartIcon,
      labelZh: '账号诊断与选题',
      labelEn: 'Account Diagnosis',
      promptTemplateZh: (s) =>
        `请诊断 TikTok 账号 ${s.author ? `@${s.author}` : '当前账号'} 的定位与内容结构：依据主页可见的作品与简介，判断其内容支柱（教育 / 娱乐 / 激励 / 带货）是否失衡，指出 3 个增长瓶颈、最该补的选题空档，并给出可直接执行的内容调整建议。`,
      promptTemplateEn: (s) =>
        `Diagnose the TikTok account ${s.author ? `@${s.author}` : 'on this page'}: from the profile and videos visible here, judge whether its content pillars (educational / entertainment / inspirational / promotional) are out of balance, name 3 growth bottlenecks and the topic gaps worth filling, and give concrete, actionable adjustments.`
    },
    {
      id: 'tt_profile_collab',
      icon: TargetIcon,
      labelZh: '合作价值与报价',
      labelEn: 'Collab Valuation',
      promptTemplateZh: (s) =>
        `请评估 TikTok 账号 ${s.author ? `@${s.author}` : '当前账号'} 的合作价值：依据主页可见的粉丝量、互动表现与内容垂类判断其 KOL 层级（素人 / KOC / 腰部 / 头部 / 顶流），给出合理的商单报价区间及其调整因子（垂直度、独家、多平台、时效），报价必须标注口径：能参考的定价资料多为中文平台人民币口径，若没有 TikTok 直接对口的报价表，请说明折算依据并给出保守—乐观区间，不要给出单一确定数字。最后列出最适合合作的 3 类品牌与预期效果指标（每个数值标注估算口径）。`,
      promptTemplateEn: (s) =>
        `Assess the brand-collaboration value of the TikTok account ${s.author ? `@${s.author}` : 'on this page'}: infer its KOL tier (nano / micro / mid / macro / top) from the followers, engagement and niche visible here, propose a fair rate range with its adjustment factors (verticality, exclusivity, cross-platform, seasonality), State the basis for the numbers: where the only rate references are RMB-denominated tables for other platforms, say so, explain the conversion, and give a conservative-to-optimistic range rather than a single figure. Finish with the 3 best-fit brand categories and expected KPIs, each noting how it was estimated.`
    },
    {
      id: 'tt_profile_benchmark',
      icon: FlameIcon,
      labelZh: '对标竞品与选题',
      labelEn: 'Competitor Gaps',
      promptTemplateZh: (s) =>
        `请以 TikTok 账号 ${s.author ? `@${s.author}` : '当前账号'} 为基准做赛道对标：先取 3-5 个同垂类对标账号的主页（优先直接读取页面，被拦截时改用搜索），对比它们在选题、形式与节奏上的差异；拿不到的播放量、完播率等后台数据如实标注为「无公开数据」，不要估成精确值。最后列出 3 个更值得抢先做的选题方向，并说明各自的爆款潜力与切入方式。`,
      promptTemplateEn: (s) =>
        `Benchmark the TikTok account ${s.author ? `@${s.author}` : 'on this page'} against peer accounts in its niche: first gather 3-5 comparable accounts (read their pages directly, fall back to search if blocked), then compare their topic choice, format and pacing. Where backend metrics such as views or completion rate are not public, label them as unavailable rather than inventing precise figures. Finish with 3 topic directions worth moving on first, each with its viral potential and how to enter it.`
    }
  ],
  'tiktok:detail': [
    {
      id: 'tt_hook_deconstruct',
      icon: ZapIcon,
      labelZh: '黄金3秒钩子拆解',
      labelEn: '3s Hook Teardown',
      promptTemplateZh: (s) =>
        `请深度拆解当前 TikTok 视频${s.postText ? `（“${s.postText}”）` : ''}前 3 秒的视觉反差、台词悬念与心理诱饵，提炼出 3 个可复用的短视频黄金起跑 Hook。`,
      promptTemplateEn: (s) =>
        `Analyze the visual contrast, sound cue, and curiosity gap in the first 3 seconds of this TikTok video${s.postText ? ` ("${s.postText}")` : ''}, extracting 3 repeatable hook templates.`
    },
    {
      id: 'tt_script_breakdown',
      icon: VideoIcon,
      labelZh: '分镜脚本与逐字稿',
      labelEn: 'Storyboard Script',
      promptTemplateZh: (s) =>
        `请将当前视频${s.postText ? `（“${s.postText}”）` : ''}拆解为标准分镜脚本表格，包含【镜头秒数】、【视觉动作】、【口播台词/音效】、【心理钩子】四列。`,
      promptTemplateEn: (s) =>
        `Deconstruct this video${s.postText ? ` ("${s.postText}")` : ''} into a structured storyboard breakdown table with 4 columns: [Timestamp/Duration], [Visual Action], [Spoken Line/Audio], [Psychological Trigger].`
    },
    {
      id: 'tt_comment_reply',
      icon: QuoteIcon,
      labelZh: '评论区高赞神评',
      labelEn: 'Top Comment Hijack',
      promptTemplateZh: () =>
        `针对该视频内容，生成 3 条极具网感、易引起广泛共鸣并被顶上前排的高赞神评。`,
      promptTemplateEn: () =>
        `Generate 3 sharp, viral comment ideas for this video that maximize likes and spark front-row discussion.`
    }
  ],
  'generic': [
    {
      id: 'gen_summary',
      icon: FileTextIcon,
      labelZh: '核心要点提炼',
      labelEn: 'Key Takeaways',
      promptTemplateZh: (s) =>
        `请阅读当前页面（${s.title}），用清晰的 Markdown 结构提炼其核心论点、事实依据与主要结论。`,
      promptTemplateEn: (s) =>
        `Please summarize the key arguments, supporting evidence, and conclusions of this page (${s.title}) in clean Markdown bullet points.`
    },
    {
      id: 'gen_critique',
      icon: ZapIcon,
      labelZh: '观点驳论与盲点',
      labelEn: 'Counter Arguments',
      promptTemplateZh: (s) =>
        `请对当前文章（${s.title}）的核心论断进行批判性审视，列出 3 个潜在漏洞或反向思考角度。`,
      promptTemplateEn: (s) =>
        `Critically examine the core claims in (${s.title}), pointing out 3 potential blindspots, counter-examples, or alternative interpretations.`
    },
    {
      id: 'gen_translate',
      icon: GlobeIcon,
      labelZh: '精炼中英双语对照',
      labelEn: 'Bilingual Polish',
      promptTemplateZh: () =>
        `请将当前页面选中文本或核心段落翻译为地道、专业的中文与英文对照表达。`,
      promptTemplateEn: () =>
        `Translate and polish the selected text or core ideas from this page into idiomatic, natural English and Chinese bilingual pairs.`
    }
  ]
}

/**
 * The chips one page scene gets.
 *
 * Resolution order is scene, then the platform's home group, then the generic
 * web presets. The fallback is a safety net, not a default: a creator profile
 * used to land on the generic buttons because TikTok had no profile group at
 * all, which read as "this page is about nothing in particular" on the one page
 * where the account itself is the subject.
 */
export function presetChipsFor(scene: PageSceneInfo): PresetChipItem[] {
  const key = `${scene.platform}:${scene.pageType}`
  return PRESET_LIBRARY[key] ?? PRESET_LIBRARY[`${scene.platform}:home`] ?? PRESET_LIBRARY.generic
}

export const PresetChips = memo(function PresetChips({
  scene,
  locale = 'zh',
  onSelectPrompt
}: {
  scene?: PageSceneInfo | null
  locale?: 'zh' | 'en'
  onSelectPrompt: (promptText: string) => void
}) {
  const isEn = locale === 'en'
  const currentScene = scene || {
    url: window.location.href,
    title: document.title,
    platform: 'generic',
    pageType: 'unknown'
  }

  const chips = presetChipsFor(currentScene)

  return (
    <div className="preset-chips-scroll">
      <div className="preset-chips-track">
        {chips.map((chip) => {
          const label = isEn ? chip.labelEn : chip.labelZh
          const template = isEn ? chip.promptTemplateEn : chip.promptTemplateZh
          const Icon = chip.icon
          return (
            <button
              key={chip.id}
              type="button"
              className="preset-chip-btn"
              onClick={() => onSelectPrompt(template(currentScene))}
              title={isEn ? `Apply preset: ${label}` : `点击载入预设：${label}`}
            >
              <span className="chip-icon"><Icon size={12} /></span>
              <span className="chip-label">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
})
