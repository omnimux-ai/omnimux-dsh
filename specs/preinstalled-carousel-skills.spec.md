# 预装技能：商品轮播图 / 图文复刻（创作图片分类）

Issue: #2609 · 风险 R2 · 插件 omnimux-market

## 1. 目标（Objective）

把两款已产出的电商图文技能作为**预装技能**纳入产品，使用户在输入框的技能菜单里按「创作图片」分类直接看到并选用：

| 技能 | slug | 用户可见名 | 源材料（只读） |
| --- | --- | --- | --- |
| 商品轮播图 | `shoppable-carousel` | 商品轮播图 | `…/creatok/skills/shoppable-carousel` |
| 图文复刻 | `replicate-carousel` | 图文复刻 | `…/creatok/skills/replicate-carousel` |

用户是谁：使用 OmniMux 做电商图文/轮播内容运营的人；他们按 Agent 预设（默认「全能社媒操盘手」）在输入框技能菜单里挑技能。

成功长什么样：技能菜单「创作图片」分类下从 6 款变为 8 款，新增两款可点选挂载；两款技能实体随产品内置（技能库可解析、可安装到本机技能目录）。

## 2. 用户操作旅程与期望界面反馈

1. 用户打开一个会话（Agent 模式 = 社媒预设），点输入框区域的技能入口 → 技能菜单弹出。
2. 分类区点击「创作图片」页签 → 列表只显示该分类技能。
3. **期望**：列表出现 8 张卡片，其中包含「商品轮播图」「图文复刻」，各自带标题、一句说明、封面缩略图，且**不带「未安装」角标**（预装态）。
4. 用户点「商品轮播图」→ 卡片进入选中态，输入框底部出现该技能的技能胶囊，胶囊文案为该技能名。
5. 用户再点一次（或点胶囊上的 ✕）→ 选中态取消，胶囊消失。
6. 切到另一个 Agent 预设（`omni-agent`）重复步骤 2–3 → 同样可见这两款。

## 3. 命令（Commands）

在产品根或任务工作树内执行：

```bash
# 定向测试（技能菜单数据与解析）
node --test plugins/omnimux-market/src/client/skill-linkage.test.js
node --test plugins/omnimux-market/src/client/preset-skill-lookup.test.js

# 插件全量测试（含构建）
corepack pnpm --filter omnimux-market test

# 数据形态门禁
corepack pnpm verify:skill-bilingual
corepack pnpm presets:verify
```

## 4. 项目结构（Project Structure）

| 路径 | 角色 |
| --- | --- |
| `plugins/omnimux-market/catalog/preset-skills.json` | 输入框技能菜单的**出厂预设真源**（按 Agent 预设分组） |
| `plugins/omnimux-market/catalog/skills/<slug>/` | 内置技能实体（SKILL.md + 附属文件 + 元数据） |
| `plugins/omnimux-market/src/client/skill-picker-logic.js` | 绑定解析与分类过滤（`getPresetSkillBinding` / `filterPresetSkills` / `findPresetSkill`） |
| `plugins/omnimux-market/src/client/skill-picker.js` | 技能菜单渲染 |
| `specs/`（本工作树） | 本规格 |

## 5. 数据形态（Code Style）

`preset-skills.json` 中每个预设的 `skills[]` 条目，逐字沿用同分类既有条目的字段形状：

```json
{
  "id": "sk-tk-shoppable-carousel",
  "slug": "shoppable-carousel",
  "skill": "shoppable-carousel",
  "name": "商品轮播图",
  "title": "商品轮播图",
  "titleZh": "商品轮播图",
  "titleEn": "Shoppable Carousel",
  "category": "创作图片",
  "description": "…一句中文说明…",
  "summary": "…与 description 同文…",
  "installed": true,
  "isHot": false,
  "isNew": false,
  "coverIndex": 6,
  "cover": "catalog/covers/skills/skill-card-6.webp",
  "downloads": 0
}
```

技能实体目录形态对齐产品自研技能（参照 `catalog/skills/replicate-viral-video/`）：`SKILL.md` 原文保留 + 原附属目录（references / templates / scripts / schemas / examples）+ `meta.yaml` 元数据（中英双语字段，仿既有条目）。

## 6. 测试策略（Testing Strategy）

- 框架：`node --test`（仓库既有）。
- 位置：`plugins/omnimux-market/src/client/*.test.js`。
- 层：数据层断言（分类计数、条目字段、预装态、解析命中）+ 真实浏览器端到端（技能菜单可见性与交互）。
- 期望：本次新增/修改的断言全绿；既有断言只做计数同步（6 → 8），不放松。

## 7. 边界（Boundaries）

- **总是**：追加而非改写既有条目；保持既有 6 款字段与顺序不变；保留源技能 SKILL.md 内容。
- **先问**：是否同时上架技能货架（`catalog/index.json`）；是否改动技能菜单交互与样式。
- **绝不**：修改出厂 Agent 预设真源 `presets/*/skills.json`；改动其余预设；修改资产库源文件（只读引用）；新增第三个分类。

## 8. 验收用例（Acceptance Criteria）

| # | 用例 | 期望 |
| --- | --- | --- |
| AC1 | `filterPresetSkills(binding.skills, '创作图片')`（`tiktok-agent`） | 长度 8，含 `shoppable-carousel`、`replicate-carousel` |
| AC2 | 同上（`omni-agent`） | 长度 8，含两款 |
| AC3 | 两款条目的 `installed` | `true`（预装态，不显示未安装角标） |
| AC4 | `findPresetSkill('shoppable-carousel')` / `('replicate-carousel')` | 命中，`installed === true`，`presetId ∈ {tiktok-agent, omni-agent}` |
| AC5 | 技能实体 | `catalog/skills/<slug>/SKILL.md` 存在且非空，附属目录完整 |
| AC6 | 真实浏览器：技能菜单 →「创作图片」 | 可见「商品轮播图」「图文复刻」两张卡片（截图证据留存） |
| AC7 | 真实浏览器：点选两款 | 技能胶囊点亮；再点取消 |
| AC8 | 既有分类 | 「创作视频」仍 7 款；其余分类计数不变；「搜索爆款视频」仍返回空集 |
| AC9 | 技能货架注册 | `catalog/index.json` 注册两款技能，归入 `image-static` 分类（图片和静态广告），双语字段完备 |
| AC10 | 双语门禁 | `corepack pnpm verify:skill-bilingual` 114/114 官方货架技能全量通过 |

## 9. 新用户基线（Product Baseline）

两款技能随产品包内置：技能实体在 `catalog/skills/`，菜单条目在 `preset-skills.json`，货架索引在 `catalog/index.json`，不依赖任何开发机私有状态、本地服务或绝对路径。缺失时（例如包裁剪）技能菜单仍能渲染其余条目——条目缺失只表现为卡片不出现，不产生报错；技能库解析不到时 `findPresetSkill` 返回 `null`，消费方据此不渲染入口（既有行为）。

## 10. 决策与落地记录

- 决策一：两款技能归属与既有 6 款相同的两个预设（`tiktok-agent`、`omni-agent`）。
- 决策二：`installed: true`（预装态）是产品对「预装」的既有语义，与其余 6 款创作图片技能一致。
- 决策三（用户已拍板）：用户确认「同时上架到技能/专家页」，已在 `catalog/index.json` 补充 `sk-omx-shoppable-carousel` 与 `sk-omx-replicate-carousel` 两条官方货架条目，归入 `image-static`（图片和静态广告），双语门禁 114/114 全绿。
