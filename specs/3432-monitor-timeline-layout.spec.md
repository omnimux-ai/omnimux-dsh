---
status: active
issue: 3432
base: 87e7c83bb76cb6feef642b453b95045f8d30b575
---

# 3432 账号监控两栏布局：左账号列表 + 右原生时间线

## 目标

把账号监控从「账号筛选弹层 + 作品瀑布流卡片」改为：

1. 左侧常驻账号列表容器，负责选择账号；默认全部账号选中，多选，支持反选/重置，保留账号状态、重试、主页跳转。
2. 右侧内容区显示所选账号的帖子，默认全部账号。
3. 帖子按发帖时间倒序，行样式参考原平台时间线：头像、昵称、handle、平台标记、发帖时间、正文，并保留媒体封面、播放/点赞/评论/分享与既有操作（原帖/详情/立即复刻/AI 解构/标为已处理）。
4. 顶部工具栏移除账号下拉与排序下拉，保留搜索、刷新、平台筛选。

数据接口、选择查询语义（`accounts` 参数）、刷新/额度/首采不变。

## 实现

- 新增 `RivalAccountColumn`：复用账号筛选行（`AccountFilterRow` 由 `RivalAccountFilter` 导出）渲染常驻左栏；头部展示标题、选择摘要、反选/重置。
- 新增 `RivalTimeline` / `RivalTimelineRow`：单列列表；行内元素按平台原生卡片组织（头像/昵称/handle/平台标记/时间/正文/媒体/互动指标 + 悬停操作）；媒体加载失败时隐藏媒体块；已处理态弱化。
- 新增纯函数模块 `rival-timeline.js`：`timelineTimestamp` / `sortTimelineRows`（posted_at 倒序，不可读时间沉底、id 兜底）、`timelineBody`、`timelineInitial`、`timelineStateText`（已处理/已复刻/已互动文案）。
- `InspirationSection`：rivals tab 内容改为 `.omnimux-rival-layout` 两栏；工具栏删除 `RivalAccountFilter` 与排序下拉；`useRivalFeed` 排序固定 `latest`。
- `RivalAccountsPanel`：有帖子时渲染时间线（含追加 sentinel，且只在 idle 时触发一次；失败不自动重试），「标为已处理」做本地乐观翻转，状态文案区分已处理/已复刻/已互动；无帖子时沿用现有空态/骨架/首采进度。
- `toRivalCardRow` 增补 `text`、`avatar_url`、`account.avatar_url`（additive，不影响其它消费者）。
- 账号监控不再消费 `RivalMasonry` / `RivalPostCard` / `rival-masonry.js`；它们仍被灵感库消费，保留组件与单测。`RivalAccountFilter` 退役 trigger/panel 与相关文案/样式删除，只保留可复用的账号行；`RivalFeedGrid` 去掉卡片/瀑布流渲染，只保留空态/骨架/首采进度。
- `rival-styles.js`：删除瀑布流/卡片/筛选弹层样式，新增两栏与时间线样式；响应式窄视口左栏收窄、不横向溢出。

## 验收用例

| # | 用例 | 期望 |
|---|---|---|
| A1 | 打开账号监控 | 左右两栏；左栏常驻账号列表；默认全部账号被勾选；右栏显示全部帖子 |
| A2 | 取消/勾选账号、反选、重置 | 右栏立即按所选账号过滤；重置回全部；选择仍通过 `accounts` 参数请求 |
| A3 | 时间线 | 按 `posted_at` 倒序；无排序下拉；追加分页在底部加载 |
| A4 | 行元素 | 头像/首字母、昵称、handle、平台标记、相对时间、正文、媒体（如有）、播放/点赞/评论/分享；悬停操作可用 |
| A5 | 空态/首采/加载 | 沿用现有空态、骨架与首采进度 |
| A6 | 其他 Tab | 灵感库、爆款趋势不受影响 |
| A7 | 窄视口 760px / 375px | 760px 时左栏 200px、两栏；375px 时堆叠单列；无横向溢出 |
| A8 | 追加页失败 | sentinel 暂停，不自动重复请求；恢复后可由下一次 idle 继续 |
| A9 | 标为已处理 | 点击后行立即 is-done、按钮消失，状态文案按已处理/已复刻/已互动区分 |

## 验证

- 时间线纯函数/渲染单测、两栏 page e2e、更新后的账号监控渲染门禁；
- 插件核心套件、`verify-stage-contracts`、`verify-anti-slop`、`scan-ui-gates` 与 main 对照、`impact-matrix`；
- 隔离 worktree 真实浏览器：两栏布局、账号选择联动、时间倒序、行元素与操作、空态；截图与结构化事实。

## 新用户基线

新用户导入账号 → 首采完成后默认看到全部账号的时间线；缺凭据/额度/渠道沿用现有明确错误；不依赖开发机状态。

## 文档影响

新增本 spec 取代旧卡片/瀑布流与账号弹层设计；历史文档不回写。不改合同、模型、接口与 README。
