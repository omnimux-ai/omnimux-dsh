# 规范：AIGC 创作 9 项技能入库技能工坊目录（原生仓库 git 源）

> 任务真源：Issue #2131 · 分支 `agent/market-agentara-aigc-skills-issue-2131` · 基线 `origin/main` = `4fdba1fff`。
> 本文件是本任务人与 Agent 共享的验收真相源：写码前定死「建什么、怎样算完成」。
> 上游机制真源：`docs/contracts/skill-bilingual.md`（货架条目双语门禁）、`specs/amazon-suite-import.spec.md`（同类「按 git 源入库」先例）。本任务**沿用**既有条目形态与安装链路，不改造它们。

## 1. 业务目标与背景

### 1.1 现状

资产库（OPC 资产库）已入库上游仓库 `agentara/skills`（`https://github.com/agentara/skills`，默认分支 `main`）的 `skills/aigc/` 分组，共 9 个技能包：`gunpla-poster`、`portrait-clone`、`presentation-design`、`soviet-storybook-grotesque`、`torn-paper-collage-poster`、`video-character-design`、`video-plan`、`video-poster-design`、`video-storyboard`。

技能工坊（`omnimux-market`）的货架真源是包内静态目录 `plugins/omnimux-market/catalog/index.json`。这 9 项**尚未**登记，用户在技能工坊里看不到、也装不到。

### 1.2 目标

在 `catalog/index.json` 的 `items` 数组末尾追加 **9 条** `kind: 'skill'` 条目，安装源统一指向其**原生仓库地址**：

```json
"source": { "type": "git", "repo": "agentara/skills", "path": "skills/aigc/<slug>", "ref": "main" }
```

即：技能正文仍只有上游仓库一份；本仓只登记「去哪儿装」，不复制正文、不落第二份真源、不新增包内 `catalog/skills/` 目录。

### 1.3 用户已确认的决策（不得自行更改）

1. **全部 9 项**都要入库，不做筛选、不做分批。
2. **安装源 = 原生仓库地址**（`agentara/skills` 的 git 源），不是本机 clone 路径、不是包内 bundled 副本。
3. 入库后用户在技能工坊中**可见、可一键安装**，装的是上游正文。

## 2. 数据契约

### 2.1 货架条目（`catalog/index.json` → `items[]` 末尾，追加 9 条）

条目形态沿用同仓既有第三方 git 源先例（`Blotato-Inc/blotato-skills` 3 条）：

```json
{
  "id": "sk-omx-<slug>",
  "tab": "skills",
  "kind": "skill",
  "title": "<中文标题>",
  "subtitle": "Agentara",
  "summary": "<中文摘要>。源：agentara/skills（git）。",
  "category": "sk-visual",
  "tags": ["AIGC", "<主题>", "Agentara", "<领域>"],
  "skill": "<slug>",
  "source": { "type": "git", "repo": "agentara/skills", "path": "skills/aigc/<slug>", "ref": "main" }
}
```

### 2.2 逐条取值（slug → 标题 / 领域标签）

| # | slug | title | 领域标签 |
|---|---|---|---|
| 1 | gunpla-poster | 高达模型收藏海报 | 商业广告 |
| 2 | portrait-clone | 人像复刻生图提示词 | 创意实验 |
| 3 | presentation-design | 演示设计拼版图 | 商业广告 |
| 4 | soviet-storybook-grotesque | 苏东童书怪诞插画 | 创意实验 |
| 5 | torn-paper-collage-poster | 撕纸拼贴编辑海报 | 商业广告 |
| 6 | video-character-design | 视频角色设定图 | 专业影视 |
| 7 | video-plan | 短视频分场企划 | 专业影视 |
| 8 | video-poster-design | 电影感海报与主视觉 | 专业影视 |
| 9 | video-storyboard | 视频分镜与提示词 | 专业影视 |

- 入口顺序：`items` **数组末尾**追加（降低与其他在途 PR 的文本冲突概率）。
- 分类统一 `sk-visual`（视觉与视频）；本任务**不新建**目录分类（`categories` 数组不动）。
- 领域标签取自技能工坊既有领域词表（`WORKSHOP_DOMAINS`）：一条一个领域，保证「领域筛选」可达；另外三项为 `AIGC`、主题词、来源名 `Agentara`。

### 2.3 解析层约束（`plugins/omnimux-market/src/expert/catalog.js` 的 `parseItem`/`parseSource`）

| 字段 | 约束 | 本任务取值 |
|---|---|---|
| `id` | `^[a-z0-9]+(-[a-z0-9]+)*$`，全目录唯一 | `sk-omx-<slug>`（9 条互不重复，与既有 357 条不冲突） |
| `kind` / `tab` | 枚举内 | `skill` / `skills` |
| `title` | 非空，≤40 字 | 见表 §2.2，最长 9 字 |
| `summary` | 非空，≤200 字 | 见表，最长约 70 字 |
| `subtitle` | 截断至 24 字 | `Agentara` |
| `category` | 已有分类 id | `sk-visual` |
| `tags` | ≤8 个 | 各 4 个 |
| `skill` | `^[a-z0-9]+(-[a-z0-9]+)*$` | slug |
| `source.type` | `git` 时 `repo` 须匹配 `owner/name`，`path` 非空、不得含 `..`、不得以 `/` 开头 | `agentara/skills` + `skills/aigc/<slug>` |

- **双语门禁范围**（`skill-bilingual.md` §4）：门禁只作用于 `recommended === true` 的官方货架条目。本批 9 条**不进精选**（不写 `recommended`），故无需 `titleZh/titleEn/summaryZh/summaryEn`；渲染层按既有兜底链显示 `title`/`summary`。
- 文件格式保真：保持既有 **2 空格缩进 + 末尾换行**，不引入 CRLF、不引入制表符、不重排既有内容。

## 3. 安装链路契约（沿用，不改造）

| 环节 | 既有行为 | 本任务要求 |
|---|---|---|
| 渠道归属 | `catalogSkillChannel()`：`id` 以 `sk-omx-` 开头 → `custom` | 9 条全部落 `custom`（与既有第三方 git 源条目一致） |
| slug 解析 | `catalogSkillSlug()`：优先 `skill` 字段 | 返回与 `skill` 一致的 slug |
| 命中 | `findCatalogSkill(slug/id)` | 9 条按 id 与 slug 均可命中 |
| 安装 | `installFromCatalog()` 走 `source.git` → 拉取 `<path>/SKILL.md` 等文件写入 `$DSH_HOME/skills/<slug>/` | 上游 9 条路径均可读（HTTP 200），安装可解析 |

## 4. 验收标准（可观察）

1. **条目存在且唯一**：`catalog/index.json` 中 9 个 `id` 各出现一次；总条目数 357 → 366。
2. **源字段逐条正确**：9 条 `source.repo === "agentara/skills"`、`source.path === "skills/aigc/<slug>"`、`source.ref === "main"`、`source.type === "git"`。
3. **解析层可达**：用插件自身解析器加载目录后，`catalogSkillChannel()` 对 9 条均返回 `custom`；`catalogSkillSlug()` 返回对应 slug；`findCatalogSkill()` 按 id 与 slug 命中同一条。
4. **领域可达**：9 条的 `workshopDomains()` 非空，且与 §2.2 领域标签一致。
5. **上游可解析**：9 条 `https://raw.githubusercontent.com/agentara/skills/main/skills/aigc/<slug>/SKILL.md` 全部 HTTP 200。
6. **无人受损**：既有 357 条逐字节未变（除末尾插入位置的分隔符），`verify:skill-bilingual` 与相关单测全绿。

## 5. 验证计划（本任务实跑）

| 检查 | 命令 | 期望 |
|---|---|---|
| 目录解析与字段 | `node -e` 载入 `src/expert/catalog.js` + `skill-aggregate.js` 断言 §4.1–4.4 | 全通过 |
| 上游探活 | `curl -o /dev/null -w '%{http_code}'` × 9（见 §4.5） | 9×200 |
| 既有条目未变 | `git diff` 仅新增 10 行（9 条 + 分隔符）且无删除行 | 通过 |
| 双语门禁 | `corepack pnpm verify:skill-bilingual` | 非零退出为失败 |
| 插件单测 | `corepack pnpm --filter omnimux-market test` | 全绿 |

## 6. 非目标

- 不改界面代码、交互、样式；不改精选位（`featured`）、推荐理由与封面（`cover`）——本批不设封面，卡片走既有默认样式。
- 不做出厂预装（`preinstalled`）、不改 `catalog/preset-skills.json`、不改 `catalog/skills/` 包内技能正文。
- 不新建「AIGC 创作」目录分类（如需，另开任务改 `categories` 与筛选 UI）。
- 不修改上游 `agentara/skills` 仓库；不在本仓复制技能正文（禁止第二份真源）。
- 不动跨插件模型契约、不发版、不改生产环境。

## 7. 风险与回滚

- **R2**：纯目录数据追加，运行时对单条脏数据是「过滤该条」而非不可用（`workshop-query` 拒绝即出局）。
- 回滚 = 删除这 9 条（或 revert 本 PR）；无数据迁移、无存储副作用。
- 冲突面：`catalog/index.json` 是高频修改文件，追加在末尾降低与在途 PR 的文本冲突概率；若基线已前移，按同位置重放。
