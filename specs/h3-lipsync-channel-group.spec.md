# 规格说明：MiniMax H3 口型版渠道分组接入与画布落地

## 1. 业务目标与需求背景
用户在做「H3 同人物对口型视频复刻」时发现：创作画布的 MiniMax H3 模型分组里没有对口型版本，导致无法从画布发起对口型生成。网关侧（fal.ai 官方直连渠道 44）已于 2026-09-19 生产上架独立公开型号 `minimax-h3-lip-sync`（上游 `minimax/h3-max/lip-sync/image-to-video`）。本任务在执行中枢（`plugins/omnimux`）为 H3 家族接入「口型版」渠道分组，并同步落地到创作画布（`plugins/omnimux-workflow`）的模型版本档选择面板，实现从画布选择到正确路由的端到端闭环。

## 2. 契约格式与参数规格（以网关真源为准）
- **所属模型**：`minimax-h3`（分组挂在 H3 家族下，画布呈现为第 6 个版本档）
- **分组标识 (id)**：`lipsync`
- **显示名称 (label)**：`口型版`（符合《渠道分组显示名与副标题命名规范》白名单「价值词 + 版」）
- **特性徽标 (badge)**：`音频驱动唇形对齐 · 适合人像口播对白`
- **文字简介 (description)**：`专注音频驱动人像唇形对齐，完美匹配口播短剧、带货解说与虚拟角色对白场景。`
- **上游路由**：`wireModel: "minimax-h3-lip-sync"`，`wireGroup: "default"`（网关渠道 44 真实供给；不存在 `minimax-h3-video-lipsync` 分组，旧草稿接线作废）
- **计费 (pricing)**：按秒 `per_second`，$0.125/秒（1.25 积分/秒），5 秒预估 ≈6.3 积分（`pointsEstimate: 6.3`，`discountRate: 1`）
- **能力约束 (constraints)**：
  - operations：`["digital_human"]`（该型号仅支持对口型图生视频；旧草稿的 first_frame/video_multi_ref 作废）
  - 分辨率：`parameters: { resolution: { only: ["768P", "2K"] } }`（与 H3 家族其余分组一致）
- **模型契约新增操作** `minimax-h3#digital_human`（label 数字人/对口型）：
  - 输入：`character`（人像图片，必填 1 张）+ `driving_audio`（驱动音频，必填 1 条，wav/mp3，≤15 秒）；不强制 prompt
  - 参数：时长 5–15 秒默认 5；分辨率 480P/768P/1080P/2K 默认 768P（画布经分组约束收窄为 768P/2K）
  - 执行档案：`videoDigitalHuman`（已存在，status live，要求 image + audioTrack）
  - 证据：研究 verified（fal.ai 官方模型页）；实现 ready；执行为 stub（网关侧已生产上架，本仓未新增真实请求）

## 3. 关键用户旅程
1. 用户在画布放置视频生成节点，模型选 MiniMax H3 → 版本档列表出现「口型版」及场景简介。
2. 选「口型版」后生成方式只剩「数字人/对口型」，节点呈现人物图片槽与驱动音频槽。
3. 用户接入人像首帧与音频（如 12 秒样片音轨），提交后请求以 `minimax-h3-lip-sync@default` 候选路由到网关对口型专线，载荷为 image + audioTrack，提交守卫放行。
4. 未选口型版时，H3 其余 5 档行为不变（回归保护）。

## 4. 改动影响面与跨插件对齐
1. **规范与门禁**：`docs/contracts/channel-group-naming.md` 增补「口型版」；`scripts/verify-channel-group-naming.mjs` 白名单同步增补并加固镜像解析（沿用旧草稿）。
2. **执行中枢**：`channel-groups.js`（第 6 档）、`pricing-calculator.js`（minimax-h3-lip-sync 按秒价目）、`id-universe.js`（wire 型号别名）、`video-models.yaml`（digital_human 操作）、相关单测（channel-groups/model-capabilities/coverage/gateway-truth-reconciliation/pricing-calculator）。
3. **创作画布**：`channelGroups.ts`（镜像第 6 档 + description）、`ModelCascadeMenu.tsx`（版本档行渲染场景简介，沿用旧草稿）、`channelGroups.test.mjs`、`tests/e2e/channel-group-naming.e2e.test.mjs`（六档命名断言）。
4. **新用户基线**：功能不依赖任何开发机私有状态；网关未供给 `minimax-h3-lip-sync` 时提交按既有失败语义报错，不静默回退。

## 5. 验收标准
- [ ] `node scripts/verify-channel-group-naming.mjs`（或对应 pnpm 脚本）绿灯。
- [ ] `pnpm verify:model-contracts` 绿灯。
- [ ] 中枢 `channel-groups.test.js`、画布 `channelGroups.test.mjs`、e2e `channel-group-naming.e2e.test.mjs` 全绿（含 6 档、lipsync 路由候选 `minimax-h3-lip-sync@default`、按秒计费断言）。
- [ ] 契约索引中 `minimax-h3#digital_human` 达到 listed。
- [ ] 提交守卫对 digital_human（image + audioTrack）映射断言通过。
- [ ] `pnpm hub:interfaces` 重新生成接口全景面板。
