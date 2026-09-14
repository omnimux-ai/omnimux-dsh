/**
 * Twitter Copilot Text Sanitizer & Anti-Truncation Pipeline
 * Ensures clean, single-choice, un-truncated output matching Twitter's character budget.
 */

export function sanitizeTweetText(rawText: string, locale: 'zh' | 'en' = 'zh'): string {
  if (!rawText || typeof rawText !== 'string') return ''

  let text = rawText.trim()

  // 1. 移除模型可能输出的 <think>...</think> 内部思考标签
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  // 2. 如果是中文环境，坚决剔除一切前置的英文分析/思考前言
  if (locale === 'zh') {
    const firstChineseIndex = text.search(/[\u4e00-\u9fa5]/)
    if (firstChineseIndex > 0) {
      const prefix = text.slice(0, firstChineseIndex)
      // 如果前面是英文分析、词汇或过长英文前缀，直接截取自首个中文字符开始
      if (
        /analyz|think|tweet|goal|persona|formula|angle|focus|creator|consider|[a-z]{10,}/i.test(prefix) ||
        prefix.length > 20
      ) {
        text = text.slice(firstChineseIndex).trim()
      }
    }
  }

  // 3. 剥离 Markdown 标记符号（加粗 **、标题 #、列表 -、引用 >、多余引号）
  text = text
    .replaceAll('**', '')              // 彻底移除加粗星号
    .replaceAll('__', '')              // 移除下划线加粗
    .replace(/^#+\s+/gm, '')          // 移除标题
    .replace(/^[-*•]\s+/gm, '')       // 移除无序列表符号
    .replace(/^\d+[\.、]\s*/gm, '')   // 移除有序序号
    .replace(/^["“](.*?)["”]$/g, '$1') // 移除外层多余引号
    .replace(/^(?:评论|回复|神评|推文|备选)[：:]\s*/gi, '') // 移除前缀标签
    .trim()

  // 4. 如果有多段候选输出（例如同时给出了多条备选），按空行或换行分割，优选最完整的一条精粹短评
  if (locale === 'zh') {
    const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean)
    const valid = paragraphs.filter(
      (p) => /[\u4e00-\u9fa5]/.test(p) && !/^(?:备选|选项|思路|注|说明|或者)/.test(p),
    )
    if (valid.length > 0) {
      // 优选字数在 25~110 字之间的最自然评论，避开残缺句
      const best = valid.find((p) => p.length >= 25 && p.length <= 110) || valid[valid.length - 1]
      text = best
    }
  }

  // 5. 推特字数硬防线与截断保护：
  // 严格控制在安全字数以内，并在最后一个完整标点处平滑收口，绝不半句截断！
  const maxSafeChars = locale === 'zh' ? 120 : 250
  if (text.length > maxSafeChars) {
    const truncatedSlice = text.slice(0, maxSafeChars)
    const lastPunctuation = Math.max(
      truncatedSlice.lastIndexOf('。'),
      truncatedSlice.lastIndexOf('！'),
      truncatedSlice.lastIndexOf('？'),
      truncatedSlice.lastIndexOf('!'),
      truncatedSlice.lastIndexOf('?'),
      truncatedSlice.lastIndexOf('\n'),
    )
    if (lastPunctuation > 20) {
      text = truncatedSlice.slice(0, lastPunctuation + 1).trim()
    } else {
      text = truncatedSlice.trim() + '…'
    }
  }

  return text
}
