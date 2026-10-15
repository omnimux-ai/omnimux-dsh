# #3357 C/E：任务自有源码构建与打包准备

## 目标与阶段
- 状态：获父批准有限 preparation-only 本地实施；固定基线 `8fe6276958d27e40007cd3336c0342829c1b09fa`。本轮仅写原 bootstrap、其原测试和本规格，不执行真实构建/打包/安装；App 两消费路径后由父整合。
- 第一纵切仅同一既有启动入口的 preparation-only：真实候选源码 → owned builder → 预构建归档 → 字节核对 → 清理；不安装、不启动、不宣称 fresh、任务行为反证或 source-installed-loaded。
- 父先读本规格及设计报告，判断范围与依赖，再授权正常实施；本规格不产生执行、来源认证或生产发布权限。

## 已读复用与最小 seam
- `scripts/test-env-bootstrap.mjs`：`diagnoseWorktreeRoot`/`validateRoot`、`createTestEnvironmentStarter` 的 start、既有 cleanup 生命周期；234–241 现证据请求提前拒绝，352–701 的 Dev-backed 装配不进入新路径、不改其历史语义。
- `scripts/evidence-contract.mjs`：`captureCandidate` 已有 resolved base/head、candidate/inputs/index/changes/snapshot 摘要；`extraInputs` 不支持生成前缺失文件，不改核心或放宽此限制。
- `scripts/materialize-graph.mjs`：`prepareFiles` 的 anchored copy/identities、`payloadManifest`/`hashFile`；`scripts/materialize-cache.mjs`：`privatePnpmEnvironment` 的私有目录及空 npmrc；PATH 必须另收窄为固定工具位置。
- `scripts/managed-tarball.mjs`：`runPnpm` 固定 pnpm 的有界监督；不能当任意 shell/DSH 执行器。`managed-tarball-archive.py inspect` 接受 tarball/name/version/sha256，返回 entries 的 path/type/size/mode/sha256、digest、identity；直接复用，不手写 tar 解析。
- `scripts/sync-stable.sh:389–415,674–725` 的实体布局、两项明确变换及 pack 文件核对算法可复用；不得调用真实同步入口，已有内联算法不是现成公开模块。

## Interface 与文件范围
- 在既有 bootstrap 公开 `prepareTaskRuntime({root, mode:'ui', evidenceContext:{taskId,runId}, candidate:{base,head}})`；同一 start 增加精确字段 `preparationOnly:true`、`candidate:{base,head}` 并调用它；未知字段、缺字段、非 ui 均在副作用前拒绝。普通既有调用保持兼容。
- `root` 必须先通过真实双向登记；task/run 只是绑定元数据，candidate 的提交必须真实解析且 head=current HEAD；不能接受调用者自报 digest、authority、permission、授权 token、输出排除范围或任意命令。
- 返回 `{scope:'preparation-only', status:'task-source-prepared', preparationPath, candidateBefore, candidateAfter, sourceMap, packages, build, observations, cleanup}`；不含 origin/loginUrl，observations 的 runtimeStarted=false、userFresh='unknown'、taskBinding='unknown'。失败抛已有 TEST_ENV_ 风格分类且附真实清理/观察。
- 后继可在 cleanup 前以明确 candidate 请求消费 preparationPath 并重新核 candidate 与包字节；不能仅凭旧 JSON/路径取得安装或加载事实。调用方 finally cleanup 后路径失效。
- 目标写集最多五项：本规格、`scripts/test-env-bootstrap.mjs`、其原测试、`scripts/worktree-app-qa.mjs`、其原 `worktree-app-qa.test.mjs`；不加服务/库/runner/fixture，不把新逻辑塞成巨型脚本分支。
- App 请求仅增加 preparationOnly/candidate 的显式转交和准备错误/原件保留，不扩核心 scope/schema；现消费者 `new URL(env.origin)` 对无 origin 必须失败并保存 pass=false 原件，不伪造浏览器/环境断言。没有准备状态的公共调用测试不算此目标交付。

## 源码、依赖与布局
- 在登记 root 下独占 `.test-env-*` 根，记录 dev/ino；owned root 先建再 capture，仍属既有 ignored 目录。根/清理身份改变则失败保留，不删除其他目标。
- 构建 source 角色第一阶段只取预声明 tracked source，不捕获不存在的 bundle；全候选绑定仍复用原 capture（tracked 含删除/mode 及普通未跟踪候选），不改核心。生成的 ignored 文件不作 extraInputs。构建会修改 ignored generated，且原仓某些 lib 可能 tracked，故绝不在 checkout 构建。
- 从捕获的已声明 tracked 源条目逐文件实体复制 bytes 与执行位；新增未跟踪构建输入须另行固定审查，否则拒绝，不能漏掉其候选变化。拒链接/特殊文件/未声明读取。最小 repo-thin 布局保持 owner/stage/plugins/omnimux、owner/stage/packages/dsh-ui-kit、owner/stage/packages/generation-capabilities，加必要根 manifest/workspace/lock 与已审构建配置；不是仅复制 hub+kit。
- 构建工具仅来自任务 root/node_modules 的一份已按原 lock 固定安装的构建依赖；允许该任务依赖已有仓内 ancestor 链，不读 Dev/global 或任选其它 checkout。stage 根仅以明确受审链接供模块解析；记录真实工具路径/锁摘要，不称其为 installed product。不可确认依赖来源或缺 esbuild/mediabunny/tsdown 则 `TEST_ENV_PREPARE_DEPENDENCY_REQUIRED`，不自动安装、联网、npm hooks、Dev 回落。
- 构建按已审原 scripts.build：kit 的 tsdown，hub 的 media-inspect 后 client；hub client 实际读取 packages/generation-capabilities。先静态校验固定脚本值/参数及 POSIX 命令标志语义，变动脚本拒绝，不把任意 package scripts 当安全入口。
- child cwd/HOME/XDG/TMP/Corepack/pnpm/npm 配置均 owned；完整白名单 env，无 NODE_OPTIONS/NODE_PATH/预加载/代理/凭据/系统配置。普通已审构建仍有 OS 子进程写能力；路径/env 校验不是恶意脚本沙箱，恶意依赖/安装留第二阶段安全条件。

## 产物与精确变换
- builder 保持原相对 file:../../packages/dsh-ui-kit；构建完成后再复制到独立 pack 兄弟布局 omnimux 与 dsh-ui-kit，源暂存不改。
- 仅预声明两项变换：pack/omnimux/package.json 的 dependencies.dsh-ui-kit 从已读原 file 值变为 file:../dsh-ui-kit，JSON.stringify 两空格+换行；hub src/release-channel.json 仅合法唯一 channel 规范为 development 的同格式字节。其它字段/文件差异不许放宽。
- 真实 `pnpm --config.ignore-scripts=true pack --dry-run --json` 固定文件集合；真实 pack 禁 hooks，记录原 exit/signal，归档 name/version 必须等于源映射（omnimux 0.1.2、dsh-ui-kit 0.1.0，仅本基线；候选变动须重新固定）。
- 比对所有已声明 packed 普通文件的集合/bytes/mode 与 archive inspect；package.json 仅允许上述预声明结果，不是任意 JSON 语义等价。同时记 archive 整包 SHA256、archive manifest digest、build/pack stage payload manifests、sourceMap 的源/暂存 path+mode+size+sha256。归档目录规范可单列，文件执行位不得悄悄放宽。
- sourceBefore/After 取同 options，原候选不得变化；build stage 中的已复制源码也核未改，生成输出单列 roles。实际构建命令/工具/进程 exit+close/有界脱敏 stdout+stderr 与包摘要为观察；自写清单、source/name 固定值不作独立认证。

## 测试策略、命令与验收
- 正常授权实施后先在原 node:test 文件添加 public 参数/根检查/缺依赖/分类的真用例，保留原243行覆盖，不引入 fs 静态 import 豁免、registerHooks/动态 spread 绕旧门禁。硬拒即停受影响动作，不换 helper/别名/缩改旧拒绝 payload 重送。
- 下一步定向命令：`node --test scripts/test-env-bootstrap.test.mjs scripts/worktree-app-qa.test.mjs`；`git diff --check`。涉及适用 gate 再选最小相关集合；本轮仅执行文档空白检查，不执行测试或 build。
- 真准备验收须真实本仓 candidate 的 build+pack 成功、全部文件/模式精确匹配、源码前后相同、exit+close/有界日志、精确幂等 cleanup；负向含构建非零/缺包/字节或模式漂移/候选漂移/身份漂移且不回落。无真实产物的参数测试只算局部完成。
- cleanup 复用既有 owner 生命周期，等待全部构建后代退出，确认 owned 根 dev/ino 再删；失败保原件和清理状态，不把 cleanup 未知记成功。

## 明确依赖与拒绝
- 当前 runPnpm 的 worker 将 stderr 丢到 DEVNULL，失败 reason 又清空 stdout，不能满足失败日志要求；现 worker 也只从宿主 PATH 找 pnpm。不得无声复制 runner、额外写第六文件或虚称已支撑。
- 最小前置依赖票：只在现 managed-tarball worker 及原测试内补固定工具解析和有界、脱敏可保留的 stdout/stderr/结束观察，保持 fixed-pnpm Interface，不增加任意 command；父审成本后单独授权。此依赖未落地时 #3357 最多正常参数/分类代码，不得声称 source-build-pack 真纵切完成。
- 始终：事实/推断分开，准备错误保持 unknown/not-run；先问：新增文件/依赖、worker Interface 扩张或范围超五项；绝不：本轮生产/test写、真实 build/pack/install/App/profile、Git refs/remote、秘密、别工作区或官方写入/下级委派。
- 官方当前 publish 文档及已安装 0.1.5-rc.3 为父已读上下文，不保证本仓 alpha.3 pin 兼容；本轮不升级。E2 真 source-installed-loaded、fresh App 和任务行为验证仍未证。

## 实施后的实测事实（本轮真实运行，非推断）
第一纵切已在原 bootstrap、原测试与本规格内实现并真实跑通：真实候选捕获前后一致 → owned stage 实体复制 → 真实构建 → 真实 pack → 归档 inspect 与受验 extract → 精确清理。观测到 `status='task-source-prepared'`，omnimux 0.1.2 归档 874 个文件（含 73 个目录项共 947 项）、dsh-ui-kit 0.1.0 归档 78 个文件，stage 清单 1423 项，sourceMap 1305 项，两次构建与两次 pack 退出码均为 0，cleanup `cleaned=true` 并回报 owner 身份。同一候选两次独立运行的归档摘要完全相同。

构建阶段只使用任务 root 已按原 lock 安装的依赖（hub 固定 esbuild 0.25.12、kit 固定 tsdown 0.22.14），以包级 `node_modules` 链接供模块解析；未安装、未联网、未读 Dev/profile/凭据。

实测修正了规格原先的推断，均以真实字节为准：
1. **stage 必须包含兄弟插件**：`plugins/omnimux/src/client/session-guide/trending/recommendation-engine.js` 真实跨插件引用 `plugins/omnimux-inspiration/src/recommendation-engine.js`，故 stage 增加该插件源码；打包集合仍仅 hub 与 kit。
2. **声明三项 pack 变换而非两项**：除 kit 依赖路径与 release-channel 外，packer 会移除生命周期 `prepare` 脚本且不写末尾换行，因此在声明负载中提前落地该规范化，使归档清单与声明负载逐字节一致。
3. **归档集合完整性以 packer 自己的声明为准**：先以真实 `pack --dry-run --json` 取声明文件集合，要求归档文件集合与之完全相等（数量与逐路径），再对每个声明文件按其真实来源（暂存目标或仓根附加文件）比对 size/sha256/mode；`package.json` 经受验 extract 后按内容深度相等（packer 会重排键序，键序非语义）。因此“构建空转或丢文件仍报已准备”不再可能。
4. **暂存源码在构建后必须未被改写**：构建前记录全部候选已复制输入（path/mode/size/sha256）为 sourceMap，构建后逐项复核，任一漂移即失败。
5. **owned 根身份**：创建时记录 dev/ino，删除前复核同一身份，并在 cleanup 结果中回报；失败保留现场且 `cleaned=false`。

构建子环境对既有安装向 private env 做了两处显式覆盖：`COREPACK_HOME` 指向调用环境提供的工具缓存，`COREPACK_ENABLE_PROJECT_SPEC=1` 以尊重 `packageManager: pnpm@11.7.0` 固定值；网络仍禁用，解析失败即大声失败。

写集说明：因新增静态依赖使 `managed-tarball.mjs`、`materialize-cache.mjs`、`materialize-graph.mjs` 成为 CI 实际消费的根，按仓库既有治理门禁要求把这三项从 localRequired 升为 ciRequired（`scripts/governance-manifest.json`），这是门禁的既有契约而非新增信任。

仍未证：pnpm 驱动仍由宿主 PATH 解析（worker 尚无固定 EXE 入参，属已记录的前置依赖票）；无 OS 子进程写隔离；未安装、未加载、非 fresh、未启动 App、无任务行为证据。
