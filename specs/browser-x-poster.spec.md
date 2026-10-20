# 规范：X 推文海报生成与发帖页自动预填（Issue #3460）

## 1. 目标与用户故事

在 X 时间线/详情页的推文上提供一个「生成海报」入口：点击后弹出黑白主题确认，确认后**并行**完成两件事——本地 canvas 生成一张竖版海报、本地 Agent 生成一段「个人观点」——然后把用户带到 X 发帖页，自动把海报作为图片附件、把观点预填进正文，由用户自己点发布。

非目标：不自动发布、不做模板编辑器/多主题、不拼接推文媒体、不做海报广场、不新增 manifest 主机权限。

## 2. 用户流程

1. 推文互动栏下方出现 `生成海报` 按钮（仅一条推文一个按钮）。
2. 点击 → Shadow DOM 模态：两张主题卡（白底 / 黑底）、说明「将在发帖页自动附图并预填观点，由你确认发布」、`取消` / `生成并预填`。
3. 确认 → 模态进入生成态：两条进度（海报 / 观点）。
4. 渲染完成（本地 canvas → PNG DataURL）且观点生成结束（成功或超时/失败）→ 写入短 TTL 载荷 → `location.assign('https://x.com/compose/post')`。
5. 发帖页加载 → 内容脚本发现未过期载荷 → 等待 composer 与 file input → 通过 `DataTransfer` 附图 → 通过粘贴事件预填观点 → 清除载荷 → Toast 提示（成功/部分失败）。
6. 用户检查后自行点击「发帖」。任何路径都不点击发布按钮。

## 3. 架构与文件

新增 `plugins/omnimux-browser/extension/src/content/twitter-poster/`：

| 文件 | 职责 |
| --- | --- |
| `types.ts` | `TweetPosterSource`、`PosterTheme`、`PosterRenderResult`、`PendingPosterPayload` |
| `themes.ts` | 黑白两套固化 Token（canvas 用色 + UI 预览缩略图用色） |
| `render.ts` | 纯函数：`wrapLines` / `measurePosterHeight` / `renderPoster(canvas, source, theme)`；无 DOM 副作用（接受 CanvasLike） |
| `modal.ts` | Shadow DOM 模态：主题选择、生成态、错误态、键盘/遮罩关闭 |
| `opinion.ts` | 观点 Prompt 构造 + `DSH_TWITTER_COPILOT_GENERATE` 调用 + `sanitizeTweetText` + 超时 |
| `compose.ts` | 发帖页消费：等待 composer/file input、附图、预填、载荷读写与 TTL |
| `index.ts` | 入口：X host 判定、每推文按钮注入、observer、特性开关、消费载荷 |
| `styles.css` | 按钮/模态样式（Token + fallback，无裸色唯一来源） |
| `render.spec.ts` 等 | 单测 |

改动：`content/index.ts` 增加动态挂载；`feature-flags.ts` 增加 `poster`；`content-entry` 的 `FEATURE_FLAG_KEYS` 同步；`panel/App.tsx` + `panel/strings.ts` 增加开关与双语文案；`tests/feature-flags.spec.ts` 覆盖新 key。

## 4. 数据契约

```ts
type PosterTheme = 'light' | 'dark'

interface TweetPosterSource {
  name: string        // 显示名
  handle: string      // 不含 @
  avatar: string      // 绝对 URL（pbs.twimg.com），可为空
  verified: boolean
  text: string        // 推文正文（保留原始换行）
  url: string         // 永久链接
}

interface PendingPosterPayload {
  dataUrl: string     // image/png
  text: string        // 个人观点，可为空
  sourceUrl: string
  theme: PosterTheme
  createdAt: number   // Date.now()
}
```

- 存储键：`omnimux_x_poster_pending`（`chrome.storage.local`）。
- TTL：10 分钟；消费或过期即删除。只在 `x.com/compose/post`、`x.com/compose/tweet`、`/intent/post` 消费，其他页面保留等待跳转。
- 载荷体积上限：8 MB（超限视为生成失败，提示「海报过大」）。

## 5. 海报视觉规格（代码固化）

参考 BlueV 实测参数（`tmp/bluev/viral.html` 内联 poster 脚本）：宽 `W=1280`、`PAD=100`、内容宽 `CW=1080`；正文 `40px`、行高 `68`；头像圆半径 `52`、ID 区高 `160`；标题（若启用）`64px/88`；水印区高 `110`。我们 v1 不渲染标题与推文媒体，保持「头像 + 名称/账号 + 正文 + 水印」结构与参考图一致。

- 字体栈：`"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Zen Hei",sans-serif`；不加载远端字体。
- 主题：
  - `light`：底 `#ffffff`、正文 `#0f1419`、名称 `#0f1419`、次级 `#6b7280`、分隔线 `rgba(15,20,25,.10)`。
  - `dark`：底 `#0b0b0c`、正文 `#e7e9ea`、名称 `#ffffff`、次级 `#8b98a5`、分隔线 `rgba(255,255,255,.14)`。
- 作者行：头像（失败时首字母圆底）+ 名称 + 认证勾（单色描边，不用平台蓝）+ `@handle`；下方 2px 分隔线。
- 正文：按字符换行，保留原文换行；连续空行最多保留一个空行；不修改文案。
- 水印：右下角 `OmniMux` 文字 + 幽灵品牌 mark（来自 `media-hover/overlay-icons.ts` 的 `BRAND_GHOST_PATH`），透明度 `.8`。
- 高度：`PAD + head + bodyLines * 68 + watermark`，宽度固定 1280；高度上限 4000，超出截断并在末尾显示省略号（保证 X 可上传）。
- 导出：`canvas.toDataURL('image/png')`；不使用 `toBlob`（避免回调复杂度）。

## 6. 观点生成

- 复用现有通道：`chrome.runtime.sendMessage({ type: 'DSH_TWITTER_COPILOT_GENERATE', systemPrompt, userMessage })`。
- 中文默认（页面 `lang` 以 `zh` 开头），否则英文。
- Prompt 要点：第一人称个人观点；2–3 句；80–140 字；不复述原文；不输出 hashtag/emoji/链接/引号；不用「深入探讨/赋能/闭环」等 AI 腔；只输出正文。
- 生成后走 `sanitizeTweetText(text, locale)`；失败/超时（20s）返回空串，不阻断跳转。

## 7. 失败与降级

| 场景 | 行为 |
| --- | --- |
| 模型离线/超时 | 仍生成海报并跳转；正文空；Toast「观点生成失败，可在发帖页手动补充」 |
| 头像拉取失败 | 用名称首字母占位，不阻塞 |
| 海报 DataURL 过大 | 中止跳转，提示「海报过大，请重试」 |
| 发帖页未出现 composer（未登录/改版） | 保留载荷 10 分钟并提示「请先登录 X，再打开发帖页」 |
| composer 已有正文 | 不覆盖，Toast「输入框已有内容，未覆盖」 |
| file input 未找到 | 仍预填观点，Toast「未能自动附图，请手动添加」 |
| 插件上下文失效 | 提示刷新页面 |

## 8. 新用户基线

- 不依赖任何开发机状态：海报渲染纯本地；观点生成依赖本机 OmniMux 运行（缺失时按失败降级）；附图/预填只依赖 X 页面与扩展自身权限。
- 不新增 host 权限，不读取 X 密码/私信，不访问第三方服务器；所有中间载荷仅存本机浏览器。

## 9. 验收

- 单测：换行/度量/高度上限、主题 token 差异、载荷 TTL 与消费、compose 元素选择、prompt 构造、主题选择状态机。
- 构建：`pnpm build`、`pnpm typecheck`、`pnpm test`（extension）。
- 真实浏览器（隔离 worktree + ego-browser）：加载 unpacked 扩展 + 本地 X 结构 fixture，跑完整流程并截图；关闭开关后无入口。
- 不新增 manifest 权限；`node scripts/impact-matrix.mjs --git-diff --base origin/main` 记录的检查通过。

## 10. 非目标

自动发布、定时发布、媒体海报、多模板/配色、海报历史/广场、BlueV 代码复制、X 之外的平台。
