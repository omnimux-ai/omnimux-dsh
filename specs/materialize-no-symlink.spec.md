# 物化产物禁止携带软链规格 (Issue #2006)

## 1. 现象
OmniMux 启动直接进入恢复模式，启动停止位置「Profile 选择」，报错：

```
OmniMux managed Profile: managed source contains symbolic link
/Users/x/.omnimum-dev/profiles/omnimux/.materialize-snapshots/plugins/dsh-ui-kit/.worktrees/tab-align/node_modules
```

应用完全无法启动，只能进安全模式。

## 2. 根因
`scripts/sync-to-app.sh` 物化权威 `dsh-ui-kit` 时用的是：

```sh
rsync -a --delete --exclude 'node_modules/' "$DSH_UI_KIT_DIR/" "$temporary/"
```

两处漏洞叠加：
1. **只排除了 `node_modules/` 目录**，没有排除 `.worktrees/`、`.git/`、`.agent-backups/` 这些开发目录；
2. **排除规则带尾斜杠**只匹配目录，匹配不到**同名软链**。`.worktrees/tab-align/node_modules` 恰好是指向源码仓 `node_modules` 的软链，于是被原样拷进快照。

受管 Profile 的启动校验**拒绝任何软链**，因此应用拒绝启动。

## 3. 目标
物化产物里永远不出现软链；万一出现，物化当场失败并说清原因，而不是把炸弹留给下一次启动。

## 4. 验收标准
- **AC-1** rsync 排除规则不再依赖尾斜杠：`node_modules` 无论目录还是软链都被排除。
- **AC-2** 同时排除 `.worktrees/`、`.git/`、`.agent-backups/` 三类开发目录。
- **AC-3** 物化结束后做一次软链扫描；发现软链立即删除临时目录并以非零码退出，输出明确提示。
- **AC-4** 正常物化（无软链）行为不变，产物仍含 `package.json` 与 `lib/index.js`。
