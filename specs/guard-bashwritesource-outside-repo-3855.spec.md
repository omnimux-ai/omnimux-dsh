# Spec: guard-quality-loop bashWritesSource 只拦仓库内业务源码写入

Issue: #3855

## 用户操作旅程

Agent 在收尾物化时执行 `cp ~/.omnimux-dev/profiles/omnimux/.materialize-snapshots/plugins/dsh-ui-kit/src/icons/fixtures/x.txt ~/.omnimux-dev/profiles/omnimux/node_modules/dsh-ui-kit/src/icons/fixtures/x.txt`：两个路径都含 `plugins/` + `/src/`，但都在仓库外的 Dev profile 里，**不应**被规格门禁拦。

同时，真正的仓库内写入（`echo x > plugins/omnimux/src/client/a.js`、worktree 里相对路径写入）**仍必须**被拦，除非本任务已落盘 spec。

## 期望反馈

| 场景 | 现在 | 修复后 |
|---|---|---|
| cp 到 `~/.omnimux-dev/...` | ❌ deny | ✅ allow |
| 仓库内 `> plugins/.../src/x.js` | ❌ deny（无 spec 时） | ❌ deny（不变） |
| worktree 内相对路径写入 | ❌ deny（无 spec 时） | ❌ deny（不变） |
| 提取不到目标的 eval/管道 | ❌ deny | ❌ deny（从严兜底） |

## 假设

1. Dev profile 物化目录（`~/.omnimux-dev/**`）不是仓库源码，本就不该走规格门禁；
2. 命令里能提取出写目标 token 时，resolve 到绝对路径再判断「是否在仓库根内」是可靠判定；
3. 提取不到目标（heredoc、eval、管道里只出现片段）时维持从严兜底，宁可误拦也不放行仓库内写入。

## 证伪方式

- 若有反例：某条命令的写目标 token 提取出来后 resolve 到了仓库内 `plugins/*/src/` 却被判 false → 修复失效，用例见测试；
- 若有反例：某条仓库外写入被误拦 → 提取逻辑漏了该路径形态，需补 token 提取规则。

## 验收用例

- `bashWritesSource("cp A B")`，A/B 都是 `~/.omnimux-dev/...` 绝对路径 → `false`；
- `bashWritesSource("echo x > plugins/omnimux/src/client/a.js", repoCwd)` → `true`；
- `bashWritesSource("echo x > plugins/omnimux/src/client/a.js", worktreeCwd)` → `true`（相对 worktree root resolve 到 worktree 内的 `plugins/`，findRepoRoot 找到 worktree 根，仍判 true）；
- `bashWritesSource("python3 -c \"open('plugins/x/src/a.js','w')\"", repoCwd)` → `true`；
- `bashWritesSource(heredoc 只含路径片段的命令)` → `true`（兜底从严）。

## 旧标准变更

无——这次是规则语义修正，不是断言削弱；既有测试全保留，只加新用例。
