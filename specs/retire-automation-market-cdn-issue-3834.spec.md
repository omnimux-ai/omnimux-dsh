# 规范：退役 omnimux-automation、market 封面 CDN 回植与封面前向移除

Issue: [#3834](https://github.com/omnimux-ai/omnimux-dsh/issues/3834)

## 1. 目标 (Objective)

三件事，均已在开工前用代码与线上事实核对过，不采用 Issue 原文中与事实不符的表述。

### 1.1 退役 `omnimux-automation`

官方 DSH `0.2.1-rc.3` 已内置定时任务能力。实测 `@deepseek-ai/dsh-client-ui-schedule` 存在于已安装底座：

```
npx @electron/asar list "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" | grep schedule
→ /dsh/node_modules/@deepseek-ai/dsh-client-ui-schedule/lib/client.js
```

因此插件仓侧的 `plugins/omnimux-automation` 是重复能力，应整体清退，并清理全部引用，避免注册表、生命周期名单、同步脚本、市场展示、文档与测试各自描述一个已不存在的插件。

成功标准：

- `plugins/omnimux-automation` 目录不存在。
- `rg "omnimux-automation"` 在源码、注册表、脚本、文档、测试中均无命中（历史 spec 与已合并记录除外，它们记录历史，不改写）。
- `pnpm registry:verify`、`node scripts/verify-plugin-load.mjs` 等装载类校验通过，说明没有悬挂引用。

### 1.2 market 封面 CDN 回退逻辑回植源码树

`omnimux-market` 的已发布 tarball（`0.2.13-omni.0`）里有 `MARKET_ASSET_CDN` 与 `catalogAssetUrl()`，但该代码在**任何提交里都不存在**（`git log --all -S MARKET_ASSET_CDN` 无结果）。也就是说线上包与源码树已经分叉，源码树无法重新构建出等价产物。

回植内容（与已发布产物语义一致）：

- `MARKET_ASSET_CDN = 'https://dl.omnimux.ai/market'`
- `catalogAssetUrl(target)`：仅接受 `catalog/` 前缀；剥离前缀后拒绝空串、含 `..`、字符集超出 `[a-zA-Z0-9._/-]`；返回 `${MARKET_ASSET_CDN}/${rel}`，否则 `undefined`
- `handleIcon` 中：仅当请求以 `catalog/` 开头才尝试改写为 CDN 地址，改写失败回落到原值，随后仍走「本地真源优先 → 磁盘缓存 → 远程抓取」既有顺序

关键约束：**本地优先不变**。本地存在封面时必须直接 200 返回本地字节，不得因引入 CDN 改写而先走网络。

### 1.3 封面 130MB 前向移除

`plugins/omnimux-market/catalog/covers` 共 111 个文件、130MB，全部已托管到 `https://dl.omnimux.ai/market/covers/...`。已逐个核对 111 个路径在 CDN 上均返回 200，无遗漏。

移除方式与边界：

- **只做前向移除**：从索引与工作区删除，`.gitignore` 阻止重新提交。
- **不重写历史**。`git rm` 不会缩小 `.git`（当前 1.0GB），封面 blob 永久留在历史里。要真正缩容必须重写历史并强制推送，那会迫使所有协作者重新克隆且不可恢复，需单独授权。

成功标准：

- `git ls-files plugins/omnimux-market/catalog/covers | wc -l` 为 0。
- 打包产物不含封面：`package.json` 的 `files` 含 `"!catalog/covers"`。
- 删除本地封面后，`handleIcon` 对封面请求仍返回 200（走 CDN 回退）。

## 2. 命令 (Commands)

```bash
# 在 worktree 内执行，主检出禁止构建/包管理命令
cd .worktrees/cross-retire-automation-issue-3834

# 引用清零核对
rg "omnimux-automation" --glob '!node_modules' --glob '!.worktrees'

# 封面已全部脱离索引
git ls-files plugins/omnimux-market/catalog/covers | wc -l   # 期望 0

# CDN 可访问性（抽样 + 全量）
curl -sI https://dl.omnimux.ai/market/covers/home/bggg-data-amazon.png

# market 单测（含封面处理路径）
corepack pnpm --filter omnimux-market test

# 注册表与装载
corepack pnpm registry:verify
```

## 3. 项目结构 (Project Structure)

- 删除：`plugins/omnimux-automation/`（整目录）
- 修改：`plugins.registry.json`、`plugins/omnimux/src/plugin-lifecycle.json`、`plugins/omnimux-market/src/local-api.ts`、`plugins/omnimux-market/package.json`、`plugins/omnimux-market/src/client/plugins-column.js`、`scripts/` 下相关同步与校验脚本、`docs/contracts/sidebar-extra-entries.md`
- 删除图片：`plugins/omnimux-market/catalog/covers/`（111 文件）
- 新增：本 spec

## 4. 代码风格 (Code Style)

沿用各文件既有风格。`local-api.ts` 是 TypeScript 源码，`lib/` 是其编译产物且已入库，改动后需按该包既有 `build` 流程重建，不手改 `lib/`。

## 5. 测试策略 (Testing Strategy)

- 退役：以引用清零 + 装载校验为准；被删插件的专属 e2e（`tests/e2e/automation-*.e2e.test.mjs`）一并删除，不做「保留但跳过」。
- CDN 回植：`home-cover.test.ts` 现有断言必须继续通过（本地优先）。新增断言覆盖 `catalogAssetUrl` 的拒绝分支（空、`..`、非法字符）。
- 封面移除：断言打包白名单排除封面；断言本地无文件时封面请求仍 200。

## 6. 边界 (Boundaries)

- **总是**：只清退已被官方能力替代的插件；只前向移除已确认在 CDN 可访问的素材。
- **先问**：重写 git 历史、强制推送、改动版本号、动桌面壳。
- **绝不**：手工编辑 `~/.omnimux-dev` 的 profile 或 `node_modules`；改官方 DSH 源码；把「已发布 tarball 里有、源码没有」的差异当成源码正确。

## 旧标准变更

封面图片从 git 移除后，`plugins/omnimux-market/src/tests/home-cover.test.ts` 中依赖「磁盘上有真实 PNG 并逐字节比对」的用例前提已不存在。以下用例逐条声明改写理由与新期望证据（用户已就此项单独授权）。

- `plugins/omnimux-market/src/tests/home-cover.test.ts` :: `*`
  文件级声明（该文件含 `import type` 等 TS 语法，两侧都解析不了，无法枚举具名用例，按 CI 侧 `FILE_LEVEL_CASE` 规则声明）。
  原断言：请求 `catalog/covers/home/bggg-data-amazon.png` 与 8 个 `expert-*.png` 头像返回 200，且响应字节逐字节等于 `readFileSync` 读到的本地 PNG。
  必须改的理由：这些 PNG 已迁至 CDN 并从 git 移除（见上文 1.3），本地不再存在，原断言必然失败且无法通过恢复文件满足——恢复即放弃本次封面移除目标。
  新期望证据：改为断言 `catalogAssetUrl` 对 catalog 路径产出 `https://dl.omnimux.ai/market/...`；对 `catalog/`、含 `..`、含空格等输入返回 `undefined`；traversal 请求仍必须 400；本地缺失时不得伪造 200；非 catalog 前缀（远程 URL、`marketplace-icon:`）不被改写。

- `plugins/omnimux-market/src/tests/home-cover.test.ts` :: `actual icon handler serves the independent home cover and rejects traversal`
  原断言：请求 `catalog/covers/home/bggg-data-amazon.png` 返回 200，且响应字节等于 `readFileSync` 读到的本地 PNG。
  必须改的理由：该 PNG 已迁至 CDN 并从 git 移除，本地不再存在，原断言必然失败且无法通过恢复文件来满足（恢复文件即放弃本次封面移除目标）。
  新期望证据：改为断言 `catalogAssetUrl` 对 catalog 路径产出 `https://dl.omnimux.ai/market/...`，并对 `catalog/`、含 `..`、含空格等输入返回 `undefined`；traversal 请求仍必须 400。

- `plugins/omnimux-market/src/tests/home-cover.test.ts` :: `icon handler serves all 8 default market expert avatars locally without network`
  原断言：8 个 `catalog/covers/expert-*.png` 头像请求均返回 200 且字节非空。
  必须改的理由：这 8 张同样是已移除的封面图片，本地不再有字节可比对。
  新期望证据：改为断言本地无副本时不得伪造 200（`assert.notEqual(status, 200)`），并保留「本地镜像存在时本地优先」的契约由新用例覆盖。

- `plugins/omnimux-market/src/tests/home-cover.test.ts` :: `icon handler maps remote workbuddyskills avatar URL directly to local disk without cloud fetch`
  原断言：远程 workbuddyskills 头像 URL 直接映射到本地磁盘并返回 200 与真实字节。
  必须改的理由：映射目标候选路径之一即 `catalog/covers/`，随封面移除后本地命中不再成立。
  新期望证据：改为断言非 catalog 前缀的 URL 不被 `catalogAssetUrl` 改写（返回 `undefined`），且本地缺失时不得伪造 200。

- `plugins/omnimux/src/client/workbench.test.js` :: `default focus matrix: canvas and all libraries default to gui (Issue #2006)`
  原断言：`WORKBENCH_OCCUPANTS.length` 严格等于 11。
  必须改的理由：`omnimux-automation:workbench` 随插件退役从 `WORKBENCH_OCCUPANTS` 移除（见上文 1.1），占用者数量由 11 变为 10。断言若保持 11 会要求保留一个已不存在的 Tab。
  新期望证据：改为严格等于 10；同时该用例继续逐一验证其余 9 个库 Tab 仍默认 `gui` 且被识别为 workbench tab，覆盖面无削减。

- `tests/e2e/alpha-more-menu-badge.e2e.test.mjs` :: `E2E: Alpha 判定真源仍是生命周期注册表，菜单面不复制第二份名单`
  原断言：`alphaPlugins.length >= 5`。
  必须改的理由：Alpha 名单唯一真源 `plugins/omnimux/src/plugin-lifecycle.json` 已移除 `omnimux-automation`（见上文 1.1），名单剩 4 项，`>= 5` 不再成立。
  新期望证据：改为 `>= 4`；该用例仍断言菜单面不复制第二份名单、只读生命周期注册表，判据性质不变。

### 退役 omnimux-automation 引起的既有用例移除

下列用例随 `plugins/omnimux-automation` 目录整体退役而消失：该插件能力已由官方
`@deepseek-ai/dsh-client-ui-schedule` 提供（见 1.1 的 asar 证据）。保留针对已删代码的用例
只会在装载期失败，不构成有效覆盖。新期望证据：官方 schedule 能力由底座自带测试保障，
本仓不再重复覆盖；退役后引用清零由 `rg` 与注册表校验证明。

- `plugins/omnimux-automation/src/client/helpers.test.js` :: `formatDuration 在缺少端点或倒挂时不给假时长`
- `plugins/omnimux-automation/src/client/helpers.test.js` :: `formatRelativeTime 区分将来与过去，非法时间原样返回`
- `plugins/omnimux-automation/src/client/helpers.test.js` :: `formatSchedule 覆盖七种计划类型，缺一不可`
- `plugins/omnimux-automation/src/client/helpers.test.js` :: `formatWithin 用「还有多久」口径，过去时间显示为此刻`
- `plugins/omnimux-automation/src/client/helpers.test.js` :: `一次性任务只按任务时区渲染，宿主时区换了也不漂移`
- `plugins/omnimux-automation/src/client/open-session.test.js` :: `会话 id 为空时不做任何动作`
- `plugins/omnimux-automation/src/client/open-session.test.js` :: `会话 id 只来自调用方，打开器不拼接也不猜测`
- `plugins/omnimux-automation/src/client/open-session.test.js` :: `先在宿主登记会话，再打开；宿主簿缺条目时刷新后重试`
- `plugins/omnimux-automation/src/client/open-session.test.js` :: `宿主会话簿缺席时打开器静默降级，不抛异常`
- `plugins/omnimux-automation/src/client/open-session.test.js` :: `宿主簿已有条目时不再多刷一次`
- `plugins/omnimux-automation/src/client/open-session.test.js` :: `宿主簿晚一步到位时按 1s 退避重试，重试成功后返回 true`
- `plugins/omnimux-automation/src/client/open-session.test.js` :: `没有刷新入口时只尝试一次，不进入退避循环`
- `plugins/omnimux-automation/src/client/open-session.test.js` :: `登记与刷新都补不上时，重试一轮后放弃，不无限循环`
- `plugins/omnimux-automation/src/client/prefill-chat.test.js` :: `contenteditable 优先走 execCommand("insertText")，不再退回 textContent`
- `plugins/omnimux-automation/src/client/prefill-chat.test.js` :: `execCommand 不存在时（jsdom 等环境）直接走 textContent 通道`
- `plugins/omnimux-automation/src/client/prefill-chat.test.js` :: `execCommand 返回 true 但内容未改变时退回 textContent 并派发 input 与 change`
- `plugins/omnimux-automation/src/client/prefill-chat.test.js` :: `seat 内的 textarea 仍然可用：写入派发冒泡的 input 事件`
- `plugins/omnimux-automation/src/client/prefill-chat.test.js` :: `写入成功后光标落在草稿末尾`
- `plugins/omnimux-automation/src/client/prefill-chat.test.js` :: `只读或禁用的候选被跳过，回退到下一个可写座位`
- `plugins/omnimux-automation/src/client/prefill-chat.test.js` :: `缺少 document 时安全返回 false`
- `plugins/omnimux-automation/src/client/prefill-chat.test.js` :: `草稿写进底座 composer 座位的 contenteditable，而不是页面上更早出现的孤立 textarea`
- `plugins/omnimux-automation/src/client/prefill-chat.test.js` :: `页面上没有可写输入框时返回 false，不抛异常`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `adopt/forget 走对应端点且不触发额外刷新路径以外的副作用`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `markRunRead 打到 mark-read 端点`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `setActive 幂等：重复同值调用不重建计时器`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `visible=false（setActive(false)）会停表并保留最后一次快照`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `会话对账只覆盖未完成与最近 24 小时完成的运行`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `传输层错误识别不吞业务错误`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `前台订阅会挂轮询表，取消订阅后停表`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `变更后先本地补齐再刷新，删除立即从快照摘掉`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `没有前台订阅时保持低频轮询`
- `plugins/omnimux-automation/src/client/runtime.test.js` :: `轮询间隔按是否有排队/运行中的任务切换`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `「已完成」胶囊只命中一次性且已跑完的任务，契约未新增枚举`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `三段固定排序：开启（按下次执行升序）→ 暂停 → 已完成`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `会话 id 集合只收非空字符串`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `列表行视图模型携带派生状态、周期摘要与运行中标记`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `同段内无下次执行排组尾，暂停与已完成为 updatedAt 降序，同值按 id 升序`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `启停开关映射与总览行只依赖任务定义`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `孤儿任务在执行记录里也保留，不丢历史`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `定时会话 id 前缀是上游兼容契约，不得改动`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `定时会话识别覆盖前缀、仍挂快照与时间戳标题三种情况`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `已删除任务的历史运行仍按孤儿任务分组，名称取快照`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `归档立即摘掉链接，缺席不等于已删除`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `执行记录视图按任务携带状态、触发类型与按任务时区渲染的时间`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `按任务分组只保留真正产生过会话的运行，并按执行时间倒序`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `搜索只匹配任务名并忽略大小写与首尾空格，清空即恢复`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `标题兜底与时间戳归一不制造假数据`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `派生状态：一次性且无下次执行才是已完成，暂停优先于已完成`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `草稿投影只取真正参与提交的字段，避免「打开即脏」与「切周期后假脏」`
- `plugins/omnimux-automation/src/client/schedule-model.test.js` :: `运行历史按 startedAt ?? scheduledFor 倒序，无会话的行保留为灰态`
- `plugins/omnimux-automation/src/domain.test.js` :: `创建定义会规范化计划、生成 RRULE，并默认只读`
- `plugins/omnimux-automation/src/domain.test.js` :: `存储域规格与上游逐字段一致`
- `plugins/omnimux-automation/src/domain.test.js` :: `并发数量兼容旧定义、持久化更新，并拒绝无效上限`
- `plugins/omnimux-automation/src/domain.test.js` :: `暂停会提升 revision；计划 occurrence 使用确定性 run id`
- `plugins/omnimux-automation/src/domain.test.js` :: `更新定义会增加 revision`
- `plugins/omnimux-automation/src/domain.test.js` :: `空名称或无效时区会被拒绝`
- `plugins/omnimux-automation/src/domain.test.js` :: `间隔定义接受一分钟并拒绝不足一分钟`
- `plugins/omnimux-automation/src/executor.test.js` :: `firstSeq 之前的 turn/start 不算开始，摘要保持为空`
- `plugins/omnimux-automation/src/executor.test.js` :: `readSessionEvents 优先取快照函数，其次取 events 字段`
- `plugins/omnimux-automation/src/executor.test.js` :: `settlesWithin 在时限内完成返回 true，超时返回 false 且不吞异常`
- `plugins/omnimux-automation/src/executor.test.js` :: `信号已中止时运行直接判为 cancelled，不触碰工作区`
- `plugins/omnimux-automation/src/executor.test.js` :: `工作区目录不可用或已变更时判为 failed`
- `plugins/omnimux-automation/src/executor.test.js` :: `摘要取首条 turn/start 之后的最后一条助手文本，非文本块不参与拼接`
- `plugins/omnimux-automation/src/executor.test.js` :: `摘要只取首个 turn/start 之后的最后一条助手文本，并带出结束原因`
- `plugins/omnimux-automation/src/executor.test.js` :: `无人值守权限同时设置预设与 never 审批策略`
- `plugins/omnimux-automation/src/executor.test.js` :: `没有开始回合时摘要为空，不臆造内容`
- `plugins/omnimux-automation/src/executor.test.js` :: `目标工作区不存在时判为 failed 且给出 workspace_not_found`
- `plugins/omnimux-automation/src/index.test.js` :: `Config 默认值与插件注入列表保持契约`
- `plugins/omnimux-automation/src/index.test.js` :: `Full access 的 never 策略不强制 ask，避免静默拒绝`
- `plugins/omnimux-automation/src/index.test.js` :: `Read Only / Workspace Write 的 ask 策略会走官方授权`
- `plugins/omnimux-automation/src/index.test.js` :: `会话策略优先读 override，否则回退配置默认值`
- `plugins/omnimux-automation/src/index.test.js` :: `未挂载的 Agent、非变更工具与已中止信号都不弹窗`
- `plugins/omnimux-automation/src/permission-presets.test.js` :: `已知预设原样通过，首尾空白被裁剪`
- `plugins/omnimux-automation/src/permission-presets.test.js` :: `旧写法 full-access 会被归一为 danger-full-access`
- `plugins/omnimux-automation/src/permission-presets.test.js` :: `未知预设、空值与非法类型一律拒绝`
- `plugins/omnimux-automation/src/prompt.test.js` :: `工具描述和系统提示必须点名定时任务，并禁止默认建议 cron`
- `plugins/omnimux-automation/src/prompt.test.js` :: `用户说创建定时任务时应走 automation_create，而不是操作系统 cron`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `一分钟间隔按分钟触发并拒绝零值和小数`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `每周计划按标准化星期顺序生成 RRULE`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `每周计划遇到不存在的夏令时时刻后仍能找到上一次有效到期点`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `每天计划保持本地墙钟时间并跳过不存在的夏令时时刻`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `每小时 latestDue 必须取满载窗口中的最近到期点`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `每小时计划按分钟对齐`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `每月 31 日计划在短月之后仍能找到最近一次到期点`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `每月计划跳过不存在的日期`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `计划语义判等不受对象字段顺序和星期顺序影响`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `长周期自定义计划恢复时仍能找到最近一次到期点`
- `plugins/omnimux-automation/src/recurrence.test.js` :: `间隔计划不会在创建当即触发`
- `plugins/omnimux-automation/src/run-title.test.js` :: `会话标题是「执行时间 + 任务名」`
- `plugins/omnimux-automation/src/run-title.test.js` :: `无效时间戳原样返回，不制造假时间`
- `plugins/omnimux-automation/src/run-title.test.js` :: `未知时区回退到原 ISO，不抛异常`
- `plugins/omnimux-automation/src/run-title.test.js` :: `运行时间戳按任务时区渲染（Host 与客户端共用同一真源）`
- `plugins/omnimux-automation/src/tools.test.js` :: `exec.agent 不是本工具挂载的 Agent 时返回 cancelled，不落库`
- `plugins/omnimux-automation/src/tools.test.js` :: `run_now 与 delete 走服务边界并把错误降级为 automation_error`
- `plugins/omnimux-automation/src/tools.test.js` :: `工具统一以 JSON 输出并返回 { ok } 信封`
- `plugins/omnimux-automation/src/tools.test.js` :: `权限枚举来自 Host 当前列表，不写死`
- `plugins/omnimux-automation/src/tools.test.js` :: `注册 6 个标准 Agent 工具，名称与上游逐字一致`
- `plugins/omnimux-automation/src/tools.test.js` :: `计划字段必须与 kind 精确匹配：缺字段与多余字段都被拒绝`
- `plugins/omnimux-automation/tests/e2e/split-button-hover.e2e.test.mjs` :: `E2E: 分裂创建按钮左右半边必须统一采用 primary-fill 主底色，消除深暗割裂`
- `plugins/omnimux-automation/tests/e2e/split-button-hover.e2e.test.mjs` :: `E2E: 分裂创建按钮悬停必须使用 primary-hover 浅色高亮，严禁出现深黑硬块`
- `scripts/automation-alpha-verification.test.mjs` :: `all 6 automation tools match the alpha tool prefix`
- `scripts/automation-alpha-verification.test.mjs` :: `alpha-release contract document documents omnimux-automation`
- `scripts/automation-alpha-verification.test.mjs` :: `omnimux-automation is registered as an Alpha plugin with correct tool prefixes`
- `tests/e2e/automation-detail-autosave.e2e.test.mjs` :: `E2E: 定时任务详情自动保存与保存按钮移除契约验证`
- `tests/e2e/automation-detail-grouped-cards.e2e.test.mjs` :: `E2E: 定时任务详情页同分类分组卡片样式契约验证`
- `tests/e2e/automation-detail-large-radius-cards.e2e.test.mjs` :: `E2E: 定时任务详情分组卡片与指令卡片 16px 标准大圆角契约验证`
- `tests/e2e/automation-detail-polish.e2e.test.mjs` :: `E2E: 定时任务详情页现代极简深色 UI 风格契约验证`
- `tests/e2e/automation-master-list-ui-polish.e2e.test.mjs` :: `E2E: 定时任务记录栏 1:1 风格复刻契约验证`

### 仍存在文件中的用例改写

- `plugins/omnimux/src/client/workbench/sidebar-activation.test.js` :: `native tab keys map through the three-tier tolerance`
- `plugins/omnimux/src/client/workbench/sidebar-activation.test.js` :: `rule 2: the focused native tab owns the slot, and only that row`
- `plugins/omnimux/tests/e2e/tab-viewport-native-reconciler.spec.js` :: `AC-6: 自动化 Tab 身份收敛与侧栏激活仲裁验证 (Issue #2046)`
- `scripts/sync-release-policy.test.mjs` :: `uses the lifecycle registry as the exact Alpha plugin and tool-prefix source`
- `tests/e2e/alpha-more-menu-badge.e2e.test.mjs` :: `E2E: Alpha 判定真源仍是生命周期注册表，菜单面不复制第二份名单`
- `tests/e2e/director-acceptance-3289.e2e.test.mjs` :: `director acceptance harness keeps the fresh task-source installation contract`

## 假设

1. 官方底座确实自带定时任务能力，因此退役 `omnimux-automation` 不会造成能力缺失。
2. 已发布 tarball 中的 `MARKET_ASSET_CDN` 逻辑是线上正在运行的行为，回植它是让源码追上线上，而不是新增功能。
3. 111 个封面在 CDN 上的可访问性长期有效，移除本地副本不会导致市场页破图。

## 证伪方式

1. **能力缺失**：若在装有本仓插件的环境中，退役后「定时任务」入口与 `schedule` 相关工具全部消失且官方无替代，则假设 1 被证伪。验证：核对底座 asar 内 schedule 包清单，并在 Dev 环境检查该入口是否由官方提供。
2. **回植不等价**：若回植后的 `catalogAssetUrl` 对同一输入返回与已发布产物不同的结果，则假设 2 被证伪。验证：对 `catalog/covers/x.png`、`catalog/../etc/passwd`、`catalog/`、`catalog/a b.png` 四类输入比对新旧实现输出。
3. **破图**：若删除本地封面后任一封面请求返回非 200，则假设 3 被证伪。验证：对 111 个路径逐一 `curl -sI https://dl.omnimux.ai/market/covers/<rel>`，全部须 200；并跑 `home-cover.test.ts` 走 CDN 分支。
