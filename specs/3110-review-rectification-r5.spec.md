# 3110 账号监控 v2 第五轮整改规格（第三轮复审遗留 + 新发现）

- 关联：PR #3140 / Issue #3110；复审报告 `docs/evidence/account-monitor-v2-cards-3110/pm-signoff-3.md`
- 日期：2026-10-05；工作树 `.worktrees/account-monitor-v2-cards-issue-3110`，分支 `feat/account-monitor-v2-cards-issue-3110`

## 1. 目标

修复第三轮复审新发现的 9 项缺陷，其中两条会抵消本 PR 自己的核心承诺（`ratio` 落库保持、详情弹窗封面渲染）。本规格只覆盖第五轮整改项，不扩张范围。

## 2. 用户操作旅程与期望反馈

1. 账号刷新时，上游行不带 `ratio` → 已落库的实测宽高比**保持不变**（不被覆写为 null），卡片比例不回退默认值。
2. 用户在作品卡片点「详情」→ 弹窗**真实渲染封面图**（白名单描述符含弹窗可读的封面字段）。
3. 用户悬停无安全 http(s) 原帖链接的卡片 → 「原帖直达」按钮**保留格子但置灰**，title 提示 `rivalFeed.card.originalUnavailable`（zh「原帖链接不可用」/ en「Original link unavailable」）。
4. 正文/标题换行估算：连字符长词、超宽 URL、hashtag、CJK+ASCII 混排、不换行空格（NBSP）与真实浏览器行数差值最小化；不产生同列重叠。
5. 详情弹窗时间在英文层用半角冒号，不出现 `：`。
6. 「立即复刻」在已有一张卡 busy 时点击第二张 → 第二次点击被忽略（重入守卫）。

## 3. 验收用例

- **AC-1**：`buildPostRow` 先落 `{ratio: 1.5}`，再以无 `ratio` 行刷新（`ctx.existing` 带既有行）→ 断言 `ratio === 1.5`。
- **AC-2**：`toRivalCardRow` 输出含 `cover_src`（或弹窗可读字段），`RivalPostPreviewModal` 渲染的 `<img>` 有非空 src。
- **AC-3**：`rivalWrapLines` 对 `a-b-c` 类连字符词与 NBSP 串的估算行数与真机实测一致（差值入报告）。
- **AC-4**：非 http(s) `source_url` 的卡片操作行仍渲染三个槽位，原帖按钮 `disabled` 且 `title` 为字典文案。
- **AC-5**：locale 取真源 `ctx.locale`（可访问时），`rivalLocaleOf` 退为兜底并在头注写明「非语言真源」。
- **AC-6**：`handleReplicate` 在 `busyId` 非空时直接 return；三处 handler 守卫一致。
- **AC-7**：`r4-placement-measure.json` 由 HEAD 代码重新生成：e1/e2/e3 `est` 反映实测估算，`e3 pillRow=false`，`maxAbsDiff` 真实，且新增**同列相邻卡重叠量**字段。

## 4. 边界

- **不做**：胶囊对比度配色（规格与票面 AC 冲突，等用户裁定）；`.clamp-*`/`.t-*` 类名风格；拆解失败文案复用 `attachFailed`（R3-2 明文指定）；`ratio` 生产链路（后端切片）。
- **总是**：①②③④ 先写红测试；④③ 用真机（headless Chrome + CDP）逐卡复验；测试命令记真实退出码；资产层测试回归。
- **绝不**：不 push、不开 PR、不 amend 历史提交。

## 5. 测试策略

- 单测：`rival-accounts-store.test.js`（ratio 保持）、`rival-masonry.test.js`（连字符/NBSP）、`rival-filter.test.js`（cover_src 白名单）、`rival-post-card.test.js`（置灰按钮）、`rival-format.test.js`（locale 兜底语义）。
- 渲染测：`rival-post-preview-modal.test.js` 新文件断言封面 `<img>` 非空 src。
- 真机：docs/evidence `harness/` 重建后重跑 placement-measure + 换行专项复验（连字符/URL/hashtag/混排/空 velocity）。

## 6. 开放问题

- `ctx.locale` 在组件层的可达形式（`ctx.locale.getSnapshot()?.active` vs 字典探针）按本仓 `composer-commands-i18n.js` 先例实现；组件拿不到 `ctx` 时 `rivalLocaleOf` 兜底。
