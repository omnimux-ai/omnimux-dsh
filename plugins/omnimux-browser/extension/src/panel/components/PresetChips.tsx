import { memo } from 'react'
import type { PageSceneInfo } from './SceneBadge.tsx'

export interface PresetChipItem {
  id: string
  icon: string
  label: string
  promptTemplate: (scene: PageSceneInfo) => string
}

const PRESET_LIBRARY: Record<string, PresetChipItem[]> = {
  'twitter:status': [
    {
      id: 'tw_high_reply',
      icon: '🚀',
      label: '高赞神评截流',
      promptTemplate: (s) =>
        `请针对当前推文${s.author ? `（作者：@${s.author}）` : ''}${s.postText ? `（内容：“${s.postText}”）` : ''}，运用高赞截流公式（信息增量 × 情绪共鸣 × 表达清晰度），撰写 3 条不同风格的优质评论（数据补充型、反向思考型、幽默共鸣型），语言接地气、不讲套话、坚决杜绝机械AI味。`
    },
    {
      id: 'tw_threads',
      icon: '🧵',
      label: '推文转长贴串',
      promptTemplate: (s) =>
        `请把当前推文${s.postText ? `（“${s.postText}”）` : ''}的核心观点拆解并扩写为 5~7 条深度 Twitter Threads 推文串。第一条给强钩子（Hook），中间层层展开干货与案例，最后一条做总结并引导转评互动。`
    },
    {
      id: 'tw_quote_retweet',
      icon: '🔄',
      label: '中文引用转推',
      promptTemplate: (s) =>
        `请提炼当前推文${s.postText ? `（“${s.postText}”）` : ''}的核心爆点，撰写 3 条有深度、有独特见解的中文引用转推文案，每条提供独立信息增量。`
    },
    {
      id: 'tw_en_reply',
      icon: '🌍',
      label: '出海地道英文回复',
      promptTemplate: (s) =>
        `Please write 3 sharp, native-sounding English replies to this tweet${s.postText ? `: "${s.postText}"` : ''} from the perspective of a seasoned tech/AI practitioner. Crisp, insightful, and natural.`
    },
    {
      id: 'tw_witty_rebuttal',
      icon: '🎭',
      label: '幽默趣味反驳',
      promptTemplate: (s) =>
        `针对当前推文${s.postText ? `（“${s.postText}”）` : ''}的观点，生成 2 条幽默风趣、逻辑严密的神评，化解争议并引爆前排互动。`
    }
  ],
  'twitter:profile': [
    {
      id: 'tw_dm_collab',
      icon: '📩',
      label: '达人商务合作私信',
      promptTemplate: (s) =>
        `结合博主${s.author ? `@${s.author}` : ''}的定位与主页风格，撰写 3 种语气的商务合作私信（真诚赞美型、利益共赢型、直接利落型），简短高效，拒绝营销垃圾感。`
    },
    {
      id: 'tw_author_audit',
      icon: '🕵️',
      label: '达人画像与爆款拆解',
      promptTemplate: (s) =>
        `请分析该博主${s.author ? `@${s.author}` : ''}的内容矩阵、互动特征与人设定位，评估其内容策略与核心受众偏好。`
    }
  ],
  'twitter:home': [
    {
      id: 'tw_home_imitation',
      icon: '🔥',
      label: '热点主页发帖',
      promptTemplate: () =>
        `请结合当前社交网络讨论热点，为我的个人主页撰写 3 条高互动潜力的首发推文，排版采用一段一句、适度留白、富有网感。`
    },
    {
      id: 'tw_viral_rewrite',
      icon: '💡',
      label: '爆款二创复刻',
      promptTemplate: (s) =>
        `请提取当前视野中最具爆款潜质推文的核心开头钩子与情绪逻辑，在保持核心事实不变的前提下，复刻生成一篇更具传播力的原创推文。`
    },
    {
      id: 'tw_feed_filter',
      icon: '📊',
      label: '信息流热度快筛',
      promptTemplate: () =>
        `请快筛当前信息流中的核心议题，提炼出前 3 个最具传播价值的讨论角度与数据要点。`
    }
  ],
  'tiktok:detail': [
    {
      id: 'tt_hook_deconstruct',
      icon: '🎣',
      label: '黄金3秒钩子拆解',
      promptTemplate: (s) =>
        `请深度拆解当前 TikTok 视频${s.postText ? `（“${s.postText}”）` : ''}前 3 秒的视觉反差、台词悬念与心理诱饵，提炼出 3 个可复用的短视频黄金起跑 Hook。`
    },
    {
      id: 'tt_script_breakdown',
      icon: '🎬',
      label: '分镜脚本与逐字稿',
      promptTemplate: (s) =>
        `请将当前视频${s.postText ? `（“${s.postText}”）` : ''}拆解为标准分镜脚本表格，包含【镜头秒数】、【视觉动作】、【口播台词/音效】、【心理钩子】四列。`
    },
    {
      id: 'tt_comment_reply',
      icon: '💬',
      label: '评论区高赞神评',
      promptTemplate: () =>
        `针对该视频内容，生成 3 条极具网感、易引起广泛共鸣并被顶上前排的高赞神评。`
    }
  ],
  'generic': [
    {
      id: 'gen_summary',
      icon: '📝',
      label: '核心要点提炼',
      promptTemplate: (s) =>
        `请阅读当前页面（${s.title}），用清晰的 Markdown 结构提炼其核心论点、事实依据与主要结论。`
    },
    {
      id: 'gen_critique',
      icon: '⚡',
      label: '观点驳论与盲点',
      promptTemplate: (s) =>
        `请对当前文章（${s.title}）的核心论断进行批判性审视，列出 3 个潜在漏洞或反向思考角度。`
    },
    {
      id: 'gen_translate',
      icon: '🌐',
      label: '精炼中英双语对照',
      promptTemplate: () =>
        `请将当前页面选中文本或核心段落翻译为地道、专业的中文与英文对照表达。`
    }
  ]
}

export const PresetChips = memo(function PresetChips({
  scene,
  onSelectPrompt
}: {
  scene?: PageSceneInfo | null
  onSelectPrompt: (promptText: string) => void
}) {
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
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="preset-chip-btn"
            onClick={() => onSelectPrompt(chip.promptTemplate(currentScene))}
            title="点击载入场景化 Prompt"
          >
            <span className="chip-icon">{chip.icon}</span>
            <span className="chip-label">{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
})
