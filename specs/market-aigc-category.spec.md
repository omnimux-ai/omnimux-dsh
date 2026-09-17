# 规范：新增「AIGC 创作」技能分类 + 入库 18 项 AIGC 技能

> 任务真源：Issue #2139 · 分支 `agent/market-aigc-category-issue-2139` · 基线 `origin/main` = `79d11aa49`。
> 本文件是本任务人与 Agent 共享的验收真相源：写码前定死「建什么、怎样算完成」。
> 上游机制真源：`src/client/skill-picker-logic.js`（货架分类单一真源）、`src/workshop-query.ts`（服务端领域镜像）、`src/client/plaza/plazaUtils.js`（顺序镜像）、`src/client/skill-plaza.js`（契约注释）、`src/client/skill-shelf-parity.test.js`（一致性守卫）。本任务**沿用**既有分类机制，不新增第二套分类体系。

## 1. 业务目标与背景

用户要求：新增「AIGC 创作」分类，并从资产库（OPC 资产库）挑一批 AIGC 相关技能一起入库到该分类。

现状：技能工坊 / 技能广场的领域分类来自客户端货架分类表；分类过滤走条目的 `tags`（`itemShelfTags` → `workshopDomains`）。原 9 项 agentara/skills 技能此前分散在「专业影视 / 商业广告 / 创意实验」三个分类。

## 2. 分类契约（五处同步，缺一即漂移）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `plugins/omnimux-market/src/client/skill-picker-logic.js` | `SKILL_SHELF_TAXONOMY` 增加一行 `{ id: 'AIGC 创作', labelKey: 'picker.tab.aigc', keywords: ['AIGC 创作'] }` |
| 2 | `plugins/omnimux-market/src/client/i18n.js` | 中文 `picker.tab.aigc: 'AIGC 创作'`；英文 `picker.tab.aigc: 'AIGC Creation'` |
| 3 | `plugins/omnimux-market/src/workshop-query.ts` | `WORKSHOP_DOMAINS` 增加 `'AIGC 创作'`（服务端查询校验） |
| 4 | `plugins/omnimux-market/src/client/plaza/plazaUtils.js` | `WORKSHOP_DOMAIN_ORDER` 增加 `'AIGC 创作'`（顺序镜像） |
| 5 | `plugins/omnimux-market/src/client/skill-plaza.js` | 领域契约注释行与 `WORKSHOP_DOMAIN_ORDER` 逐项一致 |

- **位置**：`WORKSHOP_DOMAIN_ORDER` 中置于 `'套件'` 之后（第 2 位）；`SKILL_SHELF_TAXONOMY` 中置于首行。两表成员集合必须相等（守卫测试按集合比较）。
- **keywords 只放分类名本身**：禁止放 `生图 / 视频 / 图像` 等泛词，否则 `matchesDomainTag` 的兜底匹配会把无关技能吸入该分类。
- 未改动分类：短剧漫剧 / 专业影视 / 动画 / 商业广告 / 电商 / 教育 / 创意实验 / 音频音乐 / 平台工具（成员与顺序均不变）。

## 3. 目录契约（`plugins/omnimux-market/catalog/index.json`）

### 3.1 已有 9 项（agentara/skills）改为归入新分类

- 仅把 `tags` 中的领域标签替换为 `'AIGC 创作'`（`AIGC`、主题词、`Agentara` 三项保留），其余字段（id / title / summary / category / skill / source）逐字节不变。

### 3.2 新增 18 项 AIGC 技能

条目形态沿用既有第三方 git 源先例：`id` = `sk-omx-<name>`、`tab` = `skills`、`kind` = `skill`、`category` = `sk-visual`、`tags` = `["AIGC", "<主题>", "<来源>", "AIGC 创作"]`、`source` = `{ type: 'git', repo, path, ref: 'main' }`，不设 `recommended` / `cover`。追加位置：`items` 数组末尾。

| # | 来源仓库 | 仓库内路径 | 中文标题 |
|---|---|---|---|
| 1 | `ZJU-REAL/Easel` | `skills/openclaw/ai-image-gen` | AI 生图（文生图／图生图） |
| 2 | `ZJU-REAL/Easel` | `skills/openclaw/image-editing` | 图像处理与加水印 |
| 3 | `ZJU-REAL/Easel` | `skills/openclaw/image-enhance` | 图片增强与放大 |
| 4 | `ZJU-REAL/Easel` | `skills/openclaw/remove-bg` | 抠图与换背景 |
| 5 | `ZJU-REAL/Easel` | `skills/openclaw/ai-video-gen` | AI 视频生成 |
| 6 | `ZJU-REAL/Easel` | `skills/openclaw/auto-short-video` | 一句话一键成片 |
| 7 | `JimLiu/baoyu-skills` | `skills/baoyu-image-gen` | 多通道 AI 生图 |
| 8 | `JimLiu/baoyu-skills` | `skills/baoyu-cover-image` | 文章封面图生成 |
| 9 | `JimLiu/baoyu-skills` | `skills/baoyu-comic` | 知识漫画创作 |
| 10 | `calesthio/OpenMontage` | `.claude/skills/flux-best-practices` | FLUX 生图实战 |
| 11 | `calesthio/OpenMontage` | `.claude/skills/ltx2` | LTX 视频生成 |
| 12 | `Emily2040/seedance-2.0` | `skills/seedance-prompt` | Seedance 提示词工程 |
| 13 | `Emily2040/seedance-2.0` | `skills/seedance-characters` | 视频角色一致性 |
| 14 | `Emily2040/seedance-2.0` | `skills/seedance-camera` | AI 视频运镜 |
| 15 | `Emily2040/seedance-2.0` | `skills/seedance-examples-zh` | Seedance 中文范例 |
| 16 | `dexhunter/seedance2-skill` | `zh` | 即梦 Seedance 中文提示词 |
| 17 | `Pluviobyte/rnskill` | `skills/editorial-collage-motion` | 拼贴动效出片 |
| 18 | `ArcReel/ArcReel` | `agent_runtime_profile/.claude/skills/generate-grid` | 宫格分镜生图 |

- `title` ≤40 字、`summary` ≤200 字、`tags` ≤8、`source.repo` 须匹配 `owner/name`、`source.path` 非空且不含 `..`（`parseItem`/`parseSource` 约束，与 #2131 相同）。
- 文件格式保真：2 空格缩进、LF、末尾换行；既有 366 条逐字节不变（纯插入）。

## 4. 验收标准（可观察）

| # | 标准 | 判据 |
|---|---|---|
| AC-1 | 分类 chip 出现 | 技能工坊/广场分类栏含「AIGC 创作」；中文界面文案为 `AIGC 创作`，英文界面为 `AIGC Creation` |
| AC-2 | 五处清单一致 | `SKILL_SHELF_TAXONOMY` 与 `WORKSHOP_DOMAIN_ORDER` 成员集合相等且含新分类；契约注释与之逐项一致（`skill-shelf-parity.test.js` 全绿） |
| AC-3 | 过滤正确 | 选中「AIGC 创作」返回 27 条（9 + 18）；既有 9 个分类的成员集合与改动前一致 |
| AC-4 | 登录/列表不回退 | 既有分类 chip、精选、全部列表行为不变（`skill-workshop-ui`、`skill-picker-logic`、`skill-plaza` 相关测试全绿） |
| AC-5 | 目录可解析 | 目录 384 条；18 条新条目 `catalogSkillChannel=custom`、slug 一致、领域非空且为 `['AIGC 创作']`；9 条旧条目领域同样为新分类 |
| AC-6 | 上游可解析 | 18 条上游 `SKILL.md` 逐条 HTTP 200；抽样走真实安装链路落盘并与上游逐字节一致 |
| AC-7 | 真实浏览器证据 | 隔离工作树内真实浏览器加载技能工坊，分类栏含新分类；点击后列表为该分类条目；留 PNG + 结构化 JSON |

## 5. 验证计划（本任务实跑）

| 顺序 | 检查 | 命令/方式 | 期望 |
|---|---|---|---|
| 1 | 目录结构 | python 解析 + 字段断言 | AC-5 通过 |
| 2 | 目录解析 | `lib/expert/catalog.js` + `lib/skill-aggregate.js` + `lib/workshop-query.js` 复算 | 27 条领域均为 `['AIGC 创作']` |
| 3 | 上游探活 | 18 × `raw.githubusercontent.com` | 18×200 |
| 4 | 真实安装抽样 | `installSkill()`（`DSH_HOME` 指向临时目录） | 与上游逐字节一致 |
| 5 | 目录/单元测试 | `pnpm --filter omnimux-market test` | 与基线相比无新增失败 |
| 6 | 双语门禁 | `pnpm verify:skill-bilingual` | 69/69（新条目不进精选，覆盖范围不变） |
| 7 | **真实浏览器预演（先于 e2e）** | 隔离工作树内 Web QA（动态端口、自清理） | AC-7 证据落盘 `docs/evidence/` |
| 8 | 端到端测试 | `plugins/omnimux-market/tests/e2e/*.spec.js` 新增用例 | 全绿 |

> 强制工序：界面源码改动必须先有实机预演证据，再写端到端测试，之后才允许提交（`scripts/guard-quality-loop.mjs` 机械强制）。

## 6. 非目标

- 不改安装链路、精选位、封面、预装；不新增第二套分类体系；不删除既有分类。
- 不并入本轮未选中的来源（如 `rediumvex/ai-video-generator-claude`、`Narcooo/inkos`）。
- 不修改上游仓库；不在本仓复制技能正文。

## 7. 风险与回滚

- **R2**：纯前端标签 + 目录数据。过滤复用既有 `matchesDomainTag` 语义，不新增判定分支。
- 回滚 = revert 本 PR；无数据迁移、无存储副作用。
- 冲突面：`catalog/index.json` 与 `skill-picker-logic.js` 为高频修改文件；本任务在末尾追加并在分类表首位插入，降低与在途 PR 的文本冲突。
