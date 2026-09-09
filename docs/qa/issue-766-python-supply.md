# #766 Python 供应子模块独立 QA

## 结论与路由

**IS_PASS: YES，仅供应子模块；Routing: NoOne。** 第二轮独立新增测试 **14/14 通过，0 failed、0 skipped、0 cancelled，exit 0**。第一轮 8/14，6 个 QA 夹具失败已自行修复；没有归因于工程102的源码缺陷，没有第三轮。

本报告不是整个 T01、#766、业务工程110、最终 npm 包、插件实际安装、L2/浏览器或正式发布验收。**#766 不可据此关闭。** 供应模块可以交回主理人作为110同源接线输入，不因当前缺 Intel 原生或最低 macOS 实机而阻止已授权隔离编码。未请求的全平台发布条件不扩成当前供应模块阻塞。

- 验收时间：2026-09-08 17:25–17:39，Asia/Shanghai。
- 唯一树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-storage-766`。
- base/target HEAD 均为 `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`；审查本地未提交供应增量，不是远端最新 tip 审查，未 fetch/push。
- 真实宿主：macOS 26.5.2 / 25F84，arm64，Node v25.8.0。
- 唯一新增持久文件：`plugins/omnimux-assets/scripts/python-supply.qa.test.mjs` 与本文。
- 全文读取：供应实现报告120行、python-compat200行、产品clarifications113行；并读取供应五个脚本、manifest、NOTICE、上游receipts、窄helper及本仓 plugin-qa / dev-pipeline / plugin-git-pr 合同。
- 用户已批准插件私有 CPython 3.13 固定版本/摘要/许可/macOS双CPU；规格旧文本中的“尚未批准”不是本轮授权状态。

## 两轮测试账本

工作目录为任务树的 `plugins/omnimux-assets`：

```sh
node --test --test-reporter=tap scripts/python-supply.qa.test.mjs
```

| 轮次 | Total | Passed | Failed | Skip / Cancel | Exit | 时长 | 路由 |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| 1 | 14 | 8 | 6 | 0 / 0 | 1 | 2020.715417 ms | QA：修自有测试 |
| 2（最终） | 14 | 14 | 0 | 0 / 0 | 0 | 5809.681583 ms | NoOne |

第一轮失败解释：

1. 第4项许可证测试的 `/usr/bin/tar` 解 full `.zst` 在测试特意限定的 PATH 下无法找到 `zstd -d -qq`，exit1。这是测试辅助解档环境问题，不是供应件缺库，也不是要求用户安装系统Python。改为 **Node 内建 `zstdDecompressSync`**，仅对已核验的归档解压到自有tmp，再用系统tar只读取成员。
2. 顶层 `await test()` 与根 `after` 钩子组合导致夹具在后续测试前被删除，第9–13项出现 CWD ENOENT / spawn ENOENT。改为进程 exit 同步全树复核和清理；不是私有Python本身不存在。第一轮后续重建的同名自有夹具在第二轮前精确删除；确认 before=true、after=false。
3. 两轮没有改供应脚本、runtime、业务src或现有测试。最终脚本未在通过后继续改动。

附加检查：`node --check scripts/python-supply.qa.test.mjs`、`git diff --check` 均 exit0；新增两文件额外空白/本地链接检查见交付检查。未执行会自动安装依赖的 pnpm 入口，也未重跑会改 runtime/evidence 的工程既有供应测试/审计入口。

## 独立新增14项及覆盖证据

| # | 用例 | 最终结果与边界 |
| ---: | --- | --- |
| 1 | manifest固定双CPU、固定来源、私有相对路径和flags | PASS：3.13.15+20260807；固定builder SHA、官方URL、SHA256SUMS；`-I -S -B -u` |
| 2 | arm64压缩包/全树/原生依赖 | PASS：原包SHA/尺寸，全树1809项、mode/link/内容摘要；10个Mach-O CPU/最低OS/装载路径 |
| 3 | x64压缩包/全树/原生依赖 | PASS：原包SHA/尺寸，全树1805项；10个Mach-O x86_64与最低OS/装载路径；非Intel实机执行 |
| 4 | 双架构完整许可对账 | PASS：每CPU56项notice摘要/官方来源，full PYTHON.json与记录相同；14份适用补充许可逐份与原归档字节对账；full/install_only执行文件摘要相同；pip/certifi源形式CA及MPL notice保留 |
| 5 | 真取得脚本拒绝缓存原包tamper | PASS：隔离复制真实acquire，正确checksum清单+同尺寸变字节缓存，exit1 `python-supply-integrity-mismatch`；未提取、未执行、fetch被测试禁用；错误尺寸也拒绝 |
| 6 | 真静态审计器拒绝执行文件tamper | PASS：隔离非可执行文本fixture，exit1 `python-supply-integrity-mismatch` |
| 7 | 真静态审计器拒绝逃逸symlink | PASS：仅自有fixture链接，exit1 `escaping-symlink` |
| 8 | 真静态审计器拒绝group/world可写文件 | PASS：仅自有fixture chmod，exit1 `unsafe-write-or-setid-mode` |
| 9 | arm64无PATH Python、Python环境与CWD/site注入 | PASS：按名python3为ENOENT；绝对私有exe成功，实际machine=arm64；恶意json/sitecustomize/usercustomize未加载、marker不存在 |
| 10 | 供应交接env白名单排除PATH/PYTHON/DYLD污染 | PASS：隔离消费夹具显式白名单；实际私有子进程环境无PYTHON*/DYLD_*，PATH为空目录；不是110 resolver通过证明 |
| 11 | arm64载荷迁址到空格/Unicode目录 | PASS：先完整校验，再复制到自有tmp；绝对路径启动，sys.path全属新根，`_tkinter/ssl/sqlite3/ctypes`真实导入成功；相对动态库可解析；副本前后未变 |
| 12 | arm64真实窄helper同步IO | PASS：JSON原子写/读/hash，拒绝alias与相对/绝对逃逸写；原JSON字节不变 |
| 13 | arm64真实窄helper异步IO | PASS：同exe probe；150000B流分3块，每块≤65536B、字节相等；另一进程flock竞争storage-busy，unlock后重新取得锁，worker exit0 |
| 14 | x64证据口径/签名事实 | PASS：既有x64证据明确arm64宿主、转译而非Intel native；复核exe签名状态和无quarantine，不冒充分发验收 |

这些是14个行为用例，不把每个文件摘要或每个assert算成额外测试。工程原5/5只作已读历史证据，不并入本次14项。覆盖为供应关键风险矩阵，不提供未测量的行覆盖率。

### 固定载荷与本机执行事实

| 项目 | arm64 | x64 |
| --- | --- | --- |
| 原包字节 | 25,307,899 | 25,052,477 |
| 解包普通文件总字节 | 65,477,772 | 65,910,502 |
| 原包SHA256 | `ebcf53fe921c356ad2eecfcea370cb744e7bd96fdef41a53e1e8f32a15c6dfeb` | `6704f2a981d7ea358d6a7ef4f2be2457d17a65ca096b466924f469eefc1c3d70` |
| python3.13 SHA256 | `298d21ab43a8940a867fe356aca16bb216a2129f8df7f23a6a52e8bfa37446fa` | `29004fa50d925259627f7ad7f0a134f9dc7204bd09317e02226af8b188489ef2` |
| Mach-O最低macOS声明 | 11.0 | 10.15 |
| 本次实际执行 | 原生arm64窄helper/stdlib/迁址 | 不重复执行；审核既有转译证据与重做静态核验 |

合计原包50,360,376 B、解包普通文件131,388,274 B，**不是最终npm/桌面包体**。本次原生输出：CPython 3.13.15，OpenSSL 3.5.7 (9 Jun 2026)，SQLite 3.53.1；isolated/no_site/no_user_site/dont_write_bytecode均为1。所有sys.path只落私有python根，空CWD/PATH不作为stdlib来源。`python313.zip`路径可为解释器默认候选，不凭其出现在sys.path声称实体存在。

两架构全部非系统依赖均按实际Mach-O load command解析；系统依赖仅 `/usr/lib/` 与 `/System/Library/Frameworks/`。包内Tcl/Tk等库按loader/rpath解析并realpath确认仍在相应载荷根，无Homebrew、开发机Python或其他App绝对库依赖。最低OS来自metadata和load command，**不是最低OS实机验证**。

### 许可证边界

全量notice与已供应原归档对账通过；不只复述README。`zlib-ng`是显式例外：metadata列出不存在的许可文件，但Darwin链接表仅system libz；工程证据有记录，未伪造许可。PSF/历史条款与native依赖、pip vendored、MPL-2.0 certifi均被保留。

这是技术来源/notice完整性验证，不是法律意见，也不是最终发布合规签字。工程110最终包必须保留payload自有条款与`runtime/licenses/**`，并排除archives/evidence/测试夹具；本次不改或验其在改package。

## spctl、npm子进程信任与发布的严格区分

### 已有/实测事实

- 已读 `runtime/evidence/static-audit.json`：两CPU `spctl --assess --type execute -vv` 均status3/rejected；此命令本次没有重跑，结论来源清楚。
- 同一已核验arm64执行字节在本次Node子进程中成功执行，不经shell，不经PATH Python；这与spctl直接CLI拒绝**可以同时成立**。
- 本次只读复核主执行文件：arm64 `codesign --verify --strict` exit0；x64 exit1。全20个Mach-O签名详情来自既有静态报告：arm64 adhoc/no TeamIdentifier，x64 unsigned。
- 既有全树xattr报告无`com.apple.quarantine`；本次两个主exe只读xattr也无quarantine。没有删除/添加隔离标记、重签、取签名凭据、操作系统Gatekeeper、启动外部App。

### 本仓合同依据

`docs/contracts/plugin-qa.md:19–28,112–121` 按变更面区分单测、Host/L2、平台和正式发布；`docs/contracts/dev-pipeline.md:17–36,63–65` 区分worktree/L2/Dev/Prod并把壳打包归为独立流程。供应规格 `docs/specs/2026-09-08-assets-storage-python-compat.md:138–139,183` 要求记录签名/隔离启动事实，但跨仓签名条件是“若实际包需要”，不是未发布隔离开发的一刀切前置。

本轮检索本仓contracts和scripts未找到“每个npm插件CLI必须先spctl通过，才能进行当前隔离编码”的合同。不能仅凭CLI assessment拒绝，推导实际npm插件安装子进程必被拒绝；也不能凭当前无quarantine的Node spawn成功，推导经网络取得的最终npm插件在最终Host/收件环境获得分发信任。

**裁定：当前供应子模块不因spctl结果或缺正式签名被判Engineer失败。最终插件包/Host安装链、隔离属性如何保留、实际收件启动以及是否需要签名公证仍是未验事实。若最终分发证据证明必须跨仓签名，主理人再形成具体依赖与授权范围；本次不臆定、也不执行。**

## 原规格对应、缺口与下一责任人

| 规格项 | 本次满足部分 | 尚未覆盖及owner |
| --- | --- | --- |
| python-compat §8 私有供应、真正无系统Python | 受控入口PATH无python3；真实私有arm64；两架构实际原包、所有装载路径和许可证 | 不等于客户整机无Python；Intel原生、最低OS实机未有证据，主理人按原平台验收补齐，不阻当前供应编码 |
| §5.1/§8 同步异步同源/环境隔离 | 实际同exe窄helper与隔离白名单消费夹具证明可用 | 110最终resolver/Runtime/storageSync/独立store及全功能旧库入口，待其稳定后独立QA |
| §8 供应边界/实际包身份 | 固定原包/解包尺寸、字节、依赖、notice、当前隔离启动事实 | 最终npm whitelist/包体/安装祖先目录信任/ACL/TOCTOU、正式收件分发信任，本次不越面验收 |
| clarifications §2.3 旧库HTTP/工具/UI与安全恢复 | 无减少要求 | 整体#766 A01–A17仍需最终工程与独立QA；不把模块14/14替代全部P0 |
| L2/ego/原生宿主 | 未执行，非PASS | #778仍未解除；本次不启动不重试，主理人待环境链路就绪后续验 |

Known Issues（仅本次第二轮供应测试）：**无剩余失败**。上述未验范围属于证据边界/后续任务，不伪装成已经通过，也不扩成当前模块源码bug。

## 源清单指纹与只读证明

以下路径相对 `plugins/omnimux-assets`。供应源码/manifest/notice/evidence在前后保持一致。运行时全树canonical inventory涵盖相对路径、mode、symlink target、普通文件长度/SHA；前后deepEqual通过，JSON数组SHA256为：

`e73364e8167e273bee860863d797eac04d3c3f3abb2b1dc094d7aeab74583e97`

| 文件 | SHA256 |
| --- | --- |
| `scripts/python-supply.qa.test.mjs`（新增最终测试） | `0db14e5ee6393d39200d875d7c95b27a3f7b7e9b525921b5ac093ceca6471979` |
| `scripts/python-supply.mjs` | `590be1c72eb3c94dd7cb413ef0361063507e3a257193e2ac214e9d3844616cde` |
| `scripts/python-supply-audit.mjs` | `1ec9d88d84fddccc731a6c51f0fdfd28d0eef03d7d38e6b93f4b7cacb33027ac` |
| `scripts/python-supply-metadata.mjs` | `26efadcac0b1db2cb6f28c4fbd3092c7438f2f8affcbc51bff9cb53fed502bdf` |
| `scripts/python-supply-notices.mjs` | `74bda9c5de389520567692d864e613f06175d604e0bb1179bd3c2972d90f63b7` |
| `scripts/python-supply.test.mjs`（仅审阅） | `fc976e5c8f156e3364fd94876c41870b5d3ffc184366530f32774395e425e86f` |
| `runtime/python-supply.json` | `fa0adb6cade26b55117d483996b0255a299129bfa56a42b1536d25f1afe897d8` |
| `runtime/licenses/NOTICE.md` | `2103d499f23d6ba2665b28932e49a581bb90d4710fb7a833e451734e0af12409` |
| `runtime/licenses/license-index.json` | `2bcb98ef98774b3a1eb66c345c0f9f9d4c43a697c27f8436b85eed128ff89957` |
| `runtime/evidence/arm64-inventory.json` | `42bd4322a4dc4c541fed79ed5b50e7975642b110d1c53531a51e075dc78cd3b4` |
| `runtime/evidence/x64-inventory.json` | `3cca72f9afc999a5544ef7547025f3e1229a315c94418b7665fc60739703d767` |
| `runtime/evidence/static-audit.json` | `210e86a6083660e2403e07ec360eab8ec97338bcb47c2f56650fb296964a40f7` |
| `runtime/evidence/upstream-receipts.json` | `90211cc87014688093de9212893cfe720ec1199752160683236aa1b2c6b3a90d` |
| `runtime/evidence/arm64-execution.json`（原工程） | `4cfc5be5fafb59a93da27e6d7c944c8e8422f63e3936139d48b02bb4489cd0b0` |
| `runtime/evidence/x64-execution-attempt.json`（原工程） | `baf0d5a35394e4e390dca9a85d2fb67c89b4f9dde9e38e6b3144c92903b8997b` |
| `src/storage-fs.py`（本次两轮执行的只读快照） | `b5241406c2a4badcb2f425e36f233b96da92ae8c3757ed2a0648a2b0dacec2ab` |

helper因110并行修改，初始读取SHA为`573085b8efba7fbf90d8d4452758b22dbb80f5d0d4d916050cd7c11b62f30f75`，两轮启动各自复制当时字节到自有tmp并记录实际快照SHA，均为上表b524；终检live helper也是b524。这里明确区分源读取时点，不把旧工程报告的61f1…当本次执行身份。不改、不冻结110的业务写面，窄helper结果不外推其完整业务语义。

最终输出 `QA_TEMP_CLEANUP=YES`，外部只读复核 `QA_TMP_REMAINDERS=[]`。原payload以及迁址副本均未生成`__pycache`/新字节；payload全部以`-B`执行。没有重复下载、运行未核验载荷、用系统Python替代测试、触碰真实资产/共享profile/外部App、修改链接、commit/push/部署或调用其他成员。
