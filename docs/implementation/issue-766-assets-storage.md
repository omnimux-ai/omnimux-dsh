# Issue #766 工程接续报告

## 当前摘要（2026-09-08 最终单工程集成）

详见 [final-integration](issue-766-final-integration.md)。HEAD仍5485c258未提交。本轮闭合自建目录receipt窗口、install→commit属性重验、双侧歧义/缺引用与传递partial、旧版本独立计数，统一插件私有CPython3.13.15+20260807所有sync/async/store入口；禁止PATH/system fallback。末次noPATH全包**333/333、64 suites、0skip/cancel、exit0**；build257157B；完整Stage10/8、boundary2151、package12、tools98零错/警告、slots1644全部exit0；安全六gate文件71/71，不称完整gates。离线实际tgz48,580,224B/3372项，两CPU载荷及112notice逐SHA、解包重定位noPATH同步异步probe通过；排archives/evidence/pyc/test/cache。

**工程代码一致性IS_PASS:YES；完整正式交付/UI证据IS_PASS:NO。** 正式pnpm入口无合法安装状态、完整gates含sync/install及硬编码共享锁未运行；L2/ego/native picker、真实卷/ENOSPC、Intel/最低系统/最终下载隔离信任链未验。目录helper子项安装后父mtime恢复间的进程终止会保守拒绝，不冒称透明恢复全断电矩阵；当前性能不能继承历史65.9s压力为新测。主理人下一步独立整体QA，不重做已收供应14项。未委派、提交或部署。以下历史正文保留作轨迹，状态以本摘要与final-integration为准。

## 结论与范围

**IS_PASS: NO。已修复一批可复现业务安全缺陷，插件测试通过，但完整 P0 未实现；不可发布、不可关闭 #766，也不自判 QA 通过。**

- 第一次工程 failed/error 后第 1 次重试。固定 base / HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`，branch `agent/assets-storage-issue-766`；仅当前工作树，未 fetch/rebase/切分支。
- 先保存本报告后开始核查；保留前工程所有未提交成果。全文读取 PRD（332 行）、架构（595 行）、现有 diff 和所有新增模块，未改规格的 P0 定义。
- 未访问真实 OPC 素材内容、共享 profile、其他任务工作树；未另调成员、push、merge、部署或创建系统依赖。测试仅生成隔离样本。未本地 commit，避免将未完成安全实现标记可发布。

## 本次实际修复

1. `storage-migration.js`：终结任务禁止 resume/pause/abandon，避免提交后新增记录被旧账本重放覆盖；commit intent 存在时禁止补偿放弃，必须 roll-forward。
2. 安装意图已持久化、rename 尚未执行的恢复：只接受原目标身份或缺失落点及完整 staged hash，允许续传；未知目标字节保持冲突，不覆盖。
3. 预检后变化导致 confirm 失败时，resume 必须重新校验，不能绕过旧计划验证直接执行。keep-both 禁止控制路径及计划内重复落点；reuse 再验源身份；提交前再验已安装 hash。
4. `storage-runtime.js`：默认根初始化前先取得根锁；存在 marker 但 Home 根指针缺失时拒绝重建；每次操作检查当前 marker 和必需账本，不将缺账本重建为空库；并发 writer 明确拒绝。
5. `library.js` / `mappings.js` / `artifacts.js`：普通账本 JSON 改经安全助手随机临时文件、fsync、rename，不再使用可被预置链接劫持的固定 `.tmp`。
6. 导入生成 managed 叶文件 inventory。删除记录仅回收身份/hash 未变且无其他 library/artifact/mapping 引用的明确叶文件；不递归 rm ID 目录。原位文件保留；外部改变字节保留。只尝试 rmdir 已知空的应用 ID 目录。
7. `artifacts.js`：已存在 content-addressed 落点必须校验真实 hash；复制由助手执行 staged/full-hash/install，防止静默复用损坏或异内容 blob。仍为同步调用，见未完成项。
8. `storage-fs.py`：拒绝带尾斜杠的根 symlink；增加 no-follow stat、可限相对目录的 metadata-only 扫描；copy/hash 完成时发真实最终字节数。迁移 transfer 计数按增量累加，不以定时器制造百分比。
9. `storage-plan.js`：未知 `.omnimux-assets` 控制命名空间阻断；含排除项且无普通文件的原位目录不能作为可物化整目录暴露。library 对不安全链接/目录内容保守过滤。
10. `use-storage-task.js` / `StorageSettingsDialog.jsx`：迁移条目增加前后分页，避免首 200 项以外无法操作；删除确认文案说明 adopted 与 managed 区别。
11. README、manifest、package 白名单及全局库限定合同补充根指针、原位所有权、确认覆盖/清理、Python 能力依赖和未完成状态；没有扩大项目快照规则。
12. 修复前工程新增测试缺失 `readFileSync` 导入；未以删除/放宽断言绕过业务。

## 变更面

- 既有实现修改（本树合计，包含前工程）：paths、index、http-routes、protocol、ingest、picker、library、artifacts、mappings；AssetsStage、api、icons、locales、styles、use-assets-feed；相应旧测试。
- 新增实现（前工程创建、本次复核/修补）：`storage-types.js`、`storage-runtime.js`、`storage-fs.js`、`storage-fs.py`、`storage-plan.js`、`storage-migration.js`、`storage-migration.test.js`、`client/StorageSettingsDialog.jsx`、`client/use-storage-task.js`。
- 本次新增文档：本报告；门禁实际输出 `issue-766-gates-output.txt`。原规格及两幅 Mermaid 保持不改。
- 修改 `plugins/omnimux-assets/{README.md,dsh.manifest.json,package.json}` 与 `docs/contracts/project-assets-contract.md`。构建生成 `plugins/omnimux-assets/lib/client.js`（未跟踪生成物）。其他插件只读检查，未修改源码。

## 验证结果

| 命令 / 入口 | 实际结果 | exit / 限制 |
| --- | --- | --- |
| `node --test plugins/omnimux-assets/src/storage-migration.test.js` 首轮 | 8/8 | 0；44.46 秒 |
| `pnpm --filter omnimux-assets test` | 未进入测试，pnpm 自动尝试依赖安装；worktree 相对 file 依赖落到不存在的 personal/dsh-ui-kit | 1，底层安装 254；未改依赖布局 |
| 同包等价脚本 `node --test src/*.test.js src/client/*.test.js` 首轮 | 190/192，2 失败：测试导入、managed 删除 | 1；已业务修复 |
| 修复后全包（阶段） | 192/192 → 197/197 | 各 0 |
| 最终全包（含分页修改） | **200/200，64 suites，0 skip** | **0，2.23 秒**；输出 `plugins/omnimux-assets/.storage-final-test-output.txt` |
| `node scripts/build-client.mjs`（assets cwd） | 最终 client bundle 213924 bytes | **0**，未加载 App |
| `node scripts/verify-plugin-boundaries.mjs` | 2129 source files | **0** |
| `node scripts/verify-stage-contracts.mjs` | 10 Stage 审计；sidebar 检查无法加载 jsdom | **1**，缺 `jsdom`，未修改门禁 |
| `node scripts/verify-package-files.mjs`（manifest/package 修改后复验） | 12 插件 | **0** |
| `node scripts/verify-plugin-agent-tools.mjs` | 98 实装工具，0 错误/警告 | **0** |
| `git diff --check` / Node syntax / Python AST | 通过 | **0** |
| `test:gates` 等价完整 Node 脚本 | 首跑出现 10 个 ego fixture 失败，verify-ci-gates 挂住；停止该 job | killed，无正常整体 exit，不算通过 |
| `node --test --test-timeout=15000 scripts/ego-live-qa.test.mjs` | 2/12，10 失败 | **1**；临时测试夹具无法解析 `pngjs`（ERR_MODULE_NOT_FOUND） |
| 全量 gates 设置 15 秒 test timeout 重跑 | 输出保存 `issue-766-gates-output.txt`；已出现 **19 条失败**，verify-ci-gates 同步等待仍不退出 | **killed**，无整体计数/正常 exit；10 条 ego 失败已定向证实缺 pngjs，其余未完成归因；不算通过 |
| L2 / ego / native picker / 独立 QA | 未运行 | BLOCKED；主理人已提供 bash-120 exit1，viewer 外部 backup tgz 未受管 source/锁；未重复启动 |

新增回归验证：终结任务禁止重放；install intent 前中断续传；stale plan 不可经 resume 绕过；活动账本缺失不创建空库；未知控制目录/尾斜杠链接；managed 共享引用；外部改写 managed 不删；损坏 hash-addressed blob 不覆盖。迁移定向当前共 13 项，包含在 200 项中。

## 尚欠 P0（不是可选优化）

1. **全入口 FD/lease 闭环**：`http-routes.js:sendPreview` 仍按绝对路径异步开流，runtime operation 结束后未持有 preview FD lease；GET cache-miss 与 mapping scan 写的 gate 分类、路径固定 FD 和流生命周期须逐项补齐。`root_fd` 将父链接 canonicalize 后开 FD，不等于严格拒绝所有父 symlink，根替换竞态仍须测。
2. **legacy 与上传异步集成**：Runtime 禁用 lazy，但没有架构要求的异步 legacy 作业；旧绝对引用可暂时不可见。artifact hash 和 storageSync 大量同步子进程仍可阻塞 Host；每次 read 校验三账本/逐文件子进程也未满足万文件性能。不得把禁止 lazy 视作兼容完成。Python 缺失时整个 Runtime 不可用，不能声称仅新迁移受限且旧功能完整兼容。
3. **目录逻辑层与 UI 完整性**：planner 将目录展开叶子并带 logical_path，但 AssetBrowse 仍未实现逻辑目录树/大目录分页；空子目录、排除项、源文件夹子项 skip 的可见报告不完整。冲突页虽可翻页，但四动作完整集合/结构 keep-both 与全局确认仍缺端到端验证；阶段/冲突文案部分硬编码，未充分本地化。
4. **完整恢复/补偿**：copy 在 staged 写到一半失败后 O_EXCL 残留重试；backup 已落盘但 receipt 未落盘；放弃补偿中断、缺 afterIdentity receipt、目标 marker/锁恢复等仍未全覆盖。commit.json 缺失/损坏时的 ready 根识别及目标 foreign writer 锁竞态也需补测修复。当前异常注入不是 SIGKILL/fsync 全矩阵。
5. **清理与共享引用图**：cleanup 仍未实现完整连通引用/版本引用图、逐项清理 receipt 与失败幂等；7 天清理的检查到删除跨 await 未完全锁定；普通 delete inventory 的残留回收报告未完全进入 UI。已有基本共享测试不能代替迁移全库 GC。
6. **元数据/兼容**：structured input_refs 被 blocker 拒绝，ID/cover/fileId/typed URI/项目快照组合矩阵未全覆盖；xattr 文件当前标记 unmigrated 而非保留全部元数据迁移，仍须按 P0 定义解决，不能自行缩水。未新增外部依赖。
7. **进度与空间压力**：copy/hash 已为分块及真实计数，但 heartbeat/seq、暂停重试的累计及已完成项计数、Home 控制区空间、完整峰值预算、1 万文件 + ≥1GiB/RSS/真实跨卷掉盘/ENOSPC/fsync 失败尚无证据。
8. **验收和工程一致性**：缺计划中的 storage-fs/plan/runtime 专门测试集及相关 HTTP/picker/client 行为测试，未跑 Hub/Workflow 项目快照独立回归。Stage/gates 依赖阻塞未解；真实 UI、原生 picker、可移除卷和独立 QA 未开始。

## 下一责任人和可执行首步

- 主理人先核对本报告并保留任务工作树；不要因 200/200 将本任务转为已完成。
- 后续工程优先在 `plugins/omnimux-assets/src/storage-migration.test.js` 加 staged/backup/abandon 三类断电失败复现，并完成 `storage-runtime.js` / `http-routes.js` FD lease 和异步 legacy 队列；逐项关闭以上 P0 后再独立 QA。
- 环境 owner 处理工作树依赖与合法 L2 seed；本任务不手修共享 profile。独立 QA 由主理人调度。

## 2026-09-08 T02/T03 集中收口追加（历史正文保留）

详见 [migration-closeout](issue-766-migration-closeout.md)。固定HEAD5485c258未提交，本组完成稳定decisionRevision/分页授权、完整partial投影与展示hash绑定、结构prefix keep-both/双侧FD预览、有限metadata保护及ID/cover/typed-path映射、卷预算及receipt/attempt计数生产者与消费者；新增17项回归，既有用例保留。

最终等价全包314/314、64 suites、0skip/cancel、exit0，12466.538ms（`.closeout-test-accepted.txt`）；build257157B exit0；boundaries2146、package12、tools98零错/警告、diff-check均exit0。最后真实隔离压力10000小文件+1074790400B，65922ms，完成10001，源目标hash一致；copy/verify1074919290B，Host/helper峰值RSS317030400/104759296B，heartbeat最大603ms。压力输出`.closeout-pressure-accepted.json`。

**本组完整T02/T03仍IS_PASS:NO，#766不可关闭/发布。** 剩余自建父目录mkdir与receipt中断窗口、install→commit目标仅属性变化及原位目录mtime、旧版本verify计数/跨卷空间故障、歧义引用与partial完整矩阵，均明确记入分项报告，不归咎于Python供应或L2。Stage缺jsdom exit1，既有pnpm/gates环境失败保留；L2#778/ego/native picker/真实可移除卷与独立QA未取得。未接线或修改并行供应runtime/scripts；未操作真实OPC、共享环境、其他工作树或push/部署。下一步由主理人保持单集成owner补这四处再独立QA，不能仅凭314项绿灯进入发布。
