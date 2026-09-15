# 自动化定时任务详情页（TaskDetailPanel）现代深色 UI 风格重构规格

## 1. 目标（Objective）
参考现代深色极简风格（对标图2），优化 OmniMux 自动化插件（`plugins/omnimux-automation`）中的定时任务详情面板（`TaskDetailPanel.jsx` 与 `styles.js`），消除传统表单的厚重边框感与冗余标签，提升信息层级与沉浸式阅读质感。

## 2. 验收标准（Acceptance Criteria）
- **AC-1（主标题视觉提质）**：去除标题上方冗余的灰色 `名称` 文本标签，主标题输入框 `.dsh-st-md-title-input` 呈现为大号标题（16-18px，粗体 600），默认无生硬外边框与浅底，与背景浑然一体，聚焦时提供微妙细腻的边框反馈。保留 DOM 类名与受控更新机制。
- **AC-2（任务指令卡片化）**：去除 `任务指令` 冗余小标题，将指令内容呈现为全宽的深色圆角矩形卡片容器（`background: var(--dsw-alias-bg-layer-2)` 或微弱背景，`border: 1px solid var(--dsw-alias-border-l1)`，`border-radius: 8px`，`padding: 14px 16px`），文本行高舒展（20-22px），多行长文排版清晰；点击时可在卡片内顺畅进行就地编辑。
- **AC-3（分组小标题内敛克制）**：将「详情」、「频率」等分组标题调整为淡灰次级字色（`var(--dsw-alias-label-tertiary)`，12-13px，字重 500），上下留白舒展自然，消除刺眼视觉噪音。
- **AC-4（字段行两端对齐排版）**：字段行 `.dsh-st-md-field` 采用现代化的两端对齐布局（左侧 Label，右侧靠右对齐控件），统一控件视觉高度（约 30px）与圆角（6px），控件下拉框与输入框按内容紧凑自适应，不再横跨整行，去除臃肿表单感。
- **AC-5（契约与测试 100% 保持兼容）**：现有所有 131 项单元测试与集成测试全部通过，无任何回归。

## 3. 影响文件与修改范围
- `plugins/omnimux-automation/src/client/TaskDetailPanel.jsx`
- `plugins/omnimux-automation/src/client/styles.js`
- 编译产物 `plugins/omnimux-automation/lib/client.js`

## 4. 自动化验证指令
- 构建：`pnpm --filter omnimux-automation build`
- 测试：`CI=true pnpm --filter omnimux-automation test`
