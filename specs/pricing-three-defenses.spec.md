# 基础设施计费三道防线与永久免疫架构规范 (Pricing Three Defenses Spec)

- 任务工作树：`.worktrees/implement-pricing-three-defenses`
- 分支：`agent/implement-pricing-three-defenses`
- 对应基线：`origin/main` @ `5c64326fa`
- 日期：2026-09-18

## 1. 背景与目标

为了从根本上杜绝「内部排序权重被误当成真实扣费积分展示给用户」以及「AI 依葫芦画瓢扩散虚假数据」的历史顽疾，本项目建立三道确定性物理防线，形成永久免疫基础设施：
1. **第一道防线：算价真源单轨化** —— 基于平台统一定价引擎，提供客观算价推导能力，消除手工随手填假数字的盲区；
2. **第二道防线：计费真实性自动化物理门禁** —— 在质量门禁（`verify-model-contracts` 与 `test:gates`）中新增计费核验门禁，代码提交与 CI 时现场验算每条线路积分，偏离真实计费即物理阻断；
3. **第三道防线：算法排序权重与对外展示积分彻底解耦** —— 拆分 `sortWeight` 与 `pointsEstimate`，杜绝算法参数被直接当成用户报价的架构混淆。

## 2. 详细设计与实现标准

### 支柱一：定价计算引擎标准化与推导能力
- 在 `plugins/omnimux/src/catalog/pricing-calculator.js` 中补充 `resolveGroupEstimatedPoints(modelId, group)` 函数：
  - 提取 `wireModel || modelId`；
  - 结合 `MODEL_BASE_PRICING` 中该模型的计量单位（`per_second` / `per_task` / `per_token`）与单价；
  - 结合 `group.pricing` 声明的倍率与基准时长（视频 5 秒），严格按照 `1 USD = 10 Points` 汇率计算标准预估积分；
  - 返回精确数值（如 0.2、0.3、3.6、4.9、16）。

### 支柱二：定价真实性校验机械门禁 (Pricing Integrity Gate)
- 创建 `scripts/verify-pricing-points-integrity.test.mjs`：
  - 扫描中枢 `channel-groups.js` 与画布 `channelGroups.ts` 的全部模型；
  - 对已在网关基准价目表登记的所有模型，逐条对比 `pointsEstimate` 与动态算价结果：
    `Math.abs(declared - calculated) <= 0.1` 必须严格成立；
  - 设立异常熔断红线：所有非 token 模型（视频、图片、音频）的预估积分不得出现 > 100 的历史虚高残余值；
  - 校验两端（中枢与画布）配置的积分必须 100% 逐字严格相等；
  - 挂载至 `package.json` 的门禁流程与 `scripts/verify-cross-plugin-model-alignment.test.mjs`，只要有任何偏差立即抛错中断提交。

### 支柱三：排序权重与计费展示结构解耦
- 在 `ChannelGroupItem` 类型中增加可选字段 `sortWeight?: number`；
- 修改 `plugins/omnimux/src/catalog/serving/channel-groups.js` 与 `channelGroups.ts` 的路由打分排序逻辑：
  - 在按成本排序（`cost_first`）与自动打分时，优先级为 `group.pricing?.sortWeight ?? group.pricing?.pointsEstimate ?? 0`；
  - 将内部算法的权重诉求与对外扣费展示彻底分流，前端卡片仅消费 `pointsEstimate`。

## 3. 验收标准（可测试）

- **AC-1 (自动算价对齐)**：`resolveGroupEstimatedPoints` 能准确计算 MiniMax H3、Seedance 2.5、Seedance 2.0、GPT Image 2.5 各分组真实积分。
- **AC-2 (物理门禁拦截)**：当故意将某条线路的 `pointsEstimate` 篡改为 5825、1100 或其他偏离真实金额的数值时，门禁测试立即抛出明确拦截异常并退出非零码。
- **AC-3 (排序权重解耦)**：声明 `sortWeight` 的线路按 `sortWeight` 参与排序，但不影响 `pointsEstimate` 的展示；未声明时正常使用 `pointsEstimate` 排序。
- **AC-4 (门禁全绿与CI通过)**：
  - `node scripts/verify-pricing-points-integrity.test.mjs` 100% 绿灯；
  - `pnpm verify:model-contracts --strict` 100% 绿灯；
  - 两侧单测 100% 绿灯。
