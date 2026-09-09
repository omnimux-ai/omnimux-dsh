# omnimux-studio 审计整改（本地 Issue 草案）

风险 R1：新增受版本控制的插件清单与客户端入口。授权仅插件前端、必要版本归属和测试；本次提交不 push/merge/物化，不改官方 DSH、后端或真实 API。

输入：主仓 deliverables/conversational-generation-studio/ 的 architecture-audit.md、PRD.md、system_design.md、class-diagram.mermaid、sequence-diagram.mermaid；index.html 保持原样。

## 验收

按 system_design F01–F14：无全局顶栏；局部 CSS；完整 scope tuple；共享内存草稿；有序 Token 与 IME 键盘；Mock 标识；可取消模拟；完整冻结请求；UUID；余额/批量；原型菜单与三维过滤；locale/register 与 inner.effect 生命周期；可移植构建及真实测试。

## 交付边界

- 本仓 .worktrees/studio-audit-remediation，分支 agent/studio-audit-remediation。
- 兄弟 omnimux-dsh-wt-visual-generation 的 payload 只读导入，原软链和 payload 保留。
- 远端 Issue 尚未创建；本地分支未绑远端 Issue 编号。提交交主理人独立 QA 后按既有流程推进。
- L2 需在最终 commit 绑定隔离 profile，且仅一个在研链接；不得物化未合并代码到共享 Dev。
