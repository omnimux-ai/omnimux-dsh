---
title: 市场卡片窄栏状态「去对话试试」图标按钮与气泡提示
id: spec-market-card-compact-try-btn
type: spec
status: draft
authority: L2
date: 2026-09-23
---

# 目标
在技能/专家市场中，当分栏处于窄栏状态（卡片容器宽度较窄）时，3:2 营销技能卡片（FeaturedCard）底部的「去对话试试」从文本按钮平滑退化为圆形图标按钮；鼠标悬停时提供「去对话试试」气泡消息提示，消除窄列文字挤压折行与布局破损。

## 审计与复用
- 卡片根容器已有 `container-type: inline-size; container-name: market-featured-card;`，完全支持标准的 `@container market-featured-card` 容器查询。
- 现有 `FeaturedCard.jsx` 内已有标准的对话气泡图标矢量渲染函数 `renderHoverIcon('try')`，SVG 尺寸与样式规范统一，直接复用。
- 交互直接复用 `safeTrySkillInSession` 与已有会话注入能力，保证功能无回退。
- 设计系统：严格消费 `--dsw-alias-*` 标准 Token，不自造变量，符合产品设计规范。

## 验收标准
1. **容器响应式退化**：基于 `@container market-featured-card (max-width: 288px)` 容器宽度判定：
   - 充足宽度（> 288px）：展示完整按钮（图标 + 文字标签），并设置 `white-space: nowrap` 确保永不拆行折叠；
   - 窄栏状态（≤ 288px）：文字标签退出布局（`display: none`），按钮收紧为圆形图标按钮（24px × 24px，50% 圆角，内边距归零，图标居中），与左侧「40 次使用」并排无重叠溢出。
2. **气泡消息提示**：
   - 按钮配置 `title="去对话试试"`（英文为 `Try in Chat`），鼠标悬停时浮出系统标准气泡文本提示；
   - 同时配置对齐的 `aria-label="去对话试试"`，保障屏幕朗读等无障碍访问体验。
3. **交互与点击事件一致性**：
   - 点击图标按钮同样触发 `onTryClick`（临时接入会话尝试），行为与原文本按钮完全一致；
   - 点击卡片其他区域仍正常触发卡片详情弹窗。
4. **测试与回归验证**：
   - 补齐/更新针对紧凑状态卡片 CTA 几何断言与 DOM 结构测试，通过所有自动化测试并形成隔离环境真实浏览器验证记录。

## 新用户基线
纯前端视觉与样式响应式优化，不引入任何额外依赖与后端接口变更。
