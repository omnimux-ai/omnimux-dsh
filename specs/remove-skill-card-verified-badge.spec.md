# 移除技能卡片「认证对勾徽标」

## 背景与目标
用户反馈：技能卡片标题旁的白色对勾认证徽标（`creatify-card-verified-svg`）需要全部移除，范围覆盖：
1. 创建会话页（session-guide）的技能卡片 `SkillCard.jsx`
2. 创建会话页的模板卡片 `TemplateCardItem.jsx`
3. 技能专家插件入口页（omnimux-market 广场）的精选卡片 `FeaturedCard.jsx`

## 验收标准
- 上述 3 处组件渲染结果中不再出现 `creatify-card-verified-svg` 元素。
- 相关的 `ICON_VERIFIED` 导出与 `renderVerifiedSvg` 函数一并删除（无其他引用后）。
- 既有测试 `home-skill-cards-aurora.test.js` 与 `home-skill-cards-aurora.e2e.test.mjs` 中断言徽标存在的用例，改为断言徽标不存在。
- 卡片其余元素（标题、极光背景、点阵、悬停按钮）行为不变。
- `pnpm --filter` 相关测试全绿。

## 影响面
- plugins/omnimux/src/client/session-guide/skills/SkillCard.jsx
- plugins/omnimux/src/client/session-guide/templates/TemplateCardItem.jsx
- plugins/omnimux-market/src/client/plaza/FeaturedCard.jsx
- plugins/omnimux/src/client/session-guide/templates/home-skill-cards-aurora.test.js
- plugins/omnimux/tests/e2e/home-skill-cards-aurora.e2e.test.mjs
