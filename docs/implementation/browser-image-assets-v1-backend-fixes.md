---
title: "V1 #3052 后端缺陷整改报告（QA 第 2 轮前）"
id: "impl-browser-image-assets-v1-backend-fixes"
type: "log"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# V1 #3052 后端缺陷整改报告

对照 [QA 报告](../qa/browser-image-assets-v1-qa.md) 的 Q1–Q5 与 [OCR 报告](../qa/browser-image-assets-v1-ocr.md) 的 1 高 5 中逐条整改。工作树 `.worktrees/cross-browser-image-assets`，分支 `agent/cross-browser-image-assets-issue-3051`，HEAD 仍为 `d95764912e36da01d879ab65d6340469b48a4625`；改动为未提交工作树快照，未 commit/push/merge/restart/关票。

## 逐条整改（红→绿证据如下；更正见本表后注）

| 编号 | 缺陷 | 最小修复 | 红→绿证据 |
|---|---|---|---|
| Q1 高危 | `.image-ingest` 为 symlink 时 mkdir/sweep 越过 vault 删除外部目录 | `realStagingRoot()`：lstat 根必须真实目录且 `realpath(root) === realpath(vaultRoot)/.image-ingest`，否则 `path-denied`；先于 sweep/mkdir 执行；`clearStagingSlice` 对不安全根与 symlink 片跳过不递归 | `.tmp/fix3052-q1-red.log`（exit 1，sentinel 被删复现）→ `q1-green.log`/`q1-suite2.log`（exit 0） |
| Q2 高 | 缺文件旧记录被 remove 销毁并吞 remove 失败 | 缺文件旧记录不授权 remove：保留账本/assetId/元信息，新保存另建条目；`completeExistingAsset` 完整行优先（烂记录不挡新资产）；`rollbackAddedAsset` 仅限本次提交资产且失败时 console.warn 留痕 | `.tmp/fix3052-q2-red.log`（exit 1，两条）→ `q2-green.log`/`q2-suite.log`（exit 0） |
| Q3 中 | 跨 source 同名并发产生重名 handle | `enqueueCommit` 串行队列只覆盖名称预约 + `library.add` 提交段；下载/暂存仍并行 | `.tmp/fix3052-q3-red.log`（重名 `同名海报` 复现）→ `q3-green.log`/`q3-suite.log`（exit 0） |
| Q4 中 | 40 字名加 `(2)` 超限报 name-invalid；`-\x7f` 区间把 `-` 当控制符删且漏 `\x00-\x1f` | `uniqueDisplayName` 按 `40 - suffix.length` 预留后缀长度并去尾部点/空白；`sanitizeDisplayName` 控制字符改为 `[\u0000-\u001f\u007f-\u009f]`，保留普通连字符 | `.tmp/fix3052-q4-red.log`（2 fail：`'a\x01b c'` 与 name-invalid）→ `q4-green.log`/`q4-suite.log`（exit 0） |
| Q5 中 | attachments/imageLimits 在 mount 时捕获，后挂载永久 unavailable | 新增 `createImageAssetSaveDeps(ctx)`（image-assets.ts）：validateImage 绑定当次 provider、imageMediaTypes 与 assetLibrary 均按调用 `ctx.get` 解析；index.ts 改用它 | `.tmp/fix3052-q5-red.log`（1 failed，函数缺失）→ `fix3052-q5-green.log` 与 `fix3052-q5-green2.log` **实际均为 1 failed（不是 exit 0）**，最终绿证据是 `q5-suite.log`（exit 0，62 pass）；QA 探针 `late-attachments` PASS |
| OCR 中① | sourceKey trim 后未传 runSave，未规范化值被持久化 | `ingestDownloadedImage` 校验并传 `{...input, sourceKey}`；同时加严为 64 位小写 hex | `.tmp/fix3052-srckey-red.log`（账本出现带空白 source）→ `srckey-green.log`/`srckey-suite.log`（exit 0） |
| OCR 中② | ingest 提交后未再查 abort，可能向已断连接回 saved | `runIngest` settle 后、回执判定前先 `aborted()` → `cancelled`；不撤销已真实提交的文件 | `.tmp/fix3052-abort-red.log`（saved vs cancelled）→ `abort-green.log`（exit 0） |
| OCR 中③ | 外部 abort 先行但底层迟 reject 时被迟到 timer 改报 timeout | `externallyAborted` first-wins 归因；timeout 判定收紧为 `timedOut && !externallyAborted` | `.tmp/fix3052-fetch-red.log`（timeout 误报）→ `fetch-green.log`（exit 0） |

> **更正（2026-10-03 第二轮 OCR 整改时如实修订）**：上表「红→绿证据」两处在原始撰写时记录不准。
> 一、Q5 行：`fix3052-q5-green.log` 与 `fix3052-q5-green2.log` 实际是失败日志（各 1 failed / 47 skipped，断言 `unsupported-image` 得 `http-error`），并非该表所写的 exit 0；该条真正的转绿证据是 `fix3052-q5-suite.log`（62 pass / exit 0）与 QA 探针。
> 二、表头原声称「每条均先失败行为测试跑红」不精确：`q2-red`（2 fail）、`q4-red`（2 fail）、`abort-red`（2 failed）为一次跑多断言/多测试的红，属部分 TDD，而非严格的单项红→绿循环；`srckey`、`fetch`、`q1`、`q3` 为单项红。此处更正描述，不改写或删除任何原始日志文件。

## 测试断言变更说明（授权内）

- `image-ingest-v1.test.js` 原「移除残骸后按新保存入库」断言 `list().length===1` 违规格「缺文件不授权销毁记录」——按主理人指令改写为旧记录保留 + 新条目另建 + 第三次命中 duplicate，文件中已注明理由；其余既有断言一律未动。
- 新增 8 条针对缺陷的行为断言，全部落在已登记的四个本任务测试文件内，无新测试文件。

## 全量验证（真实命令与退出码）

- `node --test plugins/omnimux-assets/src/*.test.js` → exit 0，270 pass / 0 fail / 0 skip（`.tmp/fix3052-assets-all.log`）
- `node node_modules/vitest/vitest.mjs run tests/`（plugins/omnimux-browser）→ exit 1，299 pass / 1 fail / 6 skip / 2 收集失败（`.tmp/fix3052-browser-all.log`）。三项与 QA 基线完全一致，非本次改动引入：`composition.spec.ts:322` caps 旧断言缺合法新增 `imageAssetSave:true`（QA Q6，测试合同更新待主理人授权，本任务未改既有断言）；`session-purge.spec.ts` 缺 `@deepseek-ai/dsh-workspace`；`e2e` 缺 `playwright-core`。
- `node --experimental-transform-types .tmp/qa3052-real.mjs`（QA 原探针第二轮，未改动，SHA256 `51d65b09…a8a4f7`）→ exit 0，**18 PASS / 0 FAIL**（`.tmp/fix3052-qa-round2.log`）：含 symlink 哨兵保留、缺文件 persist 失败一致性、并发同名唯一、40 字第二保存、late-attachments 动态解析、dispose/remount 重建。
- `tsc -p tsconfig.json --noEmit`（browser）→ exit 0（`.tmp/fix3052-tsc-final.log`）
- `node scripts/verify-plugin-boundaries.mjs` → exit 0；`git diff --check` → exit 0
- extension 套件未跑：本整改不触及 extension（前端 subagent 并行拥有）。

## 源码指纹（冻结时 SHA-256）

- `plugins/omnimux-assets/src/image-ingest.js` `da9f049a4f4dd269f4a1faed2e2141a56bea5d374b82176e4fb1c4f5fbb6d717`
- `plugins/omnimux-assets/src/ingest.js` `3a32105b67fab58dadff42aee40830b69e53f3e1e7082a2f655c5ae9c2b49a3f`（未改）
- `plugins/omnimux-assets/src/library.js` `dc616a2fce115ee10175d120736e4264aff302d414c460cb05eede977a625c81`（未改）
- `plugins/omnimux-browser/src/index.ts` `4ae9ce0f13dc525eab99fa580921f2b9d507e56da1b8c461e96d6a0ad74535e8`
- `plugins/omnimux-browser/src/image-assets.ts` `ad57095adeca555d9a10b87036ca0491f5dc8584e8f62e82e9d9a97ca159bf8f`
- `plugins/omnimux-browser/src/media-fetch.ts` `101c7e4849a4c6e564e55cdb66281999048ae498cb6cfceb65f086798054416b`
- `plugins/omnimux-assets/src/image-ingest-v1.test.js` `cad3f54443bb34fdc7a69cd5960de028825584f36e85e793af332a67e0d7eb06`
- `plugins/omnimux-assets/src/library-image-transaction-v1.test.js` `38d20be6beff27c334e4112aa11e25e526d595335c7eda4a85f78abf42faeba7`（未改）
- `plugins/omnimux-browser/tests/image-assets-v1.spec.ts` `24abb2d2f10abc024e8f3cbb81d87da0ca709a668673020151ff9ed8956b6ef1`
- `plugins/omnimux-browser/tests/image-assets-rpc-v1.spec.ts` `ecf0eee2d76bc82f4eeefce4df06786b33b9fc48a4942ac6e803947ea4a0d222`（未改）

## 范围与未做事项

只改 `plugins/omnimux-assets/src/image-ingest.js`、`plugins/omnimux-browser/src/{index,image-assets,media-fetch}.ts` 与上述四个本任务测试文件；未改业务 root deps、既有基线断言、extension、QA 探针。Q6 caps 测试合同红灯保留待主理人授权。请主理人安排独立复验与 OCR 复审。
