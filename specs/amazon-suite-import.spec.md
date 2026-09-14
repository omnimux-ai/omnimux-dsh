# 规范：亚马逊运营全套（Amazon-Skills）作为「套件」入库 + 平铺多技能仓库装载

> 任务真源：Issue #1685 · 分支 `agent/market-amazon-suite-issue-1685`。
> 本文件是本任务人与 Agent 共享的验收真相源：写码前定死「建什么、怎样算完成」。
> 上游机制真源：`specs/suite-marketplace.spec.md`（PR #1671 已合入主干的「套件」能力）。本任务**沿用**该机制，不改造它。

## 1. 业务目标与背景

### 1.1 现状

技能市场「套件」分类（`kind: 'suite'`）已支持 6 个社媒 / 内容方向的套件：一张卡看构成、详情页按「技能 / 规则 / Agent」三块看清单、一键安装三样到位。

既有 6 个套件的技能都躺在**包内的统一中间层**：`<包根>/skills/<技能名>/SKILL.md`。装载逻辑据此写成「扫 `<包根>/skills/` 再摊平」。

### 1.2 本次入库对象

资产库新入库 **`nexscope-ai/Amazon-Skills`**：52 个亚马逊卖家运营技能包。它的仓库形态与既有套件**不同**——52 个技能直接躺在**仓库根**下，**没有** `skills/` 中间层：

```
Amazon-Skills/
├── amazon-ppc-campaign/SKILL.md
├── amazon-advertising-strategy/SKILL.md
├── …（共 52 个）
└── README.md
```

同时仓库根**没有** SKILL.md（不像专家包自带根入口），也**没有** `.git`（本机副本是拷贝而非克隆）。

### 1.3 目标

1. **入库**：在 `catalog/index.json` 末尾追加一条 `kind: 'suite'` 条目 `suite-amazon-skills`，分类 `sk-suite`，构成 52 技能 / 0 规则 / 0 Agent。
2. **数据层**：套件清单的**技能项**支持可选 `path`（包内相对路径），缺省空串 = 沿用 `<包根>/skills/<name>/` 旧语义。
3. **安装层**：技能装载支持「平铺多技能仓库」——清单项带 `path` 时按 `<包根>/<path>/` 装载，缺省仍走 `<包根>/skills/<name>/`。

### 1.4 用户已确认的决策（不得自行更改）

1. **与其他套件同等对待**：不新造卡片形态、不新造详情页形态、不新造安装入口——沿用「套件」既有的一整套界面与流程。
2. **标题 / 摘要 / 标签按任务给定值原样入库**（`title: 亚马逊运营全套`），不做二次改写。
3. **52 条技能的中文名与中文说明取自已备好的对照数据**，逐字入库，不重写、不润色、不补造。

## 2. 数据契约

### 2.1 货架条目（`catalog/index.json` → `items[]` 末尾）

```json
{
  "id": "suite-amazon-skills",
  "tab": "skills",
  "kind": "suite",
  "title": "亚马逊运营全套",
  "summary": "52 个亚马逊卖家运营技能包，覆盖广告投放、关键词研究、Listing 优化、评论管理、FBA 计算与品牌合规。",
  "category": "sk-suite",
  "tags": ["亚马逊", "跨境电商", "运营"],
  "skill": "amazon-skills",
  "source": { "type": "git", "repo": "nexscope-ai/Amazon-Skills", "path": ".", "ref": "main" },
  "suite": { "skills": [ /* 52 条 */ ], "rules": [], "agents": [] }
}
```

- 追加位置：`items` **数组末尾**（降低与其他在途 PR 的文本冲突概率）。
- 52 条技能，每条 `{ name, title, desc, path }`：
  - `name` / `title` / `desc` 取自 `tmp/suite-demo/amazon-suite-skills.json`（`name` 与磁盘目录逐一对齐，52/52 命中）；
  - `path` = 该技能在仓库内的相对路径，本仓库中**等于目录名**，即 `"path": "amazon-ppc-campaign"`。
- 约束（`catalog.js` 的 `parseItem`）：`title` ≤ 40 字、`summary` ≤ 200 字、`tags` ≤ 8 个、`id`/`category`/`skill` 均须匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`。
- 文件格式保真：保持既有 **2 空格缩进 + 末尾换行**，不引入 CRLF、不引入制表符、不重排既有内容。

### 2.2 清单项 `path` 语义（`parseSuiteManifest`）

- **仅技能项**获得 `path`；规则项与 Agent 项**形状不变**（不新增键），以免影响既有 6 个套件与其客户端渲染。
- 技能项 `path` 为**可选字符串**，缺省投影为**空串**（表示沿用旧语义）。非字符串一律投影为空串，不抛错。
- 既有 6 个套件的技能项**没有** `path` → 解析结果与改造前逐字段一致（空串），行为**零变化**。

## 3. 安装契约（`suite-install.ts`）

### 3.1 技能装载路径选择

对每个待装技能名 `name`：

| 条件 | 源目录 |
| --- | --- |
| 清单项带非空 `path` | `<包根>/<path>/` |
| 清单项无 `path`（空串） | `<包根>/skills/<name>/`（**不变**） |

- 判据是「该技能目录下存在 `SKILL.md`」，落点仍是 `$DSH_HOME/skills/<name>/SKILL.md`（技能库摊平语义不变）。
- `path` 必须是**安全的包内相对路径**：不得为绝对路径、不得含 `..` 段、每段须匹配既有 `isSafeName` 规则之外的路径字符集（允许 `/` 分隔）。不合规的 `path` 记为该技能失败，**不落盘、不越界读取**。
- 包内找不到源 `SKILL.md` 时的失败文案要能区分两种形态：带 `path` 时报 `<path>/SKILL.md`，缺省时报 `skills/<name>/SKILL.md`。

### 3.2 必须保持的既有语义（不得回归）

1. **已装判据**：`$DSH_HOME/skills/<name>/SKILL.md` 存在即为已装（返回 `already`，不覆盖、不回滚）。
2. **部分失败语义**：任一环节失败 → `partial: true` + `failed[]` 列出未完成项；**已成功项不回滚**；三件事（技能 / 规则 / Agent）彼此独立，一个环节失败不阻断其余环节。
3. **幂等**：同一套件重复安装，第二次全部 `already`，`result.already === true`，磁盘不再发生写入。
4. **既有 6 个套件装载行为逐字节不变**：它们的技能项无 `path`，仍走 `<包根>/skills/<name>/`。
5. **写入边界**：只写 `$DSH_HOME` 之下 + 显式选定项目根的 `AGENTS.md`；规则托管段 `omnimux-suite:<id>` 标记与逐字节还原语义不变。

## 4. 用户操作旅程与期望界面反馈

### 4.1 旅程 A：在货架上认出这个套件

1. 用户打开技能市场，点分类栏「套件」。
2. **期望**：列表出现 **7** 张套件卡（既有 6 张 + 亚马逊 1 张）；亚马逊卡的标题为「亚马逊运营全套」，描述为该条目的 `summary`。
3. **期望**：该卡构成行为 **`技能 52 · 规则 0 · Agent 0`**（0 也显示为 0，不隐藏、不伪造）。
4. **期望**：套件卡不出现技能开关（既有套件卡约定）。

### 4.2 旅程 B：在详情页看清单

1. 用户点击「亚马逊运营全套」卡片。
2. **期望**：详情页标题为「亚马逊运营全套」，来源行可读，描述为该条目的 `summary`。
3. **期望**：只渲染「技能」一块（规则、Agent 为空 → **整块连同标题不出现**，不显示空态占位）。
4. **期望**：技能块渲染 **52** 张条目卡，每张显示**中文标题**与**中文说明**（逐条与目录数据一致）。
5. **期望**：详情容器几何为正（宽高 > 0），页面无横向溢出，无 JS 异常与 console error。

### 4.3 旅程 C：一次安装全部到位

1. 用户在详情页点「安装」，在确认框选「当前项目」，确认。
2. **期望**：52 个技能全部落到 `$DSH_HOME/skills/<name>/SKILL.md`（逐一存在），回执技能计数为 新增 52 / 失败 0，`partial` 为假。
3. **期望**：重复安装第二次返回全部 `already`，不重复写入。
4. **期望**：规则 / Agent 为空 → 不产生任何 AGENTS.md 写入、不产生 `.agent-presets/` 目录。

## 5. 验收标准

### 5.1 自动化测试

| # | 断言 | 落点 |
| --- | --- | --- |
| T1 | 技能项 `path` 被解析；缺省为空串；规则 / Agent 项**不含** `path` 键 | `src/expert/catalog.test.js` |
| T2 | 既有 6 个套件解析结果与改造前一致（无 `path` → 空串），`skills/rules/agents` 计数不变 | 同上 |
| T3 | 平铺装载：清单项带 `path` 时从 `<包根>/<path>/` 装载到 `$DSH_HOME/skills/<name>/SKILL.md` | `src/tests/suite-install.test.ts` |
| T4 | 缺省装载：清单项无 `path` 时仍从 `<包根>/skills/<name>/` 装载（旧语义） | 同上 |
| T5 | 不安全 `path`（绝对路径 / 含 `..`）被拒，记失败，不落盘 | 同上 |
| T6 | 带 `path` 的技能缺 `SKILL.md` 时失败文案指向 `<path>/SKILL.md` | 同上 |
| T7 | 真目录计数：`catalog/index.json` 的 `suite-amazon-skills` 技能数 = 52，且 `path` 集合与 `tmp/suite-demo/amazon-suite-skills.json` 的 `name` 集合逐元素一致 | 新增 `src/tests/amazon-suite-catalog.test.js` |
| T8 | 既有 6 个套件不回归：条目数、分类、三块计数与改造前一致 | 同上 |
| T9 | 插件全量 `npm test` 全绿（既有 2 例环境故障除外，`lib/tests/host.test.js`、`lib/tests/workshop-request-guard.test.js`，主检出同样复现） | 全量套件 |

### 5.2 实装验证（临时 DSH_HOME）

用**临时** `DSH_HOME` 实跑一次 `installSuite`，断言：

- `$DSH_HOME/skills/<name>/SKILL.md` 对 52 个技能名**逐一存在**（计数 = 52）；
- 落点路径样例与源目录名一致；
- 重复安装第二次全部 `already`；
- 真实 `~/.dsh` **零改动**。

### 5.3 真实浏览器证据

在**本任务工作树**内用真实 Chrome（headless）渲染生产组件（esbuild 打包真实 `PlazaCardGrid.jsx` / `SuiteDetailModal.jsx` / `usePlazaFilter.js` + 真实 `catalog/index.json` + 真实 `css.js` / `i18n.js`），动态端口、自清理，断言：

| # | 断言 |
| --- | --- |
| B1 | 套件分类下 `.regular-card` 数量 = **7**，且亚马逊卡在列 |
| B2 | 亚马逊卡构成行文案 = **`技能 52 · 规则 0 · Agent 0`** |
| B3 | 卡片标题与描述与目录条目逐字一致 |
| B4 | 卡片几何为正（宽 > 0、高 > 0） |
| B5 | 详情页 `.ws-suite-block-title` = `["技能"]`（规则 / Agent 空块整块不出现） |
| B6 | 技能块渲染 **52** 张卡，中文标题与中文说明逐条与目录数据一致 |
| B7 | 详情几何为正、无横向溢出、`Runtime.exceptionThrown` = 0、`console.error` = 0 |
| B8 | 留存 PNG 截图与结构化 `measurements.json` 报告 |

证据落点：`.workbuddy/evidence/amazon-suite-qa/`（新目录，**不覆盖**既有 `suite-browser-qa/`）。

## 6. 非目标（本任务明确不做）

- 不改造「套件」的卡片 / 详情页 / 安装确认框等既有界面形态。
- 不为亚马逊套件新增规则或 Agent（该仓库两者皆无）。
- 不改动其余 6 个套件的目录数据。
- 不引入 `path` 之外的新清单字段；不支持嵌套 `skills/` 之外的多级约定之外的目录发现。
