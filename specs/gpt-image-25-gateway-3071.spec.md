# GPT Image 2.5 最新网关对齐（#3071）

## 1. 目标与成功标准
用户要求先证明真实可用，再将最新上游变更接入执行中枢。仅处理 GPT Image 2.5 的官方线路与已有消费端，不创建第二路由器或新派生模型。
- AC1：保存核对日期、当前线上官方文档 URL、公开价格和分组；相互冲突的文档明确保留冲突，不用旧记录覆盖当前事实。
- AC2：先通过已有凭据进程注入发起最小单张出图；最多每个待核定线路一次，不以失败重试探测能力。留存请求参数、状态、实际输出、可解码文件、请求次数；只有取得真实文件才记可用。
- AC3：中枢请求参数与已确认的所选线路契约一致；标准版与经济版不能静默互换，不把服务存活或模拟响应标为真实生成。
- AC4：修改后的目录、所选渠道限制、请求映射、所有消费端参数/默认值与共享目录保持一致；本任务不自动开放文档尚未确认的模式。
- AC5：完成相关离线测试、任务隔离的真实运行/必要功能浏览器验证和独立评审；PR 通过 required CI 与 Merge Queue 后才物化 Dev。
- AC6：清理本任务临时进程与已合并工作树；不改生产或上游仓库，不重启桌面应用。

用户旅程：已登录用户选择 GPT Image 2.5 → 选择实际线路 → 填入合规提示词和该线路允许的参数 → 单次提交 → 原任务等待/收取 → 显示可解码图片；未知或拒绝明确报错且不重复付费提交。未配置 API 凭据的新用户收到明确缺少凭据提示，不回退到本机私有服务。

## 2. 命令
最小检查候选（以最终影响面收敛）：
- `node scripts/impact-matrix.mjs --git-diff --base origin/main`
- `node scripts/verify-model-contracts.mjs --strict`
- `node scripts/verify-cross-plugin-model-alignment.mjs`
- `node scripts/verify-product-baseline.mjs`
- `node scripts/verify-plugin-boundaries.mjs`
- `corepack pnpm --filter omnimux test`
- 相关下游提交测试；仅 UI 变化使用工作树真实功能浏览器证据。
- `node scripts/generate-hub-interfaces-html.mjs`
- `git -C <task-worktree> diff --check`

## 3. 结构与复用
能力真源：`plugins/omnimux/src/catalog/specs/image-models.yaml`。
线路真源：`plugins/omnimux/src/catalog/serving/channel-groups.js`。
请求映射：`plugins/omnimux/src/catalog/contract/submit-guard/map.js`；提供方字段仍限定在映射与协议层。
协议/执行：现有 `src/media/protocols/openai-media.js`、vendor map 与执行账本，不创建平行客户端。
消费端：Workflow 渠道镜像、Viewer 参数后备以及 Apps 支持白名单，只改实际受影响行。
证据：本任务 `.agent-reports/` 与 `docs/evidence/`；规格在本工作树随代码提交。

## 4. 风格与契约
沿用 ESM/具名导出/JSDoc；临界输入和输出显式类型。真实映射示例采用当前已有函数签名 `mapValidatedPlanToVendor(args)`，输出仍为既有 vendor payload，不扩展中枢公开请求以容纳渠道内部细节。错误沿既有 OmnimuxError 传播，不吞错。

## 5. 验证与测试策略
先阅读与最小真实可用性验证，再修改实现；实现后先运行生产函数验证实际发包与结果世界态，再固化正式离线回归。文档支持、实现覆盖、本次真实执行三类事实分开。
真实测试预算：每个待核定线路最多一次单张，任何未知已受理状态仅收取原任务，不自动重提；参考素材只允许公开 HTTPS。绝不输出/落盘真实密钥、完整认证 URL 或签名信息。
浏览器验证使用本任务工作树动态端口且自清理；共享 Dev 的人工验收不作为 Agent 条件。文档影响：更新任务规格与精确渠道来源证据；既有通用合同不改其授权边界。

## 6. 边界与阶段
总是：先核对最新官方来源；测试先于接入；隔离实现；完整错误传播；只暂存本任务改动。
先问：缺失且无法安全复用的凭据引导、超出最小测试预算、上游或生产写入。
绝不：真实付款/充值、修改生产、修改上游仓库、重启桌面、伪造可用性、静默换线路、按单样本收窄/扩大官方能力。

阶段：Spec → 文档/真实可用性 → Code → Verify → Test → Green → PR/MQ → Dev 物化/清理。
当前假设：线上官方文档存在历史与现行内容混杂，需要精确定位最新分组契约；不会依据模型名字或旧脚本默认值猜字段。
