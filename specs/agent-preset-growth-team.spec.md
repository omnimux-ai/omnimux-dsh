# 规范：新增出厂 Agent 预设「增长专家团」

> 任务：Issue #2235 — 在 OmniMux 出厂会话预设中新增第 6 个预设 `marketing-growth-team`。
> 素材真源：资产库 `workbuddyskills/experts/marketing-growth-team`（营销增长专家团，MIT，参考 marketingskills v2.9.x）。
> 默认预设 `omni-agent`（社媒专家）**本次不变**。

## 1. 业务目标与需求对齐

### 1.1 背景
会话模式下拉现有 5 个出厂预设，覆盖社媒出片、短剧、营销战役、日常办公与插件开发，但缺少「以增长操盘为主理人身份」的入口。资产库的营销增长专家团是一套 fCMO 级全栈增长资产（1 位主理人 + 4 位专家 + 68 篇领域参考），产品侧尚无对应预设。

### 1.2 预设映射契约

| Preset ID | 显示名 | 拼音首字母 | order | 默认状态 | 主理人 |
|---|---|---|---|---|---|
| `cordis` | 创建Agent | C (chuàng) | 1 | 备选 | —（既有，不动） |
| `drama-agent` | 短剧专家 | D (duǎn) | 2 | 备选 | —（既有，不动） |
| `daily-work` | 日常工作 | R (rì) | 3 | 备选 | —（既有，不动） |
| `omni-agent` | 社媒专家 | S (shè) | 4 | **默认激活（不变）** | —（既有，不动） |
| `marketing-agent` | 营销专家 | Y (yíng) | 5 | 备选 | —（既有，不动） |
| `marketing-growth-team` | **增长专家团** | **Z (zēng)** | **6** | 备选 | **首席营销策略师「盛全局」** |

命名理由：延续既有「按名称拼音首字母正序」约定（C/D/R/S/Y），`增长专家团` 取 Z 排在末尾，**不与「营销专家」(Y) 同首字母冲突**，因此既有 5 个预设的名称与 order 全部保持原值，无重排风险。

### 1.3 挂载专家契约（4 位）

| 工具名 | 专家 | 职责域 |
|---|---|---|
| `expert_cro_specialist` | 转化率优化师「专化率」 | 落地页与注册流优化、转化文案、A/B 实验、弹窗与付费墙 |
| `expert_seo_content_strategist` | 搜索引擎与内容优化师「索引擎」 | 技术 SEO 审计、AI SEO（AEO/GEO/LLMO）、程序化 SEO、站点架构、内容策略、ASO |
| `expert_growth_engineer` | 增长与获客负责人「曾长洋」 | 付费投放、邮件序列、冷启动外呼、短信、社媒、推荐计划、免费工具、联合营销、社区 |
| `expert_analytics_revops` | 数据分析与营收运营负责人「数据源」 | 埋点实施、归因建模、营收运营、销售赋能、防流失、客户研究 |

主理人本人即团队 Lead（对应素材 `settings.json` 的 `agent: marketing-growth-team-lead`），**不重复挂载自己**。

## 2. 核心架构与模块改动

### 2.1 新增预设真源（`presets/marketing-growth-team/`）
- `preset.yml`：`name: 增长专家团`、`description`、`order: 6`。
- `agent.cordis.yml`：以 `presets/marketing-agent/agent.cordis.yml` 为结构模板，persona 段由构建脚本注入；保持 `- id: persona` 使用 `prefix` 键（禁止 `text`）。
- `skills.json`：`presetId: marketing-growth-team`，绑定市场目录既有技能。

### 2.2 新增专家片段（`presets/fragments/growth-experts.cordis.yml`）
- 4 条 `tool-subagent` spawn 行，格式对齐 `marketing-experts.cordis.yml`（`provider: spawn`、`toolName: expert_*`、`persona: |`）。
- 顶部保留 `    # ── OmniMux 全能营销专家工具 ──` 风格的分节注释，说明「仅在子任务边界清晰且独立有收益时委派」。

### 2.3 构建脚本（`scripts/build-agent-presets.mjs`）
- 新增 `GROWTH_AGENT_PERSONA` 常量（主理人「盛全局」），persona 必须走 `prefix: |`。
- `targets` 增加 `presets/marketing-growth-team/agent.cordis.yml` ← `growth-experts.cordis.yml`。
- 保持幂等：连跑两次产物字节一致。

### 2.4 物化脚本（`scripts/sync-agent-presets.sh`）
- `KEEP=(omni-agent marketing-agent marketing-growth-team drama-agent standard daily-work cordis)`。
- 同步更新脚本内两处「出厂会话预设」中文注释清单。
- **不触碰** `default: omni-agent` 契约。

### 2.5 技能绑定（`plugins/omnimux-market/catalog/preset-skills.json`）
- 新增 `marketing-growth-team` 键，结构对齐既有条目（`presetId` / `name` / `description` / `categories` / `skills`），技能只引用 `catalog/skills/` 中**已存在**的包，不新增技能正文。

### 2.6 测试断言
- `scripts/verify-agent-presets.test.mjs`：
  - 新增 `marketing-growth-team` 结构与 4 位专家清单断言；
  - `KEEP` 断言更新为新名单；
  - persona `prefix` 键清单加入新预设。
- `tests/e2e/agent-presets-naming-order.e2e.test.mjs`：
  - 新增「增长专家团 / order 6」断言；
  - **保留**「默认预设锁定 `omni-agent`」断言。

### 2.7 文档
- `presets/README.md`：预设表新增一行，并补充「增长专家团」的机制说明。

## 3. 新用户基线

- 本预设是**出厂内置**资产：全新安装 + 登录后的用户，无需任何外部账号、密钥或本地开发机状态即可选中并新建会话。
- 主理人 persona 不引用任何开发机私有路径、本地服务或开发端口；`expert_*` 委派仅依赖宿主工具总线，缺失时按既有 `tool-subagent` 契约报错，**不静默降级**。
- 技能绑定只引用随产品分发的 `catalog/skills/` 包；缺包时技能选择器按既有逻辑回退，不阻塞会话创建。

## 4. 验收标准

1. `node scripts/build-agent-presets.mjs` 成功，且**幂等**（连跑两次 `agent.cordis.yml` 字节一致）。
2. `node --test scripts/verify-agent-presets.test.mjs` 100% 通过。
3. `node --test tests/e2e/agent-presets-naming-order.e2e.test.mjs` 100% 通过（6 预设名称/order + 默认仍为 `omni-agent`）。
4. `node --test scripts/sync-agent-presets-targets.test.mjs` 100% 通过（不误删非本脚本拥有的预设目录）。
5. 新预设三个文件齐备且 YAML 可解析（`preset.yml`、`agent.cordis.yml` 顶层为序列、`skills.json` 为合法 JSON）。
6. `presets/README.md` 与 `KEEP` 名单一致，无遗漏。

## 5. 文档影响声明

更新 `presets/README.md`（预设清单与机制说明）与本 spec；不新增独立契约文档——预设清单的既有真源就是 `presets/README.md` 与 `scripts/sync-agent-presets.sh` 的 `KEEP` 名单，本次只做同步，不引入第二处真相。
