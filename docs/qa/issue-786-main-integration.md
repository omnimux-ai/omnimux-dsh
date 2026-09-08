# Issue #786 — main 整合最终快速独立复核

## 结论

**IS_PASS: YES。Routing Decision: NoOne。范围内未解决源码缺陷：0；PR 可准备。** 本轮只读检查源码等价性、main 变化、测试注册与已有执行证据，没有重复全 gates，也未另跑17项。工程149/149、独立17/17、repeat4/4、Stage10/8的原始日志及进程结果通过核验；QA142和guard53结论在相同输入下复用。覆盖率未统计，不提供虚构百分比。

**基线提醒：远端 main 已由 `fbaaca68` 前移至 `40efef15`。** 新增提交只改 Market CSS 三行，与任务路径无交集、无注册/行为接口冲突；这不是本轮源码缺陷或PR准备阻塞。现有执行证据绑定 `2cd03380`，不冒称已在 `40efef15` 上重跑或完成新一次 rebase。主理人应在后续PR/CI集成中保留这项上游CSS修复。

## 精确身份与只读范围

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-non-git-guard-786`。
- 分支：`agent/common-non-git-guard-786-issue-786`；PR base为 `main`，不是 `origin/develop`。
- 入场及本轮交付 HEAD：`bac4b3fea384cb32261d7318d440b24f9d1c5317`。入场 clean；本轮仅新增本报告，未提交，交主理人commit。
- 实测代码：`2cd0338097d0c2ca59ba56d4b19aaf3c3ee30765`，tree `92e05fcd00621439a01b07346c62951563c15561`。
- 已集成/执行基线：`fbaaca681fd36f2bfd3b936d19700252083ab598`。
- 2026-09-08 20:48 Asia/Shanghai，`git ls-remote origin refs/heads/main` 返回 `40efef157f3760ae8f84ccad04db938ff1e8cb8f`；该对象已经在本地，无须fetch或写共享refs。
- 全文读取[工程143报告](../implementation/issue-786-main-integration.md)124行、[最终QA142](issue-786-final.md)143行、Git/PR合同、package、安全适配器、integration-results及四份执行日志。核对上游完整CSS增量、Market apply接口增量和任务Stage/注册diff。没有委派子代理或扩大成重复全量审计。

## Git 等价性与新 main 适用性

以下只读检查成功：

```sh
git range-diff 59c19cdfb15b20556086c2255f3e43d019d66dd4..ef2fbaefceda0ed1171850175b7bb30012154c8e fbaaca681fd36f2bfd3b936d19700252083ab598..2cd0338097d0c2ca59ba56d4b19aaf3c3ee30765
# 1: ef2fbaef = 1: 2cd03380 fix(common): classify non-git writes and restore sync entries (#786)
git diff --exit-code ef2fbaefceda0ed1171850175b7bb30012154c8e 2cd0338097d0c2ca59ba56d4b19aaf3c3ee30765 -- scripts package.json
git diff --exit-code 2cd0338097d0c2ca59ba56d4b19aaf3c3ee30765 bac4b3fea384cb32261d7318d440b24f9d1c5317 -- . ':(exclude)docs'
git diff --exit-code fbaaca681fd36f2bfd3b936d19700252083ab598 bac4b3fea384cb32261d7318d440b24f9d1c5317 -- plugins pnpm-lock.yaml
git diff --check 40efef157f3760ae8f84ccad04db938ff1e8cb8f...HEAD
```

- range-diff为`=`，scripts/package逐字等价；工程报告的“无冲突rebase”与结果一致。本轮未重新执行rebase，不把结果等价声称为独立观察到当时整个rebase过程。
- `bac4b3fe`仅新增 `docs/implementation/issue-786-main-integration.md`（124行），其父提交为实测代码，无生产/测试改动。
- 旧base到 `fbaaca68` 的13个上游文件均为Market及文档；任务不改产品plugins或锁。`apply.js`新增可选workspaces注入，受控Stage ctx的`inject(_names, fn) { return fn(ctx) }`仍兼容；row rank4.1、单Tab、真实DOM监听器及生命周期断言未改变。149和Stage证据已运行该版本。
- `40efef15`直接父提交为 `fbaaca68`，唯一变化为 `plugins/omnimux-market/src/client/css.js`：`repeat(2,minmax(0,1fr))`、断点760→440、card `min-width:0`。不改导出、选择器、注册、Host接口、guard/sync/fixture、依赖或测试命令。PR三点diff仍仅任务15文件（加本轮报告后16），不存在任务覆盖上游CSS的修改。
- 当前分支尚落后远端这一个提交；本轮没有构造/测试合并树。CSS实机效果属于上游验收，未在这里重新认证；现有非布局合同测试证据仍适用于本任务，不因此重复全gates。

## 注册、日志与输入证据

`package.json:48`的 `test:gates` 以空白分词独立核验，`scripts/guard-worktree.qa.test.mjs` **恰好一次**；真实命令输出同样包含该路径，日志显示独立suite的17条成功结果。旧132加新增17为149，不将nested guard36/targets22/Alpha9另加到顶层计数；repeat4已在旧132中。

全文读取 `.workbuddy/sync-repeat-786/integration-results.json`，六条checks全部 `status:0, signal:null, error:null`。重新计算每份日志SHA-256与记录完全相等。下表是**核实并复用工程真实执行记录**，不是本轮新测试轮次：

| 检查 | 结果 / 真实记录exit | 日志SHA-256 |
|---|---|---|
| 全 `test:gates` | 149/149、4 suites、0 fail/cancelled/skipped/todo；exit0 | `4da837ff723c78adb47104d23f4dca32b7e07ad56cec59ed8c47cfbbac54c8bb` |
| 独立guard QA | 17/17、1 suite；exit0 | `16d9b1e1d60d8f2438cbb268f48fa289c1ca6d1a0da023a2a7439661c861ac0b` |
| 独立repeat | 4/4；exit0 | `375bc8210b8ffdd12592babc2fa51a1c72e4c497de776eef5f522fe1d2a43475` |
| Stage | 10 components / 8 registered sidebar targets；exit0 | `f9fb50948bea9b6c707c23cb5e23089b8bd6d091f39109f0d3948d848d3b1388` |

对应文件为同目录 `integration-gates.log`、`integration-guard-qa.log`、`integration-repeat.log`、`integration-stages.log`。整体执行时间为20:42:07–20:44:08 Asia/Shanghai；gates107398.689084ms。Python/pnpm预检日志也逐一hash匹配且exit0。

对结果中的14个输入逐一读取并计算SHA-256，**sourceBefore = sourceAfter = 本轮当前文件**。package新hash为 `cc79b1b7de92eec9a3139d4f8429db413a31dd5f9ac736a5774575408c64b651`；guard/source、既有测试、QA文件、Stage、live QA、Alpha、sync/repeat、targets、aggregator、锁及安全材料均与报告一致。相对QA142只有package新注册变化，故其132PASS及guard53结论可复用，不忽略142已记载并纠正的Python PATH历史失败。

## 安全适配器与证据边界

- 当前safe-presets SHA-256为 `f6c55bb32bcd6b622f42ce432c816fe20425c2cbcc23b991e46d9c3641ae16c4`，私有presets副本为 `e7121b7394c4d68c7ef27d96b2aa0bacc290635e9b684d81ae2c0a2b9bbb1a06`；与QA142/工程143一致，未修改或加载执行适配器。
- 重新独立计算原presets的ROOT定义与`/Applications/`两项替换，私有副本逐字相等；`absent-Applications`当前仍不存在。适配器仍只改精确presets argv与指定Corepack路径，返回真实spawnSync结果，不改断言、skip、stdout或退出码。
- integration-results记录受保护618项前后摘要均为 `c4c4be14d41d6500ddbe7f3f4b1bb6c1e827cc9e44e32b15436b231ebcfd994e`；本轮核实记录一致并复用此前独立安全审计，没有重新遍历整个App/Corepack，更不把历史快照说成本轮实机审计。其适用范围限报告列出的Corepack及四个App presets路径。
- 没有真实global skill、Dev/Prod/App、主checkout、依赖或配置写入；没有裸跑targets/gates，没有Host/browser/Electron测试。Stage是受控Host/JSDOM合同，不等于live UI。生产sync保留`frozen_lockfile=false`；不把独立frozen用例误称为生产frozen安装。

## 交付与下一责任

本轮仓库唯一写入为 `docs/qa/issue-786-main-integration.md`，不新增测试、不改源码/适配器、不commit/push/PR/MQ、不rebase、不激活hook或物化App。已检查本报告本地链接存在及Markdown空白，交付HEAD保持 `bac4b3fea384cb32261d7318d440b24f9d1c5317`。

**PR可准备，Routing: NoOne；没有剩余失败Known Issues。** 下一owner为主理人：显式提交本报告，在main基线PR与required CI/Merge Queue流程中保留/整合已核实的`40efef15`。若后续出现新的相关源码变化才重估必要定向测试；无相关变化不重复本地全gates。本结论不自动授权merge、main hook激活、Dev/Prod物化、Issue关闭或#778后续事项。
