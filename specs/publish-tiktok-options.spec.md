# 3969 TikTok 发布选项（重新落地 #3963 实现）

Issue: #3969 · 分支 `agent/publish-tiktok-options2-issue-3969` · 风险等级 **R2**（发布页 + 提交参数）

## 背景

#3963 的实现已在本地验证通过，但 PR #3965 提交时暂存区只包含证据文件，合并后主分支没有源码改动；工作树清理后实现丢失。本任务按原规格重新落地。

原背景：网关 `POST /api/social/v1/posts` 已支持 `tiktok_options`，并提供 `GET /api/social/v1/accounts/:id/creator-info` 返回 `privacy_level_options` 与互动禁用标记。桌面端不传这些字段，默认 `SELF_ONLY`，审核通过后无法选择公开。

## 方案

1. `src/shared/tiktok-options.js`（Host/客户端共用）：归一化、`privacyChoices(creatorInfo)`、`buildCreateTikTokOptions`、`tiktokOptionProblems`。
2. Hub 新增工具 `omnimux_accounts_creator_info`（`official/publish.js` + `official/mount.js`）。
3. Host：`hubtools.creatorInfo`、`GET /omnimux/publish/creator-info`、`submit`/`retry` 透传 `settings.tiktok_options`、提交前校验非法组合。
4. 客户端：发布页「TikTok 发布选项」区块（隐私级别按 creator-info 渲染、评论/合拍/拼接、商业披露、音乐确认）；草稿保存/恢复；非法组合禁用提交。
5. 详情页「仅自己可见」提示改为按实际隐私级别显示。

## 假设

- creator-info 的 `privacy_level_options` 就是当前账号可选项；为空才回退全量四项。
- 未审计沙盒只返回 `SELF_ONLY`，因此 UI 只显示「仅自己可见」。
- `music_usage_confirmed` 只在勾选后发送，未勾选保持网关缺省行为。

## 证伪方式

- 单测：归一化/payload/非法组合/草稿透传。
- 浏览器实测：未审计只有一项隐私级别；已审计可选公开并写入草稿 `settings.tiktok_options`；账号禁用项置灰。
- 沙盒实测（可选）：选公开在未审计账号上被 TikTok 拒绝并原样回显错误。

## 新用户基线

默认 `SELF_ONLY`；不新增密钥或配置；creator-info 读取失败回退全量选项，不阻断发布。

## 文档影响

`plugins/omnimux-publish/docs/hub-tool-contracts.md` 记录 `tiktok_options` 与 creator-info 的关系。

## 旧标准变更

- `plugins/omnimux-publish/tests/e2e/publish-tiktok-flow.e2e.test.mjs` :: `shows the pre-review private-visibility notice for a live TikTok direct subtask`

- `plugins/omnimux/src/host/apply.test.js` :: `registers all 54 tools and 20 seams by default`

- `plugins/omnimux/src/official/mount.test.js` :: `registers official tools by default`

- `plugins/omnimux/src/official/mount.test.js` :: `skips fine-grained tools when gate.tools.<name> is false`

apply.test 原断言默认工具数 54，新增 `omnimux_accounts_creator_info` 后为 55；mount.test 原断言官方工具数 41、关闭 2 个后 39，新增同一工具后为 42 / 40。三处都只把计数加一，用例语义与其余断言不变；新期望证据为 Hub 工具注册数从 41 增至 42（`pnpm --filter omnimux test` 与 `pnpm test:agent-tools`）。

原断言 `assert.match(recordDetailSrc, /showsPrivateNotice\(tasks\)/)`；提示改为按隐私级别显示后调用点变为 `showsPrivateNotice(tasks, record)`，新期望正则 `/showsPrivateNotice\(tasks, record\)/`，并新增「公开级别不显示提示」断言。
