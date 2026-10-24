# 实机预演证据：长文章帖（X Article）回帖助手上下文读取修复（#3630）

- 时间：2026-10-23 14:33–15:33（Asia/Taipei）
- 环境：ego lite（已登录 X 的日常 profile），OmniMux 扩展（unpacked，路径 `plugins/omnimux-browser/extension/dist`），版本 0.1.4
- 目标页：<https://x.com/Khazix0918/status/2113466426216583632>（X Article 长文章帖）
- 被测构建：任务工作树 `agent/browser-x-article-context-issue-3630` 的 `node scripts/build.mjs` 产物（评审修复后的最终代码；`content.js` 含 `twitterArticleRichTextView` 读取逻辑）
- 对照构建：`origin/main`（8f312e713）现网扩展产物

## 页面事实（页面内脚本实测）

| 项 | 值 |
| --- | --- |
| `main article[data-testid="tweet"][tabindex="-1"]` | 存在 |
| 该推内 `[data-testid="tweetText"]` | **0 个** |
| `[data-testid="twitterArticleReadView"]` | 存在 |
| `[data-testid="twitter-article-title"]` | 「我好像陷入了某种，AI时代的虚无主义。」 |
| `[data-testid="twitterArticleRichTextView"]` 正文长度 | 4,390 字 |
| 交互计数（read view 内 `role="group"`） | `45101591万` |

## 预演步骤与结果

1. 打开文章帖 → 点击 OmniMux 助手按钮 → 菜单标题「推文回帖助手」，菜单项 `ai-tweet-reply-high`（高赞神评生成）。
2. **修复前（main 构建）**：点击菜单项后 1.8 s 内出现 toast
   - `toast = "没有读到原推内容，请刷新页面后重试。"`，`toastVisible = true`
   - 截图：`before-main-build.png`
3. 换上工作树构建产物并重载扩展（`chrome.developerPrivate.reload`）后重跑同一路径（15:33 用第二轮评审修复后的最终构建复跑）：
   - 立即出现 `toast = "AI 正在深度思考生成：高赞神评生成..."`（上下文闸门放行，进入生成）
   - 截图：`after-fix-build.png`
4. 等待生成完成（≤80 s）：
   - `toast = "已填入推文输入框，请复核后点击发帖！"`
   - 回帖框实际文本：`开修改器最残忍的地方，是它让人提前看清了真相：如果把所有走过的弯路、费劲的折腾都抽掉，所谓的终点其实空无一物。AI 剥夺的不是技能，而是我们用忙碌换来的充实感。`（内容取自文章主旨，证明读到的是文章正文而非空串）
   - 截图：`after-fix-generated.png`

## 结论

同一页面、同一操作路径：修复前被上下文闸门拦截（原帖正文读取为空），修复后正常读取文章标题与正文、完成生成并写入回帖框。未对短推文/普通详情页做回归实机检查，该部分由 jsdom 回归用例覆盖。
