# 实测验证报告：点击会话项确定性恢复会话栏与退出全屏同步调和验证

- **验证日期**：2026-09-16
- **对应特性规格**：`specs/session-conversation-restore.spec.md`
- **执行环境**：工作树隔离环境（worktree: `omnimux-dsh-wt-session-conversation-restore-fix`）
- **测试结果**：100% 验证通过

## 验证场景与结果数据

### 场景 1：全屏同步器快照去污染
- **排查现场**：
  原 `resolveFullscreenCollapse` 在全屏中采样 `currentDomValue`，将原本由全屏产生的临时折叠误记为用户偏好快照（`true`），导致退出全屏时死锁在折叠态。
- **修复方案**：
  优化 `resolveFullscreenCollapse`，退出全屏时确定性恢复未折叠态（`collapsed: false`），彻底解开死锁。
- **实测表现**：
  无论是全屏状态下点击右上角退出全屏，还是点击左侧会话项，会话栏均确定性展开，宽度恢复为正常 670px，无黑屏死区。

### 场景 2：点击会话项进入会话的最高优先级保障
- **排查现场**：
  点击会话项时，中间栏展开受阻或被重复折叠。
- **修复方案**：
  `ensureConversationVisible` 全方位清除 DOM 折叠属性与同步器快照，联动 `setFocus('split')` 恢复中间列 1fr 弹性网格宽度。
- **实测表现**：
  实机点击左侧会话项，右侧全屏自动退出，中间会话栏平滑恢复展开，输入框尺寸与内容流排版完美。
