# #3112 账号监控 · 导入后即时首采与进度承诺（实施规格）

> 真源优先级：规格字典（docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md §3）> 票面 #3112 > 实现参考（plan-notes §5）。
> 本文件是实施侧的工作规格：用户操作旅程、可测验收标准与边界；文案逐字以规格字典为准。

## 1. 目标

用户导入监控账号后：立即触发首采（Host 已满足，不动服务端）→ 空态显示进度承诺（`正在为你抓取内容` + 细线进度条 + `首次采集约需 1 分钟，完成后内容会自动出现在这里。`）→ 采完内容自动出现，无需手动刷新 → 失败/超时给出可理解提示与重试入口 → 空态常驻 `去逛逛爆款趋势` 分流出口。

## 2. 用户操作旅程

1. 用户在账号监控 Tab（或无账号态）导入账号 → 弹窗关闭、Toast `已添加监控账号 {handle}`。
2. 内容区进入 E2 首采空态：标题 + 描述 + 细线进度条 + `去逛逛爆款趋势`；不显示筛选行。
3. 客户端按 E1 `config_summary.poll_interval_ms` 轮询：存在 `queued|running` 账号则继续，采完自动重读第 1 页，内容直接出现。
4. 账号变 `error`/`backoff` 且该账号尚无帖子 → 空态切失败态：`已停止` + `连续 {n} 次刷新失败` 或 `刷新过于频繁，{n} 分钟后可再次刷新。` + `重试` 按钮。
5. 点 `重试` → 调 `POST /rival-accounts/:id/refresh` 重新入队 → 回到 E2 首采空态。
6. 轮询达到上限（承诺时长×1.4÷间隔，约 40 次）仍无结果 → 失败态 `导入失败，请稍后重试` + `重试`（重试=重新启动一轮有界轮询）。
7. 点 `去逛逛爆款趋势` → 切到爆款趋势 Tab（复用外壳 Tab 切换）。

## 3. 验收标准（可测）

- AC1 导入成功立即入队首采：Host 既有（importAccount → enqueue(mode:'first') → 同步 drain()），本票不改服务端。
- AC2 E1/E2 空态文案逐字：`正在为你抓取内容`、`首次采集约需 {n} 分钟，完成后内容会自动出现在这里。`（n=1）、`去逛逛爆款趋势`、`还没有监控账号`、`导入 1 个对标账号，约 1 分钟后这里会出现按爆发力排序的内容。`。
- AC3 存在 `queued|running` 账号且监控 Tab 激活时按 `poll_interval_ms` 轮询；无活动账号时零定时器；卸载即清理。
- AC4 无 `queued|running` 且该账号 `post_count>0` → 内容自动出现（最后一次 load 重读第 1 页）。
- AC5 `error|backoff` 且 `post_count=0` → 失败态含原因文案与 `重试`；不无限转圈（轮询有上限）。
- AC6 成本契约不变：一次导入一次 reserve（2 次云调用）；重复导入无 force 0 次；轮询只读 E1/E15，零新增云调用。
- AC7 全部可见文案逐字取自规格字典或 locales 既有键；无字典外文字、无装饰图标。

## 4. 命令

- 单测：`cd <worktree>/plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs --test src/client/rival-fetch-watch.test.js src/client/use-rival-feed-poll.test.js src/client/feed-empty-kind.test.js src/client/rival-first-fetch.e2e.test.js`
- 全量：`pnpm --filter omnimux-inspiration test`

## 5. 结构

- 新增 `src/client/rival-fetch-watch.js`（纯函数：活动态判定、失败判定、轮询预算）。
- 改 `src/client/use-rival-feed.js`（受控轮询）、`RivalAccountsPanel.jsx`（emptyKind 拆分）、`RivalFeedGrid.jsx`（E2/失败空态）、`locales.js`（字典键）、`rival-styles.js`（进度条/空态链接样式）、`rival-api.js`（refreshRivalAccount）、`InspirationSection.jsx`（分流回调）。

## 6. 测试策略

- 纯函数单测：rival-fetch-watch（判据与预算）；feedEmptyKind（三档拆分）。
- hook 级：useRivalFeed 轮询启动/停止/上限/清理（node:test + 假 fetch，定时器用短间隔注入）。
- e2e（jsdom 全链路）：导入→E2 渲染→完成自动出现→失败→重试回 E2。
- 真实浏览器截图：harness 脚本驱动功能路径（E1→导入→E2→内容出现→失败→重试），亮暗两套。

## 7. 边界

- 总是：文案逐字取字典；共享文件（InspirationSection/locales/rival-styles）只做追加式改动；测试先红后绿。
- 先问：改 Host 行为、新增端点（本票只加一个已有端点的客户端包装）、新增可见文案键以外的文案。
- 绝不：新增云调用；把 `mode:'first'` 改成 manual；常驻无界定时器；改 `InspirationCoverCard`/`styles.js`。
