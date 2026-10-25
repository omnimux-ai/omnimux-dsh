# 任务运行期 peer 证明承认声明驱动的精确版本豁免（画布验收第二段阻断）

- 任务：`.worktrees/sidebar-exemption-proof`（分支 `agent/sidebar-exemption-proof`，基线 `origin/main` @ `f76b89e7b`，含已合入的 #3771）
- 日期：2026-10-25
- 上游：`specs/sidebar-peer-exemption.spec.md`（#3771，安装阶段已解除）
- 阻断原文：`.worktrees/canvas-catalog-truth/docs/evidence/blockers/canvas-catalog-truth-issue-3762.json` 与同目录 `peer-proof-diagnostic.txt`（只读参考，本工作树不改它）

## 1. 问题

#3771 把豁免写进任务私有 profile 的 `compatibility.json`，`dsh plugin add` 预检放行、安装成功。但同一条命令随后在 **fresh task runtime 的服务端加载证明**被拒：

```
TEST_ENV_FRESH_RUNTIME / hint = "Task peer version does not satisfy its declaration"
peerResolutionFailure = { parentName: "dsh-better-sidebar", name: "@deepseek-ai/dsh-agent",
  spec: "^0.1.5-rc.1", optional: false, status: "resolved", scope: "shipping-app", version: "0.2.1-rc.3" }
```

判定点在 `scripts/task-runtime-proof.mjs:185`：它**无条件**用 `semver.satisfies`，完全不读豁免，因此阻断只是从「安装阶段」前移到了「proof 阶段」。结构性原因：`dsh-better-sidebar@0.19.1` 的 14 个非可选 `@deepseek-ai/dsh-*` peer 声明 `^0.1.5-rc.1`（= `>=0.1.5-rc.1 <0.2.0-0`），宿主代际 `0.2.1-rc.3` 结构性落在区间外。

## 2. 设计

1. **同一真源、同一判定，不复制逻辑**：proof 侧不新增豁免名单，也不复制 install 的判定；只调用 `scripts/task-runtime-install.mjs` 已导出的 `readSupportPeerExemptions()` / `supportPeerExemptionDecision()`，并新增导出一个共用的失败语义 `assertSupportPeerExemptionCoverage(decision)`（install 的 `applySupportPeerExemptions` 改为调用它，两阶段共用同一段错误码与 detail 文案）。真源仍是 `scripts/sidebar-support-identity.json` 的 `peerExemptions`。
2. **只在版本区间判定失败时才查豁免**：`validateTaskPeerResolution` 里 `semver.satisfies` 成立时路径完全不变（零行为漂移）。
3. **宿主代际取「该 peer 实际解析到的版本」**：peer 从 shipping app 解析出的 `version` 就是证明过程真实观测到的宿主代际，直接作为 `supportPeerExemptionDecision` 的 `hostVersion`。声明写的是别的代际 → `stale`；复核超窗 → `expired`；两者都按 install 同一段代码硬失败 `TEST_ENV_INSTALL_SUPPORT_EXEMPTION_STALE`。声明畸形 → `TEST_ENV_INSTALL_SUPPORT_EXEMPTION_INVALID`（同一读取器抛出）。
4. **未声明不静默**：`undeclared` 时不放行，断言消息补上具体 detail（豁免键、peer 名与 spec、宿主代际），错误对象继续带 `peerResolutionFailure`。
5. **只放宽 peer 版本区间**：`manifestSha256` / `entrySha256`、`packageRoot` / `entryPath` 归属、私有图边界、包名与版本精确性、payload 字节、probe 源与哈希、shipping anchor 一致性全部原样执行；被豁免的 peer 一旦哈希/归属被破坏仍然红。
6. **可审计**：放行的 peer 在 proof 输出里被标记 `exempted: true`，并带 `exemptionKey`（`package@version`）、`exemptionHostSpec`、`exemptionReviewedAt`。这些字段随 `serverLoading.peers` 进入运行报告 `report.runtimeLoading.server`，并在 `validateTaskRuntimeBinding` 的 installation 摘要里汇总为 `peerExemptions`。

## 产品基线

豁免只在**任务私有 profile**（系统临时目录 `omnimux-task-*`，随任务销毁）与任务运行期证明里生效；不写 Dev/Prod profile，不依赖开发机状态，不引入任何宿主版本字面量。缺声明、缺宿主代际、support 包不在图内一律 coded failure，不降级。

## 假设

1. 阻断根因是「proof 侧不读豁免」而不是 support 包坏了。若包本身坏了，豁免放行后仍会在后续 profile 启动/画布验收失败（而不是恢复）。
2. 同一宿主 App 内所有 `@deepseek-ai/dsh*` 包同代际。实测 `OmniMux Dev.app` 的 app.asar 中 13 个实际存在的 `@deepseek-ai/dsh-*` peer（阻断清单里第 14 个 `@deepseek-ai/dsh-invariants` 在该 App 内不存在）全部 `0.2.1-rc.3`，且 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-agent` 均为 `0.2.1-rc.3`，等于 `dsh --version` 与 `build-info.json` 的 `dsh.packageSpec`。若该不变量不成立，`peer.version` 与声明的 `hostSpec` 不符 → 硬失败（fail-closed），不会静默放行。
3. proof 侧不能用 `installation.appAnchor` 直接读版本：该路径在 `app.asar` 内，`verify:app` 的 Node 进程没有 asar 支持。因此宿主代际只能来自真实服务端进程里观测到的解析结果。

## 证伪方式

任一成立即推翻本设计：

1. **豁免未生效**：声明齐全时 `validateTaskPeerResolution` 仍抛「Task peer version does not satisfy its declaration」——说明没读同一真源。
2. **豁免不是声明驱动**：把 `peerExemptions` 清空/替换后仍放行——说明放行来自别的东西（例如安装记录字段）。
3. **豁免放宽了别的东西**：给被豁免的 peer 破坏 `manifestSha256` / `entrySha256` / `packageRoot` 后仍通过——说明放宽面超过版本区间。
4. **静默降级**：`hostSpec` 不符或 `reviewedAt` 超窗时放行，且没有任何 coded failure。
5. **未声明也放行**：`peerExemptions` 缺失时 peer 仍通过——说明「未声明即拒」失效。
6. **复制了逻辑**：proof 里出现第二份豁免名单、第二份宿主版本字面量或第二段 stale 文案。

复现命令（本工作树）：

```bash
node --test scripts/task-runtime-proof.test.mjs
node --test scripts/task-runtime-install.test.mjs
```

## 验收

- [x] `validateTaskPeerResolution` 在版本区间不成立时先查同一真源豁免；命中即放行并在 peer 上留下 `exempted` + `exemptionKey` + `exemptionHostSpec` + `exemptionReviewedAt`。
- [x] 未声明仍拒（消息含具体 detail）；过期/宿主不符抛 `TEST_ENV_INSTALL_SUPPORT_EXEMPTION_STALE`；声明畸形抛 `TEST_ENV_INSTALL_SUPPORT_EXEMPTION_INVALID`。
- [x] 被豁免的 peer 破坏 `manifestSha256` / `entrySha256` / `packageRoot` 仍然失败。
- [x] 真实用例：以 #3762 阻断的同形输入（`dsh-better-sidebar@0.19.1` + `@deepseek-ai/dsh-agent ^0.1.5-rc.1` → 宿主代际）走真实 inspector + 真实 probe，proof 不再因 peer 版本失败，且 `proof.peers[0].exempted === true`。
- [x] `node --test scripts/task-runtime-proof.test.mjs`（29/29）、`node --test scripts/task-runtime-install.test.mjs`（32/32）全绿。
- [x] `pnpm check:boundaries` 通过（4508）；`pnpm test:gates` 485/486，唯一失败为既有环境性用例（见下）。
- [x] `git diff --check` 通过。

## 非目标

- 不改 support 包的 `peerDependencies`，不 fork/vendor 侧边栏，不动壳仓 patch 与 preset 构建。
- 不改 `.worktrees/canvas-catalog-truth`，不在其中跑 `verify:app`，不改其请求与旅程。
- 不引入 `git commit` / `push`；不改本工作树之外的文件。
- 不扩豁免到 support 包以外的任何包（判定按声明的 `package@version` 精确匹配，代码层不可能）。
- 不把豁免扩到 `engines.dsh`、非 `@deepseek-ai/dsh*` peer 或私有图内的宿主同名包。

## 实测结果（2026-10-25，本工作树）

| 项 | 命令 / 输入 | 结果 |
| --- | --- | --- |
| proof 用例 | `node --test scripts/task-runtime-proof.test.mjs` | 29/29 通过（原有 23 条全部保留，新增 6 条） |
| install 用例 | `node --test scripts/task-runtime-install.test.mjs` | 32/32 通过（#3771 的 32 条原样保留；改动只是把 stale 文案抽成共用函数） |
| 消费侧用例 | `node --test scripts/worktree-app-qa-task.test.mjs` | 25/25 通过（原有 24 条 + 新增 1 条豁免摘要） |
| 正向（最小夹具） | `proof accepts the shipped host peer exemption and records it for audit` | 放行；`exempted=true`、`exemptionKey=<row.package>@<row.version>`、`exemptionHostSpec=<row.hostSpec>`、`exemptionReviewedAt=<row.reviewedAt>` |
| 正向（真实 inspector + 真实 probe） | `same-PID server proof accepts the shipped exemption for the blocker peer shape` | 986ms；真实子进程 inspector、真实 profile probe、真实 shipping anchor，`proof.peers[0].exempted === true`、`scope=shipping-app`、`version === row.hostSpec` |
| 反例 1（未声明） | 同上真实观测，`peerExemptions: []` | 拒绝：`Task peer version does not satisfy its declaration: dsh-better-sidebar@0.19.1 declares @deepseek-ai/dsh-agent ^0.1.5-rc.1 on dsh <host> with no declared peer exemption for that generation` |
| 反例 2（宿主不符 / 复核过期 / 声明畸形） | `hostSpec` 改 `9.9.9` / `reviewedAt` 改 `2020-01-01` / `peerExemptions` 改成字符串 | 前两者 `TEST_ENV_INSTALL_SUPPORT_EXEMPTION_STALE`，后者 `TEST_ENV_INSTALL_SUPPORT_EXEMPTION_INVALID` |
| 反例 3（豁免下破坏其它断言） | 已放行的 peer 改 `manifestSha256` / `entrySha256` / `packageRoot` | 仍然失败：`Task peer file digest is invalid` / `differs from shipping anchor resolution` / `resolved outside the shipping app` |
| 反例 4（私有图宿主同名包） | 私有 scope 的 `@deepseek-ai/dsh-agent` | 仍然失败（豁免不覆盖安装器自己选的私有图成员） |
| 边界 | `pnpm check:boundaries` | 通过（4508 个源文件） |
| 门禁套件 | `pnpm test:gates` | 486 用例，485 通过、1 失败；失败项为 `scripts/public-plugin-apply.test.mjs` 的既有用例（见下） |
| 测试撰写门禁 | `node --test --import ./scripts/local-evidence-fixture-preload.mjs scripts/test-authoring-inspection.test.mjs scripts/test-change-review.test.mjs scripts/verify-test-standard-declarations.test.mjs scripts/guard-quality-loop.test.mjs scripts/verify-silent-catch.test.mjs scripts/lib/silent-catch-delta.test.mjs` | 173 用例，172 通过、1 失败（同一条既有环境性用例）；新增测试代码无展开、无计算成员访问 |
| 空白检查 | `git diff --check` | 通过 |

环境性失败的证据（与本次改动无关，已实测复现）：`scripts/public-plugin-apply.test.mjs` 的 `unregistered task paths and external siblings cannot inherit shared repository authority` 断言「向主检出 `scripts/` 写新测试文件应放行」，而 `guard-anti-cheat.mjs` 的 `readSource()` 要求读到的字节等于 `git ls-tree <treeRoot> HEAD` 的 blob。主检出（HEAD `870715aff`）当前有他人未提交改动（`plugins/omnimux-market/lib/host.js`、`plugins/omnimux-market/src/host.ts`、`plugins/omnimux/src/client/settings-value-reader.js`、`plugins/omnimux/src/host/apply.js`），故判定 deny。**把本工作树的全部改动 `git stash` 后在干净 HEAD 上单跑同一文件，结果仍是 18/19、同一条失败**——与本次 diff 无因果关系，且与 #3771 记录的签名一致。本工作树不修改主检出，无法消除该外部条件。

## 工作树准备

本工作树最初无 `node_modules`（`plugins/omnimux-studio/node_modules/dsh-better-sidebar` 缺失，install 用例 7 条报 `run pnpm install first`）。执行 `pnpm install --frozen-lockfile --prefer-offline`（33.6s，exit 0）后 32/32 全绿；`pnpm-lock.yaml` 未被改写，`git status` 只有本次 5 个改动文件 + 1 个新 spec。

