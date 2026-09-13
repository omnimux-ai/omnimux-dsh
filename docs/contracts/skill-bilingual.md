---
title: "技能中英双语适配与入库门禁契约"
id: "contract-skill-bilingual"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-13"
updated: "2026-09-13"
authors: ["x", "agent-engineer"]
subsystem: "omnimux-market"
tags: ["skill", "bilingual", "admission-gate", "catalog"]
supersedes: []
superseded_by: null
---

# 技能中英双语适配与入库门禁契约

> **权威等级**：L1 | **生命周期**：持续演进 (Living)
> 覆盖范围：`plugins/omnimux-market`（技能工坊 / 技能广场 / 技能选择器）+ `plugins/omnimux`（新建会话精选 Skill）+ `scripts/`（入库门禁）。

## 1. 目的与真源

官方货架技能（技能工坊 / 技能广场 / 技能选择器 / 新建会话精选）在中文与英文界面下都必须显示对应语言的标题与描述。本契约规定：

1. **唯一真源**：`plugins/omnimux-market/catalog/index.json`。UI 不得新增第二份文案表，技能的 `SKILL.md` 保持原语言不动。
2. **唯一判据**：`plugins/omnimux-market/src/skill-bilingual.ts` 的 `checkSkillBilingual()`。脚本、门禁、UI、测试全部引用它或它的同域镜像，禁止在任何位置内联 `!titleEn` 之类的临时判断。
3. **唯一字段域**：`titleZh` / `titleEn` / `summaryZh` / `summaryEn`，顺序即报错输出顺序。禁止新增 `nameZh` / `descZh` 等别名（旧 UI 兜底链对 `nameZh/nameEn` 的兼容属历史遗留，官方货架统一走 4 字段）。

## 2. 字段域

| 字段 | 上限 | 说明 |
|---|---|---|
| `titleZh` | 80 | 中文标题 |
| `titleEn` | 80 | 英文标题 |
| `summaryZh` | 200 | 中文摘要 |
| `summaryEn` | 200 | 英文摘要 |

归一化规则：非字符串（`null` / 数字 / 对象 / 数组）→ `''`；空白串（`'   '`）→ 视为缺失；超长 → 截断到上限。截断后仍算通过。

## 3. 判据红线

**判据内绝不做语言回退。** `missingFields.length > 0` 即不通过；`titleEn || title` 这类回退会把「缺失任一字段即不合格」静默降级为永远通过，是本契约明令禁止的写法（由 `scripts/verify-skill-bilingual.test.mjs` 的源码级断言守卫）。

「渲染时兜底」与「门禁判定」是两件事：渲染层必须保留 `skillTitle()/skillDesc()` 的兜底链（否则历史数据在 UI 上会空白），门禁层则必须零容错。

**渲染选区优先级（既有行为，不得改变）**：
`tr('skill.name.<slug>')` → `tr('skill.name.<id>')` → `titleEn|titleZh`（按 locale）→ `name|title` → slug。即：i18n 字典覆盖 > 目录双语字段 > 原始单语字段。

## 4. 适用范围与豁免

门禁只作用于**官方货架条目**：`kind === 'skill' && tab === 'skills' && recommended === true`。

范围外条目一律**不判不拦不报错**：

- 未上架的遗留技能条目；
- `mine` 视图中用户已安装的历史技能；
- SkillHub / WorkBuddy 远程候选行；
- `kind !== 'skill'` 或 `tab !== 'skills'` 的专家 / 团队 / 连接器条目。

## 5. 双层门禁

| 维度 | 静态硬门禁 | 运行时准入门禁 |
|---|---|---|
| 入口 | `corepack pnpm verify:skill-bilingual`（`scripts/verify-skill-bilingual.mjs`） | 每次 `workshopQuery` / `aggregateSkillSearch` |
| 判定 | 逐条校验官方货架技能的 4 字段非空 | 投影后逐条校验，且**在写入 winners 之前** |
| 失败行为 | **非零退出**，列出 `id + 缺失字段 + 修复指引`；选不到任何条目（`checked === 0`）同样判失败（防空转） | **过滤该条**，写入快照 `admission.skippedIds`，`console.warn` 一条聚合日志；**绝不 throw** |
| 覆盖 | 目录文件、精选快照新鲜度、生成器 | 工坊、广场、选择器 |
| 防绕过 | CI 必跑；`test:gates` 内含自测证明门禁非空转 | 被拒 token 不进入 winners，**远程同名行也不得顶替**（ADR-BL-01） |

### ADR-BL-01 · 拒绝即出局，不降级、不顶替

门禁判定必须发生在 `winners.set(token, …)` **之前**，且被拒 token 记入 `rejectedTokens`，远程候选循环同样跳过它。若先写入再过滤，未过门禁的官方技能会被非官方远程行替代，等于门禁被绕过。

### 审计字段

`WorkshopQuerySnapshot.admission` 与 `WorkshopQueryResult.admission`（可选，向后兼容）：

```ts
interface AdmissionSummary {
  enforced: boolean      // 本次是否真的执行过门禁（无官方条目时为 false）
  skippedCount: number   // 被拒条目总数
  skippedIds: string[]   // 升序，最多 50 条；超出部分只计 skippedCount
}
```

`enforced` 用于区分「没跑门禁」与「跑了且全过」。`isWorkshopResponseApplicable` **不校验**该字段，老快照 / 老客户端不受影响。

## 6. 数据流

```
catalog/index.json（唯一真源）
  → expert/catalog.js parseItem()        补回双语投影（trim + 截断，缺失即空串，无回退）
  → workshop-query.ts collectWorkshopDiscovery()  门禁先于 winners.set，汇总 admission
  → skill-aggregate.ts catalogItemToCard()        仅当 checkSkillBilingual().ok 时携带双语
  → client/skills-ui.js Cards() / client/skill-picker.js   经 skillTitle()/skillDesc() 选区渲染
```

`parseItem()` **只补字段不判门禁**——若把门禁放进解析层，未上架技能也会被拦，破坏搜索与安装。

## 7. 收集层与静态门禁的常量镜像

`expert/catalog.js`（JS，须在未编译的源码目录直接运行）与 `scripts/verify-skill-bilingual.mjs`（CI 回归步骤不跑 `pnpm install`/`build`）无法 import 判据 TS 模块，因此各自**镜像**声明字段域与上限。两处镜像均由测试守卫：

- `plugins/omnimux-market/src/tests/skill-bilingual.test.ts` —— 断言 `expert/catalog.js` 的上限与判据模块一致；
- `scripts/verify-skill-bilingual.test.mjs` —— 从 `src/skill-bilingual.ts` 源码提取字段域/上限/范围并与脚本比对。

改动字段域时必须四处同步：判据模块、目录解析层、门禁脚本、本契约。

## 8. 失败处置

1. **静态门禁失败（CI/本地）**：按输出补齐 `catalog/index.json` 中对应条目的缺失字段，重跑 `corepack pnpm verify:skill-bilingual`；若条目尚未准备好，应先把 `recommended` 置为非 `true` 或从货架撤下，而不是留空字段过关。
2. **运行时门禁拒绝**：条目不出现在工坊/广场/选择器，控制台出现一条聚合告警。此时修数据即可，无需回滚版本；运行时永不因脏数据不可用。
3. **精选快照漂移**：运行 `node scripts/generate-featured-skills.mjs` 重生成；缺双语时生成器**抛错且不写文件**。

## 9. 接线清单

| 位置 | 内容 |
|---|---|
| `package.json` | `verify:skill-bilingual`；`verify:gates` 在 `doc:pairing` 之后串联该门禁；`test:gates` 纳入两个门禁自测 |
| `.github/workflows/quality-gate.yml` | *Run syntax & contract gates* 增 `node --check`；*Run regression tests* 增门禁自测与门禁执行 |
| `plugins/omnimux-market/src/tests/skill-bilingual.test.ts` | 判据与目录解析层的一致性、真实目录 69/69 |
| `plugins/omnimux-market/src/tests/workshop-query.test.ts` | 运行时门禁、防绕过、admission 审计、豁免范围 |
| `scripts/verify-skill-bilingual.test.mjs` | 防空转、故障注入、CLI 退出码、镜像防漂移 |
| `scripts/generate-featured-skills.test.mjs` | 生成器硬失败（B14）与零漂移 |

## 10. 边界条件

| # | 边界 | 期望行为 |
|---|---|---|
| B1 | 字段为空白串 | 视为缺失，门禁不通过 |
| B2 | 字段为 `null` / 数字 / 对象 | 归一化为 `''`，不抛异常 |
| B3 | 字段超长 | 截断到上限，仍通过 |
| B4 | `titleEn === titleZh` | 判据通过（形态合法），静态门禁输出告警供人工复核 |
| B5 | `recommended:true` 但非 `tab:skills` | 不纳入门禁范围 |
| B6 | 目录 0 条官方货架技能 | 静态门禁 `checked === 0` → 失败（防空转） |
| B7 | 官方条目缺双语 | 工坊不出现该条，`admission.skippedIds` 含其 id |
| B8 | 被拒 token 存在远程同名行 | 远程行同样不出现 |
| B9 | `mine` 视图中历史技能缺双语 | 正常显示（走 `title` 兜底），不受门禁影响 |
| B10 | 目录整体不可用 | 既有降级路径不变，`admission.enforced === false` |
| B11 | `tr('locale')` 为 `en` / `zh` / 缺失 | 分别选 EN 字段 / ZH 字段 / 浏览器 `document.documentElement.lang` 回退 |
| B12 | i18n 字典存在 `skill.name.<slug>` | 字典优先，目录字段被忽略 |
| B13 | 快照/响应缺 `admission` | `isWorkshopResponseApplicable` 与分页均不受影响 |
| B14 | 生成器遇到缺英文字段 | 抛错且**不写文件** |

## 11. 门禁保证的边界

门禁只保证「4 个字段非空且形态合法」，**不保证英文内容是地道译文**。内容质量另设人工抽检，不写进硬门禁——把「是否真的是英文」做成自动判定需要语言检测，误判率高、门禁不可维护。
