---
title: "决策：L2 restart-host 保端口与磁盘，不保浏览器会话"
id: "decision-l2-restart-host-session-semantics"
type: "decision"
status: "superseded"
authority: "L2"
date: "2026-08-26"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# 决策：L2 `restart-host` 保端口与磁盘，不保浏览器会话

> **SUPERSEDED — 2026-09-09 / #864：** L2 独立环境及其起停、端口和会话生命周期已全量退役，不再执行下文命令。现行流程见 [dev-pipeline](../contracts/dev-pipeline.md) 与 [plugin-qa](../contracts/plugin-qa.md)：合入前 worktree 自动化/静态与独立评审，required CI/MQ 合入 main 后按需 Dev 45120 验收。下文是历史决策原文，历史结果不重标。

日期：2026-08-26。
状态：**已确认（审计修订）。**
性质：降级 `spec-plugin-dx-pipeline.md` v1.0.0 G3「不丢失浏览器会话与调试数据」。对照官方 CLI SIGTERM dispose 与现网 `dev-env.sh start`。
依据：2026-08-26 工程保障审计（Rex SEV2 / 潜伏 SEV1；Archi / Cody；原稿未入库）。对照 [dev-pipeline.md](../contracts/dev-pipeline.md)。

## 结论

允许新增 **仅限 L2** 的子命令 `dev restart-host <task>`，语义是：

> **停掉该 task 的 Cordis Host 进程组，用同一 `port.txt` 与同一 profile 再拉起。**
> 保的是：L2 端口、profile 目录、磁盘数据、已有 symlink。
> **不保**：浏览器 WebSocket / HMR 连接、进程内 SQLite 会话索引、进行中的 generation / tool / pty。
> 浏览器 tab/URL 可以留着，但必须重连；不得宣传「不丢失调试数据」。

这不是热重启，是 **同口冷重启**。现网 `start` 是全量重建（停 watch、可能克隆生产 `node_modules`、`alloc_port`、重建软链、20s 扫 URL）。`restart-host` **不得**复用那条全量路径。

## 正确行为

1. **只动 Host 进程组**。`watch.pid` 必须 `kill -0` 仍活；若已死才补 `start_watch`。不 migrate、不克隆 `node_modules`、不改软链。
2. **杀之前做 PID 身份校验**（实施闸，不是建议）：
   - `kill -0 $pid`，否则清 stale 再拉
   - `ps -p $pid -o command=` 必须同时包含 `apps/cli/lib/bin.js`、`--profile omnimux-dev-$name`、`--port` 与 `port.txt` 一致
   - **不得**包含 `/Applications/OmniMux`
   - 不匹配 → abort，打印 cmdline，**禁止 SIGKILL**
3. Host / watch 启动时 `setsid`/`detached`。先 `SIGTERM` 进程组，等待 **≥5s**（对齐官方插件树 dispose），仍活再 `SIGKILL` **进程组**（不是单 PID）。
4. 同口 bind 前 `lsof` 该口 **LISTEN 必须空**（TIME_WAIT 下死绑会 `EADDRINUSE`）。失败保留旧 pid/log，不报成功。
5. `$pdir/restart.lock` flock；`start` / `restart-host` / `stop` 共享。锁失败非零退出。
6. 冒烟任务名必须 `smoke-<uniq>`（pid / 随机 / session），**禁止**硬编码 `smoke-task`。
7. `host.log` rotate 或追加，**禁止截断**导致事故无现场。写一行 `restart-host.log` 审计（谁、task、旧/新 pid、port、信号）。
8. Agent 可调用 `dev restart-host`。`restart` / `restart:dev` / `restart:prod` 继续对 `DSH_AGENT_SESSION` / `AGENT_ROLE` / `CI` **fail-closed**。帮助文案禁止把 `restart-host` 写成裸 `restart`。

## 否决

| 方案 | 为何否决 |
|---|---|
| G3「不丢失浏览器会话与调试数据」 | Cordis SIGTERM 会 dispose 整棵插件根；会话索引是进程内 SQLite。tab 可留，WS/HMR/generation 必丢 |
| 读裸 `host.pid` + 超时 `kill -9` 单 PID | 无身份校验；macOS PID 复用可误杀桌面 App（潜伏 SEV1）；跳过 dispose 留 pty/esbuild 孤儿 |
| 对 Agent 开放却无 flock | 同名 task 多 Agent 互杀 L2（SEV2） |
| 把 `restart-host` 做成 `start` 的别名 | 会停 watch、可能换口、重建软链，违背「只重启 Host」 |

## 验收（可测，禁止假承诺）

- 端口不变（`port.txt` 相同）
- `host.pid` 更新且新进程 cmdline 匹配身份闸
- `curl -sI -H "Host: 127.0.0.1:<port>" http://127.0.0.1:<port>/` → 200/302
- watch 进程仍活（或死后被补拉）
- `DSH_AGENT_SESSION=1` 下 `restart prod/dev` 仍拦截；`dev restart-host` 放行

## 回滚

去掉 CLI 对 `restart-host` 的转发；Host 侧改动继续走现网 `dev stop` + `dev start`。不 `pkill` 任何 `OmniMux*.app`。
