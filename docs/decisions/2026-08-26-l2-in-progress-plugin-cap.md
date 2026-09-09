---
title: "决策：L2 在研插件仍保持「每个 profile link ≤ 1」"
id: "decision-l2-in-progress-plugin-cap"
type: "decision"
status: "superseded"
authority: "L2"
date: "2026-08-26"
authors: ["x", "agent-architect"]
subsystem: "omnimux-assets"
---

# 决策：L2 在研插件仍保持「每个 profile link ≤ 1」

> **SUPERSEDED — 2026-09-09 / #864：** L2 独立环境及其生命周期、单 link 门槛已全量退役，不再执行下文命令。现行流程见 [dev-pipeline](../contracts/dev-pipeline.md) 与 [plugin-qa](../contracts/plugin-qa.md)：隔离 worktree 自动化/静态与独立评审 → required CI/MQ → main → 按需 Dev 45120 验收。下文是历史决策原文，历史结果不重标。

日期：2026-08-26。
状态：**已确认（审计修订）。**
性质：否决 `spec-plugin-dx-pipeline.md` v1.0.0 G2「同一 L2 task 多 symlink」。对照合同 [dev-pipeline.md](../contracts/dev-pipeline.md) 铁律 3、[plugin-qa.md](../contracts/plugin-qa.md)。
依据：2026-08-26 工程保障审计（Archi / Cody / Rex / Tessa / Docu；原稿未入库）。对照合同 [dev-pipeline.md](../contracts/dev-pipeline.md)、[plugin-qa.md](../contracts/plugin-qa.md)。

## 结论

**一个 L2 dev profile 里 link 的在研插件仍然 ≤ 1 个。** 其余插件必须是物化稳定副本。doctor 继续把 `node_modules` 下一层 symlink 数 `> 1` 判 ✗。

多插件并行的隔离单元是 **task / profile / 端口 / `DSH_HOME`**，不是 watcher 个数，也不是同一 Host 上的 symlink 个数。

```
yarn omnimux:dev start assets-v2 omnimux-assets     # 442xx A，link 仅 assets
yarn omnimux:dev start wf-v2 omnimux-workflow       # 442xx B，link 仅 workflow
```

真要「同一个浏览器里看第二个插件的 client HMR」：只 link **主插件**；次插件走 **watch + 把构建产物同步进该 profile 的物化副本**（不是第二条 symlink）。Hub 半成品不得污染垂直验收。

## 为何保留

≤1 保护的是：

- 多 Agent / 多任务互不污染同一 generation 与 SQLite 会话索引
- 半成品 Hub 不会拖垮垂直插件验收
- `dev-doctor.sh` 可机械执法（现网 `linked > 1` → bad，修复建议 `dev rm`）
- 端口池 44200–44299 按「一 task 一 profile 一 link」设计
- `watch.plugin` 现为单值文件；`start`/`watch` 只接一个 `<plugin>`

同 Host 多 link 会让「在研」集合变成隐式共享可变面。这不是 DX 优化，是契约覆盖。

## 否决

| 方案 | 为何否决 |
|---|---|
| 同一 L2 task 批量 `ln -s` 多个在研插件 | 打穿铁律 3；doctor 会立刻全红或被迫放行脏双 link |
| 把合同改写塞进实施计划最后一天（原 TASK-08） | 用实现覆盖合同；窗口期 Agent 读 AGENTS 会把新行为当违规 |
| 把软链打到 `dsh.profile.bundles/` 目录 | 该字段是 profile `package.json` 的 JSON 数组，**不是目录**。真源是 `$pdir/node_modules/<plugin>` |

## 加载路径（实现铁律）

L2 link **只允许**：

```bash
rm -rf "$pdir/node_modules/$plugin"
ln -s "$PLUGINS_ROOT/$plugin" "$pdir/node_modules/$plugin"
```

`$pdir` = `~/.dsh-dev/tasks/<task>/profiles/omnimux-dev-<task>`。
`dsh.profile.bundles` 只许当名字名单，Host 按名单从 `node_modules/<name>` 加载。

## 回滚

无需新开关。保持现网 `dev-doctor.sh` 的 `linked > 1` → bad。若错误合入多 link：`dev stop` 后对多余 symlink `rm`，从生产物化副本 `cp -Rc ~/.dsh/profiles/omnimux/node_modules/<plugin>` 收回（**禁止**用 `sync-to-app.sh` 回滚）。

## 对实施计划的约束

- 禁止 TASK「批量 Symlink 多个在研插件」
- `watch-plugin.mjs` 可以修进程模型（禁止 workflow `process.exit` 拖死父进程），但 **`dev start` 仍只 link 一个插件**
- 次插件 watch-without-link 若要做，必须另开任务，且 doctor 仍只允许 1 条 symlink
