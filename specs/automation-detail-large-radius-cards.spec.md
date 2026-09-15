# 定时任务详情分组卡片与指令卡片大圆角规范

## 1. 目标（Objective）
响应用户明确指令：“分组卡片用大圆角 最好是复用现有的 UI 共享组件”，将定时任务详情面板中的任务指令卡片（Prompt）与各分类分组卡片（`详情`、`频率` 等）的圆角统一升级为 **16px** 标准大圆角（对齐设计规范中大卡片容器与属性抽屉的 16px 标准圆角体系），内边距舒展自然，彻底对齐用户最新提供的参考图视觉质感。

## 2. 核心验收标准（Acceptance Criteria）
- **AC-1（分组卡片 16px 大圆角）**：
  - 分组卡片容器 `.dsh-st-md-group-card` 的圆角升级为 `border-radius: 16px`。
  - 内联字段行首尾行圆角自然贴合，内边距舒展（`padding: 10px 16px`），行间内联微弱细分割线。
- **AC-2（任务指令卡片 16px 大圆角）**：
  - 任务指令卡片 `.dsh-st-md-prompt` 与其编辑态 `.dsh-st-md-prompt-input` 圆角统一升级为 `border-radius: 16px`，内边距为 `16px 18px`，大圆角形态饱满圆润。
- **AC-3（复用现有设计令牌与规范）**：
  - 严格消费 `--dsw-alias-bg-layer-2` 与 `--dsw-alias-border-l1` 官方 Token，100% 通过 UI 规范静态扫描。
- **AC-4（全量测试 100% 通过）**：
  - 所有 132 项自动化测试与相关端到端测试 100% 保持绿灯。

## 3. 影响文件与修改范围
- `specs/automation-detail-large-radius-cards.spec.md`
- `plugins/omnimux-automation/src/client/styles.js`
- 编译产物 `plugins/omnimux-automation/lib/client.js`
- 验证证据 `docs/evidence/automation-detail-large-radius-cards-verified.md`
- 端到端测试 `tests/e2e/automation-detail-large-radius-cards.e2e.test.mjs`
