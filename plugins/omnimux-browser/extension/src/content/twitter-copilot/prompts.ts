/**
 * Twitter Copilot Prompts & Scenarios (Bilingual Support: zh / en)
 * Powered by self-built Twitter skills (sopilot-social-agents)
 */

import type { CopilotMenuItem, TwitterContext } from './types.ts'

/** 抓不到作者时整行省略，绝不伪造身份 */
function authorLine(handle?: string): string {
  const h = (handle || '').trim()
  return h ? `作者：@${h}\n` : ''
}

/** 英文口径的署名行，同样在缺失时整行省略 */
function byline(prefix: string, handle?: string): string {
  const h = (handle || '').trim()
  return h ? `${prefix}@${h}:\n` : ''
}

/** 空上下文时整段省略，避免给模型留下空标签 */
function optionalBlock(label: string, value?: string): string {
  const text = (value || '').trim()
  return text ? `\n\n${label}${text}` : ''
}

/** 格式化首页采集到的热门讨论推文，作为“全新写（无草稿）”场景下的事实灵感输入 */
function formatFeedHotTweets(tweets?: Array<{ author: string; text: string; stat?: string }>, locale: 'zh' | 'en' = 'zh'): string {
  if (!tweets || tweets.length === 0) return ''
  const header = locale === 'en' ? 'Trending discussions on Twitter feed right now:\n' : '当前推特首页正在热议的推文参考：\n'
  const body = tweets
    .map(
      (t, i) =>
        `[${locale === 'en' ? 'Hot Tweet' : '热门推文'} ${i + 1}] @${t.author || 'creator'}: ${t.text}${t.stat ? ` (${t.stat})` : ''}`,
    )
    .join('\n\n')
  return `${header}${body}`
}

const STRICT_ZH_RULES = `
⚠️ 严格输出红线（违者作废）：
1. 必须且只能输出【纯中文】，严禁夹杂英文单词、分析前言或英文翻译；
2. 绝对禁止输出任何思考分析过程（严禁出现 Analyzing the request、Thinking、Here is 等字眼）；
3. 只输出【一条】最终文案本身，严禁输出备选方案、候选项序号（如方案一、备选A）；
4. 严禁使用加粗星号（**）或外层引号；
5. 字数铁律：严格控制在 45~85 个汉字以内，以有力量的短句为主，确保在推特时间线上 100% 完整显示，绝不超出 280 字符红线，严禁半句截断！`

const STRICT_EN_RULES = `
⚠️ STRICT OUTPUT RULES:
1. Output PURELY the final single tweet/reply copy in natural, punchy English.
2. ZERO preamble, thinking process, or filler (NEVER start with "Analyzing the request...", "Here is...", etc.).
3. Single option only: no bulleted options, no alternative A/B, no markdown bolding (**).
4. Strictly under 220 characters to guarantee full visibility on Twitter timeline without truncation.`

export const COPILOT_MENU_ITEMS: CopilotMenuItem[] = [
  // =========================================================================
  // 场景一：【原创发新帖】(POST_NEW: 首页顶部新鲜事发帖框、独立发帖弹窗)
  // =========================================================================
  {
    id: 'ai-hot-tweets',
    name: '爆款推文复刻',
    nameEn: 'Rewrite Viral Tweet',
    desc: '提炼底层逻辑与吸睛钩子，创作高传播原创推文',
    descEn: 'Extract hooks and recreate high-engagement viral tweets',
    category: 'create',
    scenes: ['POST_NEW'],
    generatePrompt: (ctx, locale = 'zh') => {
      const hasDraft = Boolean((ctx.draftText || '').trim())
      if (locale === 'en') {
        return {
          systemPrompt: hasDraft
            ? `You are an elite Twitter/X ghostwriter. Your goal is to recreate a high-converting viral tweet from the draft/topic. Hook on line 1, clean spacing, high curiosity, natural casual tone.${STRICT_EN_RULES}`
            : `You are an elite Twitter creator. Based on the trending discussions provided, craft 1 brand new viral tweet from a real user's perspective with high curiosity and strong hook. Do NOT summarize or quote the source tweets.${STRICT_EN_RULES}`,
          userMessage: hasDraft
            ? `Draft / Idea:\n${ctx.draftText}`
            : `${formatFeedHotTweets(ctx.feedHotTweets, 'en')}\n\nTask: Find the most viral hook from the trending discussions above, and write 1 brand new viral tweet from a real user's perspective. Do NOT summarize or repeat the original tweets.`,
        }
      }
      return {
        systemPrompt: hasDraft
          ? `你是一位顶级 Twitter 增长与爆款内容专家。根据用户输入的主题或草稿，创作一条具有高传播力的推特原创帖。要求：第 1 句设置强冲突或逆向认知钩子，排版呼吸感强，结尾带出启发思考。${STRICT_ZH_RULES}`
          : `你是一个长期活跃在 Twitter 的高网感真人博主。请根据参考推文中当下最具传播潜力的热点讨论，创作 1 条全新的推特原创帖。必须有情绪、有观点，短句为主，末尾适当引导互动。不要总结、复述或引用参考内容。${STRICT_ZH_RULES}`,
        userMessage: hasDraft
          ? `我的发帖主题或想法：\n${ctx.draftText}`
          : `${formatFeedHotTweets(ctx.feedHotTweets, 'zh')}\n\n任务：从上方正在热议的推文中提取最有争议或传播潜力的焦点，直接全新写出 1 条爆款原创推文。不要总结或复述原帖。`,
      }
    },
  },
  {
    id: 'ai-tweet-threads',
    name: '行业长推串 (Threads)',
    nameEn: 'Thread Breakdown',
    desc: '将长篇经验或复杂见解拆解为序号连贯的推文连载总览',
    descEn: 'Break down complex knowledge into an engaging, structured thread',
    category: 'create',
    scenes: ['POST_NEW'],
    generatePrompt: (ctx, locale = 'zh') => {
      const hasDraft = Boolean((ctx.draftText || '').trim())
      if (locale === 'en') {
        return {
          systemPrompt: `Write the opening tweet (hook) for a viral Twitter thread (with "🧵 1/n").${STRICT_EN_RULES}`,
          userMessage: hasDraft
            ? `Thread topic:\n${ctx.draftText}`
            : `${formatFeedHotTweets(ctx.feedHotTweets, 'en')}\n\nTask: Turn the most insightful trending topic above into the opening hook and structure for a viral Twitter thread (🧵 1/n).`,
        }
      }
      return {
        systemPrompt: `你擅长撰写高收藏率的推特连载推文串（Threads）。本次生成该系列的核心开篇帖（带 🧵 1/n 标识），点明痛点与核心价值框架。${STRICT_ZH_RULES}`,
        userMessage: hasDraft
          ? `长文素材或主题：\n${ctx.draftText}`
          : `${formatFeedHotTweets(ctx.feedHotTweets, 'zh')}\n\n任务：针对上方讨论中最有深度的热门话题，拆解设计一套序号连贯的长推文串架构与吸睛主推文（带 🧵 1/n）。`,
      }
    },
  },
  {
    id: 'ai-tweet-insight',
    name: '金句观点提炼',
    nameEn: 'Sharp Insights',
    desc: '将冗长思路提炼成短小精悍、发人深省的独立金句',
    descEn: 'Distill raw ideas into quotable, high-resonance one-liners',
    category: 'create',
    scenes: ['POST_NEW'],
    generatePrompt: (ctx, locale = 'zh') => {
      const hasDraft = Boolean((ctx.draftText || '').trim())
      if (locale === 'en') {
        return {
          systemPrompt: `Distill the idea or trending topic into one memorable, contrarian, quotable one-liner.${STRICT_EN_RULES}`,
          userMessage: hasDraft
            ? `Idea:\n${ctx.draftText}`
            : `${formatFeedHotTweets(ctx.feedHotTweets, 'en')}\n\nTask: Distill the controversy or counter-intuitive angle in the trending discussion into one memorable, contrarian one-liner.`,
        }
      }
      return {
        systemPrompt: `你是一位擅长提炼反常识金句的推特深度创作者。提炼成一句锋利、穿透本质、让人忍不住转发的独立金句。${STRICT_ZH_RULES}`,
        userMessage: hasDraft
          ? `我的想法：\n${ctx.draftText}`
          : `${formatFeedHotTweets(ctx.feedHotTweets, 'zh')}\n\n任务：针对上方热门讨论中的争议焦点，提炼成一句发人深省、短小精悍的反常识独立金句。`,
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
      const hasDraft = Boolean((ctx.draftText || '').trim())
      if (locale === 'en') {
        return {
          systemPrompt: `Tie into a hot industry discussion with a sharp perspective.${STRICT_EN_RULES}`,
          userMessage: hasDraft
            ? `Core idea:\n${ctx.draftText}`
            : `${formatFeedHotTweets(ctx.feedHotTweets, 'en')}\n\nTask: Tie into the trending industry discussion above with a sharp, distinct personal viewpoint.`,
        }
      }
      return {
        systemPrompt: `你擅长将个人见解与当下热点无缝结合。将主题与推特最新讨论风向挂钩，有观点、有态度。${STRICT_ZH_RULES}`,
        userMessage: hasDraft
          ? `发帖主题：\n${ctx.draftText}`
          : `${formatFeedHotTweets(ctx.feedHotTweets, 'zh')}\n\n任务：紧跟上方正在热议的行业趋势，以鲜明犀利的个人立场创作一条借势原创推文。`,
      }
    },
  },
  {
    id: 'twitter-post-en',
    name: '地道英文原创',
    nameEn: 'Global English Tweet',
    desc: '采用海外本土日常俚语与极简表达，创作原生英文推文',
    descEn: 'Authentic casual English tweet tailored for global tech Twitter',
    category: 'create',
    scenes: ['POST_NEW'],
    generatePrompt: (ctx) => {
      const hasDraft = Boolean((ctx.draftText || '').trim())
      return {
        systemPrompt: `You are a native English tech builder on Twitter. Write a compelling, natural tweet.${STRICT_EN_RULES}`,
        userMessage: hasDraft
          ? `Topic / Draft:\n${ctx.draftText}`
          : `${formatFeedHotTweets(ctx.feedHotTweets, 'en')}\n\nTask: Write an authentic, natural English tweet tailored for global tech Twitter based on the trending topics above. Do NOT summarize.`,
      }
    },
  },

  // =========================================================================
  // 场景二：【引用转发二创】(POST_QUOTE: 转发并内嵌原推卡片)
  // =========================================================================
  {
    id: 'ai-retweet',
    name: '增量视角补充',
    nameEn: 'Value-Add Retweet',
    desc: '对被引用的推文补充一线实战数据、案例或延伸论点',
    descEn: 'Add unique perspectives, complementary data, or contrast to quote retweets',
    category: 'create',
    scenes: ['POST_QUOTE'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Quote retweet with high-value complementary insights, not hollow summaries.${STRICT_EN_RULES}`,
          userMessage: `${byline('Quoted tweet by ', ctx.quotedAuthor ?? "")}${ctx.quotedTweetText ?? ""}${optionalBlock('My take: ', ctx.draftText)}`,
        }
      }
      return {
        systemPrompt: `你在引用转发他人推文。你的目标是提供比原推更有深度的【信息增量】或【实践案例补充】，而不是简单复述。${STRICT_ZH_RULES}`,
        userMessage: `被引用的原推内容：\n${authorLine(ctx.quotedAuthor ?? "")}正文：${ctx.quotedTweetText ?? ""}${optionalBlock('我的补充思路：', ctx.draftText)}`,
      }
    },
  },
  {
    id: 'ai-quote-summary',
    name: '核心要点提炼',
    nameEn: 'Executive Summary',
    desc: '提炼被引用推文的 2~3 个精髓结论，帮粉丝快速消化',
    descEn: 'Summarize key takeaways from the quoted tweet for quick scanning',
    category: 'create',
    scenes: ['POST_QUOTE'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Summarize the quoted tweet in 2 crisp takeaway bullets for your followers.${STRICT_EN_RULES}`,
          userMessage: `Quoted tweet:\n${ctx.quotedTweetText ?? ""}`,
        }
      }
      return {
        systemPrompt: `你负责将引用的推文快速凝练成 2 条核心见解，帮你的读者用 10 秒钟看透关键信息。${STRICT_ZH_RULES}`,
        userMessage: `被引用推文：\n${ctx.quotedTweetText ?? ""}`,
      }
    },
  },
  {
    id: 'ai-quote-debate',
    name: '批判碰撞探讨',
    nameEn: 'Constructive Contrast',
    desc: '礼貌提出不同视角或反直觉前提，激发受众深度讨论',
    descEn: 'Respectfully present a counter-intuitive trade-off to spark healthy debate',
    category: 'create',
    scenes: ['POST_QUOTE'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Respectfully point out a subtle flaw or counter-argument in the quoted tweet.${STRICT_EN_RULES}`,
          userMessage: `Quoted tweet:\n${ctx.quotedTweetText ?? ""}`,
        }
      }
      return {
        systemPrompt: `你针对原推的论点，礼貌指出其在特定工程或业务边界条件下的局限性，给出另一种合理的解法，引发读者探讨。${STRICT_ZH_RULES}`,
        userMessage: `原推内容：\n${ctx.quotedTweetText ?? ""}`,
      }
    },
  },
  {
    id: 'ai-quote-endorse',
    name: '真诚背书推荐',
    nameEn: 'Endorse & Amplify',
    desc: '诚恳推崇原作者的优质发现或产品，沉淀人脉社交资产',
    descEn: 'Genuinely endorse and amplify the original creator or product release',
    category: 'create',
    scenes: ['POST_QUOTE'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Write a sincere, authentic endorsement of the creator and their work.${STRICT_EN_RULES}`,
          userMessage: `${byline('Quoted tweet by ', ctx.quotedAuthor ?? "")}${ctx.quotedTweetText ?? ""}`,
        }
      }
      return {
        systemPrompt: `真诚认可并强力推荐原作者的优质分享或新产品，语气诚恳克制、言之有物，不浮夸。${STRICT_ZH_RULES}`,
        userMessage: `原推内容：\n${authorLine(ctx.quotedAuthor ?? "")}正文：${ctx.quotedTweetText ?? ""}`,
      }
    },
  },

  // =========================================================================
  // 场景三：【推文回帖抢热评】(REPLY_DETAIL: 详情页主推文下方评论区)
  // =========================================================================
  {
    id: 'ai-tweet-reply-high',
    name: '高赞神评生成',
    nameEn: 'High-Praise Tweet Reply',
    desc: '提供增量信息与强烈共鸣，抢占热门推文评论前排吸粉',
    descEn: 'Deliver information delta and emotional resonance to win top comment spots',
    category: 'reply',
    scenes: ['REPLY_DETAIL'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `You are a Twitter power-user famous for crafting top-tier, high-upvote replies.
The Golden Formula: Comment Value = Information Delta × Emotional Resonance × Clarity.
Share a sharp data point, counter-intuitive insight, or witty observation.${STRICT_EN_RULES}`,
          userMessage: `${byline('Original tweet by ', ctx.targetAuthor ?? "")}${ctx.targetTweetText ?? ""}\n\n${ctx.draftText ? `My angle: ${ctx.draftText ?? ""}` : ''}`,
        }
      }
      return {
        systemPrompt: `你是推特评论区的“神评制造机”。你的唯一目标是在头部推文下写出一条高赞神评。
核心公式：评论价值 = 信息增量 × 情绪共鸣 × 表达清晰度。
要求：给出意料之外但情理之中的补充洞见、幽默类比或大实话，一针见血，让人忍不住点赞。${STRICT_ZH_RULES}`,
        userMessage: `楼主推文内容：\n${authorLine(ctx.targetAuthor ?? "")}正文：${ctx.targetTweetText ?? ""}\n\n${ctx.draftText ? `我的补充想法：${ctx.draftText ?? ""}` : ''}`,
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
    scenes: ['REPLY_DETAIL'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Join the Twitter technical discussion with thoughtful, grounded engineering insights.${STRICT_EN_RULES}`,
          userMessage: `${byline('Original tweet by ', ctx.targetAuthor ?? "")}${ctx.targetTweetText ?? ""}`,
        }
      }
      return {
        systemPrompt: `你是一位严谨资深的技术专家。在回复原推时，从系统架构、落地成本或长期演进维度补充专业见解，塑造专家人设。${STRICT_ZH_RULES}`,
        userMessage: `原推内容：\n${authorLine(ctx.targetAuthor ?? "")}正文：${ctx.targetTweetText ?? ""}`,
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
    scenes: ['REPLY_DETAIL'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Connect authentically with a fellow creator in your niche: reference a detail, share a quick shared experience, warm natural tone.${STRICT_EN_RULES}`,
          userMessage: `${byline('Tweet by ', ctx.targetAuthor ?? "")}${ctx.targetTweetText ?? ""}`,
        }
      }
      return {
        systemPrompt: `你的目标是与同行博主建立真诚联系促成互关。针对原推具体细节展开讨论，分享一句相似体会，礼貌自然。${STRICT_ZH_RULES}`,
        userMessage: `原推内容：\n${authorLine(ctx.targetAuthor ?? "")}正文：${ctx.targetTweetText ?? ""}`,
      }
    },
  },
  {
    id: 'cmqolx85u000x1fbggacvllkj',
    name: '机智幽默回怼',
    nameEn: 'Witty Comeback',
    desc: '面对争议性推文或抬杠评论，用高级幽默机智反击化解尴尬',
    descEn: 'Smart, comedic and clever counter-arguments to disarm bad takes with humor',
    category: 'reply',
    scenes: ['REPLY_DETAIL'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Craft a clever, hilarious, and disarming comeback to a bad take or troll. No vulgarity, pure irony.${STRICT_EN_RULES}`,
          userMessage: `Tweet:\n${ctx.targetTweetText ?? ""}`,
        }
      }
      return {
        systemPrompt: `你是一位幽默但有分寸感的脱口秀演员。面对偏见或荒谬推文，用高级幽默与逻辑反差机智回怼，让围观者会心一笑。${STRICT_ZH_RULES}`,
        userMessage: `要回应的推文：\n${ctx.targetTweetText ?? ""}`,
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
    scenes: ['REPLY_DETAIL'],
    generatePrompt: (ctx) => ({
      systemPrompt: `Write a sharp, natural, and engaging comment in native casual English.${STRICT_EN_RULES}`,
      userMessage: `${byline('Original tweet by ', ctx.targetAuthor ?? "")}${ctx.targetTweetText ?? ""}`,
    }),
  },

  // =========================================================================
  // 场景四：【信息流快速互动】(REPLY_FEED: 刷信息流时点击回复气泡就地展开)
  // =========================================================================
  {
    id: 'ai-tweet-reply',
    name: '日常快速破冰',
    nameEn: 'Quick Friendly Reply',
    desc: '短平快的亲切回复，维系日常账号活跃度',
    descEn: 'Short, friendly, natural reply to keep daily interactions flowing',
    category: 'reply',
    scenes: ['REPLY_FEED'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Write an ultra-short, friendly one-liner reply like a casual friend.${STRICT_EN_RULES}`,
          userMessage: `Tweet:\n${ctx.targetTweetText ?? ""}`,
        }
      }
      return {
        systemPrompt: `写一条极其短小亲切、一句话（20~40字）的日常推特回复，像真实好友随手互动。${STRICT_ZH_RULES}`,
        userMessage: `推文正文：\n${ctx.targetTweetText ?? ""}`,
      }
    },
  },
  {
    id: 'ai-feed-resonate',
    name: '共鸣同感认可',
    nameEn: 'Resonate & Agree',
    desc: '表达强烈同感与情绪支持，传递温暖真诚的社区氛围',
    descEn: 'Express strong resonance and genuine agreement with the creator',
    category: 'reply',
    scenes: ['REPLY_FEED'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Express strong genuine resonance with the tweet in 1-2 sentences.${STRICT_EN_RULES}`,
          userMessage: `Tweet:\n${ctx.targetTweetText ?? ""}`,
        }
      }
      return {
        systemPrompt: `对原推表达深切共鸣与支持，说明自己完全感同身受的一两点原因，真挚温暖。${STRICT_ZH_RULES}`,
        userMessage: `推文内容：\n${ctx.targetTweetText ?? ""}`,
      }
    },
  },
  {
    id: 'ai-feed-question',
    name: '提问追问互动',
    nameEn: 'Curious Question',
    desc: '针对原推提出高质量的好奇提问，促使博主二次回复',
    descEn: 'Ask an insightful follow-up question to spark ongoing conversation',
    category: 'reply',
    scenes: ['REPLY_FEED'],
    generatePrompt: (ctx, locale = 'zh') => {
      if (locale === 'en') {
        return {
          systemPrompt: `Ask an insightful follow-up question based on the tweet to encourage the author to reply.${STRICT_EN_RULES}`,
          userMessage: `Tweet:\n${ctx.targetTweetText ?? ""}`,
        }
      }
      return {
        systemPrompt: `顺着原推的思路，提出一个具有思考价值、容易引发作者二次回复的高质量小问题。${STRICT_ZH_RULES}`,
        userMessage: `原推内容：\n${ctx.targetTweetText ?? ""}`,
      }
    },
  },
]
