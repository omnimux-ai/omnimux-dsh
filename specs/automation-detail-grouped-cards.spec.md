# 定时任务详情页同分类卡片分组（Grouped Cards）规格

## 1. 目标（Objective）
响应用户明确指令：“把同一个分类的用卡片样式分组分开”，将定时任务详情面板（`TaskDetailPanel.jsx`）中各分类（详情、频率、历史等）下的字段行收纳进现代圆角卡片容器中，实现类似 iOS/macOS 设置的分组卡片风格（Grouped Cards）。

## 2. 核心验收标准（Acceptance Criteria）
- **AC-1（分组卡片容器化）**：
  - 每个配置分类（「详情」、「频率」）下的字段项整体包裹在一个独立的 `.dsh-st-md-group-card` 容器中。
  - 卡片容器具备细腻的深色背景（`var(--dsw-alias-bg-layer-2)`）、细微边框（`1px solid var(--dsw-alias-border-l1)`）、标准圆角（`border-radius: 10px`）和超出隐藏（`overflow: hidden`）。
- **AC-2（卡片内部字段行内部分隔）**：
  - 卡片内的每行字段（`.dsh-st-md-field`）具有舒适的内边距（`padding: 8px 14px`）和最小高度（`min-height: 40px`）。
  - 卡片内相邻行之间具备微弱分割线（`border-bottom: 1px solid var(--dsw-alias-border-l1)`），末行无底分割线。
- **AC-3（分类副标题外置居顶）**：
  - 分类标题（如「详情」、「频率」）置于对应卡片外部上方，文字为克制次级灰（`color: var(--dsw-alias-label-tertiary)`，12-13px，字重 500），间距舒展。
- **AC-4（全量功能与兼容性 100% 保持）**：
  - 131 项现有自动化测试与端到端测试 100% 保持通过，所有受控数据与提交行为完全兼容。

## 3. 影响文件与修改范围
- `specs/automation-detail-grouped-cards.spec.md`
- `plugins/omnimux-automation/src/client/TaskDetailPanel.jsx`
- `plugins/omnimux-automation/src/client/styles.js`
- 产物 `plugins/omnimux-automation/lib/client.js`
- 验证证据 `docs/evidence/automation-detail-grouped-cards-verified.md`
- 端到端测试 `tests/e2e/automation-detail-grouped-cards.e2e.test.mjs`
