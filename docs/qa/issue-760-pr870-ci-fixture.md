# Issue #760 / PR #870 CI fixture 修复

## 范围与身份

- 固定 base：`05037937b3121e4cf8fb6b1c0d44d7ca892c34f9`。
- 修复父提交：`be09e518e3fcecf3715c1e18b2fb5c81971f6fb5`，与开始时远端 PR head 一致。
- 2026-09-09 15:25 +08:00 fetch 后 origin/main 已前进；本次不 merge/rebase，仍按指定固定 base 复现。
- 完整读取 `issue-760-pr870-final.md`；该独立 QA 原文保留，不代写其结论。
- 仅修改 synthetic HTTP fixture 与新增一个并发回归。未改产品 H3、Viewer、CI workflow、verdict、required checks、模型合同、共享依赖或 profile。未 merge、物化或运行真实 L2/浏览器验收。

## 真实 CI 失败与可证实根因

[原 CI 34322765044](https://github.com/omnimux-ai/omnimux-dsh/actions/runs/34322765044/job/102373030933) 的 regression 为143项、142通过、1失败：`live-page-preparation.test.mjs:76`，`test L2 Host exited (1)`。fixture 原实现未消费 stderr，日志无法证明那次退出的具体 OS 错误。

从固定 base 用 `git show <base>:scripts/ego-qa-test-helpers.mjs` 读取原字节，在当前任务树依赖环境用 data URL 导入，不修改主检出。在两个 fixture 并发启动时复现：都先通过 lsof 探测44299，然后一个成功，另一个 stderr 为 `listen EADDRINUSE: address already in use 127.0.0.1:44299`、退出1。另一复现临时移除父进程 PATH 的外部工具路径，三个 fixture 并发启动，两个同样 EADDRINUSE、一个成功；完成后恢复 PATH 并清理这些 synthetic 子进程。

**已证实固定 base 的 check-then-bind 端口竞争缺陷，且 lsof 不可用会误判空闲；未证实原 GitHub 单次失败唯一归因为该竞争，也不把它宣称确定 flake。** 原单文件在本机未修改时13/13通过，说明顺序复跑通过不能排除该缺陷。本机 Node v25.8.0；CI使用Node22，本次本地结果不冒称Linux/Node22结果。

## 最小修复

- `scripts/ego-qa-test-helpers.mjs`：由拥有 listener 的子进程直接 bind 44299→44201；仅 EADDRINUSE 时试下一个端口，其他错误保留并失败。保持原端口范围和身份文件合同，不改生产端口分配。
- 子进程成功 bind 后返回实际端口，再写 port.txt/env；新增5秒启动上限和有界stderr诊断。
- `scripts/live-page-preparation.test.mjs`：三个 synthetic fixture 无lsof并发启动，断言URL互异且各返回ok。原登录失败、timeout、不重试、token不泄露断言完全保留。

## 验证

| 检查 | 结果 |
| --- | --- |
| 固定 base 原fixture双并发 | 预期失败：EADDRINUSE、exit1 |
| 固定 base 原fixture三并发且无lsof | 预期失败：两个EADDRINUSE、exit1 |
| 修复后 live-page-preparation | 14/14 pass，0 skip |
| quality-gate.yml 中原样 regression 命令 | 144/144 pass，0 fail/skip；任务树 qa-pr870-ci-regression.log |
| pnpm --config.verify-deps-before-run=false test:gates | 非PASS：出现6项依赖失败，嵌套verify-ci-gates长时间未完成后主动停止，不给全量计数 |
| 单独诊断 live-qa + sync-repeat-install | 15 total /9 pass /6 fail；两项缺 @chakra-ui/react，四项 Corepack 的隔离cache无法取得pnpm11.7.0（Network access disabled）；qa-pr870-gate-diagnostics.log |
| git diff --check | PASS |

Stage/chakra环境问题与完整gates受限仍保留。没有安装共享依赖，也没有为绕过Corepack网络限制改环境或测试。H3全包与UI基线沿用独立QA事实，未重复广域产品修复。

## CI waiver 技术事实（未修改）

现有 `scripts/ci-verdict.mjs:73-82` 的真实源码与合同描述不一致：没有browserReport时，若 `GITHUB_ACTIONS=true`、非空 `GITHUB_RUN_ID`、`filesFromGit=true`、`ciStatus=success`、L0通过且不存在两个legacy fallback开关，会令 browserPass=true。该代码在本次父提交已存在；提交历史显示来自 `6f98a4ef9dfe19936e7320df1a4209ace925c8cd`。这不是具备PR/SHA/用户授权绑定的一次性waiver，也不能证明真实浏览器通过。

原CI因前序failure不满足此分支，故同时报告缺browserReport。若正常修复后前序全绿，既有分支可能放行；结果必须以真实新head CI为准。没有修改、模拟启用或新增这个分支，没有自写qa:pass/浏览器报告或关闭required。主理人与独立QA应明确区分现有机制的绿色结果、一次性用户L2豁免和真实运行证据。

## 回传

工程交叉一致性检查：fixture启动协议与调用方身份文件一致，原业务断言保留；局部修复可交独立QA。整体发布仍不作PASS声明。下一责任人为独立QA/主理人：审查本次两文件差异、核对新head真实CI及上述证据缺口；本委派不合并、不物化。
