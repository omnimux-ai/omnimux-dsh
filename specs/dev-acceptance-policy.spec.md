# 规格说明：Agent 验收基准改为「隔离工作树 Web 验证」（开发版真机验收归人工）

**文件：** `specs/dev-acceptance-policy.spec.md` ｜ **优先级：** P0

## 1. 背景与用户约定

多工作树并发时，共享的开发版应用（Dev Desktop，端口 45120）是**单实例**资源：多个 Agent 同时抢占会互相覆盖物化产物、争抢实例锁，客观上无法并行执行。用户明确约定：

> **Agent 不再承担开发版真机验收；只要在各自独立的隔离工作树完成了真实浏览器 Web 验证，即视为达到验收预期。开发版真机验收由人工（用户本人）执行。**

## 2. 现状审计（变更前）

开发版真机验收在当前体系中被**三层强制**：

| 层级 | 位置 | 现状 |
| --- | --- | --- |
| 常驻规则 | 仓库 `AGENTS.md` 验证节与交付节 | 要求 UI 变更「合并后必须用 ego-browser 在 Dev 45120 取共享探针证据」；「拿不到 Host 正常运行证据不得宣布收尾」 |
| 合同文档 | `docs/contracts/*`（plugin-qa、plugin-git-pr、dev-pipeline、agent-issue-lifecycle、stage-guards、hmr、first-level-page-layout、generation-node-policy、openreel-vendor-contract、agent-workbench-sync、client-ui-remediation、ui-design-guidelines）、`docs/standards/dev-app-cdp-acceptance.md` | 一致把「合并后 Dev 45120 验收」列为 UI 类变更的交付前提 |
| 流水线代码 | `scripts/impact-matrix.mjs`、`scripts/auto-pipeline.mjs` | 代码级强制：UI 变更标记 `Dev: required`，交付流程要求「物化并完成 Dev 45120 验收前不得声明成功、不得清理现场」 |

## 3. 变更设计

### 3.1 验收基准切换
- **Agent 侧验收证据**改为：在**本任务独立工作树**内，用真实浏览器（ego-browser 或工作树隔离 Web 验收驱动，动态端口、测完即焚）完成界面渲染与交互验证，并留存截图/结构化报告。
- **开发版真机验收**改为：**人工职责**。Agent 不得把它作为交付卡点、不得等待它、不得阻塞在它上面，也不得把它记作自己的验收证据。

### 3.2 物化（sync）定位调整
- 物化仍**允许**由 Agent 执行（供人工在开发版上实机查看），但**不再是交付完成的必要条件**，也不再与「必须取得 Dev 运行时证据」绑定。
- 物化仍保留既有多 Agent 防覆盖守卫（防并发互相冲刷），该守卫不因本变更放宽。

### 3.3 流水线代码调整
- `impact-matrix.mjs`：UI 变更的交付要求由「Dev 45120 ego-browser 证据」改为「隔离工作树真实浏览器 Web 验证证据」；Dev 真机验收标记为人工职责（不再作为 Agent 的 required 项）。
- `auto-pipeline.mjs`：移除「未完成 Dev 45120 验收即不得声明成功/不得清理」的 Agent 卡点，改为以隔离工作树 Web 验证证据判定交付。

## 4. 验收标准

| # | 场景 | 预期 |
| --- | --- | --- |
| 1 | 检索常驻规则与合同文档，是否仍要求 Agent 做 Dev 45120 验收 | 不再要求；明确写为人工职责 |
| 2 | 检索流水线代码，UI 变更是否仍标记 Dev required | 不再标记；改为隔离工作树 Web 验证 |
| 3 | 隔离工作树内完成真实浏览器 Web 验证 | 满足 Agent 交付验收 |
| 4 | 并发多工作树场景 | 无需争抢开发版单实例；物化防覆盖守卫不受影响 |
| 5 | 相关自动化测试 | 全绿；旧行为断言同步更新 |

## 5. 边界

- 不改变生产发布授权、真实支付人工边界、密钥与凭证边界。
- 不删除既有历史验收证据文档（`docs/evidence/**` 属历史记录，不回改）。
- 壳层/平台门控改动的 Electron 证据要求不在本次范围内，维持原状。
