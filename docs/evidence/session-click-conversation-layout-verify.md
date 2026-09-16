# 实测验证报告：点击会话消息确定性恢复会话栏与自适应布局验证

- **验证日期**：2026-09-16
- **对应特性规格**：`specs/session-click-conversation-layout.spec.md`
- **执行环境**：工作树隔离环境（worktree: `omnimux-dsh-wt-session-click-conversation-layout`）
- **测试结果**：100% 通过

## 验证场景与结果数据

### 场景 1：退出全屏按钮精准定位，排除内部分栏按钮干扰
- **排查现场**：
  原 `HOST_FULLSCREEN_EXIT_SELECTORS` 误将 `button[aria-label="分栏"]`（实际为 dockkit 内部窗格切分按钮）作为退出全屏按钮，导致退出全屏失败，面板仍留全屏。
- **修复方案**：
  移除无约束的 `aria-label="分栏"`，仅采信 `data-sidebar-right-mode="push"` 或带有「退出全屏/Exit fullscreen」语义的官方稳定按钮。
- **实测表现**：
  精准定位到 `button[data-sidebar-right-mode="push"]`，点击后面板确定性退出全屏转为 `push` 模式。

### 场景 2：双层折叠键物理彻底清除
- **排查现场**：
  全屏态下会话折叠由 DOM 属性 `data-omnimux-conversation-collapsed` 驱动，而 `api.getConversationCollapsed()` 返回 `false`，导致原逻辑跳过清理。
- **修复方案**：
  `ensureConversationVisible` 强制校验 DOM 属性与内存快照，物理移除 `data-omnimux-conversation-collapsed` 并调用 `api.setFocus('split')`。
- **实测表现**：
  点击会话行后，会话栏宽度立即从 0px 恢复为完整的可用宽度，中间会话栏完全展开可见。

### 场景 3：会话激活胜出，调和器不反向抢全屏
- **排查现场**：
  退出全屏后调和器曾将面板反向拉回全屏。
- **修复方案**：
  调和器中增加会话选中判定：当中间会话栏已在展示且存在被选中的会话项时，遵循会话胜出契约，不再反向拉回全屏。
- **实测表现**：
  点击会话项后，会话栏稳定持续展示，右侧面板处于分栏或收起状态，会话输入框尺寸舒展无变形。
