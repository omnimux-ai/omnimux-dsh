# 物化产物软链门禁 · 验证证据（Issue #2006）

生成时间：2026-09-16 09:48（Asia/Shanghai）

## 1. 现场证据（修复前）
受管快照 `~/.omnimux-dev/profiles/omnimux/.materialize-snapshots/` 内扫描结果：

```
$ find <snapshot> -type l | wc -l
1
$ find <snapshot> -type l
.../plugins/dsh-ui-kit/.worktrees/tab-align/node_modules
  -> /Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit/node_modules
```

应用启动即进恢复模式，报错原文：
`managed source contains symbolic link .../dsh-ui-kit/.worktrees/tab-align/node_modules`

清除该软链后全快照软链数归零，应用可正常启动。

## 2. 规则对照实验（新旧 rsync 规则）
构造一个含两类软链的源目录：`.worktrees/tab-align/node_modules`（真实故障形态）与
`node_modules-symlink`（故意不叫 node_modules 的极端形态）。

| 规则 | 产物残留软链数 | 说明 |
| --- | --- | --- |
| 旧：`--exclude 'node_modules/'` | **2** | 带尾斜杠只匹配目录，两类软链都漏 |
| 新：`--exclude 'node_modules' --exclude '.worktrees/' --exclude '.git/' --exclude '.agent-backups/'` | **1** | 真实故障形态已排除；极端命名仍会漏 |

第三行是加硬门禁的直接依据：rsync 的排除规则是尽力而为，光靠规则挡不住所有形态。

## 3. 兜底门禁（新增）
物化结束后扫描产物，发现任何软链即删除临时目录、以非零码中止，并输出明确原因——
宁可物化当场失败，也不把一个带软链的快照留给下一次启动去踩。

## 4. 验收对照
- AC-1 `node_modules` 不带尾斜杠：见上表第 2 行。
- AC-2 三类开发目录均已排除：同上。
- AC-3 软链扫描门禁已加入 `scripts/sync-to-app.sh`。
- AC-4 正常物化路径不变（仍校验 `package.json` 与 `lib/index.js`）。
