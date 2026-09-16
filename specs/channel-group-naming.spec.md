# 渠道分组显示名与副标题命名规范落地规格（Channel Group Naming Spec）

- 任务工作树：`.worktrees/channel-group-naming`（分支 `feat/channel-group-naming`，基线 `origin/main` @ `cba279c8f`）
- 日期：2026-09-16
- 权威依据：上游网关 `docs/ops/group-pricing-governance-2026-09-12.md` 第 2 节三层语义与强制命名规则、第 5 节裁决记录（2026-09-12）；上游 `AGENTS.md` 行 89 双档约定（Standard / Economy）
- 触发：用户指出「工作流·高速档 / 工作流·画质档」等分组名缺乏统一规则

## 1. 问题陈述

产品侧 18 个模型族 / 34 个启用分组，label 存在 3 类语法、12 种后缀词，且多处把采购层信息（供应商名、账号池、官方转售）与促销话术写进面向用户的显示名与副标题：

| 位置 | 现状 | 违反的规则 |
| --- | --- | --- |
| minimax-h3 高速档 badge | 「AutoDL 极速出片 · 极致低价专线」 | 上游禁令 1：禁止供应商名对外 |
| grok-imagine-video-1-5 pool label | 「号池版」 | ③ 采购层永不对外；② 须为客户价值语义 |
| nano-banana-2 pro badge | 「Evolink 全档高清专线」 | 上游禁令 1 |
| seedance-2-0 pro badge | 「按次高价专线 · Pidoi 满血」 | 上游禁令 1 |
| seedance-2-0 preferred badge | 「官转专线 · 极稳高画质」 | 采购层黑话对外 |
| nano-banana-2 pro label | 「高价档」 | 价格自述，非客户价值语义 |
| claude-opus-4-6 label | 「顶配满血版」 | 营销口语，非结构化档位语义 |
| minimax-h3 label | 「工作流·高速档 / 工作流·画质档」 | 「工作流」为上游技术实现，非客户价值语义 |

根因：产品侧**没有任何一份规范管辖渠道分组的显示名与副标题**，且无自动门禁。既有 `model-display-label.md` 明确 Scope 为 model row label only，`ui-copywriting-and-naming-standards.md` 仅管筛选器/按钮/徽章/术语字典，二者均不覆盖分组名。

## 2. 目标

1. 新增产品侧契约 `docs/contracts/channel-group-naming.md`，把上游三层语义落成可执行的产品侧规则：白名单档位词表、禁用词表、构词法。
2. 按规范整改全部 34 个分组的 label 与 badge，仅动展示层文案，**不动** `id`、`wireModel`、`wireGroup`、`pricing`、`constraints`、`enabled`。
3. 新增确定性门禁 `scripts/verify-channel-group-naming.mjs`，把规则变成机器断言（白名单 + 禁用词 + 中枢/画布镜像一致），杜绝再次跑偏。

## 3. 命名规则（本次落地口径）

### 3.1 档位词白名单（label 必须整体等于其中之一）

| 档位词 | 客户价值语义 | 每族数量约束 |
| --- | --- | --- |
| 旗舰版 | 本族最高规格 | ≤ 1 |
| 官方版 | 原厂官方直签、最高稳定性 | ≤ 1 |
| 优选版 | 精品线路，介于官方与标准之间 | ≤ 1 |
| 标准版 | 基准档 | 必须存在 |
| 经济版 | 本族最低价 | ≤ 1 |
| 极速版 | 出片速度优先 | ≤ 1 |
| 高清版 | 输出画质优先 | ≤ 1 |
| 长片版 | 固定长时长规格档 | ≤ 1 |

### 3.2 构词法与禁用项

- label 一律为「二字价值词 + 版」，禁止使用「·」等分隔符，禁止「档」后缀。
- label 与 badge **禁止**出现：供应商/渠道名（Pidoi、AutoDL、Evolink、APIMart、维金、goeasy、runninghub 等）、采购层黑话（号池、官转、成本池、渠道）、促销话术（限时、特惠池、秒杀）、价格自述（高价、低价、贵）。
- 模型原厂品牌名（MiniMax、Google、OpenAI、DeepSeek、xAI、Suno、Wan、豆包、可灵 等）允许出现在 badge，因为它们描述的是模型能力来源，不是采购渠道。

### 3.3 本次整改对照表（34 个分组的变更子集）

| 模型族 | 分组 id | 旧 label | 新 label | 旧 badge | 新 badge |
| --- | --- | --- | --- | --- | --- |
| seedance-2-0 | pro | 进阶版 | 旗舰版 | 按次高价专线 · Pidoi 满血 | 满血出片 · 按次专线 |
| seedance-2-0 | preferred | 优选版 | 优选版 | 官转专线 · 极稳高画质 | 精品专线 · 极稳高画质 |
| seedance-2-0 | cheap | 特惠版 | 经济版 | 限时特惠 · 按条计费 | 经济走量 · 按条计费 |
| seedance-2-0-fast | cheap | 特惠版 | 经济版 | 特惠走量 · 按条计费 | 经济走量 · 按条计费 |
| seedance-2-5 | pro | 进阶版 | 旗舰版 | 按次高价专线 · 满血出片 | 不变 |
| claude-opus-4-6 | claude-max-open | 顶配满血版 | 旗舰版 | Claude Max 外接版 | 官方订阅直连 |
| claude-opus-4-6 | claude-plus | 进阶增强版 | 优选版 | Claude Plus 精品专线 | 精品专线 · 高品质输出 |
| deepseek-v4-flash | deepseek-official | 官方直连版 | 官方版 | 官方满血直签 | 官方原厂直签 |
| minimax-h3 | video_fast | 工作流·高速档 | 经济版 | AutoDL 极速出片 · 极致低价专线 | 极速出片 · 极致低价专线 |
| minimax-h3 | video_pro | 工作流·画质档 | 高清版 | AutoDL 极限画质先行版 | 极限画质 · 先行专线 |
| minimax-h3 | task | 任务版 | 长片版 | 固定 15 秒 · 按次专线 | 不变 |
| gemini-3.8-flash | cheap | 特惠版 | 经济版 | 经济走量特惠池 | 经济走量专线 |
| nano-banana-2 | pro | 高价档 | 高清版 | Evolink 全档高清专线 | 全档高清专线 |
| grok-imagine-video-1-5 | pool | 号池版 | 经济版 | 自建号池 · 随心用 | 极致低价 · 随取随用 |

其余分组（标准版 / 官方版 / 极速版 等）保持不变。

## 4. 验收标准（可测试）

- **AC-1（规范文件存在且可解析）**：`docs/contracts/channel-group-naming.md` 存在，含白名单词表、禁用词表、构词法三节。
- **AC-2（label 白名单）**：`MODEL_CHANNEL_GROUPS` 全部启用分组的 label ∈ 白名单 8 词，且每族「标准版」存在、旗舰版/经济版等唯一词不重复。
- **AC-3（禁用词零命中）**：全部 label 与 badge 对禁用词表（供应商名、采购层黑话、促销话术、价格自述）零命中。
- **AC-4（构词法）**：无 label 含「·」或「档」后缀。
- **AC-5（路由与计费零变更）**：整改前后 `id` / `wireModel` / `wireGroup` / `pricing` / `constraints` / `enabled` 逐字段一致（快照比对）。
- **AC-6（跨插件镜像一致）**：中枢 `channel-groups.js` 与画布镜像 `channelGroups.ts` 的 label/badge 逐字一致。
- **AC-7（门禁可执行且有效）**：`node scripts/verify-channel-group-naming.mjs` 在整改后退出码 0；对注入的违规样本（供应商名 / 非白名单 label）退出码非 0。
- **AC-8（既有测试不回归）**：`plugins/omnimux/src/catalog/serving/channel-groups.test.js`、`plugins/omnimux-workflow/.../channelGroups.test.mjs`、`scripts/verify-cross-plugin-model-alignment.test.mjs` 全部通过。
- **AC-9（真实浏览器验证）**：隔离工作树内真实浏览器加载构建产物，打开创作画布模型级联菜单，断言 minimax-h3 分组显示为「经济版 / 高清版 / 长片版」，且页面可见文案中不含 AutoDL / 号池 / Pidoi / Evolink；证据落盘 `tmp/channel-group-naming/`（截图 + 结构化报告）。

## 5. 不做事项

- 不改动任何分组 `id`、路由键、定价与约束（纯展示层）。
- 不改动模型行的 `label`（`labels.js` / media SPECS），那属于 `model-display-label.md` 管辖范围。
- 不新增档位词之外的命名形态，不为「更好听」做主观润色。
- 不修改上游网关仓库任何文件。
