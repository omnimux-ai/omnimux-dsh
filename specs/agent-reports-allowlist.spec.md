# 规格说明：物化洁净门禁草稿白名单补齐子代理报告目录

**文件：** `specs/agent-reports-allowlist.spec.md` ｜ **优先级：** P1

## 1. 问题

上一轮收敛（#1670）把物化洁净门禁改为「未跟踪文件仅当可能进入产物时才拒绝」，白名单为 `specs/ docs/ tmp/ .workbuddy/ .agent-backups/ .worktrees/`。

随后实测发现：全局规范新要求「每个子代理必须把结论落盘为报告文件」，实际落盘目录为 `.agent-reports/`（如 `.agent-reports/suite-marketplace/*.md`），**该目录不在白名单内**，于是主检出只要存在子代理报告，物化仍被拒绝：

```
❌ sync: 工作区存在会进入物化产物的未跟踪文件，拒绝物化。
.agent-reports/suite-marketplace/impl-client.md
...
```

这是同一类误判的残留：报告文档不会进入产物，与「要物化的东西是否干净」无因果关系。

## 2. 变更

在 `scripts/sync-main.sh` 的未跟踪白名单正则中补充 `.agent-reports`：

```
^(specs|docs|tmp|\.workbuddy|\.agent-backups|\.worktrees|\.agent-reports)/
```

已跟踪文件改动仍然一律拒绝；白名单之外（如仓库根、`plugins/`、`packages/`）的未跟踪文件仍然拒绝。

## 3. 验收标准

| # | 场景 | 预期 |
| --- | --- | --- |
| 1 | 主检出仅有 `.agent-reports/**` 未跟踪报告 | ✅ 通过洁净门 |
| 2 | 主检出存在已跟踪文件改动 | 🚫 拒绝 |
| 3 | 主检出存在白名单外的未跟踪文件（如仓库根 `unlisted.txt`） | 🚫 拒绝 |
| 4 | 既有白名单目录（`specs/`、`tmp/` 等） | ✅ 保持放行 |
