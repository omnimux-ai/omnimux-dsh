// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { detectTwitterScene, extractTwitterContext } from '../src/content/twitter-copilot/extractor.ts'
import { COPILOT_MENU_ITEMS } from '../src/content/twitter-copilot/prompts.ts'
import { mountCopilotToTwitterButtons } from '../src/content/twitter-copilot/anchor.ts'
import { injectTweetText } from '../src/content/twitter-copilot/injector.ts'

describe('Twitter Copilot Native Unit Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('T1: 场景检测 - 正确识别发新帖与引用转发弹窗', () => {
    // 1. 普通发帖弹窗
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const postBtn = document.createElement('button')
    postBtn.setAttribute('data-testid', 'tweetButton')
    dialog.appendChild(postBtn)
    document.body.appendChild(dialog)

    expect(detectTwitterScene(postBtn)).toBe('POST_NEW')

    // 2. 带有引用推文的弹窗
    const quoteTweet = document.createElement('div')
    quoteTweet.setAttribute('data-testid', 'quoteTweet')
    dialog.appendChild(quoteTweet)

    expect(detectTwitterScene(postBtn)).toBe('POST_QUOTE')
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
    expect(COPILOT_MENU_ITEMS.length).toBe(10)

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
})
