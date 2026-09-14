# 测试执行目录与报告写识别修复

## 目标
Issue #1756 执行恢复子任务。用户授权修复本项目测试识别，不降低规格、隔离、E2E或验收要求；原阶段仅本任务树可审查修复。2026-09-14 用户明确选择“允许合入并启用（推荐）”：仅 PR #1777 测试目录识别修复可经正常审核、必需检查与 Merge Queue 合入，并由协调者同步本项目主镜像消费；不改全局配置，不包含 #1756/#1759 界面合入。子任务不并发写主镜像，不提前执行被拒资产复制。

## 命令
在任务根运行 node --test scripts/guard-quality-loop.test.mjs scripts/guard-worktree.test.mjs；git diff --check。按package脚本补相关gate测试。

## 结构
scripts/guard-quality-loop.mjs 与 scripts/guard-worktree.mjs 为现有真源；其test文件承载回归。规格本文件，报告主根.agent-reports/comment-only-send/gate-recovery.md。

## 风格
保持ESM具名导出、现有纯判断函数与node:test，无额外依赖。沿用返回 {decision,reason}，不得本任务id白名单。

## 验收策略
实际传入tool_input.workdir覆盖会话cwd，绝对/相对目录正确；git -C相对执行目录仍有效。主树commit仍拒绝；无规格真实源码写仍拒绝；有规格任务树正确识别；原拒绝的只读源hash+报告写命令按正确任务树现有规格允许，无规格仍拒绝；保持原写入分类不变，不加入报告白名单或脚本解析器。报告写可能误判为业务写是已知保守局限，本次仅修执行目录归属。验证entry handle完整JSON而非只测辅助函数。纯脚本修复不需UI浏览器，但不得借此把1756浏览器验收算过。

## 边界
总是：先读现有脚本/测试，记录旧版失败与新版通过，不删负向覆盖。
先问：任何全局hook配置或运行启用、不明确的跨树写。
绝不：官方包修改、关闭门禁、白名单绕过、主树源码写、提前合入、复跑已拒动作伪装授权。
