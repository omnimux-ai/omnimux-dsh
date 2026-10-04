---
title: "V1 #3052 后端 OCR 第二轮整改报告"
id: "impl-browser-image-assets-v1-backend-final-fixes"
type: "log"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# V1 #3052 后端 OCR 第二轮整改报告（R2-1 ~ R2-4）

对照 [OCR 第二轮报告](../qa/browser-image-assets-v1-ocr-round2.md) 的 1 高 3 中逐条整改。工作树 `.worktrees/cross-browser-image-assets`，分支 `agent/cross-browser-image-assets-issue-3051`，HEAD 仍为 `d95764912e36da01d879ab65d6340469b48a4625`；改动为未提交工作树快照，未 commit/push/merge/restart/deploy/关票。

本报告 `status: accepted` 表示整改证据落盘，**不表示验收通过**。backend_QA 第 2 轮的 27 行 PASS 针对的是上一轮 finding，不覆盖本轮 OCR 新发现，本轮不据此声称整体 PASS。修复后未重跑 OCR：冻结后的 OCR 复审由主理人另行安排。

## 逐条整改（每条单项红 → 最小实现绿，真实退出码与日志 SHA-256 如下）

### R2-1 · 高 · security · image-ingest.js — sweep 在 read/remove 前重检 root

- **缺陷**：`runSave` 开头的 `realStagingRoot()` 校验与 `sweepStaleSlices()` 的 `readdirSync`/`rmSync` 之间存在竞态窗口；`.image-ingest` 若在窗口内被换成指向 vault 外的 symlink，清扫会跟随读取并递归删除外部目录。红测试同时复现了更差事实：`mkdir` 间隙换入的 symlink 还会把新 scope 目录建到外部。
- **修复**：`sweepStaleSlices()` 在枚举前与每一次递归 `removeDir` 前重新调用 `isSafeStagingRoot()`，root 不安全即整体返回（宁留残留不跟随）。这是「校验到执行之间必须重检」的可测试边界防护，**不声称消除了 FD 级竞态**，不加 native 依赖。
- **红**：`node --test --test-name-pattern='R2-1' plugins/omnimux-assets/src/image-ingest-v1.test.js` → 真实 exit **1**（`.tmp/fix3052-r2-1-red.log`，SHA-256 `8cfcf2e7b5aba437f6563895528f2a51a229988779812a00d8c0e4351a122ac0`；1 fail：外部 `old-slice` 被删且新 scope 建到外部）。
- **绿**：同命令 → 真实 exit **0**（`.tmp/fix3052-r2-1-green.log`，SHA-256 `b42176b430e51a8677e6c1863a865fb91be4723c5a676c386404e50031c1ce12`）。

### R2-4 · 中 · security · image-ingest.js — root 创建与 slice mkdir 分离

- **缺陷**：root 缺席时 `realStagingRoot()` 返回 null，随后一次递归 `mkdirSync(slice)` 顺带建 root；若在递归 mkdir 前 root 位置被换成 symlink，先在 vault 外创建 scope 目录才轮到路径检查，违反「任何外部写入之前须拒绝」。
- **修复**：新增 `ensureStagingRoot()`——root 只在缺席时以**非递归** `mkdirSync` 建立一层并立即 `realStagingRoot()` 重验；`EEXIST` 并发抢建回到统一验证；`ENOENT`（vault 未物化）先建 vault 再非递归建 root。runSave 中 slice mkdir 也改为**非递归**、作用于已验证 root；slice `EEXIST` 不豁免，落到既有 lstat/realpath 验证判定（保持「预先落位 symlink 片 → path-denied」行为，QA 边界探针依赖此契约）。write/cleanup 与验证后的真实 root 一致。**可断言边界**：「mkdir 前验证到的 null/真实目录」不授权递归写入；不声称完整 FD 竞态消除。
- **红**：`node --test --test-name-pattern='R2-4' plugins/omnimux-assets/src/image-ingest-v1.test.js` → 真实 exit **1**（`.tmp/fix3052-r2-4-red.log`，SHA-256 `51e729905cd1c0511fcf355ed8862a293c3e91378274ed69a4c5cbac417510b4`；1 fail：外部目录被建入 scope）。
- **绿**：同命令 → 真实 exit **0**（`.tmp/fix3052-r2-4-green.log`，SHA-256 `ad5f57f0acc5d7f4596c4d79520fec04377fa7fe603740646b798182f548dcc4`）。
- **迭代中发现的回归**：首版改动让「预先落位 symlink slice」返回裸 `EEXIST`，QA 边界探针 `stage slice lstat symlink refusal` 由 PASS 转 FAIL（`.tmp/fix3052-r2-qa-boundaries.log`，exit 1）。补救为 slice `EEXIST` 回落验证路径后，探针恢复全绿 —— 未改探针任何断言。

### R2-2 · 中 · bug · image-assets.ts — 校验在途取消

- **缺陷**：`validateImage` 在途期间不观察 signal；慢/卡死解码器会让已断连接的 RPC 一直等到校验 settle，不能及时回 `cancelled`。
- **修复**：新增 `runValidationWithCancel()`——`signal` 缺席或已 aborted 时短路；在途时以 `Promise.race` 将校验与 abort 事件竞速，abort 先到回 `{aborted:true}` → `cancelled`。迟到的校验 settle 由 `void validation.then(()=>undefined,()=>undefined)` 显式收尾，杜绝 unhandled rejection；abort 监听在 race 结束后移除。
- **红**：`node node_modules/vitest/vitest.mjs run tests/image-assets-v1.spec.ts -t '校验在途时死亡'`（plugins/omnimux-browser）→ 真实 exit **1**（`.tmp/fix3052-r2-2-red.log`，SHA-256 `2af5f66567f1cb7d3b143ae450c35f76222f411b1df66cd482c7df77757b7b83`；1 fail：`STILL_WAITING` ≠ `cancelled`，即 bug 本体）。
- **绿**：同命令 → 真实 exit **0**（`.tmp/fix3052-r2-2-green.log`，SHA-256 `dad755472227259731cfc8d7e15f920f857384d7867fc9eb2a93e628f97fab1f`）。

### R2-3 · 中 · bug · media-fetch.ts — timeout 先行归因

- **缺陷**：模块计时器先触发（`timedOut=true`、controller abort）后，调用方再 abort 会把 `externallyAborted` 置位，catch 里把已发生的 timeout 改报成 failed/调用方取消。
- **修复**：`onExternalAbort` 改为 `if (!timedOut) externallyAborted = true` 后 `controller.abort()`——外部处理器只在本模块 timeout 尚未发生时取得归因，中断行为不变。
- **红**：`node node_modules/vitest/vitest.mjs run tests/image-assets-v1.spec.ts -t 'timeout first-wins'`（plugins/omnimux-browser）→ 真实 exit **1**（`.tmp/fix3052-r2-3-red.log`，SHA-256 `210be4ed473b4603b00a3b44483220737d429ebb47ac0392a166a60bec494bb0`；1 fail：`failed` ≠ `timeout`）。
- **绿**：同命令 → 真实 exit **0**（`.tmp/fix3052-r2-3-green.log`，SHA-256 `24de3cb1d69982f25301b22dc822cd2fb6ffdd8756df03be89fb72fabead7a08`）。

### 附带修正 · 源码注释「移除残骸」→ 保留旧记录

`image-ingest.js` 模块头不变量原写「旧记录文件缺失不算成功，**移除残骸后按新保存入库**」，与 Q2 已落地的「缺文件不授权销毁记录、旧条目保留另建新条目」行为矛盾。改为如实描述：「缺文件也不授权销毁记录：旧条目保留，本次保存另建新条目」。测试文件中既有注释本来已正确（原断言因违规格被改写并注明理由），未动。

## 旧报告更正

`browser-image-assets-v1-backend-fixes.md` 两处与日志事实不符，已就地更正（不删不改任何原始日志文件）：

1. Q5 行原把 `fix3052-q5-green.log`/`fix3052-q5-green2.log` 列为 exit 0；两文件实际均为 **1 failed / 47 skipped**（断言 `unsupported-image` 得 `http-error`）。该条真实转绿证据是 `fix3052-q5-suite.log`（62 pass / exit 0）与 QA 探针 `late-attachments` PASS。
2. 表头「每条均先失败行为测试跑红」不准确：`q2-red`/`q4-red`/`abort-red` 各含 2 个失败（一次多断言/多测试的红），属**部分 TDD**；`q1`/`q3`/`srckey`/`fetch`/`q5` 为单项红。

## 验证结果（修复后真实命令与退出码）

| 层 | 命令 | 真实 exit | 结果 | 日志 SHA-256 |
|---|---|---:|---|---|
| R2-1/R2-4 红 | `node --test --test-name-pattern=…` | 1 / 1 | 各 1 fail（预期复现） | `8cfcf2e7` / `51e72990` |
| R2-1/R2-4 绿 | 同上 | 0 / 0 | 各 1 pass | `b42176b4` / `ad5f57f0` |
| R2-2 红/绿 | `vitest run -t`（browser） | 1 → 0 | STILL_WAITING → pass | `2af5f665` / `dad75547` |
| R2-3 红/绿 | `vitest run -t`（browser） | 1 → 0 | failed≠timeout → pass | `210be4ed` / `24de3cb1` |
| ingest 文件全量 | `node --test plugins/omnimux-assets/src/image-ingest-v1.test.js` | 0 | 16 pass / 0 fail | — |
| 本任务两个 spec | `vitest run tests/image-assets-v1.spec.ts tests/image-assets-rpc-v1.spec.ts` | 0 | 67 pass / 0 fail | `e90b984b` |
| assets 全量 | `node --test plugins/omnimux-assets/src/*.test.js` | 0 | 272 pass / 0 fail / 0 skip | `2bd11225` |
| browser tsc | `tsc -p tsconfig.json --noEmit`（browser 包） | 0 | 无诊断 | `e3b0c442`（空日志） |
| 原 QA 探针（未改） | `node --experimental-transform-types .tmp/qa3052-real.mjs` | 0 | **18 PASS / 0 FAIL** | `622f8fd2` |
| QA 边界探针（未改） | `node --experimental-transform-types .tmp/qa3052-round2-boundaries.mjs` | 1 → 0 | 8 PASS + 1 FAIL（EEXIST 回归）→ **9 PASS / 0 FAIL** | `4eb4c321` |
| 边界检查 | `node scripts/verify-plugin-boundaries.mjs` | 0 | 3882 源文件 PASS | — |
| git diff --check | `git -C <worktree> diff --check` | 0 | 无空白错误 | — |

- 所有命令在显式 worktree `workdir` 下以绝对路径 `/Users/x/.nvm/versions/node/v25.8.0/bin/node` 直跑；Git 均 `git -C`；无 pnpm/管道尾部退出码推断。
- **未重跑**完整 browser `tests/` 全量：已知基线为 299 pass / 1 fail / 6 skip + 2 收集失败（Q6 caps 旧断言、缺 `@deepseek-ai/dsh-workspace`、缺 `playwright-core`），本任务不改基线 composition 断言（需用户另行授权），复跑只会重复数百个已知缺包结果。
- extension 前端未跑未碰：前端 job32 并行拥有。
- QA 探针原样重跑未改任何断言，结果如实记录（含中途 FAIL→修复→全绿的过程）。

## 源码指纹（整改后 SHA-256）

- `plugins/omnimux-assets/src/image-ingest.js` `0f74729d2f2a73c7bd98425928012beb7e887379ff70a2e5b69ba6245434269e`
- `plugins/omnimux-browser/src/image-assets.ts` `9995035f97afddeee860885fea801cfe9b0ea7c0011b811e772e0647cbcda0df`
- `plugins/omnimux-browser/src/media-fetch.ts` `685544cf2956fe9bc8ebede21db76dd33b82c37011039d6c21f3c6b3b2329a4e`
- `plugins/omnimux-assets/src/image-ingest-v1.test.js` `3831ca151c6bba15d196b609461c7a8bbb5767818653cf38175bedde0d61b95b`（+2 测试）
- `plugins/omnimux-browser/tests/image-assets-v1.spec.ts` `382d78dba69aaf5f402084826d4305866f26b437caa7a9878c52f86a862c791c`（+2 测试）
- `plugins/omnimux-browser/tests/image-assets-rpc-v1.spec.ts` `ecf0eee2d76bc82f4eeefce4df06786b33b9fc48a4942ac6e803947ea4a0d222`（未改）
- `plugins/omnimux-assets/src/library-image-transaction-v1.test.js` `38d20be6beff27c334e4112aa11e25e526d595335c7eda4a85f78abf42faeba7`（未改）
- `docs/implementation/browser-image-assets-v1-backend-fixes.md` `3cebf4285d3bd4e4a6ce3ebd9ddfdebb27743bb00e5a990b9fd011cea9125daf`（更正后）

## 范围与未做事项

只改 `plugins/omnimux-assets/src/image-ingest.js`、`plugins/omnimux-browser/src/{image-assets,media-fetch}.ts` 与两个已登记测试文件（`image-ingest-v1.test.js`、`image-assets-v1.spec.ts`，各 +2 条，共 +4 条新测试，全落在本任务已登记路径内，无新测试文件）；更正一份实施报告。未改：extension、QA 探针、基线 composition 断言、其他测试断言、协议词汇、依赖清单。无 native 依赖新增。未 commit/push/merge/deploy/restart/关票。

安全边界如实声明：R2-1/R2-4 收窄了「校验点与使用点之间」的可测试竞态边界（重检 + 非递归分层建目录 + 写后验证），`ensureStagingRoot`/`sweepStaleSlices`/`lstat`/`realpath` 的组合不能穷尽 FD 级竞争（如 root 在最后一次验证后被换出、且恰被持有句柄跟随）。这是 POSIX 无 `openat`/`O_NOFOLLOW` 语义下的诚实上限，与指令「不能声称完整 FD 竞态消除」一致。

请主理人安排冻结后的 OCR 复审与独立 QA。
