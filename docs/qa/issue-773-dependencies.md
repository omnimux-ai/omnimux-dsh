# #773 本树依赖恢复与正式包验证独立 QA

## 结论与路由

**IS_PASS: YES。Route: NoOne。仅放行当前固定源码下的依赖准备、全包静态检查及正式本包 test 证据，不是完整工坊或运行验收。**

- 正式包测试证据：**352 tests / 7 suites，352 passed / 0 failed / 0 cancelled / 0 skipped / 0 todo，exit 0**。QA 全文检查日志并独立核算明细，没有重跑这套完整测试。
- QA 独立全包 `tsc --noEmit`：**1 次，0 诊断，exit 0**，使用原 tsconfig 和本树包级解析路径。
- 依赖、当前源码及生成物与工程测试证据绑定成立；共享依赖和原有受保护文件未漂移。原 query QA Round 2 的 **84/84** 是 352 项中的子集，不另行相加。
- Coverage：**未测得有效百分比**；不采用此前空目标报告的假 100%，不把 352 项等同于 PRD 57 个 AC。
- 本次无未解决的范围内源码/依赖问题。T03 未实现及下一阶段 validator 选型不是本次 failure。

## 1. 验收身份与授权范围

- 验收时间：2026-09-08，Asia/Shanghai。
- 唯一任务树 `T`：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`。
- 主树 `M`：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`，只读消费现有依赖。
- base = HEAD = **`580234923268673562cacb5cd01aebdb780339e1`**；target 为该 HEAD 上工程报告绑定的本地未提交源码及其生成物，非远端 tip 审查。没有 fetch、切分支或改 Git 索引。
- 输入：完整工程报告 [issue-773-dependencies.md](../implementation/issue-773-dependencies.md) 279 行、[query QA](issue-773-query.md) 224 行（采用最新 Round 2）、原始日志、前后清单和采集脚本，以及实际 manifest、tsconfig、lock importer、concat-client、lib diff、安装测试的本地复制分支。
- 本 QA 唯一仓库交付写入为本文；未改源码、测试、依赖、配置、共享节点或其他报告，未安装、提交、启动 App/L2、调用模型或物化 profile。没有召唤其他成员，通信由主理人中转。

## 2. 原始证据完整性与正式入口

### 2.1 日志不是只有汇总

`.dependency-validation/test.log` 全部 **383 行**已读取：

- 第 2–7 行为 `omnimux-market@0.2.13-omni.0` 的正式 test/build 展开，与当前 `plugins/omnimux-market/package.json:45,47` 逐字匹配。
- 第 9 行产物绝对路径指向本任务树，client 为 **217813 bytes / 20 fragments**。
- 独立解析得到 **359 条成功行，减去 7 条 suite 成功行 = 352 tests**，并与末尾计数相符；无失败、skip 或截断尾部。
- 当前 manifest glob 展开对应 **31 个文件**：`lib/tests` 23、`src/expert` 4、`src/client` 4。原 Q-01/Q-02 用例在日志第 232–233 行均通过；query/QA/aggregate/catalog/picker 84 项包含在本包总数内。
- `.dependency-validation/test.exit` 内容为 `0\n`。npm 外层日志 `08_01_45_886Z` 明确 argv 为 `--prefix plugins/omnimux-market run test`、cwd 为 T、exit 0；内层 `08_01_45_964Z` 为 `npm run build`、cwd 为本包、exit 0。两份均为 Node v25.8.0 / npm 11.17.0。

正式命令是已有 npm 直接执行本包 manifest 的同一个 test，不是替代 harness。test 自带一次 build：先清理本包 lib、tsc、拼装 client、复制 fixture/expert，继而 Node test；没有理由另跑一次 build。未使用 pnpm shim/Corepack 引发工具版本切换。

### 2.2 原始证据文件 SHA-256

| `.dependency-validation/` 文件 | QA 读取时 SHA-256 |
| --- | --- |
| `fingerprint.mjs` | `8c300c24d160ebe3cf5131b972b8fa9c362e9a4983ae6dcc04a00d52dd2c14a1` |
| `before.json` | `92ff58db00ec546a9741e0cfb08143344c7bd1da286defa05ff6361ae027fa88` |
| `after.json` | `7fa689949358221425bd1d754c177b01b0f6cfdd2c524939a2f36bea24e80612` |
| `test.log` | `d1ddb9db24365a8b918ab4a5714ebcef7572d735b6a4df509e53ccb443112924` |
| `test.exit` | `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa` |

以上是内容身份，不冒充签名或不可篡改运行审计。工程独立 noEmit 没有单列原始诊断日志；因此本 QA 新跑一次无输出检查补足当前独立静态证据，不仅采信报告自述。

## 3. 依赖有效性与只读约束

- `T/plugins/omnimux-market/node_modules` 是唯一获批包级目录软链，原始 target 精确为 `M/plugins/omnimux-market/node_modules`；目标本身是真实目录。`T/node_modules` 未创建。
- 五组字节比对均通过：T/M 根 package、lock、workspace、Market package，以及 T lock 与 M 已安装 `.pnpm/lock.yaml`。
- 10 项依赖的 `realpath`、manifest name/version、声明的 main/types/typings 文件存在性逐项独立断言通过；版本与 lock 的 Market importer 相符：cordis 4.0.1、dsh-tools 0.1.0-rc.8、schemastery 3.18.1、primitives 0.1.0-rc.8、@types/node 24.13.3、TypeScript 5.9.3、esbuild 0.25.12、React/React DOM 18.3.1、dsh-ui-kit 0.1.0（file 源）。@types/node 不要求运行 main。
- UI kit 源为 `/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit`；安装副本与源的 `package.json`、`lib/index.js`、`lib/index.d.ts` 仍为同 device/inode 硬链接：inode **887738282 / 944818803 / 944818802**，nlink **11 / 5 / 5**。内容与工程记录一致。
- 包级链接只修复当前源码的依赖解析，不把主树依赖变为任务所有。**只读是任务操作约束，不是 OS 只读挂载或权限保护**；禁止沿链接安装、清理、chmod、编辑依赖或重建外部 kit。后续新增依赖不能直接复用本次放行。
- `concat-client.mjs` 仅在本包 lib 写 client；esbuild 配置 `write:false`，UI kit 被打入包内，React/React DOM/官方 primitives 外置。没有另构建外包的命令。
- 安装测试存在真实临时文件复制，不应称全套无 IO：`roots()` 经 `tmpdir()` 建隔离 home；Blotato/WorkBuddy 路径优先本机已存在素材，`installGitBundle` 才在缺源时进入 git fetch。工程受控 HOME/TMPDIR/DSH_HOME/cache 与留下的临时 fixture 一致。QA 没有重新执行这些安装测试，不将此证据扩大为网络或全文件系统审计。

## 4. 前后指纹与当前源码绑定

采集脚本全文 42 行已读；它使用排序遍历、`lstat`，不跟随目录内软链；文件记 mode/device/inode/nlink/bytes/SHA-256/mtimeMs，软链记 target。脚本本身采集指纹，10 项身份及本地素材断言不在这 42 行中；QA 对依赖身份另行独立验证，未将不存在的断言归给该脚本。

QA 用独立内存脚本解析两份完整 JSON，重算每组 entries 与摘要，并逐项 deepEqual；再直接重枚举当前磁盘 shared/packageLinks/lib、逐项比对 kit 与受保护文件，不只照抄工程表。

| 集合 | 前后数量 | 前后相同的集合 SHA-256 | 当前核对 |
| --- | ---: | --- | --- |
| M/node_modules | 35703 | `fe0861d106dd5ad9d25b7fd268b0fdb03f26197928eaadb5bacc95fe93e7e868` | 完整相等 |
| M/Market/node_modules | 18 | `37715317029168106c9bc388be90ca74d5bc38dbe0689a287df810e3de62323a` | 完整相等 |
| 外部 kit 三文件 | 3 | `4a74b68d97dfed09772c28804d56205cfead66a65752bbbd7cdb41e8df47461e` | 完整相等 |
| T 受保护集 | 3165 | `ed6d13ef2a5e19a58efa8a89ace1316c49412a7de407248062e392a462bd6b76` | 原集合无漂移 |

采集时间前 `2026-09-08T08:01:17.685Z`，后 `2026-09-08T08:02:22.859Z`，包测试日志处于该时间窗。受保护集包括当前源码/测试、manifest、配置、规格和其他已枚举文件；排除 Market lib、工程依赖报告及验证目录。QA 时额外新增的非排除路径仅有架构 81 的 `docs/implementation/issue-773-validation-dependency-decision.md`，属已披露并行文档，不是源码漂移，也不参与本次 validator 方案验收。

原 query QA Round 2 四个关键 SHA-256 与当前文件均匹配：catalog、workshop-query、工程 query tests、独立 QA tests。其余原受保护文件也逐项一致。因此 352 项结果仍绑定当前同一源码，而不是只用相同 HEAD 冒充未提交内容没变。

限度：atime 未纳入；不跟随任意未枚举软链外部树；前后相等不证明期间不存在写后恢复，不是官方发行包/profile 的全盘审计。

## 5. lib 对应性

- 指定 HEAD 保存的 **50 个 tracked lib** 内容与工程 before 清单吻合，当前全部存在、mode 100644；**48 项内容不变，仅 `expert/catalog.js` 与 `tests/skill-aggregate.test.js` 内容变化**，diff 为既有 query 元数据/own 推荐校验及 aggregate fallback 回归，非本轮新实现。
- 新增 **6 个文件**：`client/skill-picker-logic.js`、ignored `client.js`、`tests/workshop-query.qa.test.js`、`tests/workshop-query.test.js`、`workshop-query-budget.js`、`workshop-query.js`，另有一个 `client/` 目录。lib 为 56 文件/62 节点，当前完整节点清单与工程 after 精确一致。
- QA 以真实 tsconfig 和 TypeScript Program（保留 Node16 package.json `type: module` 上下文），只把选定源的 emit 写入**内存回调**，逐字节比对六项生成 JS：query、budget、QA test、query test、aggregate test、picker logic，全部一致；`src/expert/catalog.js` 与复制到 lib 的版本字节相同。未向磁盘 emit。
- client bundle 复用同一源码、打包脚本、共享依赖均未漂移的工程构建日志和 after 指纹，**本 QA 未重新打包**；不将此作为浏览器成功证据。

## 6. QA 实际检查、轮次与路由

以下命令 cwd 均为 T；Node 为 `/Users/x/.nvm/versions/node/v25.8.0/bin/node`。

```sh
env -u NODE_OPTIONS NODE_DISABLE_COMPILE_CACHE=1 \
  /Users/x/.nvm/versions/node/v25.8.0/bin/node \
  plugins/omnimux-market/node_modules/typescript/bin/tsc \
  -p plugins/omnimux-market/tsconfig.json --noEmit
```

结果 **exit 0，0 诊断**。原 strict=true、skipLibCheck=true；未加 baseUrl/typeRoots/paths、未修改 tsconfig。禁用 Node compile cache，避免 QA 写缓存。noEmit 后原受保护文件内容/mtime 和 lib 内容仍一致。

| 检查 | 结果 |
| --- | --- |
| HEAD/cwd/status、完整 lib diff | 固定 base 与本地目标确认；未改 Git 状态 |
| 原始 JSON 摘要、前后 deepEqual、当前磁盘指纹/依赖身份/硬链接 | exit 0 |
| 全包 noEmit | 1 次，exit 0 |
| 日志明细、glob 31 文件、query QA 指纹绑定 | exit 0 |
| 选定产物内存对照 Round 1 | QA 自身辅助脚本失败：`transpileModule` 未读取包 ESM 上下文，错误生成 CJS；Route QA，不是源码问题 |
| 选定产物内存对照 Round 2 | 改为真实 Program + 只写内存回调；全部一致，exit 0；无第三轮 |
| `git diff --check`、本文 untracked 直接尾随空白/链接存在性检查 | exit 0 |

没有完整测试重跑，没有删测、改断言或降格失败。辅助对照首轮失败没有改变磁盘文件；修正验证方式后问题关闭。**最终 Route: NoOne；本次范围 Known Issues：无。**

## 7. 门槛解除范围与交接

**已解除：** 历史全包 typecheck 的依赖解析前置阻塞，以及因此未能安全执行本包正式 test 的前置门槛；当前最小共享链接方案和本包 build/test 证据经独立 QA 接受。query QA 的历史失败/阻塞文本保留，按其 Round 2 与本文最新环境证据理解，不代改原报告。

**未解除：** T03 validator 新依赖/实现、真实库存与 adapter、真实远程分页/exhaustion、Host/API/UI 接线、生命周期与 G-01–04 条件、完整 PRD AC、L2/ego-browser、Dev/Prod、CI/合入与发布。测试项名称中的 AC/安全字样仅为该测试覆盖的局部行为，不扩大成对应 AC 整体 PASS。

主理人可关闭“本树依赖准备及正式包测试证据独立核验”这一分项，转下一阶段经过界定的实现/验收；架构 81 只读选型报告不自动授予装包或改共享树权限。完整 #773 工坊尚不具备关闭/归档条件。本 QA 不要求为本次已完成分项补做 L2，也不把未承诺实现的 T03 判作本次失败。
