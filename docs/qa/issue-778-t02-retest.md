# Issue #778 — T02 工程返修后独立回归

## 结论与范围

**T02 三根因返修局部 PASS / IS_PASS: YES；Routing Decision: NoOne（仅本次局部返修）。#778 整体 IS_PASS: NO，未具备关闭、合入或真实 Dev 操作条件。** 本次是首次工程返修后的独立 QA；旧报告两轮针对同一未修源码补诊断，不混作返修回归。本次只跑一次指定三文件合并命令，无第二轮、无无限迭代。

- 固定任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`。
- base 与前后 HEAD：`580234923268673562cacb5cd01aebdb780339e1`。审查对象是此 base 上的本地未提交状态，不是远端 PR tip；未 fetch/切换分支。
- 已完整读取 `docs/qa/issue-778-t02.md`（65行）、`docs/implementation/issue-778-qa-fixes.md`（58行）、`docs/implementation/issue-778-t03-followup.md`（108行）、补工规格（243行），及本次三个模块和三份测试。
- 本次唯一仓库持久交付为本报告；未新增/修改源码或测试、未修改 T03、package/lock/CI/合同。测试夹具由既有测试在任务私有目录建立并清理。
- 未运行完整 transaction/recovery、全 gates、真实 Host/L2/Dev/Prod；未 capture/restore 旧全局 backup、未 workspace install/共享依赖写、commit/push/委派。原生模块导入 `managed-tarball.mjs` 仅使用 `parseRequest`，不启动事务。

## 实际测试与精确计数

执行时间：**2026-09-08 18:15:06–18:15:39 +08:00**。环境：macOS arm64，Node `v25.8.0`，Python `3.14.6`，pnpm `11.7.0`；版本均在同一私有环境命令中实测。

```sh
source .workbuddy/managed-778-t01/env.sh
node --test --test-reporter=tap scripts/managed-tarball.test.mjs scripts/materialize-cache.test.mjs scripts/managed-tarball-t02.qa.test.mjs
```

上述与工程最终报告为同一测试命令，仅外加时间、版本和退出码打印。**实际 66 tests / 66 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo，32462.519333 ms，exit 0。** 工具后台 job `bash-390` 已完成并完整收集 TAP 输出；未另写日志文件、未重跑独立16来重复累计。

| 文件 | 原工程 | 新增工程 | 原独立 QA | 本次总数 | TAP 编号 |
| --- | ---: | ---: | ---: | ---: | --- |
| `scripts/managed-tarball.test.mjs` | 36 | 4 | 0 | 40 | 17–56 |
| `scripts/materialize-cache.test.mjs` | 8 | 2 | 0 | 10 | 57–66 |
| `scripts/managed-tarball-t02.qa.test.mjs` | 0 | 0 | 16 | 16 | 1–16 |
| 合计 | **44** | **6** | **16** | **66** | 1–66 |

新增6项为：tar双结束块边界1项；directory/leaf/extra竞态3项；来源递归预检1项；合法semver/peer及真实direct override兼容1项。42个拒绝组合与11个合法配置值是用例内断言，不能另加到66；合法值中 `$is-number` 与 `-` 是 pnpm 配置语义，不冒称均为 semver 字符串。未采集覆盖率，不填估算百分比。

## 三根因验收

| 根因 | 实测与静态证据 | 结论 |
| --- | --- | --- |
| ARC01 子目录/叶子路径绑定 | 原 QA-ARC01/02通过；工程directory/leaf/extra三项通过。`managed-tarball-archive.py:336–438` 保存目录dev/inode与叶子五字段身份，chmod后经根FD递归核对成员集合、类型、模式、身份及遍历前后名称绑定；未知成员拒绝。 | 局部 PASS |
| ARC05 完整gzip内缺tar结束块 | 原QA-ARC05通过；工程0/511/512/1023字节尾部拒绝，1024零字节通过。`:121–133` 在标准TarInfo入口对首个零块要求第二个完整512零块，保留gzip drain/CRC/EOF/非零尾部校验。 | 局部 PASS |
| CACHE02/06 来源配置提前拒绝 | QA-CACHE02-local/remote、CACHE06及工程42组合全部通过。`materialize-cache.mjs:115–118` 在private env/runner之前调用配置来源校验；`materialize-graph.mjs:373–398` 递归处理override/peer规则、protocol keys及manifest `$` 引用。 | 局部 PASS |

本轮 QA-CACHE06 的真实测试输出：`installCalls=0`、`lockExit=null`、`unapprovedSourceInGeneratedLock=false`、`alternateVersionInGeneratedLock=false`、`liveUnchanged=true`。这证明提前拒绝，**不是**旧版本曾读取恶意payload或绕过网络gate的证明。

原工程兼容证据包括：真实公开 `is-number@7.0.0` 私有获取、最终冻结离线安装、去掉旧输入后搬迁重建、embedded/native payload、hoisted ghost解析、peer occurrence、坏integrity/断网、safeMove/probe与pending原语。公开包测试输出 `nodeCount=2`、`relocated=true`、lockDigest `057467618547e5a6af38ef21c8caf8eab8cb8d41ed361d580472867d8350949d`。这些不等同完整事务或真实Host业务验收。

## 断言保留与有限 semver 复核

1. **独立测试逐字未改：**当前及测试后 SHA-256 均为旧 QA 报告的 `f2a3be3a05952957d9aa7e66a32c42ea859d9cb22fe4d2d373e268b47fc97364`；旧QA报告本身也未改。原失败断言仍要求 `rejected=true` / `installCalls=0`，没有改成接受失败或跳过。
2. **原44工程测试逐字保留：**只在内存中从现文件移除新增测试块；cache文件再逆除新增 `validateConfigurationSources` import及 `workspaceExtra` fixture参数/展开。还原文本SHA精确匹配旧T02报告：archive测试 `46da028b83eeb3d279bcfb9477182633015197cefecf8ea3a4cb4d0ce2dcb291`，cache测试 `06075d9a76ff06f349d0f5f8431806d8c0dbe51fbc8d088bec9dd9ae17990c20`。没有写还原文件、没有修改测试。这比只核计数更直接证明未删改旧断言。
3. **新来源分类有限复核未发现明显合法semver回归：**普通精确版本、`^`/`~`、比较区间、空格/OR、hyphen范围、wildcard、prerelease/build均不含新规则拒绝的protocol/斜杠/路径前缀；工程现有合法值循环和scoped peer规则通过。`$` 引用递归校验真实manifest值，合法scoped引用通过，循环/缺失及引用到file来源被拒绝。别名protocol、路径和URL不属于本次批准的普通semver来源，不以其被拒绝误报semver回归。
4. **direct override importer兼容：**`materialize-cache.mjs:125–130` 仅当workspace同名字符串override、beforeLock.override、lock importer specifier三者相等时容纳manifest范围不同；非目标manifest与完整lock/graph比较仍保留。现有真实 `is-number: ^7.0.0` override冻结安装和完整图比较通过。范围限定为该直接同名案例；没有声称所有pnpm selector/alias语法、任意拓扑、所有平台兼容，也没有另添测试或安装实验。

## 固定源码身份与 T03 未改证明

2026-09-08 18:14测试前及18:16测试后实际 `shasum -a 256` 一致，全部匹配工程最终交还；独立QA和T03身份匹配各自原报告。

| 文件 | SHA-256 |
| --- | --- |
| `scripts/managed-tarball-archive.py` | `50f70b21523024be85c7d44c97228949c1d0bdadf3a71fcb873b17567531a5cf` |
| `scripts/materialize-graph.mjs` | `35b46fa7e25b39f819abc8c90de54afe5cffbcd440e34802d490cd8464156f86` |
| `scripts/materialize-cache.mjs` | `d434eb76c5274260479750d80079c859ef615448f9a825935c9d2c8d22707e33` |
| `scripts/managed-tarball.test.mjs` | `00218682b34f6d78b2c007a760a45c8b8ed73ff95187b618b59f4695119b324a` |
| `scripts/materialize-cache.test.mjs` | `7236a7d9bd7e9bd147dc8c66e5d2ecb2d689bc1a911cf37dc676a2f66713ea31` |
| `scripts/managed-tarball-t02.qa.test.mjs` | `f2a3be3a05952957d9aa7e66a32c42ea859d9cb22fe4d2d373e268b47fc97364` |
| `docs/qa/issue-778-t02.md` | `b46ebf5289a90f7bfde02fdf0ef23d0ed19783e456164183b8eb1e146a1f5f8a` |
| `scripts/managed-tarball.mjs`（T03） | `05937f2f7948483ab7bda476659a14868fd1186bafee8838132d2dd66794d572` |
| `scripts/managed-tarball-transaction.test.mjs`（T03） | `a8b5be5e5985785083e1e64c891685e4399791a510456a510da0e23ff8a727d9` |
| `scripts/managed-tarball-recovery.test.mjs`（T03） | `ea0a9f87b22093d2fe9c1fd50ac27e9d5b67f602e51d90944459be1ba8c5a492` |

T03三文件未受改指的是字节身份不变，**不是**新T02与完整T03事务已共同验收。旧T03结果不得拼成本次测试总数。

## 安全边界、未完成项与下一责任人

- 已读取T01 `env.sh`与固定pnpm wrapper。工程测试的临时目录位于其私有TMPDIR，独立QA样本位于任务 `.workbuddy/managed-778-t02-qa-*`；私有store/config/HOME由既有fixture创建。测试后这三类样本目录均无残留。没有遗留后台job或新服务。
- `git diff --check` 测试前后均exit0；报告另作未跟踪文件空白检查。未将历史dirty增量当作本次修改。
- **旧backup阻断仍在：**18:16只读存在性核查 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-backups/legacy-4092a8f-diffs/manifest.json` 结果为不存在。未运行capture、修登记或修改旧材料；T03报告中的 `failed_phase:registration` 不因本次66/66变成成功。旧batch restore成功也不能替代capture登记成功。
- **#778整体保持NO：**T03成功交易、全部发布rename前后与信号/IO矩阵、最终同状态集成/gates、真实Host/L2以及后续合入/Dev各自证据仍待完成。T03原报告还保留准备写祖先路径覆盖及no-op只读list合同接缝，未在本次解决或豁免。未跑项标“未执行/待验”，不标N/A或PASS。
- 下一责任人：主理人可将本报告作为T02三根因局部闭合证据；backup legacy owner先在独立授权范围处理缺manifest登记，T03/最终集成owner收敛剩余实现与完整事务证据，再安排最终独立验收。本轮未发现需新增路由Engineer的源码bug，不改源码、不擅自延伸下一阶段。
