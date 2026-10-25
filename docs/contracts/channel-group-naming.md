---
title: "OmniMux 渠道分组显示名与副标题命名规范 (Channel Group Naming)"
id: "contract-channel-group-naming"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-16"
updated: "2026-10-25"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
related:
  - "docs/contracts/model-display-label.md"
  - "docs/contracts/ui-copywriting-and-naming-standards.md"
  - "docs/contracts/model-list-ownership.md"
  - "docs/contracts/omnimux-contracts-architecture.md"
---

# OmniMux 渠道分组显示名与副标题命名规范

角色创作的现行体验见[产品定位](product-positioning.md)。下列词表约束既有分组名称，不要求新增对外多档位菜单；历史“客户自选渠道组”方向已被替代。内部路由 ID、上游分组与契约继续保留，本次不宣称选择器已改造。

> **历史命名依据（2026-09-12）**：网关侧 `docs/ops/group-pricing-governance-2026-09-12.md` 第 2 节「分组必须切成三层语义」与第 5 节裁决记录（2026-09-12，已裁决采纳对外多档位入口）、网关 `AGENTS.md` 双档约定（Standard / Economy）。
> **级别**：**强制 (MANDATORY)** —— `pnpm verify:group-naming` 门禁必检项（**离线、本地按需执行**；未接入 `test:gates` 或 CI，现状见 [plugin QA · 模型与渠道门禁的自动化归属](plugin-qa.md#模型与渠道门禁的自动化归属)）。

## 一分清三份规范的边界

| 规范 | 管辖对象 | 不管辖 |
| --- | --- | --- |
| `model-display-label.md` | 模型行显示名（`modelCatalog.list()` 的 `label`） | 渠道分组显示名 |
| `ui-copywriting-and-naming-standards.md` | 筛选器、按钮、状态徽章、术语字典 | 渠道分组显示名 |
| **本规范** | **产品命名的渠道分组 `label` 与 `badge`**（中枢展示覆盖表里登记了该 `wireGroup` 的线路） | 路由 `id`、`wireModel`、`wireGroup`、定价、约束；网关自己发布的分组名 |
| 消费方（画布、应用页、媒体查看器） | 只按目录投影逐字显示 | 重新命名、翻译或改写任何分组名 |

分组 `id`、`wireGroup` 是路由与计费键，属于机器标识，不受本规范约束、也不得因改名而变更。

**单一真源**：分组名的权威表述在中枢展示覆盖表 `plugins/omnimux/src/catalog/serving/channel-groups.js`；消费方只显示目录投影，禁止手抄第二份（[契约单一真源](omnimux-contracts-architecture.md)）。网关直接发布、产品未在覆盖表命名的线路由网关起名，本规范的白名单不适用于它们，但禁用词（供应商名、采购层黑话、促销话术）照查——要改名必须先在中枢展示覆盖表补条目。

## 二、三层语义（既有命名分类）

| 层 | 语义 | 能否对外 | 产品侧落实 |
| --- | --- | --- | --- |
| ① 客户等级 | 合同/等级折扣 | 对外，运营指定 | 不出现在模型级联菜单的分组名里 |
| ② 产品档位 | 速度/画质/时长/价格档 | 按具体任务提供输出规格，不要求普通用户选择渠道分组 | 本规范管辖的 `label` / `badge` |
| ③ 采购成本池 | 供应商、渠道、成本池 | **永不对外** | 供应商名、渠道黑话一律禁止进入 `label` 与 `badge` |

## 三、档位词白名单（`label` 必须整体等于其中之一）

| 档位词 | 客户价值语义 | 每族数量约束 |
| --- | --- | --- |
| 旗舰版 | 本族最高规格 | ≤ 1 |
| 官方版 | 原厂官方直签、最高稳定性 | ≤ 1 |
| 优选版 | 精品线路，介于官方与标准之间 | ≤ 1 |
| 标准版 | 基准档 | 每族必须存在 |
| 经济版 | 本族最低价 | ≤ 1 |
| 极速版 | 出片速度优先 | ≤ 1 |
| 高清版 | 输出画质优先 | ≤ 1 |
| 长片版 | 固定长时长规格档 | ≤ 1 |
| 口型版 | 音频驱动唇形同步专线 | ≤ 1 |
| 畅享版 | 自建号池随取随用、高并发专线 | ≤ 1 |

- 白名单之外的新档位词必须先进本文件增补，再改代码。
- 每个档位词在同一模型族内**至多出现一次**（禁止两个「旗舰版」）。

## 四、构词法与禁用项

1. `label` 一律为「价值词 + 版」，**禁止**使用 `·`、`/`、`（）` 等分隔符，**禁止**以「档」结尾。
2. `label` 与 `badge` **禁止**出现下列词（大小写不敏感）：
   - 供应商 / 渠道名：`Pidoi`、`AutoDL`、`Evolink`、`APIMart`、`维金`、`goeasy`、`runninghub`
   - 采购层黑话：`号池`、`官转`、`成本池`、`渠道`、`专线池`
   - 促销话术：`限时`、`特惠池`、`秒杀`、`抢购`
   - 价格自述：`高价`、`超低价`、`低价档`
3. **允许**在 `badge` 出现模型原厂品牌名（MiniMax、Google、OpenAI、DeepSeek、xAI、Suno、Wan、豆包、可灵 等）：它们描述模型能力来源，属 ② 层信息，不是采购渠道。
4. `badge` 是价值补充说明，不得重复展示折扣数字（价格芯片已单独呈现）。

## 五、门禁与验证

- `pnpm verify:group-naming`：对**目录投影**校验产品命名线路的 label 白名单、每族唯一性、构词法、价格自述、禁用词零命中，并逐字比对画布展示名与目录投影；网关直接发布的线路单独计数，只受禁用词约束。
- 单元测试：`plugins/omnimux/src/catalog/serving/channel-groups.test.js`、`plugins/omnimux-workflow/.../channelGroups.test.mjs`。
- 门禁脚本自测：`scripts/verify-channel-group-naming.test.mjs`（含违规样本必须失败的反向用例）。
- 跨插件一致性：`pnpm verify:cross-plugin-models`（目录投影 vs 画布消费）。

## 六、变更流程

1. 新档位词先进本文件白名单；
2. 只在中枢展示覆盖表 `plugins/omnimux/src/catalog/serving/channel-groups.js` 里给该 `wireGroup` 起名（消费方自动跟随目录，禁止在画布或其它插件再抄一份）；
3. 跑 `pnpm verify:group-naming`、`pnpm verify:cross-plugin-models` 与相关单元测试；
4. 界面文案属前端改动，交付前须在任务工作树完成真实浏览器验证。
