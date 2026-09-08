# #766 最终单工程集成

## 当前状态

唯一任务树 `.worktrees/assets-storage-766`，base/HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`，未提交增量接管，无并行写者。不 commit/push/部署，不网络安装，不操作系统 Python/PATH、外仓、共享 Dev/真实 OPC。

已全文读取 migration-closeout、python-supply、local-validation-env、python-compat、closeout、clarifications、PRD、architecture。既有314/314与10000+1074790400B压力65.9s作为先前证据保留，不当本轮结果。

| 顺序 | 分项 | 状态 |
| --- | --- | --- |
| 0 | 依赖链接/真源核对 | 完成：Node v25.8.0；acorn8.15.0、root esbuild0.28.2、pngjs7.0.0、hub jsdom30.0.1/esbuild0.25.12五链接realpath匹配104报告，assets原有共享只读链接保留；无需修链接；未运行pnpm |
| 1 | mkdir成功、receipt未落中断窗口 | 已修并红绿：stage inode先落Home，独占rename安装；外部inode保留 |
| 2 | install→commit仅属性变化/原位目录mtime | 已修并红绿：文件/旧版本身份属性、commit末端、原位目录mode/mtime保护 |
| 3 | ledger歧义/缺引用/依赖partial、版本阶段计数 | 已修并组合验证：双侧歧义/缺ref、typed input-only、传递partial、版本独立计数 |
| 4 | 私有Python同源resolver与无PATH旧库全入口 | 已接线：async/sync/独立store同源；真实旧库tools/HTTP/copy/restart及全包noPATH |
| 5 | 双CPU包白名单、全包/build/boundary/package/tools/适用gates | 已执行，准确结果及未运行项见下；正式pnpm入口仍未通过 |
| 6 | 一致性/准确边界/独立QA交接 | 工程跨文件一致性IS_PASS: YES；完整正式交付/UI验收IS_PASS: NO；交主理人安排独立QA |

## 阶段实际结果（17:45）

- 目录安装凭据先写Home：私有随机stage目录inode已知后持久化prepared，再helper `renameatx_np(RENAME_EXCL)` 无覆盖安装。实际mkdir/安装成功但Host receipt前异常红灯0/1（权限448≠488）→修后3/3；外部替换inode拒绝，empty-directory统一同一路径。
- installed mode/mtime/xattr仅属性变化三个样本、既有目标父目录mtime共四项先红（错误completed/mtime改变）后绿。payload、reuse、versions按身份/属性/摘要复核；commit intent、ledger写后、before_root再次拒绝属性变化。目录每次同FD安装恢复父mtime，不chmod原位目录。
- 源/目标裸ID歧义/缺ref明确阻断，typed缺路径阻断，来源artifact依赖partial传递保留原refs；旧版本copy/verify独立receipt计数并包含totalVerifyBytes。定向migration+plan+recovery最终65/65 exit0。
- 私有resolver核验整个实际载荷、exe SHA/权限，统一async/sync/storageSync/独立store相同绝对exe及-I -S -B -u、仅固定locale环境。Runtime mappings同步也接同一FS。首轮私有全包329/329、64 suites、0skip/cancel exit0；新增真实旧schema tools/HTTP preview/CRUD/copy/restart与污染环境探针2/2 exit0。最终全量仍待末次执行。
- Stage初次exit1缺accounts React；补7插件×4条task内现有普通依赖链接（react/react-dom/esbuild/dsh-ui-kit，指MAIN受管.pnpm，非外部kit目录），不造安装元数据。完整Stage再次exit0：10组件、8注册侧栏。唯一其他插件生成物为原不存在且gitignored `plugins/omnimux-market/lib/client.js`，由原concat-client生成；无其他插件源码改动。
- 已运行现有Node npm-cli `pack --ignore-scripts --offline --cache .package-cache --json` exit0，无install/prepare。首包48,588,629B/132,879,875B、3375项，发现上游arm64已有3个pyc进入包，现已白名单排除，须重包验证；npm固有不收8个别名symlink/CPU，resolver允许缺非运行必需别名及empty dirs，不修上游二进制、不造系统链接。

## 不可替代的证据边界

供应上游固定3.13.15+20260807；本机arm64、x64转译非Intel原生。两CPU spctl直接CLI拒绝，未去quarantine/重签；此拒绝不能推断npm子进程安装必失败，也不能证明最终下载隔离安装链通过。正式签名/公证、Intel/最低系统实机、真实可移除卷、L2/ego/原生picker证据不由单测替代。正式pnpm入口仍缺合法task安装状态，禁止重演自动install ENOENT或伪造元数据。

## 最终实际验证（17:52，全部前台退出）

| 检查 | 实际结果 | exit |
| --- | --- | --- |
| `PATH=/nonexistent-assets-python /Users/x/.nvm/versions/node/v25.8.0/bin/node --test --test-timeout=30000 src/*.test.js src/client/*.test.js`（assets cwd） | **333/333、64 suites、0fail/skip/cancel、12633.272708ms**；`.final-all-accepted.txt` | 0 |
| `node scripts/build-client.mjs`（assets cwd） | lib/client.js 257157B；客户端源码未在本轮修改 | 0 |
| `node scripts/verify-stage-contracts.mjs` | 10 Stage、8实际注册侧栏；`.final-stage.txt`；不是浏览器证据 | 0 |
| `node scripts/verify-plugin-boundaries.mjs` | 2151 source | 0 |
| `node scripts/verify-package-files.mjs` | 12插件；初次对正向`/**`误当实路径报3错，改为等义目录白名单后原gate通过 | 0 |
| `node scripts/verify-plugin-agent-tools.mjs` | 98工具，0错/警告 | 0 |
| `node scripts/verify-slot-contracts.mjs` | 1644 client files、0 violations | 0 |
| `node --test --test-timeout=30000 scripts/{impact-matrix,authorization,qa-label,ci-verdict,ego-browser-page,live-runtime-proof}.test.mjs` | 71/71、3 suites、0skip/cancel；`.final-safe-gates.txt` | 0 |
| 现有Node npm-cli `pack --ignore-scripts --offline --cache .package-cache --json` + `node scripts/verify-private-package.mjs` | 实包**48,580,224B**；普通文件解包合计**132,861,279B**；**3372项**；两CPU普通非cache文件全SHA匹配、112 notices逐项SHA匹配、解包重定位noPATH真实async/sync probe 3.13.15 | 0 |

最终包 `plugins/omnimux-assets/omnimux-assets-0.2.0.tgz` SHA256=`533f22806ffdae0c6a58e12b32852aa56dd75e4b31be82f1e309eeec8479f455`；明细`.final-pack.json`、`.final-package-verified.json`。包含两CPU固定exe、stdlib/lib-dynload、原组件和全部notice；排除archives、evidence/full包、测试、pressure、pyc/__pycache__、npm cache。原上游载荷普通字节未改。npm自动省略8条便捷别名symlink/CPU，不影响固定python3.13路径；解包实际启动已证。解包验证tmp已清理，原载荷不删除。

### 未运行/非通过

- **完整`test:gates`未运行**：已审查`verify-ci-gates.test.mjs:175–190`会进入sync-targets/sync-release-policy，包含真实安装/物化；`ego-task-lock.mjs:5–18`硬编码共享`/tmp/omnimux-ego-<uid>`且相关tests使用该锁。未改gate、未猴补路径、未绕锁、未再次触发默认pnpm install。上述71项是完整六文件的安全适用子集，不称完整gates通过。其余live/ego文件未以name-pattern伪造全量。
- 不重跑已完成分页/FD/314历史基线与65.9s压力。最终333全包正常包含已有回归；大规模压力此次未重演，因此最新元数据重验增加的压力成本未有新万文件测量，不继承旧时长为当前性能结论。
- 本机并无真实隔离可移除卷/Intel原生/最低macOS样本；实际ENOSPC/掉盘与全Host断电fsync矩阵未执行。新目录测试是实际helper创建/rename成功后丢Host响应并重启，非声称每条内核指令断电都覆盖；helper安装后恢复父mtime两步之间若进程被杀，原位目录复验将安全拒绝，需人工检查后继续，不能宣称透明恢复全部属性窗口。
- L2 #778未提供解除事实；未start/部署/真实ego/原生picker，不把HTTP200或Stage JSDOM当A17。最终下载quarantine/宿主安装链仍未验，不臆造跨仓签名工程阻塞。

## 写面与交接

本轮生产改动：`src/storage-fs.py`、`storage-fs.js`、`storage-migration.js`、`storage-plan.js`、`storage-runtime.js`、`library.js`、`mappings.js`；新`src/python-runtime.js`；测试`storage-plan.test.js`、新`python-runtime.test.js`/`private-legacy.test.js`；`package.json`/`dsh.manifest.json`/README；新`runtime/{arm64,x64}-integrity.json`从已核验inventory生成；新`scripts/verify-private-package.mjs`。未动其他插件源码、根package/lock、官方/共享资源。已有跨ledger旧样本将不参与引用的mapping ID从a0改mapping0，保持原非冲突期望；另外增加真正双侧歧义用例，不放宽生产歧义规则。

其他插件唯一生成物精确记录：`plugins/omnimux-market/lib/client.js`原不存在→217813B、SHA256=`37d25f81ec30a79ad515458f0ab5500aa5d66fcb13f098119cb757b30f686847`，gitignored未tracked，原`concat-client.mjs`正常生成；源码git diff为空。新增28条task内普通依赖链接保留供QA，不共享写入安装状态。初始5链接未改。

**工程跨文件一致性 IS_PASS: YES（当前Node/macOS arm64离线范围）；完整需求/正式分发/UI验收 IS_PASS: NO。** async/sync使用冻结同源resolver；业务引用生产者/receipt/partial/提交重验互相接通，未新增第二store/router或不安全fallback。下一责任人为主理人安排独立整体QA，直接从333全包与本轮19项新增回归、实际tarball解包开始，不重新设计接口。正式pnpm/L2/真实平台证据待各自授权能力解除后补齐；当前不可关闭#766、不可发布。本轮无委派、commit/push或部署。
