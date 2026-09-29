# 实测证据：恢复新会话输入框 780px 经典舒适打字黄金宽度 (Issue #2825)

## 一、验证环境
- 目标端：OmniMux Web 开发端 (`http://127.0.0.1:45120/`)
- 关联 Issue：#2825
- 关联规格：`specs/2825-restore-780px-composer-width.spec.md`
- 视口基准：2700x1553 (超宽屏高分视口)

## 二、修复前后数据量化与视觉对比

### 1. 修复前（缺陷态）
- 输入框卡片：`max-width: var(--dsh-composer-card-max-width, 952px)!important`
- 实测计算宽度：`952px`（拉宽了 172px，占 1200px 内容卡片的 80%）
- 视觉弊病：输入短文本（如“为我解释下这个技能的最佳使用方式”）时，输入框右侧大面积空旷死区，显得极其扁平拉伸，破坏了视觉重心。

### 2. 修复后（交付态）
- 输入框卡片：`max-width: min(780px, calc(100% - 24px))!important`
- 工作区选择行：`max-width: min(780px, calc(100% - 24px))!important`
- 实测计算宽度：`780px`（精准收敛，左右留白对称居中）
- 视觉效果：打字区域紧凑优雅，与下方 1200px 卡片网格形成清晰的金字塔梯度。

## 三、测试与门禁验证
- `plugins/omnimux/src/client/session-guide/composer-width-780px.e2e.test.js`: 1/1 PASS
- 全量关联测试 56/56 PASS (0 失败)。
