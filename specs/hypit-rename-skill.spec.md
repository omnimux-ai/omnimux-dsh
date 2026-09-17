# Spec · 将 Hypit Skill 名称改为 Hypit-克隆爆款视频

- Issue: #2177
- Date: 2026-09-17
- Baseline: brand-new user machine; no dev-only paths

## Objective

将 Hypit 官方能力接入技能的名称更新为「Hypit-克隆爆款视频」，统一技能市场条目、封面 alt、SKILL.md 说明与会话精选快照中的展示文案。

## Acceptance Criteria

| ID | Criterion |
| --- | --- |
| AC-1 | `plugins/omnimux-market/catalog/index.json` 中 `sk-omx-hypit-setup` 的 `title` 与 `titleZh` 均为 `Hypit-克隆爆款视频` |
| AC-2 | `cover.alt` 与 `homeCover.alt` 更新为 `Hypit-克隆爆款视频` |
| AC-3 | `catalog/skills/hypit-setup/SKILL.md` 标题为 `# Hypit-克隆爆款视频（安装引导）`，使用说明对齐新名称 |
| AC-4 | 执行 `node scripts/generate-featured-skills.mjs` 后，`plugins/omnimux/src/client/session-guide/skills/featured-skills.json` 中首位技能的 `title` 与 `titleZh` 均为 `Hypit-克隆爆款视频` |
| AC-5 | 自动化测试（`hypit-setup-guide.test.js`、`hypit-featured-cover.spec.js`、`generate-featured-skills.test.mjs`）与基线校验全部通过 |

## Product Baseline

- 不引入开发机特有路径与配置。
- 修改仅涉及元数据展示名称与配套说明，不改变既有的会话引导交互模式与免捆绑安全边界。

## Boundaries

- Always: 保持 ID `sk-omx-hypit-setup` 和 slug `hypit-setup` 不变；保留 Hypit 品牌及官方安装渠道说明
- Never: 捆绑或镜像 Hypit 引擎二进制
