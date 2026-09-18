# 规格：回退新建会话 Agent 预设按钮移除与修改 (Revert PR #2294)

## 1. 业务目标与背景
由于在 PR #2294 中对选择器添加规则时，误写了 `[data-composer-seat]`，导致该大容器把新建会话整个输入区全部隐藏。
根据用户指令，将 PR #2294 的所有改动全部安全回退，恢复界面与系统正常状态。

## 2. 行为契约
1. 执行 `git revert 289a75f22`，恢复 `plugins/omnimux/src/client/styles.js`、`agent-preset-enhancer.js` 等文件；
2. 新建会话页面（Hero 阶段）与输入框卡片恢复正常完整显现；
3. 自动化测试套件 100% 绿灯通过。
