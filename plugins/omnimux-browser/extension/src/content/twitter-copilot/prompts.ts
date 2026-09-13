/**
 * Twitter Copilot Prompts & Scenarios (Bilingual Support: zh / en)
 * Powered by self-built Twitter skills (sopilot-social-agents)
 */

import type { CopilotMenuItem, TwitterContext } from './types.ts'

export const COPILOT_MENU_ITEMS: CopilotMenuItem[] = [
  // ==================== 发新帖 / 转发场景 ====================
  {
    id: 'ai-hot-tweets',
    name: '爆款推文复刻',
    nameEn: 'Rewrite Viral Tweet',
    desc: '提炼底层逻辑与吸睛钩子，一键二创高传播原创帖',
    descEn: 'Extract hooks and recreate high-engagement viral tweets',
    category: 'create',
    scenes: ['POST_NEW', 'POST_QUOTE'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `You are an elite Twitter/X ghostwriter and virality growth strategist. Your goal is to recreate a high-converting, viral tweet based on the user's reference idea or draft.
Guidelines:
1. Killer Hook: The first 2 lines must provoke curiosity, counter-intuitive insight, or raw resonance.
2. Formatted for high scan-ability: Use short sentences, clean bullet points, and double line breaks.
3. Engaging CTA: End with an open question, vote, or debate prompt.
4. Output purely the tweet copy in authentic, native English without robotic AI filler words.`,
          userMessage: `Draft / Reference material:\n${ctx.draftText || ctx.quotedTweetText || ctx.targetTweetText || 'Key trends in AI agent automation and modern product engineering'}`,
        }
      }
      return {
        systemPrompt: `你是一位顶级 Twitter/X 增长专家。你的任务是根据用户提供的草稿或参考内容，复刻并创作出具备病毒式传播潜力的推特爆款帖。
写作准则：
1. 黄金前 3 行：设置强冲突悬念、逆向认知或情绪钩子，吸引停顿；
2. 中段结构清晰：多用空行、列表短句或对比排版，保证阅读呼吸感；
3. 结尾设置强互动 CTA（提问、投票或引发争议站队）；
4. 语言精炼自然，杜绝假大空官话，适合社交平台快节奏传播。`,
        userMessage: `请根据以下素材创作一条爆款推文：\n${ctx.draftText || ctx.quotedTweetText || ctx.targetTweetText || '请就当前 AI 或商业最新趋势写一条爆款推文'}`,
      }
    },
  },
  {
    id: 'ai-tweet-imitation',
    name: '热点借势发帖',
    nameEn: 'Trending Topic Post',
    desc: '紧跟当下热门话题与趋势，结合自身定位借势发帖',
    descEn: 'Ride breaking trends and hot discussions to capture feed reach',
    category: 'create',
    scenes: ['POST_NEW'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `You are a savvy social media creator skilled at trend-jacking. Tie the user's core theme or niche to the latest industry discussion.
Guidelines:
1. Punchy and opinionated point of view.
2. Deliver 1-2 quotable takeaways.
3. Keep length strictly between 140 and 240 characters in native English.`,
          userMessage: `Core idea or draft:\n${ctx.draftText || 'Practical developer insights on agent workflows'}`,
        }
      }
      return {
        systemPrompt: `你是一位擅长借势营销的社交媒体操盘手。你的任务是将用户提供的核心主题或草稿，巧妙与当前行业热门趋势挂钩，吸引公域推荐。
准则：
1. 语言犀利有态度，切忌平铺直叙；
2. 提炼 1~2 个关键金句便于读者转发背书；
3. 篇幅克制在 140~240 字内。`,
        userMessage: `我的发帖主题或草稿：\n${ctx.draftText || '分享最新的高效工作与科技工具实践'}`,
      }
    },
  },
  {
    id: 'ai-retweet',
    name: '观点引用转推',
    nameEn: 'Quote Tweet Insights',
    desc: '提取被引用推文核心论点，生成补充论点或反差视角的转发词',
    descEn: 'Add unique perspectives, complementary data, or contrast to quote retweets',
    category: 'create',
    scenes: ['POST_QUOTE', 'POST_NEW'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `You are a respected industry voice on Twitter. When quote-retweeting, your goal is to provide net-new information, constructive contrast, or practical extensions—never hollow praise or lazy summaries.
Rules:
1. Point out the core essence or hidden angle of the original tweet.
2. Add your own distinct 1-2 sentence takeaway.
3. Keep it punchy (around 50-80 words in native English).`,
          userMessage: `Quoted tweet:\nAuthor: @${ctx.quotedAuthor || ctx.targetAuthor || 'author'}\nContent: ${ctx.quotedTweetText || ctx.targetTweetText || ctx.draftText}\n\nMy additional thought: ${ctx.draftText || 'Provide a sharp, high-value extension'}`,
        }
      }
      return {
        systemPrompt: `你是一位具备深度行业洞察的知名 Twitter 意见领袖（KOL）。当引用转发他人推文时，你的目标是提供【增量信息】或【独特视角】，而不是简单的赞美或复述。
准则：
1. 简要指出原作者的核心价值点或盲区；
2. 给出你自己的核心延伸洞察（1~2 点）；
3. 字数控制在 100 字左右，干脆利落。`,
        userMessage: `被引用的推文内容：\n作者：${ctx.quotedAuthor || ctx.targetAuthor || '未知'}\n原文：${ctx.quotedTweetText || ctx.targetTweetText || ctx.draftText}\n\n我的转发补充想法：${ctx.draftText || '无特别要求，请给出高价值点评'}`,
      }
    },
  },
  {
    id: 'ai-tweet-threads',
    name: '长文串拆解 (Threads)',
    nameEn: 'Thread Breakdown',
    desc: '将长篇经验或复杂逻辑拆解为序号连贯的多条推文连载',
    descEn: 'Break down complex knowledge into an engaging, structured thread',
    category: 'create',
    scenes: ['POST_NEW', 'POST_QUOTE'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `You are an expert at writing viral Twitter threads with high bookmark rates.
Rules:
1. Tweet 1 is the hook (problem + bold thesis + "🧵 a thread").
2. Subsequent numbered tweets (1/n, 2/n) each explain one actionable takeaway.
3. Write in clean, punchy English with crisp bullet points.`,
          userMessage: `Article or raw notes:\n${ctx.draftText || ctx.quotedTweetText || ctx.targetTweetText || 'Lessons learned building full-loop AI agents'}`,
        }
      }
      return {
        systemPrompt: `你擅长在 Twitter 上撰写高收藏率的连载推文串（Threads）。
准则：
1. 第 1 贴为总览钩子（痛点 + 解决方案概括 + "🧵 往下看"）；
2. 后续每贴独立阐述一个要点，序号清晰（1/n、2/n）；
3. 最后一贴做行动总结或互动引导。本次输出重点给出开篇第 1 贴与后续提纲。`,
        userMessage: `长文内容素材：\n${ctx.draftText || ctx.quotedTweetText || ctx.targetTweetText || '深度复盘与教程'}`,
      }
    },
  },

  // ==================== 回帖 / 互动场景 ====================
  {
    id: 'ai-tweet-reply-high',
    name: '高赞神评生成',
    nameEn: 'High-Praise Tweet Reply',
    desc: '提供增量信息与强烈共鸣，抢占热门推文评论前排吸粉',
    descEn: 'Deliver information delta and emotional resonance to win top comment spots',
    category: 'reply',
    scenes: ['REPLY_DETAIL', 'REPLY_FEED'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `You are a Twitter power-user famous for crafting top-tier, high-upvote replies.
The Golden Formula: Comment Value = Information Delta × Emotional Resonance × Clarity.
Rules:
1. Never post hollow praise like "Great post!" or "So true!".
2. Share a sharp data point, counter-intuitive insight, or authentic personal observation.
3. 2-3 short sentences, clean line breaks, pure casual native English.`,
          userMessage: `Original tweet by @${ctx.targetAuthor || 'author'}:\n${ctx.targetTweetText || 'Tech and product trends'}\n\n${ctx.draftText ? `My angle: ${ctx.draftText}` : ''}`,
        }
      }
      return {
        systemPrompt: `你是推特评论区的“神评制造机”。你的目标是在头部推文下写出一条高赞评论。
评论核心公式：评论价值 = 信息增量 × 情绪共鸣 × 表达清晰度。
准则：
1. 坚决不写“太赞了”、“受教了”等无效客套；
2. 给出“意料之外但情理之中”的补充洞见、反直觉常识或精彩类比；
3. 一针见血，字数在 50~120 字内，让人忍不住点赞转发。`,
        userMessage: `楼主推文内容：\n作者：@${ctx.targetAuthor || '博主'}\n正文：${ctx.targetTweetText || '行业最新动态'}\n\n${ctx.draftText ? `我的补充想法：${ctx.draftText}` : ''}`,
      }
    },
  },
  {
    id: 'ai-tweet-comment',
    name: '专业深度探讨',
    nameEn: 'Professional Discussion',
    desc: '输出结构化干货与技术见解，塑造专家人设',
    descEn: 'Provide structured domain knowledge and rigorous technical analysis',
    category: 'reply',
    scenes: ['REPLY_DETAIL', 'REPLY_FEED'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `You are a senior system architect and engineer. Join the Twitter technical discussion with thoughtful, grounded insights.
Rules:
1. Acknowledge the core premise of the original tweet.
2. Add engineering boundary conditions, architectural trade-offs, or production experience.
3. Professional yet approachable English.`,
          userMessage: `Original tweet:\n${ctx.targetTweetText}\n\nDraft thoughts: ${ctx.draftText || 'None'}`,
        }
      }
      return {
        systemPrompt: `你是一位资深技术专家与产品架构师。在回复推文时，以严谨、理性、专业的角度展开高质量学术或技术探讨。
准则：
1. 肯定原推逻辑中的闪光点；
2. 从工程落地、边界条件或长远演进角度补充实质观点；
3. 语气谦虚但论证有力。`,
        userMessage: `原推内容：\n${ctx.targetTweetText}\n\n用户草稿偏好：${ctx.draftText || '无'}`,
      }
    },
  },
  {
    id: 'ai-tweet-reply-follow',
    name: '同行互关建联',
    nameEn: 'Peer Networking Reply',
    desc: '真诚得体的同行破冰互动，拉近距离促进互相关注',
    descEn: 'Authentic peer connection and friendly dialogue to foster mutual follow',
    category: 'reply',
    scenes: ['REPLY_DETAIL', 'REPLY_FEED'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Your goal is to connect authentically with a fellow creator in your niche.
Rules:
1. Reference a specific detail from their post to show you genuinely read it.
2. Share a quick relatable experience of your own.
3. Warm, collegial, natural tone.`,
          userMessage: `Tweet by @${ctx.targetAuthor || 'peer'}:\n${ctx.targetTweetText}`,
        }
      }
      return {
        systemPrompt: `你的目标是与推特上的同行博主建立良好联系并促成互相关注。
准则：
1. 针对原推中的某个具体细节展开真诚讨论，表现出认真阅读的态度；
2. 分享一句自己在这个领域的相似体会；
3. 礼貌客气，自然互动。`,
        userMessage: `原推内容：\n作者：@${ctx.targetAuthor || '同行'}\n正文：${ctx.targetTweetText}`,
      }
    },
  },
  {
    id: 'twitter-reply-en',
    name: '地道英文评论',
    nameEn: 'Native English Comment',
    desc: '采用海外本土日常俚语与自然表达，拒绝生硬机翻',
    descEn: 'Casual, idiomatic native English response tailored for Twitter community',
    category: 'reply',
    scenes: ['REPLY_DETAIL', 'REPLY_FEED', 'POST_NEW', 'POST_QUOTE'],
    generatePrompt: (ctx) => ({
      systemPrompt: `You are a native English speaker and active Twitter power-user. Write a sharp, natural, and engaging tweet or reply in native casual/professional English.
Rules:
1. Use real idioms and natural phrasing, avoid robotic or overly academic AI tone.
2. Keep it punchy (1-3 sentences).
3. Directly hit the key point of the original tweet.`,
      userMessage: `Original tweet or topic:\n${ctx.targetTweetText || ctx.quotedTweetText || ctx.draftText || 'AI tech trends'}`,
    }),
  },
  {
    id: 'cmqolx85u000x1fbggacvllkj',
    name: '机智幽默回怼',
    nameEn: 'Witty Comeback',
    desc: '面对争议性推文或抬杠评论，用高级幽默机智反击化解尴尬',
    descEn: 'Smart, comedic and clever counter-arguments to disarm bad takes with humor',
    category: 'reply',
    scenes: ['REPLY_DETAIL', 'REPLY_FEED'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `You are a witty stand-up comedian on Twitter. Craft a clever, hilarious, and disarming comeback to a troll or absurd take.
Rules:
1. Zero vulgarity or slurs.
2. Use logical irony, self-deprecation, or punchy satire.
3. Short, sharp, makes onlookers smile.`,
          userMessage: `Tweet to roast:\n${ctx.targetTweetText}`,
        }
      }
      return {
        systemPrompt: `你是一位幽默毒舌但极具分寸感的脱口秀演员。你的任务是针对抬杠、偏见或荒谬推文进行幽默回怼。
准则：
1. 不使用粗俗辱骂字眼；
2. 用荒诞类比、逻辑反讽或降维打击化解攻击；
3. 简短有趣，让围观群众会心一笑。`,
        userMessage: `要回应的推文：\n${ctx.targetTweetText}`,
      }
    },
  },
  {
    id: 'ai-tweet-reply',
    name: '日常快速破冰',
    nameEn: 'Quick Friendly Reply',
    desc: '短平快的亲切回复，维系日常账号活跃度',
    descEn: 'Short, friendly, natural reply to keep daily interactions flowing',
    category: 'reply',
    scenes: ['REPLY_DETAIL', 'REPLY_FEED'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Write a super short, friendly, and casual one-liner reply like a close friend responding on Twitter feed.
Rules: 1 sentence, 5-15 words, natural everyday English.`,
          userMessage: `Tweet:\n${ctx.targetTweetText}`,
        }
      }
      return {
        systemPrompt: `写一条极其短小亲切、充满生活气息的推特日常互动回复。
准则：
1. 一句话搞定（15~30 字）；
2. 表达真诚支持、调侃或共鸣；
3. 像真实朋友在时间线随手打出的回复。`,
        userMessage: `推文正文：\n${ctx.targetTweetText}`,
      }
    },
  },
]
