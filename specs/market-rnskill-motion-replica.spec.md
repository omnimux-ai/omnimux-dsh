# 规范：rnskill「动效复刻」技能入库技能工坊目录（原生仓库 git 源）

> 任务真源：Issue #2244 · 分支 `agent/omnimux-market-rnskill-motion-replica-issue-2244` · 基线 `origin/main` = `e5fd9e91a`。
> 本文件是本任务人与 Agent 共享的验收真相源：写码前定死「建什么、怎样算完成」。
> 上游机制真源：`docs/contracts/skill-bilingual.md`（货架条目双语门禁）、`specs/market-agentara-aigc-skills.spec.md`（同类「按 git 源入库」先例）。本任务**沿用**既有条目形态与安装链路，不改造它们。

## 1. 业务目标与背景

### 1.1 现状

资产库（OPC 资产库）已入库上游仓库 `Pluviobyte/rnskill`（`https://github.com/Pluviobyte/rnskill`，默认分支 `main`）的技能包。其中「动效复刻」（`rn-motion-replica`）用于把参考视频拆解成布局、运动、时序与转场证据，再重建为原创动效复刻并做成片质检。

技能工坊（`omnimux-market`）的货架真源是包内静态目录 `plugins/omnimux-market/catalog/index.json`。该技能**尚未**登记，用户在技能工坊里看不到、也装不到。

同仓库已有登记先例：`sk-omx-editorial-collage-motion`（拼贴动效出片）。

### 1.2 目标

在 `catalog/index.json` 的 `items` 数组末尾追加 **1 条** `kind: 'skill'` 条目，安装源指向其**原生仓库地址**：

```json
"source": { "type": "git", "repo": "Pluviobyte/rnskill", "path": "skills/rn-motion-replica", "ref": "main" }
```

即：技能正文仍只有上游仓库一份；本仓只登记「去哪儿装」，不复制正文、不落第二份真源、不新增包内 `catalog/skills/` 目录。

### 1.3 用户已确认的决策（不得自行更改）

1. 本次只登记「动效复刻」**1 项**，不做筛选外的增减。
2. **安装源 = 原生仓库地址**（`Pluviobyte/rnskill` 的 git 源），不是本机 clone 路径、不是包内 bundled 副本。
3. **「视频洗稿流水线」及其依赖链本次不入库**：核实发现其核心包（`ra-逐字稿提取skill`、`ra-洗稿`、`ra-video-production-director`）写死了作者本机私有环境——`ZT_HOME` 环境变量、`automation/scripts` 私有脚本、`01-内容生产/` 固定目录树、`indextts2-local` 本地语音服务与私有音色 `pluvio-indextts2-calm-v1`。连带依赖一起登记后用户仍无法使用，故暂缓。
4. **「爆款视频安全改编」保持现状**：其已在货架（`sk-omx-recreate-viral-video`，git 源 `omnimux-ai/OmniMux-skills`），不重复登记。

## 2. 数据契约

### 2.1 货架条目（`catalog/index.json` → `items[]` 末尾，追加 1 条）

条目形态沿用同仓既有同源先例（`Pluviobyte/rnskill` 的 `sk-omx-editorial-collage-motion`）：

```json
{
  "id": "sk-omx-rn-motion-replica",
  "tab": "skills",
  "kind": "skill",
  "title": "动效复刻",
  "subtitle": "rnskill",
  "summary": "拆解参考视频的布局、运动、时序与转场，重建为原创动效复刻并做成片质检。源：Pluviobyte/rnskill（git）。",
  "category": "sk-visual",
  "tags": ["AIGC", "动效", "rnskill", "专业影视"],
  "skill": "rn-motion-replica",
  "source": { "type": "git", "repo": "Pluviobyte/rnskill", "path": "skills/rn-motion-replica", "ref": "main" }
}
```

- 入口顺序：`items` **数组末尾**追加（降低与其他在途 PR 的文本冲突概率）。
- 分类 `sk-visual`（视觉与视频）；本任务**不新建**目录分类（`categories` 数组不动）。
- 领域标签取自技能工坊既有领域词表（`WORKSHOP_DOMAINS`）：`专业影视`；另外三项为 `AIGC`、主题词 `动效`、来源名 `rnskill`。

### 2.2 解析层约束（`plugins/omnimux-market/src/expert/catalog.js` 的 `parseItem`/`parseSource`）

| 字段 | 约束 | 本任务取值 |
|---|---|---|
| `id` | `^[a-z0-9]+(-[a-z0-9]+)*$`，全目录唯一 | `sk-omx-rn-motion-replica`（与既有 385 条不冲突） |
| `kind` / `tab` | 枚举内 | `skill` / `skills` |
| `title` | 非空，≤40 字 | `动效复刻`（4 字） |
| `summary` | 非空，≤200 字 | 见 §2.1，约 60 字 |
| `subtitle` | 截断至 24 字 | `rnskill` |
| `category` | 已有分类 id | `sk-visual` |
| `tags` | ≤8 个 | 4 个 |
| `skill` | `^[a-z0-9]+(-[a-z0-9]+)*$` | `rn-motion-replica` |
| `source.type` | `git` 时 `repo` 须匹配 `owner/name`，`path` 非空、不得含 `..`、不得以 `/` 开头 | `Pluviobyte/rnskill` + `skills/rn-motion-replica` |

- **双语门禁范围**（`skill-bilingual.md` §4）：门禁只作用于 `recommended === true` 的官方货架条目。本条目**不进精选**（不写 `recommended`），故无需 `titleZh/titleEn/summaryZh/summaryEn`；渲染层按既有兜底链显示 `title`/`summary`。
- 文件格式保真：保持既有 **2 空格缩进 + 末尾换行**，不引入 CRLF、不引入制表符、不重排既有内容。

## 3. 安装链路契约（沿用，不改造）

| 环节 | 既有行为 | 本任务要求 |
|---|---|---|
| 渠道归属 | `catalogSkillChannel()`：`id` 以 `sk-omx-` 开头 → `custom` | 落 `custom`（与既有第三方 git 源条目一致） |
| slug 解析 | `catalogSkillSlug()`：优先 `skill` 字段 | 返回 `rn-motion-replica` |
| 命中 | `findCatalogSkill(slug/id)` | 按 id 与 slug 均命中同一条 |
| 安装 | `installFromCatalog()` 走 `source.git` → 拉取 `<path>/SKILL.md` 等文件写入 `$DSH_HOME/skills/<slug>/` | 上游路径可读（HTTP 200），安装可解析 |

## 4. 新用户基线

- **全新用户**：在技能工坊看到「动效复刻」卡片，点安装后从公网 `github.com/Pluviobyte/rnskill` 拉取技能文件，落盘到自己的技能目录；不需要任何开发机私有状态。
- **缺依赖时的行为**：安装依赖公网可达与 GitHub 可访问。网络不可达或上游删除该路径时，安装链路按既有行为**报错并保留原始错误**，不静默降级、不伪造成功。
- 技能运行时需要本机具备 `python3`（包内 `scripts/*.py`）与 `ffmpeg`/`ffprobe`（正文第 2 步要求用 `ffprobe` 校验参考片）。这些是**用户侧可选工具依赖**，不是本仓登记项；本任务不引入开发机私有路径，不新增产品运行时依赖。

## 5. 验收标准（可观察）

1. **条目存在且唯一**：`catalog/index.json` 中 `id = sk-omx-rn-motion-replica` 恰好出现一次；条目总数 385 → 386。
2. **源字段逐条正确**：`source.type === "git"`、`source.repo === "Pluviobyte/rnskill"`、`source.path === "skills/rn-motion-replica"`、`source.ref === "main"`。
3. **解析层可达**：用插件自身解析器加载目录后，`catalogSkillChannel()` 返回 `custom`；`catalogSkillSlug()` 返回 `rn-motion-replica`；`findCatalogSkill()` 按 id 与 slug 命中同一条。
4. **领域可达**：该条 `workshopDomains()` 非空且含 `专业影视`。
5. **上游可解析**：`https://raw.githubusercontent.com/Pluviobyte/rnskill/main/skills/rn-motion-replica/SKILL.md` 返回 HTTP 200。
6. **无人受损**：既有 385 条逐字节未变（除末尾插入位置的分隔符），`verify:skill-bilingual` 与相关单测全绿。

## 6. 验证计划（本任务实跑）

| 检查 | 命令 | 期望 |
|---|---|---|
| 目录解析与字段 | `node -e` 载入 `src/expert/catalog.js` 断言 §5.1–5.4 | 全通过 |
| 上游探活 | `curl -o /dev/null -w '%{http_code}'`（见 §5.5） | `200` |
| 既有条目未变 | `git diff` 仅新增（1 条 + 分隔符）且无删除行 | 通过 |
| 双语门禁 | `corepack pnpm verify:skill-bilingual` | 非零退出为失败 |
| 插件单测 | `corepack pnpm --filter omnimux-market test` | 全绿 |

## 7. 非目标

- 不改界面代码、交互、样式；不改精选位（`featured`）、推荐理由与封面（`cover`）——本条目不设封面，卡片走既有默认样式。
- 不做出厂预装（`preinstalled`）、不改 `catalog/preset-skills.json`、不改 `catalog/skills/` 包内技能正文。
- 不新建目录分类（`categories` 数组不动）。
- 不登记「视频洗稿流水线」及其依赖链，不登记其兄弟包（见 §1.3）。
- 不修改上游 `Pluviobyte/rnskill` 仓库；不在本仓复制技能正文（禁止第二份真源）。
- 不动跨插件模型契约、不发版、不改生产环境。

## 8. 风险与回滚

- **R2**：纯目录数据追加，运行时对单条脏数据是「过滤该条」而非整体不可用（`workshop-query` 拒绝即出局）。
- 回滚 = 删除该条（或 revert 本 PR）；无数据迁移、无存储副作用。
- 冲突面：`catalog/index.json` 是高频修改文件，追加在末尾降低与在途 PR 的文本冲突概率；若基线已前移，按同位置重放。
- **第三方许可**：上游 `Pluviobyte/rnskill` 为 CC BY-NC 4.0。本仓只登记安装来源、不分发其正文，与同源既有先例 `sk-omx-editorial-collage-motion` 形态一致。
