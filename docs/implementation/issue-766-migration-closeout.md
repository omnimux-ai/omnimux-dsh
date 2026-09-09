# #766 T02/T03 集中收口

## 范围与状态

工程师寇豆码；唯一写树 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-storage-766`，固定 base/HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`。全部既有未提交成果保留，不 rebase/commit/push/部署，不安装依赖、不调成员、不操作真实素材或共享环境。

已全文读取 closeout 155行、clarifications 113行、PRD 332行、architecture 595行、pagination 61行（最新297/297）及其余六份实际报告。目录纵向已完成，不重做。此前测试仅为基线，不是本组结果。初始 **本组 IS_PASS: NO；完整需求 IS_PASS: NO**。

## 分步状态

| 组 | 范围 | 状态 / 验证 |
| --- | --- | --- |
| 4.1 | decisionRevision、稳定分页/批量授权、实际摘要、受控双侧FD预览 | 已实现；201条真实冲突/重启及FD字节通过 |
| 4.2 | 完整来源partial投影、UI固定看过的hash、提交重验 | 已实现；无entry legacy/mapping/逐excluded及变化重确认通过 |
| 4.3 | 一组prefix结构keep-both、安全命名/落点重验、receipt恢复 | 多叶/空目录/双向结构/别名占用通过；父目录mkdir/receipt窗口仍欠 |
| 4.4 | 来源/目标/目录/reuse元数据保守保护、已知schema引用 | 有限支持和组合回归通过；install→commit属性与引用完整矩阵仍欠 |
| 4.5 | 各卷/Home预算、receipt计数、attempt、压力与故障 | 已实现并实际压力通过；versions计数及真实跨卷/ENOSPC仍欠 |
| 最终 | 定向、全包/build/boundaries/package/tools、准确交接 | 已执行314/314/build/三门禁通过；Stage依赖失败/L2缺证；整体NO |

每组完成后在此追加实际命令、计数、exit及限制。故障/压力仅生成隔离样本。未知对象引用保留并具体阻断，不臆造通用转换器。元数据不支持仅限确实不能保证的属性，不扩大为全文件skip。

## 第一阶段实际证据

- 已接通独立 `decisionRevision`（decisions文件原子封装并恢复），seq仅观察；分页返回/核验plan+revision；UI保存同一revision。完整partial来源library/artifact/mapping和source excluded投影，提交从after-ledgers重新求hash；UI保存展示过的hash。
- task/entry/side受控预览复用Runtime read lease及Python FD，拒绝未知side/entry及不支持类型；结构父文件阻挡多叶子的一次prefix决定已实测执行与中断恢复。空目标同hash、同必要属性来源只copy一次、保两记录。
- macOS Python缺os.listxattr已实证，改用标准库ctypes同FD flistxattr和acl_get_fd_np检测；ACL不存在为ENOENT。生成样本含com.apple.provenance，已实现仅该属性同FD有界复制/读回，不自行忽略。其余ACL/xattr明确阻断相关变更。
- 首次新增定向30项22过8失败，定位属性能力检测；逐步修复后仅旧reuse夹具mtime不等，现将该夹具mtime对齐，原reuse断言保留，并独立新增mtime不等必须partial测试。
- assets cwd `node --test --test-timeout=20000 src/storage-plan.test.js src/storage-migration.test.js src/storage-recovery.test.js src/client/StorageSettingsDialog.test.js`：**52/52，0skip/cancel，exit0，3039.048083ms**。含201冲突跨页/重启、双侧真实FD精确字节、无entry legacy/mapping/excluded和集合变化、prefix恢复、unique payload、原21恢复测试。不是最终全包或完整T02/T03结论。

## 第二阶段实际证据

- 新增目标仅xattr/ACL、目录xattr（相关叶子阻断、独立项仍迁入）、空目录mode/mtime、大小写别名/新占用/长名称、Home不足、receipt写fsync错误注入和恢复计数测试。真实属性样本使用本轮自建temp及系统xattr/chmod，仅测试夹具调用；生产检测/复制仍同FD。
- 新增按来源/ledger分离ID映射、target fileId与cover同步、未知业务字段保留、typed URI按protocol.js定义的root-relative路径映射到旧版本；未知对象原样保留并阻断，无通用递归替换。组合用例14/14 exit0，随后新增目录xattr/Home fsync两项纳入全包。
- 生产预算按dev/fsid合并target/Home/source，唯一payload、versions、ledger、journal及reserve分列；修改决定后重算；每次copy/backup检查空间、helper逐块reserve。receipt重建logical完成，attempt字节独立；Directory receipt保留身份，仅自建目录恢复mode/mtime/provenance，原位目标不chmod。
- 第一轮全包310/310 exit0，最终候选 `node --test --test-timeout=30000 src/*.test.js src/client/*.test.js` **314/314、64 suites、0skip/cancel、exit0、12602.242333ms**，输出`.closeout-test-final.txt`；其后最后安全复核改动仍需末次验证。
- `node src/storage-pressure.mjs > .closeout-pressure-output.json 2>&1`：**exit0，61828ms，10000真实小文件+1074790400B大文件，10001完成、copy/verify=1074919290B**。源/目标大文件SHA256=`5ee9faa93149369b633ea1469e6489ae959ec9d46c4028bc8522c057666075f8`。Host峰值RSS321077248B，helper106364928B；最大heartbeat采样603ms、timer203ms。原媒体源保留；temp清理。其后补目录属性终结及scan终态计数，最终需重新压力验证；首次输出不覆盖。
- root `node scripts/verify-plugin-boundaries.mjs`：2144文件exit0；`node scripts/verify-package-files.mjs`：12插件exit0；`node scripts/verify-plugin-agent-tools.mjs`：98工具0错/警告exit0；`git diff --check` exit0。assets `node scripts/build-client.mjs` exit0（256133B，之后UI分页小改须再build）。`node scripts/verify-stage-contracts.mjs` exit1，仍Cannot find module jsdom，未改门禁/依赖。

压力为实际Node+Python+磁盘迁移，不是浏览器可操作/关闭重开或真实跨卷证据。fsync故障为明确注入，既有recovery真实worker SIGKILL保留；不声称全fsync/Host断电矩阵已覆盖。

## 最终验证及一致性结论

- 末次全包：assets cwd `node --test --test-timeout=30000 src/*.test.js src/client/*.test.js > .closeout-test-accepted.txt 2>&1 && node scripts/build-client.mjs`：**314/314、64 suites、0fail/skip/cancel、exit0、12466.538ms**；build **257157B、exit0**。
- 最后全包前发现并修复真实SIGKILL在完整字节写完而mtime/provenance未落时重启误复用；红灯312/314（两个既有SIGKILL用例）保留于`.closeout-test-release.txt`。修复为保留属性不完整的stage、另建随机attempt重新复制，而不是放宽属性断言；37/37定向后上述314全包通过。
- 最后压力：`node src/storage-pressure.mjs > .closeout-pressure-accepted.json 2>&1`：**exit0，65922ms**。10000小文件+1074790400B文件，源目标hash与前轮相同；完成10001、copy/verify1074919290B、attempt归零。RSS Host317030400B/helper104759296B，heartbeat最大603ms，timer221ms。scan终态10006（包括目录与账本），不与payload条目混用。
- 最后root `node scripts/verify-plugin-boundaries.mjs && node scripts/verify-package-files.mjs && node scripts/verify-plugin-agent-tools.mjs && git diff --check`：**exit0**；2146 source、12插件、98工具零错/警告。扫描文件数增长包含另组新增供应脚本，本组没有触碰其runtime/scripts。
- Node syntax / Python AST exit0。未重跑已知会隐式安装的pnpm包装入口，保留历史失败；未运行完整gates（已有依赖/挂起问题）、L2/ego/native picker/真实可移除卷。Stage再次实际exit1缺jsdom，不改门禁。

### 准确通过范围与未闭合项

**已验证的业务增量 IS_PASS: YES；整个T02/T03按closeout全部细节 IS_PASS: NO；完整#766 IS_PASS: NO。** 不把314基线或本组新增17项等同A01–A17完整验收。

最后跨文件复核确认生产者→HTTP→hook/JSX→决定/partial提交、receipt恢复、FS属性检测接线一致；没有新增DB/队列/通用复制器。仍有以下安全收口，不能掩盖为外部依赖：

1. 自建父目录receipt当前在mkdir后落盘；若Host在这两步间终止，恢复会将该目录当既有而不恢复其源mode/mtime。现有文件payload与empty-directory的恢复测试不能证明此窗口闭合；需把目录创建意图前置并在helper内返回可认证创建凭据，保留外部同名目录。
2. 已安装payload恢复/提交前仍主要复核内容hash；虽copy/backup/reuse已重验mode/mtime/provenance，完整install→commit期间目标仅属性变化与目录原位mtime受子项写影响还未有逐边界保护/实证。不能宣称全部目标目录/reuse元数据条款已收口。
3. summary已按各卷预算，但恢复计数verifyBytes只对成功payload求和，未把旧版本校验单列为完成量；空间实际跨卷掉盘与真实ENOSPC未运行。独立卷模拟/完整progress分阶段计数仍须补差额，不以同卷压力代替。
4. 已知字段按现有schema映射，未知结构阻断保原；裸string跨ledger歧义/缺引用及源artifact依赖partial的完整组合矩阵不足，尚不能声明全部合法历史引用闭合。

这些是明确、可定位的剩余实现/证据，不需再次分派接口或重新设计。下一责任人为主理人接收后指定同一集成owner继续本报告列出的4处，再独立QA；首步补 `storage-plan.test.js` 的mkdir后receipt前Host中断及install后target-only属性变更红灯。当前不具备Issue关闭/发布条件。

### 本轮实际文件

修改：`src/storage-plan.js`、`storage-migration.js`、`storage-fs.py`、`storage-runtime.js`、`storage-types.js`、`http-routes.js`、`storage-migration.test.js`、`client/use-storage-task.js`、`client/StorageSettingsDialog.jsx`、`client/StorageSettingsDialog.test.js`、`client/locales.js`。
新增：`src/storage-plan.test.js`、`src/storage-pressure.mjs`；本报告和本组`.closeout-*`日志；生成`lib/client.js`。总报告只追加当前进度，历史不改。没有改其他规格/其他插件/供应runtime/scripts或package；全部先前未提交项保留，HEAD仍5485c258。所有本轮后台job已收集，无运行中测试。

## 外部验收边界

无Python兼容由架构94另审，本组不增加不安全fallback/供应依赖。#778真实L2 seed尚不可用，不重复start；既有jsdom/pnpm包装依赖门禁失败保留，不改门禁。真实UI、原生picker、真实跨卷及独立QA不能由Node临时HTTP或单测替代。
