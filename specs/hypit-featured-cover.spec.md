# Spec · Hypit 官方精选置顶 + 专属封面

- Issue: #2165
- Date: 2026-09-17
- Baseline: brand-new user machine; no dev-only paths

## Objective

将「Hypit 官方能力接入」设为官方精选第一位，并配置专属封面图（不再复用其他技能封面）。

## Acceptance

| ID | Criterion |
| --- | --- |
| AC-1 | `skill-recommendations.json` 的 `featuredSkills[0]` 为 `sk-omx-hypit-setup` |
| AC-2 | `homeRecommendations[0]` 同为 `sk-omx-hypit-setup`（首页精选首位） |
| AC-3 | `catalog/covers/hypit-setup.png` 存在；`index.json` 条目 `cover.asset` 指向该文件 |
| AC-4 | `featured-skills.json` 快照与目录一致且首位为 Hypit |
| AC-5 | 双语门禁 / 产品基线通过 |

## Commands

```bash
node scripts/generate-featured-skills.mjs
node --test scripts/generate-featured-skills.test.mjs
corepack pnpm verify:skill-bilingual
node scripts/verify-product-baseline.mjs
```

## Boundaries

- Always: 不捆绑 Hypit 引擎；封面无第三方 LOGO/可读商标字
- Never: 把 Hypit 可执行包打进产品
