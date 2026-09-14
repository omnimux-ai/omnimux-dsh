// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { detectTwitterScene, extractTwitterContext } from '../src/content/twitter-copilot/extractor.ts'
import { COPILOT_MENU_ITEMS } from '../src/content/twitter-copilot/prompts.ts'
import { mountCopilotToTwitterButtons, isCollapsedInlineReply, cleanupStaleCopilotButtons } from '../src/content/twitter-copilot/anchor.ts'
import { injectTweetText, INJECTOR_COPY, COPILOT_TOAST_BG, COPILOT_TOAST_TEXT_COLOR } from '../src/content/twitter-copilot/injector.ts'
import { detectCopilotLocale, checkContextReady } from '../src/content/twitter-copilot/menu.ts'
import { sanitizeTweetText } from '../src/content/twitter-copilot/sanitizer.ts'

describe('Twitter Copilot Native Unit Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  const setPathname = (pathname: string) => {
    Object.defineProperty(window, 'location', {
      value: new URL(`https://x.com${pathname}`),
      writable: true,
    })
  }

  it('T1: 场景检测 - 按线上实测结构区分三类弹窗（发新帖 / 引用转发 / 回帖）', () => {
    setPathname('/home')

    // 1. 纯发新帖弹窗：无被引用卡片、无内嵌原推
    const postDialog = document.createElement('div')
    postDialog.setAttribute('role', 'dialog')
    const postBtn = document.createElement('button')
    postBtn.setAttribute('data-testid', 'tweetButton')
    postDialog.appendChild(postBtn)
    document.body.appendChild(postDialog)

    expect(detectTwitterScene(postBtn)).toBe('POST_NEW')

    // 2. 引用转发弹窗：被引用原推内嵌于 attachments 容器（线上无 quoteTweet 节点）
    const quoteDialog = document.createElement('div')
    quoteDialog.setAttribute('role', 'dialog')
    const attachments = document.createElement('div')
    attachments.setAttribute('data-testid', 'attachments')
    const quotedText = document.createElement('div')
    quotedText.setAttribute('data-testid', 'tweetText')
    quotedText.textContent = '被引用的原推正文'
    attachments.appendChild(quotedText)
    quoteDialog.appendChild(attachments)
    const quoteBtn = document.createElement('button')
    quoteBtn.setAttribute('data-testid', 'tweetButton')
    quoteDialog.appendChild(quoteBtn)
    document.body.appendChild(quoteDialog)

    expect(detectTwitterScene(quoteBtn)).toBe('POST_QUOTE')
  })

  it('T11: 回帖弹窗 - 内嵌原推以 article 呈现，按弹窗背后是否留有聚焦原推分流', () => {
    const buildReplyDialog = () => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      const tweetText = document.createElement('div')
      tweetText.setAttribute('data-testid', 'tweetText')
      tweetText.textContent = '被回复的原推正文'
      article.appendChild(tweetText)
      dialog.appendChild(article)
      const btn = document.createElement('button')
      btn.setAttribute('data-testid', 'tweetButton')
      dialog.appendChild(btn)
      document.body.appendChild(dialog)
      return btn
    }

    // 信息流等入口：弹窗背后没有聚焦原推 → 快捷互动菜单
    setPathname('/compose/post')
    expect(detectTwitterScene(buildReplyDialog())).toBe('REPLY_FEED')

    // 详情页入口：推特会把地址改写为 /compose/post，但弹窗背后仍留有 tabindex="-1" 的聚焦原推 → 回帖菜单
    document.body.innerHTML = ''
    const main = document.createElement('main')
    const focal = document.createElement('article')
    focal.setAttribute('data-testid', 'tweet')
    focal.setAttribute('tabindex', '-1')
    main.appendChild(focal)
    document.body.appendChild(main)

    setPathname('/compose/post')
    expect(detectTwitterScene(buildReplyDialog())).toBe('REPLY_DETAIL')
  })

  it('T12: 回帖弹窗上下文 - 取弹窗内被回复的原推，不误取信息流其它推文', () => {
    setPathname('/home')

    // 信息流里另一条推文（干扰项）
    const feedTweet = document.createElement('article')
    feedTweet.setAttribute('data-testid', 'tweet')
    const feedText = document.createElement('div')
    feedText.setAttribute('data-testid', 'tweetText')
    feedText.textContent = '信息流里的其它推文'
    feedTweet.appendChild(feedText)
    document.body.appendChild(feedTweet)

    // 回帖弹窗内嵌的被回复原推
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const quotedArticle = document.createElement('article')
    quotedArticle.setAttribute('data-testid', 'tweet')
    const userDiv = document.createElement('div')
    userDiv.setAttribute('data-testid', 'User-Name')
    const userLink = document.createElement('a')
    userLink.setAttribute('role', 'link')
    userLink.setAttribute('href', '/jaxxchen003')
    userDiv.appendChild(userLink)
    quotedArticle.appendChild(userDiv)
    const quotedText = document.createElement('div')
    quotedText.setAttribute('data-testid', 'tweetText')
    quotedText.textContent = '弹窗内被回复的原推正文'
    quotedArticle.appendChild(quotedText)
    dialog.appendChild(quotedArticle)

    const textarea = document.createElement('div')
    textarea.setAttribute('data-testid', 'tweetTextarea_0')
    textarea.setAttribute('role', 'textbox')
    textarea.textContent = '我的回复草稿'
    dialog.appendChild(textarea)

    const replyBtn = document.createElement('button')
    replyBtn.setAttribute('data-testid', 'tweetButton')
    dialog.appendChild(replyBtn)
    document.body.appendChild(dialog)

    const ctx = extractTwitterContext(replyBtn, 'REPLY_FEED')

    expect(ctx.targetTweetText).toBe('弹窗内被回复的原推正文')
    expect(ctx.targetAuthor).toBe('jaxxchen003')
    expect(ctx.draftText).toBe('我的回复草稿')
  })

  it('T2: 场景检测 - 正确识别推文详情页回复', () => {
    // 模拟推特状态详情页 URL
    Object.defineProperty(window, 'location', {
      value: new URL('https://x.com/username/status/1234567890'),
      writable: true,
    })

    const replyBtn = document.createElement('button')
    replyBtn.setAttribute('data-testid', 'tweetButtonInline')
    document.body.appendChild(replyBtn)

    expect(detectTwitterScene(replyBtn)).toBe('REPLY_DETAIL')
  })

  it('T3: 上下文提取 - 正确提取楼主推文正文与作者', () => {
    // 构造推特主推文
    const mainTweet = document.createElement('article')
    mainTweet.setAttribute('tabindex', '-1')
    mainTweet.setAttribute('data-testid', 'tweet')

    const userDiv = document.createElement('div')
    userDiv.setAttribute('data-testid', 'User-Name')
    const userLink = document.createElement('a')
    userLink.setAttribute('role', 'link')
    userLink.setAttribute('href', '/tech_founder')
    userDiv.appendChild(userLink)
    mainTweet.appendChild(userDiv)

    const tweetText = document.createElement('div')
    tweetText.setAttribute('data-testid', 'tweetText')
    tweetText.textContent = '这是楼主发布的行业深度观点推文。'
    mainTweet.appendChild(tweetText)

    document.body.appendChild(mainTweet)

    // 回复按钮及草稿
    const replyContainer = document.createElement('div')
    const textarea = document.createElement('div')
    textarea.setAttribute('data-testid', 'tweetTextarea_0')
    textarea.setAttribute('role', 'textbox')
    textarea.textContent = '我的观点是：'
    replyContainer.appendChild(textarea)

    const replyBtn = document.createElement('button')
    replyBtn.setAttribute('data-testid', 'tweetButtonInline')
    replyContainer.appendChild(replyBtn)
    document.body.appendChild(replyContainer)

    const ctx = extractTwitterContext(replyBtn, 'REPLY_DETAIL')

    expect(ctx.targetAuthor).toBe('tech_founder')
    expect(ctx.targetTweetText).toBe('这是楼主发布的行业深度观点推文。')
    expect(ctx.draftText).toBe('我的观点是：')
  })

  it('T4: 场景提示词矩阵 - 完整覆盖 10 套推特场景与中英双语自适应', () => {
    expect(COPILOT_MENU_ITEMS.length).toBeGreaterThanOrEqual(10)

    const createItems = COPILOT_MENU_ITEMS.filter((i) => i.category === 'create')
    const replyItems = COPILOT_MENU_ITEMS.filter((i) => i.category === 'reply')

    expect(createItems.length).toBeGreaterThanOrEqual(4)
    expect(replyItems.length).toBeGreaterThanOrEqual(5)

    // 验证每项均有英文名称与描述
    COPILOT_MENU_ITEMS.forEach((it) => {
      expect(it.nameEn).toBeDefined()
      expect(it.nameEn.length).toBeGreaterThan(0)
      expect(it.descEn).toBeDefined()
      expect(it.descEn.length).toBeGreaterThan(0)
    })

    // 验证高赞神评 Prompt 中英双语组装
    const highReply = COPILOT_MENU_ITEMS.find((i) => i.id === 'ai-tweet-reply-high')
    expect(highReply).toBeDefined()

    // 中文 Prompt
    const zhAssembled = highReply!.generatePrompt(
      {
        scene: 'REPLY_DETAIL',
        draftText: '赞同',
        targetAuthor: 'elonmusk',
        targetTweetText: 'Starship flight test',
      },
      'zh',
    )
    expect(zhAssembled.systemPrompt).toContain('神评制造机')
    expect(zhAssembled.userMessage).toContain('@elonmusk')
    expect(zhAssembled.userMessage).toContain('Starship flight test')

    // 英文 Prompt
    const enAssembled = highReply!.generatePrompt(
      {
        scene: 'REPLY_DETAIL',
        draftText: 'Agree',
        targetAuthor: 'elonmusk',
        targetTweetText: 'Starship flight test',
      },
      'en',
    )
    expect(enAssembled.systemPrompt).toContain('Twitter power-user')
    expect(enAssembled.systemPrompt).toContain('Information Delta')
    expect(enAssembled.userMessage).toContain('Original tweet by @elonmusk')
  })

  it('T5: 按钮挂载 - 横向Flex提升、官方幽灵角标注入与竞品覆盖', () => {
    // 模拟推特嵌套结构：grandparent(横向flex) -> parent(竖向/单按钮包装) -> tweetButton
    const grandParent = document.createElement('div')
    grandParent.style.display = 'flex'
    grandParent.style.flexDirection = 'row'

    const parent = document.createElement('div')
    const tweetButton = document.createElement('button')
    tweetButton.setAttribute('data-testid', 'tweetButton')
    parent.appendChild(tweetButton)
    grandParent.appendChild(parent)

    // 竞品 SoPilot 按钮
    const competitorBtn = document.createElement('div')
    competitorBtn.className = 'ai-assistant-button'
    grandParent.appendChild(competitorBtn)

    document.body.appendChild(grandParent)

    // 模拟元素有可见几何尺寸
    vi.spyOn(tweetButton, 'getBoundingClientRect').mockReturnValue({
      width: 60,
      height: 32,
      top: 100,
      left: 100,
      right: 160,
      bottom: 132,
      x: 100,
      y: 100,
      toJSON: () => {},
    })

    mountCopilotToTwitterButtons()

    const attached = grandParent.querySelectorAll('[data-omnimux-copilot="true"]')
    expect(attached.length).toBe(1)
    const copilotBtn = attached[0] as HTMLElement
    expect(copilotBtn.className).toContain('omnimux-copilot-anchor-btn')

    // 验证复用官方幽灵图标矢量图
    expect(copilotBtn.innerHTML).toContain('fill-rule="evenodd"')
    expect(copilotBtn.innerHTML).toContain('M11.6666')

    // 验证竞品被干净替换覆盖
    expect(competitorBtn.style.display).toBe('none')

    // 重复扫描不应重复挂载
    mountCopilotToTwitterButtons()
    expect(grandParent.querySelectorAll('[data-omnimux-copilot="true"]').length).toBe(1)
  })

  it('T6: 输入框回填 - 模拟剪贴板粘贴与富文本穿透', async () => {
    const textarea = document.createElement('div')
    textarea.setAttribute('data-testid', 'tweetTextarea_0')
    textarea.setAttribute('role', 'textbox')
    textarea.setAttribute('contenteditable', 'true')
    document.body.appendChild(textarea)

    const result = await injectTweetText('生成的推特高赞评论内容')
    expect(result).toBe(true)
    expect(textarea.textContent).toBe('生成的推特高赞评论内容')
  })

  it('T7: 语言自适应 - 页面或推特为中文时优先判定为中文', () => {
    // 场景 A：html lang="zh"
    document.documentElement.lang = 'zh-CN'
    expect(detectCopilotLocale()).toBe('zh')

    // 场景 B：html lang 缺失，但页面上有“回复”中文按钮
    document.documentElement.lang = ''
    const btn = document.createElement('span')
    btn.textContent = '回复'
    document.body.appendChild(btn)
    expect(detectCopilotLocale()).toBe('zh')

    // 场景 C：完全无中文特征且非中文 lang
    document.body.innerHTML = ''
    document.documentElement.lang = 'en'
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true })
    Object.defineProperty(navigator, 'languages', { value: ['en-US', 'en'], configurable: true })
    try { localStorage?.removeItem?.('dsh_configured_locale') } catch {}
    expect(detectCopilotLocale()).toBe('en')
  })

  it('T8: 文本清洗与防截断 - 自动剥离英文思考分析段落并去除 Markdown', () => {
    // 模拟用户截图中的双语混排与思考前言
    const dirtyLlmOutput = `Analyzing the request, the persona is a "God-tier" Twitter comment generator. The goal is crafting a high-engagement comment, optimized by information delta, emotional resonance, and clarity/brevity. Common generic praise must be avoided, aiming for unexpected, insightful responses.

Algorithm feeds you garbage by default, actively curate top creators instead. Aesthetics are AIGC's true scarcity: tools are commodities, taste is the real moat.

**关注列表决定你的审美上限，算法推荐只负责兜住多巴胺下限。**

AIGC 现在的残酷真相是：模型能力每`

    const cleaned = sanitizeTweetText(dirtyLlmOutput, 'zh')
    expect(cleaned).toBe('关注列表决定你的审美上限，算法推荐只负责兜住多巴胺下限。')
    expect(cleaned.includes('Analyzing')).toBe(false)
    expect(cleaned.includes('**')).toBe(false)
    expect(cleaned.length).toBeLessThan(120)
  })

  it('T9: 场景精细区分 - 首页发新帖框绝不误判为回帖', () => {
    // 模拟推特首页顶部独立发帖框结构
    const container = document.createElement('div')
    const textarea = document.createElement('div')
    textarea.setAttribute('data-testid', 'tweetTextarea_0')
    textarea.setAttribute('role', 'textbox')
    container.appendChild(textarea)

    const placeholderSpan = document.createElement('span')
    placeholderSpan.textContent = '有什么新鲜事？'
    container.appendChild(placeholderSpan)

    const toolbar = document.createElement('div')
    const postBtn = document.createElement('button')
    postBtn.setAttribute('data-testid', 'tweetButtonInline')
    postBtn.textContent = '发帖'
    toolbar.appendChild(postBtn)
    container.appendChild(toolbar)

    document.body.appendChild(container)

    expect(detectTwitterScene(postBtn)).toBe('POST_NEW')
  })

  it('T10: 菜单场景隔离 - POST_NEW 只展示发帖类菜单，绝不包含回帖神评', () => {
    const postNewItems = COPILOT_MENU_ITEMS.filter((it) => it.scenes.includes('POST_NEW'))
    const postNewIds = postNewItems.map((it) => it.id)

    // 发帖菜单应包含爆款复刻、长推串、金句等
    expect(postNewIds).toContain('ai-hot-tweets')
    expect(postNewIds).toContain('ai-tweet-threads')
    expect(postNewIds).toContain('ai-tweet-insight')

    // 绝不可包含回帖神评、回怼或破冰
    expect(postNewIds).not.toContain('ai-tweet-reply-high')
    expect(postNewIds).not.toContain('cmqolx85u000x1fbggacvllkj')
    expect(postNewIds).not.toContain('ai-tweet-reply')
  })

  it('T13: 填入提示双语 - 英文环境输出英文提示，中文环境输出中文提示', async () => {
    const buildTextarea = () => {
      document.body.innerHTML = ''
      const ta = document.createElement('div')
      ta.setAttribute('data-testid', 'tweetTextarea_0')
      ta.setAttribute('role', 'textbox')
      ta.setAttribute('contenteditable', 'true')
      document.body.appendChild(ta)
      return ta
    }

    const taEn = buildTextarea()
    await injectTweetText('Shipping fast beats perfect planning', undefined, 'en')
    const toastEn = document.getElementById('omnimux-copilot-toast')
    expect(taEn.textContent).toBe('Shipping fast beats perfect planning')
    expect(toastEn?.textContent).toBe(INJECTOR_COPY.injected.en)
    expect(toastEn?.textContent?.includes('已填入')).toBe(false)

    const taZh = buildTextarea()
    await injectTweetText('先跑起来再优化', undefined, 'zh')
    const toastZh = document.getElementById('omnimux-copilot-toast')
    expect(taZh.textContent).toBe('先跑起来再优化')
    expect(toastZh?.textContent).toBe(INJECTOR_COPY.injected.zh)
  })

  it('T14: 填入高亮与提示条为黑白中性配色，杜绝紫色', async () => {
    const ta = document.createElement('div')
    ta.setAttribute('data-testid', 'tweetTextarea_0')
    ta.setAttribute('role', 'textbox')
    ta.setAttribute('contenteditable', 'true')
    document.body.appendChild(ta)

    await injectTweetText('配色校验文案', undefined, 'zh')

    const purpleLike = /a855f7|8b5cf6|168,\s*85,\s*247|139,\s*92,\s*246/i
    expect(purpleLike.test(ta.style.outline)).toBe(false)
    expect(purpleLike.test(ta.style.boxShadow)).toBe(false)
    // 白色描边 + 深色外圈：浅色/深色主题下均可见
    expect(ta.style.outline).toContain('#ffffff')

    const toast = document.getElementById('omnimux-copilot-toast')
    const bg = toast?.style.background || ''
    const fg = toast?.style.color || ''
    expect(purpleLike.test(bg)).toBe(false)
    expect([COPILOT_TOAST_BG, 'rgb(24, 24, 27)']).toContain(bg)
    expect([COPILOT_TOAST_TEXT_COLOR.success, 'rgb(74, 222, 128)']).toContain(fg)
  })

  it('T15: 上下文缺失时不再编造主题或身份（历史写死值全部绝迹）', () => {
    const banned = [
      '分享关于效率工具与现代技术创新的思考',
      '深度教程与核心经验复盘',
      '很多时候越做加法产品越难用，极简才是硬功夫',
      '探讨当前技术工具的快速演进',
      '无特别指定，请给出高价值专业延伸',
      '行业最新动态',
      'AI agents and software evolution trends',
      'Hard lessons learned in software development',
      'Product simplicity always beats feature bloat',
      'Practical developer insights',
      'Building useful developer tools and shipping fast',
      'Tech trends',
    ]
    const emptyCtx = { scene: 'POST_NEW' as const, draftText: '' }

    for (const item of COPILOT_MENU_ITEMS) {
      for (const locale of ['zh', 'en'] as const) {
        const { systemPrompt, userMessage } = item.generatePrompt({ ...emptyCtx, scene: item.scenes[0] }, locale)
        const joined = `${systemPrompt}\n${userMessage}`
        for (const phrase of banned) {
          expect(joined.includes(phrase), `${item.id}(${locale}) 仍包含写死内容：${phrase}`).toBe(false)
        }
        expect(joined.includes('undefined'), `${item.id}(${locale}) 出现 undefined`).toBe(false)
        // 身份伪造：抓不到作者时不得出现这些占位身份
        for (const fake of ['@博主', '@author', '@同行', '@peer', '@creator']) {
          expect(joined.includes(fake), `${item.id}(${locale}) 伪造身份：${fake}`).toBe(false)
        }
      }
    }
  })

  it('T16: 抓不到推文时上下文字段为空串而非 undefined', () => {
    setPathname('/home')
    const replyBtn = document.createElement('button')
    replyBtn.setAttribute('data-testid', 'tweetButtonInline')
    document.body.appendChild(replyBtn)

    const ctx = extractTwitterContext(replyBtn, 'REPLY_DETAIL')
    expect(ctx.targetTweetText).toBe('')
    expect(ctx.targetAuthor).toBe('')
    expect(ctx.quotedTweetText).toBe('')
    expect(ctx.quotedAuthor).toBe('')
    expect(ctx.draftText).toBe('')
  })

  it('T17: 上下文闸门 - 四场景缺上下文时阻止生成并给双语提示', () => {
    const empty = { scene: 'POST_NEW' as const, draftText: '', targetTweetText: '', quotedTweetText: '' }
    expect(checkContextReady('POST_NEW', empty, 'zh')).toContain('请先在发帖框写下主题')
    expect(checkContextReady('POST_NEW', empty, 'en')).toContain('Write your topic')
    expect(checkContextReady('POST_QUOTE', empty, 'zh')).toContain('没有读到被引用的推文')
    expect(checkContextReady('REPLY_DETAIL', empty, 'zh')).toContain('没有读到原推内容')
    expect(checkContextReady('REPLY_FEED', empty, 'en')).toContain("Couldn't read the target tweet")

    // 上下文就绪时放行：POST_NEW 有草稿放行，无草稿但有信息流热帖同样放行（双轨全新写）
    expect(checkContextReady('POST_NEW', { ...empty, draftText: '量子计算' }, 'zh')).toBeNull()
    expect(checkContextReady('POST_NEW', { ...empty, feedHotTweets: [{ author: 'elon', text: 'Mars mission update' }] }, 'zh')).toBeNull()
    expect(checkContextReady('POST_QUOTE', { ...empty, quotedTweetText: '被引正文' }, 'zh')).toBeNull()
    expect(checkContextReady('REPLY_DETAIL', { ...empty, targetTweetText: '原推正文' }, 'zh')).toBeNull()
    expect(checkContextReady('REPLY_FEED', { ...empty, targetTweetText: '原推正文' }, 'zh')).toBeNull()
  })

  it('T18: 多输入框物理隔离 - 严格只读写图标所属的局部容器', async () => {
    // 页面模拟两个输入框：1号为发帖框，2号为回复框
    const box1 = document.createElement('div')
    box1.innerHTML = `
      <div data-testid="tweetTextarea_0_label">
        <div role="textbox" data-testid="tweetTextarea_0" contenteditable="true">发帖框原内容</div>
      </div>
      <button class="omnimux-copilot-anchor-btn" id="btn1">1</button>
    `
    const box2 = document.createElement('div')
    box2.innerHTML = `
      <div data-testid="tweetTextarea_0_label">
        <div role="textbox" data-testid="tweetTextarea_0" contenteditable="true">回复框2号原草稿</div>
      </div>
      <button class="omnimux-copilot-anchor-btn" id="btn2">2</button>
    `
    document.body.appendChild(box1)
    document.body.appendChild(box2)

    const btn2 = box2.querySelector('#btn2') as HTMLElement
    const ta1 = box1.querySelector('[role="textbox"]') as HTMLElement
    const ta2 = box2.querySelector('[role="textbox"]') as HTMLElement

    // 1. 读取草稿：点击 2 号图标，只读 2 号框
    const ctx = extractTwitterContext(btn2, 'POST_NEW')
    expect(ctx.draftText).toBe('回复框2号原草稿')

    // 2. 注入文本：传入 2 号图标，只能填入 2 号框，1 号框绝不能被修改
    await injectTweetText('生成好的神评内容', btn2, 'zh')
    expect(ta2.textContent).toContain('生成好的神评内容')
    expect(ta1.textContent).toBe('发帖框原内容')
  })

  it('T19: 孤立图标注入拒绝全局退化查找，安全降级到剪贴板', async () => {
    // 页面存在一个输入框，但图标不在该输入框容器内
    const box = document.createElement('div')
    box.innerHTML = `
      <div data-testid="tweetTextarea_0_label">
        <div role="textbox" data-testid="tweetTextarea_0" contenteditable="true">原内容不变</div>
      </div>
    `
    document.body.appendChild(box)

    const orphanBtn = document.createElement('button')
    orphanBtn.className = 'omnimux-copilot-anchor-btn'
    document.body.appendChild(orphanBtn)

    const writeTextSpy = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy,
      },
    })

    // 执行注入：由于 orphanBtn 无法向上寻找到合法容器，绝不乱填到 box 内，而是降级剪贴板
    const res = await injectTweetText('孤立文本', orphanBtn, 'zh')
    expect(res).toBe(true)
    const ta = box.querySelector('[role="textbox"]') as HTMLElement
    expect(ta.textContent).toBe('原内容不变')
    expect(writeTextSpy).toHaveBeenCalledWith('孤立文本')
  })

  it('T20: 回帖推文目标未命中时不向整页第一条推文退化', () => {
    setPathname('/home')
    // 页面存在一条主推文，但它不是当前按钮的目标
    const pageTweet = document.createElement('article')
    pageTweet.setAttribute('data-testid', 'tweet')
    pageTweet.innerHTML = '<div data-testid="tweetText">首页第一条推文</div>'
    document.body.appendChild(pageTweet)

    const isolatedReplyBtn = document.createElement('button')
    isolatedReplyBtn.setAttribute('data-testid', 'tweetButtonInline')
    document.body.appendChild(isolatedReplyBtn)

    const ctx = extractTwitterContext(isolatedReplyBtn, 'REPLY_DETAIL')
    // 绝不拿首页第一条推文充数
    expect(ctx.targetTweetText).toBe('')
  })

  it('T21: 引用卡片作者提取优先取 User-Name 内部链接', () => {
    setPathname('/compose/post')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.innerHTML = `
      <div data-testid="quoteTweet">
        <div data-testid="tweetText">包含外链的推文 <a href="/status/999">第三方链接</a></div>
        <div data-testid="User-Name">
          <a role="link" href="/real_author_handle">真实博主</a>
        </div>
      </div>
      <button class="omnimux-copilot-anchor-btn" id="qbtn">Q</button>
    `
    document.body.appendChild(dialog)
    const qbtn = dialog.querySelector('#qbtn') as HTMLElement

    const ctx = extractTwitterContext(qbtn, 'POST_QUOTE')
    expect(ctx.quotedAuthor).toBe('real_author_handle')
  })

  it('T22: 气泡提示消息（Toast）置顶 - top: 24px，不再贴在页面底部', () => {
    const cssPath = resolve(__dirname, '../src/content/twitter-copilot/styles.css')
    const css = readFileSync(cssPath, 'utf8')

    // 匹配 .omnimux-copilot-toast 选择器块
    const toastBlock = css.match(/\.omnimux-copilot-toast\s*\{([^}]+)\}/)?.[1] || ''
    expect(toastBlock).toContain('top: 24px;')
    expect(toastBlock).not.toContain('bottom: 24px;')
    // 隐藏状态下向上偏移，入场时向下滑出
    expect(toastBlock).toContain('translateY(-20px)')
  })

  it('T23: 发新帖 5 大模块双轨自适应 - 有草稿改写，无草稿从信息流热帖全新原创', () => {
    const postNewItems = COPILOT_MENU_ITEMS.filter((item) => item.scenes.includes('POST_NEW'))
    expect(postNewItems.length).toBe(5)

    const sampleFeedTweets = [
      { author: 'tech_insider', text: 'OpenAI 发布了全新的推理强度控制参数，实测效果惊人。', stat: '500 喜欢, 120 转发' },
      { author: 'dev_guru', text: '极简代码架构为何总是打败过度设计的复杂系统？', stat: '800 喜欢, 340 转发' },
    ]

    for (const item of postNewItems) {
      // 1. 轨迹一：有草稿走改写/扩写
      const rewriteZh = item.generatePrompt({ scene: 'POST_NEW', draftText: '我的初始想法' }, 'zh')
      expect(rewriteZh.userMessage).toContain('我的初始想法')

      // 2. 轨迹二：无草稿走全新写（注入热帖参考，杜绝 undefined 与写死死板主题）
      const freshZh = item.generatePrompt({ scene: 'POST_NEW', draftText: '', feedHotTweets: sampleFeedTweets }, 'zh')
      if (item.id === 'twitter-post-en') {
        expect(freshZh.userMessage).toContain('Trending discussions on Twitter feed right now')
      } else {
        expect(freshZh.userMessage).toContain('当前推特首页正在热议的推文参考')
      }
      expect(freshZh.userMessage).toContain('tech_insider')
      expect(freshZh.userMessage).toContain('OpenAI 发布了全新的推理强度控制参数')
      expect(freshZh.userMessage).not.toContain('undefined')
      expect(freshZh.userMessage).not.toContain('分享关于效率工具与现代技术创新的思考')

      const freshEn = item.generatePrompt({ scene: 'POST_NEW', draftText: '', feedHotTweets: sampleFeedTweets }, 'en')
      expect(freshEn.userMessage).toContain('Trending discussions on Twitter feed right now')
      expect(freshEn.userMessage).not.toContain('undefined')
      expect(freshEn.userMessage).not.toContain('AI agents and software evolution trends')
    }
  })

  it('T24: 代码完整性 - menu.ts 源码中 scene 参数在 requestLlmGeneration 与 handleExecuteItem 完整闭环无未声明变量', () => {
    const menuSourcePath = resolve(__dirname, '../src/content/twitter-copilot/menu.ts')
    const source = readFileSync(menuSourcePath, 'utf8')

    // 确保 requestLlmGeneration 签名包含 scene
    expect(source).toMatch(/async function requestLlmGeneration\([^)]*scene:\s*TwitterCopilotScene/)
    // 确保 handleExecuteItem 调用处透传了 scene
    expect(source).toMatch(/await requestLlmGeneration\([^)]*scene\)/)
    // 确保构建产物不含自由 scene 标识符导致的 TS18004 隐患
    expect(source).toContain('context: {')
  })

  it('T25: 未激活与激活双态挂载 - 推特评论区处于未激活紧凑占位栏时，必须正常挂载唯一 OmniMux 图标', () => {
    const collapsedBar = document.createElement('div')
    collapsedBar.innerHTML = `
      <div class="avatar"></div>
      <div class="placeholder">发布你的回复</div>
      <div class="button-container" style="display: flex;">
        <button data-testid="tweetButtonInline" disabled>回复</button>
      </div>
    `
    document.body.appendChild(collapsedBar)
    const replyBtn = collapsedBar.querySelector('button') as HTMLElement
    // 模拟正向尺寸
    vi.spyOn(replyBtn, 'getBoundingClientRect').mockReturnValue({
      width: 60,
      height: 32,
      top: 100,
      left: 500,
      right: 560,
      bottom: 132,
      x: 500,
      y: 100,
      toJSON: () => {},
    })

    // 未激活紧凑回复条是合法挂载目标（不再被识别为陈旧孤立节点）
    expect(isCollapsedInlineReply(replyBtn)).toBe(false)

    mountCopilotToTwitterButtons()

    // 验证未激活紧凑占位条上正常挂载了唯一图标
    const mounted = document.querySelectorAll('.omnimux-copilot-anchor-btn')
    expect(mounted.length).toBe(1)
    expect(mounted[0].parentElement).toBe(replyBtn.parentElement)
  })

  it('T26: 展开态精准挂载 - 用户激活展开回复框后，仅在底部工具栏回复按钮旁单一挂载', () => {
    const expandedComposer = document.createElement('div')
    expandedComposer.innerHTML = `
      <div class="reply-context">回复 @ScarletKc</div>
      <div data-testid="tweetTextarea_0_label">
        <div role="textbox" data-testid="tweetTextarea_0" contenteditable="true">已有草稿</div>
      </div>
      <div data-testid="toolBar" style="display: flex;">
        <div class="media-tools" style="display: flex;">
          <button aria-label="媒体"></button>
          <button aria-label="Emoji"></button>
        </div>
        <div class="actions" style="display: flex;">
          <button data-testid="tweetButtonInline">回复</button>
        </div>
      </div>
    `
    document.body.appendChild(expandedComposer)
    const replyBtn = expandedComposer.querySelector('button[data-testid="tweetButtonInline"]') as HTMLElement
    vi.spyOn(replyBtn, 'getBoundingClientRect').mockReturnValue({
      width: 60,
      height: 32,
      top: 200,
      left: 500,
      right: 560,
      bottom: 232,
      x: 500,
      y: 200,
      toJSON: () => {},
    })

    expect(isCollapsedInlineReply(replyBtn)).toBe(false)

    mountCopilotToTwitterButtons()

    const mounted = document.querySelectorAll('.omnimux-copilot-anchor-btn')
    expect(mounted.length).toBe(1)
    // 验证挂载在包含回复按钮的同级 flex 容器中
    expect(mounted[0].parentElement).toBe(replyBtn.parentElement)
  })

  it('T27: 孤立僵尸图标自动清理 - DOM 状态切换时旧位置残留图标被立即清除，绝不残留双图标', () => {
    // 1. 模拟遗留了一个旧的孤立 copilot 按钮（脱钩节点）
    const orphanContainer = document.createElement('div')
    orphanContainer.style.display = 'flex'
    const orphanCopilot = document.createElement('button')
    orphanCopilot.className = 'omnimux-copilot-anchor-btn'
    orphanCopilot.setAttribute('data-omnimux-copilot', 'true')
    orphanContainer.appendChild(orphanCopilot)
    document.body.appendChild(orphanContainer)

    expect(document.querySelectorAll('.omnimux-copilot-anchor-btn').length).toBe(1)

    // 2. 执行孤立图标主动清理，触发清除
    cleanupStaleCopilotButtons()

    // 3. 孤立图标被清除
    expect(document.querySelectorAll('.omnimux-copilot-anchor-btn').length).toBe(0)

    // 4. 执行挂载扫描，验证二次幂等清理
    mountCopilotToTwitterButtons()
    expect(document.querySelectorAll('.omnimux-copilot-anchor-btn').length).toBe(0)
  })

  it('T28: 交互事件冒泡隔离 - 图标交互阻止 mousedown/pointerdown 穿透到推特外层容器', () => {
    const composer = document.createElement('div')
    composer.innerHTML = `
      <div data-testid="tweetTextarea_0_label">
        <div role="textbox" data-testid="tweetTextarea_0" contenteditable="true"></div>
      </div>
      <div data-testid="toolBar" style="display: flex;">
        <button data-testid="tweetButtonInline">回复</button>
      </div>
    `
    document.body.appendChild(composer)
    const replyBtn = composer.querySelector('button') as HTMLElement
    vi.spyOn(replyBtn, 'getBoundingClientRect').mockReturnValue({
      width: 60,
      height: 32,
      top: 200,
      left: 500,
      right: 560,
      bottom: 232,
      x: 500,
      y: 200,
      toJSON: () => {},
    })

    mountCopilotToTwitterButtons()

    const copilotBtn = document.querySelector('.omnimux-copilot-anchor-btn') as HTMLElement
    expect(copilotBtn).toBeDefined()

    let parentReceivedMouseDown = false
    let parentReceivedPointerDown = false
    composer.addEventListener('mousedown', () => { parentReceivedMouseDown = true })
    composer.addEventListener('pointerdown', () => { parentReceivedPointerDown = true })

    copilotBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    copilotBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

    expect(parentReceivedMouseDown).toBe(false)
    expect(parentReceivedPointerDown).toBe(false)
  })

  it('T27: 输入定位回溯 - 首页常驻发帖区（非弹窗/非 form/非 article）小幽灵图标能沿祖先成功定位输入框', async () => {
    // 模拟推特首页常驻发帖框 DOM 结构：输入框与发帖工具栏在同一个大容器内，跨越数层 div
    const homeComposerContainer = document.createElement('div')
    homeComposerContainer.className = 'home-composer-outer'
    homeComposerContainer.innerHTML = `
      <div class="composer-top-row">
        <div class="avatar-cell"></div>
        <div class="input-cell">
          <div data-testid="tweetTextarea_0_label">
            <div data-testid="tweetTextarea_0RichTextInputContainer">
              <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="composer-bottom-row">
        <div data-testid="toolBar" class="toolbar-inner">
          <div class="toolbar-icons">
            <button type="button" class="omnimux-copilot-anchor-btn" id="home-ghost-btn">G</button>
          </div>
          <div class="toolbar-submit">
            <button data-testid="tweetButtonInline" disabled>发帖</button>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(homeComposerContainer)

    const ghostBtn = homeComposerContainer.querySelector('#home-ghost-btn') as HTMLElement
    expect(ghostBtn).not.toBeNull()

    const success = await injectTweetText('测试首页常驻发帖框注入！', ghostBtn, 'zh')
    expect(success).toBe(true)

    const textarea = homeComposerContainer.querySelector('div[data-testid="tweetTextarea_0"]') as HTMLElement
    expect(textarea.textContent).toContain('测试首页常驻发帖框注入！')
  })

  it('T28: 卡片级单实例铁律清理 - 卡片内若存在右上角或上半部分残留图标，扫描时强制清除，只保留底部操作栏图标', () => {
    const card = document.createElement('div')
    card.innerHTML = `
      <div class="header-row">
        <div class="reply-to">回复 @test</div>
        <button class="omnimux-copilot-anchor-btn" data-omnimux-copilot="true" id="stale-corner">右上角残留</button>
      </div>
      <div data-testid="tweetTextarea_0_label">
        <div role="textbox" data-testid="tweetTextarea_0" contenteditable="true"></div>
      </div>
      <div data-testid="toolBar" style="display: flex;">
        <button aria-label="媒体"></button>
        <button data-testid="tweetButtonInline" id="valid-btn">回复</button>
      </div>
    `
    document.body.appendChild(card)

    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      width: 500,
      height: 150,
      top: 100,
      left: 100,
      right: 600,
      bottom: 250,
      x: 100,
      y: 100,
      toJSON: () => {},
    })

    const staleCorner = card.querySelector('#stale-corner') as HTMLElement
    vi.spyOn(staleCorner, 'getBoundingClientRect').mockReturnValue({
      width: 32,
      height: 32,
      top: 105,
      left: 550,
      right: 582,
      bottom: 137,
      x: 550,
      y: 105,
      toJSON: () => {},
    })

    const validBtn = card.querySelector('#valid-btn') as HTMLElement
    vi.spyOn(validBtn, 'getBoundingClientRect').mockReturnValue({
      width: 60,
      height: 36,
      top: 210,
      left: 520,
      right: 580,
      bottom: 246,
      x: 520,
      y: 210,
      toJSON: () => {},
    })

    mountCopilotToTwitterButtons()

    // 验证右上角残留已被彻底销毁
    expect(document.getElementById('stale-corner')).toBeNull()

    // 验证卡片内仅有 1 个幽灵图标，位于底部工具栏
    const cardCopilots = card.querySelectorAll('.omnimux-copilot-anchor-btn')
    expect(cardCopilots.length).toBe(1)
    expect(cardCopilots[0].parentElement).toBe(validBtn.parentElement)
  })

  it('T29: 工具栏查找作用域严格受限 - 严禁跨层级向整张卡片搜寻外部或右上角的竞品按钮', () => {
    const rootCard = document.createElement('div')
    rootCard.innerHTML = `
      <div class="floating-header">
        <button class="ai-assistant-button" id="external-sopilot">外部竞品</button>
      </div>
      <div data-testid="tweetTextarea_0_label">
        <div role="textbox" data-testid="tweetTextarea_0" contenteditable="true"></div>
      </div>
      <div data-testid="toolBar" class="toolbar-flex" style="display: flex;">
        <button data-testid="tweetButtonInline" id="toolbar-btn">回复</button>
      </div>
    `
    document.body.appendChild(rootCard)

    vi.spyOn(rootCard, 'getBoundingClientRect').mockReturnValue({
      width: 500,
      height: 150,
      top: 100,
      left: 100,
      right: 600,
      bottom: 250,
      x: 100,
      y: 100,
      toJSON: () => {},
    })

    const toolbarBtn = rootCard.querySelector('#toolbar-btn') as HTMLElement
    vi.spyOn(toolbarBtn, 'getBoundingClientRect').mockReturnValue({
      width: 60,
      height: 36,
      top: 210,
      left: 520,
      right: 580,
      bottom: 246,
      x: 520,
      y: 210,
      toJSON: () => {},
    })

    mountCopilotToTwitterButtons()

    // 挂载点绝不可被外部竞品引偏到 floating-header 中
    const mountedCopilot = rootCard.querySelector('.omnimux-copilot-anchor-btn') as HTMLElement
    expect(mountedCopilot).not.toBeNull()
    expect(mountedCopilot.parentElement).toBe(toolbarBtn.parentElement)
  })

  it('T30: 未激活到激活状态切换流转 - 从紧凑条展开为编辑卡片后，旧位置图标被卡片级单实例守卫清除，底部工具栏挂载唯一图标', () => {
    // 1. 初始为未激活紧凑占位条
    const container = document.createElement('div')
    container.className = 'comment-reply-region'
    container.innerHTML = `
      <div class="compact-bar" style="display: flex;">
        <div class="placeholder">发布你的回复</div>
        <button data-testid="tweetButtonInline" id="compact-btn">回复</button>
      </div>
    `
    document.body.appendChild(container)
    const compactBtn = container.querySelector('#compact-btn') as HTMLElement
    vi.spyOn(compactBtn, 'getBoundingClientRect').mockReturnValue({
      width: 60,
      height: 32,
      top: 100,
      left: 500,
      right: 560,
      bottom: 132,
      x: 500,
      y: 100,
      toJSON: () => {},
    })

    mountCopilotToTwitterButtons()
    expect(container.querySelectorAll('.omnimux-copilot-anchor-btn').length).toBe(1)

    // 2. 模拟推特状态切换：点击后展开成多行编辑卡片
    // 假设旧紧凑条节点被推特变形为顶部或者保留在顶部，同时底部创建了新的媒体工具栏
    container.innerHTML = `
      <div class="expanded-top-header" style="display: flex;">
        <span>回复 @target</span>
        <button class="omnimux-copilot-anchor-btn" data-omnimux-copilot="true" id="stale-top-icon">旧图标</button>
      </div>
      <div data-testid="tweetTextarea_0_label">
        <div role="textbox" data-testid="tweetTextarea_0" contenteditable="true">准备输入的回复</div>
      </div>
      <div data-testid="toolBar" class="expanded-bottom-toolbar" style="display: flex;">
        <button aria-label="媒体"></button>
        <button data-testid="tweetButtonInline" id="expanded-btn">回复</button>
      </div>
    `

    const staleTop = container.querySelector('#stale-top-icon') as HTMLElement
    vi.spyOn(staleTop, 'getBoundingClientRect').mockReturnValue({
      width: 32,
      height: 32,
      top: 105,
      left: 550,
      right: 582,
      bottom: 137,
      x: 550,
      y: 105,
      toJSON: () => {},
    })

    const expandedBtn = container.querySelector('#expanded-btn') as HTMLElement
    vi.spyOn(expandedBtn, 'getBoundingClientRect').mockReturnValue({
      width: 60,
      height: 36,
      top: 250,
      left: 520,
      right: 580,
      bottom: 286,
      x: 520,
      y: 250,
      toJSON: () => {},
    })

    // 执行扫描挂载
    mountCopilotToTwitterButtons()

    // 验证：顶部旧图标已被清除，仅在底部工具栏保留 1 个图标
    expect(document.getElementById('stale-top-icon')).toBeNull()
    const finalCopilots = container.querySelectorAll('.omnimux-copilot-anchor-btn')
    expect(finalCopilots.length).toBe(1)
    expect(finalCopilots[0].parentElement).toBe(expandedBtn.parentElement)
  })

  it('T31: 竞品覆盖对齐 - 当同级存在 SoPilot 竞品按钮时，OmniMux 图标在其位置挂载并优雅覆盖', () => {
    const bar = document.createElement('div')
    bar.innerHTML = `
      <div class="row-flex" style="display: flex; flex-direction: row;">
        <button data-testid="tweetButtonInline" id="reply-btn">回复</button>
        <button class="ai-assistant-button" id="sopilot-btn">SoPilot</button>
      </div>
    `
    document.body.appendChild(bar)
    const replyBtn = bar.querySelector('#reply-btn') as HTMLElement
    const sopilotBtn = bar.querySelector('#sopilot-btn') as HTMLElement

    vi.spyOn(replyBtn, 'getBoundingClientRect').mockReturnValue({
      width: 60,
      height: 32,
      top: 100,
      left: 400,
      right: 460,
      bottom: 132,
      x: 400,
      y: 100,
      toJSON: () => {},
    })

    mountCopilotToTwitterButtons()

    const copilotBtn = bar.querySelector('.omnimux-copilot-anchor-btn') as HTMLElement
    expect(copilotBtn).not.toBeNull()
    // 验证 SoPilot 被干净覆盖抑制
    expect(sopilotBtn.style.display).toBe('none')
    // 验证 OmniMux 成功挂载在工具行
    expect(copilotBtn.parentElement).toBe(sopilotBtn.parentElement)
  })
})
