# 官方核心主打技能：图文复刻（replicate-carousel）上架技能插件市场

Issue: #2719 · 风险 R1 · 插件 omnimux-market

## 1. 目标（Objective）

将《图文复刻》（`replicate-carousel`，市场条目 `sk-omx-replicate-carousel`）作为官方精选与核心主打技能上架至技能插件市场，用户在技能市场中可选安装使用。

- 用户可见名称：图文复刻 (Carousel Replication)
- 市场分类：图片和静态广告（`image-static`）
- 技能定位：拆解爆款多图与轮播图视觉逻辑，为新商品或新选题原创复刻逐页方案与生图提示词
- 安装类型：市场可选安装（`marketplace`）
- 推荐与热门状态：官方精选推荐（`recommended: true`）、热门标识（`isHot: true`）、置顶排序（进入官方重磅精选置顶序列）

## 2. 影响与文件清单

| 路径 | 操作 | 说明 |
| --- | --- | --- |
| `plugins/omnimux-market/catalog/index.json` | 修改 | 将 `sk-omx-replicate-carousel` 设为 `recommended: true`，`isHot: true`，保持 `installType: marketplace` |
| `scripts/generate-featured-skills.mjs` | 修改 | 将 `sk-omx-replicate-carousel` 加入官方精选置顶序列 `PINNED_TOP_SKILL_IDS` |
| `plugins/omnimux/src/client/session-guide/skills/featured-skills.json` | 重新生成 | 刷新 Hub 精选快照，与目录保持 100% 逐字节对齐 |

## 3. 验收标准与门禁用例（Acceptance Criteria）

- **AC1**：`catalog/index.json` 中 `sk-omx-replicate-carousel` 字段包含 `recommended: true`, `isHot: true`, `installType: "marketplace"`。
- **AC2**：静态双语门禁 `node scripts/verify-skill-bilingual.mjs` 全量通过（113/113 条目双语齐备）。
- **AC3**：精选快照校验 `node scripts/generate-featured-skills.mjs --check` 全量通过（113 条精选技能，包含 `sk-omx-replicate-carousel` 且置顶）。
- **AC4**：市场目录完整性门禁 `node scripts/verify-market-catalog.mjs` 全量通过（240 个条目，可选安装 239 个）。

## 4. 新用户基线（Product Baseline）

所有配置与技能实体均随产品包本地内置，不依赖任何外部云端服务、网络请求或开发机专属私有状态。新用户安装后即可在技能市场中浏览、搜索并可选安装。
