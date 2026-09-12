import React, { memo } from 'react'
import type { PageSceneInfo } from './SceneBadge.tsx'
import {
  RocketIcon,
  ThreadIcon,
  QuoteIcon,
  GlobeIcon,
  SparklesIcon,
  FileTextIcon,
  FlameIcon,
  ChartIcon,
  ZapIcon,
  VideoIcon
} from './icons.tsx'

export interface PresetChipItem {
  id: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  labelZh: string
  labelEn: string
  promptTemplateZh: (scene: PageSceneInfo) => string
  promptTemplateEn: (scene: PageSceneInfo) => string
}

const PRESET_LIBRARY: Record<string, PresetChipItem[]> = {
  'twitter:status': [
    {
      id: 'tw_high_reply',
      icon: RocketIcon,
      labelZh: '高赞神评截流',
      labelEn: 'Viral Reply Hack',
      promptTemplateZh: (s) =>
        `请针对当前推文${s.author ? `（作者：@${s.author}）` : ''}${s.postText ? `（内容：“${s.postText}”）` : ''}，运用高赞截流公式（信息增量 × 情绪共鸣 × 表达清晰度），撰写 3 条不同风格的优质评论（数据补充型、反向思考型、幽默共鸣型），语言接地气、不讲套话、坚决杜绝机械AI味。`,
      promptTemplateEn: (s) =>
        `Please craft 3 high-impact, engaging replies to this tweet${s.author ? ` by @${s.author}` : ''}${s.postText ? `: "${s.postText}"` : ''}. Balance unique information value with emotional resonance. Concise, witty, and native-sounding without robotic AI tone.`
    },
    {
      id: 'tw_threads',
      icon: ThreadIcon,
      labelZh: '推文转长贴串',
      labelEn: 'Tweet to Threads',
      promptTemplateZh: (s) =>
        `请把当前推文${s.postText ? `（“${s.postText}”）` : ''}的核心观点拆解并扩写为 5~7 条深度 Twitter Threads 推文串。第一条给强钩子（Hook），中间层层展开干货与案例，最后一条做总结并引导转评互动。`,
      promptTemplateEn: (s) =>
        `Deconstruct and expand this tweet's core thesis${s.postText ? ` ("${s.postText}")` : ''} into a high-retention 5-7 post Twitter Threads. Start with a viral Hook, structure actionable steps and insights in the body, and close with a compelling CTA.`
    },
    {
      id: 'tw_quote_retweet',
      icon: QuoteIcon,
      labelZh: '中文引用转推',
      labelEn: 'Quote Retweet',
      promptTemplateZh: (s) =>
        `请提炼当前推文${s.postText ? `（“${s.postText}”）` : ''}的核心爆点，撰写 3 条有深度、有独特见解的中文引用转推文案，每条提供独立信息增量。`,
      promptTemplateEn: (s) =>
        `Synthesize the breakthrough insight of this tweet${s.postText ? ` ("${s.postText}")` : ''} and generate 3 thought-provoking quote retweets that add unique perspective and spark discussion.`
    },
    {
      id: 'tw_en_reply',
      icon: GlobeIcon,
      labelZh: '出海地道英文回复',
      labelEn: 'Native English Reply',
      promptTemplateZh: (s) =>
        `Please write 3 sharp, native-sounding English replies to this tweet${s.postText ? `: "${s.postText}"` : ''} from the perspective of a seasoned tech/AI practitioner. Crisp, insightful, and natural.`,
      promptTemplateEn: (s) =>
        `Write 3 sharp, insider-level replies to this tweet${s.postText ? `: "${s.postText}"` : ''} from the perspective of a Silicon Valley builder. Punchy, authentic, and discussion-driving.`
    },
    {
      id: 'tw_witty_rebuttal',
      icon: SparklesIcon,
      labelZh: '幽默趣味反驳',
      labelEn: 'Witty Counter',
      promptTemplateZh: (s) =>
        `针对当前推文${s.postText ? `（“${s.postText}”）` : ''}的观点，生成 2 条幽默风趣、逻辑严密的神评，化解争议并引爆前排互动。`,
      promptTemplateEn: (s) =>
        `Generate 2 witty, razor-sharp yet respectful counter-points to this tweet${s.postText ? ` ("${s.postText}")` : ''} that reframe the topic with clever humor.`
    }
  ],
  'twitter:profile': [
    {
      id: 'tw_dm_collab',
      icon: FileTextIcon,
      labelZh: '达人商务合作私信',
      labelEn: 'Creator Outreach DM',
      promptTemplateZh: (s) =>
        `结合博主${s.author ? `@${s.author}` : ''}的定位与主页风格，撰写 3 种语气的商务合作私信（真诚赞美型、利益共赢型、直接利落型），简短高效，拒绝营销垃圾感。`,
      promptTemplateEn: (s) =>
        `Draft 3 tailored collaboration DMs for creator ${s.author ? `@${s.author}` : 'this profile'} (authentic praise, win-win value, concise direct pitch). High conversion rate, zero spam vibe.`
    },
    {
      id: 'tw_author_audit',
      icon: ZapIcon,
      labelZh: '达人画像与爆款拆解',
      labelEn: 'Profile Deep Dive',
      promptTemplateZh: (s) =>
        `请分析该博主${s.author ? `@${s.author}` : ''}的内容矩阵、互动特征与人设定位，评估其内容策略与核心受众偏好。`,
      promptTemplateEn: (s) =>
        `Analyze the content strategy, engagement patterns, and niche positioning of ${s.author ? `@${s.author}` : 'this profile'}, summarizing core audience traits.`
    }
  ],
  'twitter:home': [
    {
      id: 'tw_home_imitation',
      icon: FlameIcon,
      labelZh: '热点主页发帖',
      labelEn: 'Trending Feed Post',
      promptTemplateZh: () =>
        `请结合当前社交网络讨论热点，为我的个人主页撰写 3 条高互动潜力的首发推文，排版采用一段一句、适度留白、富有网感。`,
      promptTemplateEn: () =>
        `Identify top trending talking points in the current feed and draft 3 high-virality posts for my personal profile. One sentence per line, crisp formatting.`
    },
    {
      id: 'tw_viral_rewrite',
      icon: SparklesIcon,
      labelZh: '爆款二创复刻',
      labelEn: 'Viral Post Remix',
      promptTemplateZh: () =>
        `请提取当前视野中最具爆款潜质推文的核心开头钩子与情绪逻辑，在保持核心事实不变的前提下，复刻生成一篇更具传播力的原创推文。`,
      promptTemplateEn: () =>
        `Deconstruct the psychological hook and emotional pacing of the top viral post in view, remixing it into an original high-performing post.`
    },
    {
      id: 'tw_feed_filter',
      icon: ChartIcon,
      labelZh: '信息流热度快筛',
      labelEn: 'Feed Intelligence',
      promptTemplateZh: () =>
        `请快筛当前信息流中的核心议题，提炼出前 3 个最具传播价值的讨论角度与数据要点。`,
      promptTemplateEn: () =>
        `Filter and rank key narratives across this feed, extracting the top 3 high-leverage discussion angles and takeaways.`
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

  const key = `${currentScene.platform}:${currentScene.pageType}`
  const chips = PRESET_LIBRARY[key] || PRESET_LIBRARY[`${currentScene.platform}:home`] || PRESET_LIBRARY.generic

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
