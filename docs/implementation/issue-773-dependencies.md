# #773 本树依赖准备：调查与最小方案落实

## 最新结论（2026-09-08 16:03 Asia/Shanghai）

**最小依赖方案工程验证通过：唯一包级软链已建立，全包 `tsc --noEmit` exit 0；本包正式 test（含一次 build）352/352、7 suites、0 fail/cancel/skip/todo，exit 0。依赖缺失导致的独立静态验证前置门槛已解除；独立 QA 尚未核查，不代表完整工坊、T03 或 UI/L2 验收。**

仅新增任务树 Market 包级依赖链接，重建本包 lib，并更新本文；源码、query/validator、规格、package/lock、官方/sharedprofile/外部 kit 均未改写。共享依赖与本树受保护文件前后指纹一致。命令、输出清单、指纹及证据限度见文末“获批落实记录”。下列只读调查与未执行建议保留为历史记录，不再代表当前状态。

## 首次只读调查结论与范围（历史）

**首次调查完成时未修复环境，未执行链接/安装/typecheck/build/test，未作 UI 或功能验收。**

- 2026-09-08 核验：base = HEAD = `580234923268673562cacb5cd01aebdb780339e1`，任务树 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`（下称 `T`）；主树为 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`（下称 `M`）。目标是本包 `omnimux-market` 的完整验证，不是全 workspace 构建。
- **可推荐的最小路径：另行授权后，仅创建 `T/plugins/omnimux-market/node_modules` → `M/plugins/omnimux-market/node_modules` 一个目录软链。** 已有源真实存在、十项直接依赖身份/版本匹配当前锁，无需网络或 postinstall；仍须链接后用本树完整 `--noEmit` 检查确认解析，再进入正式本包 test。
- 仅根级 `node_modules` 链接不足：主树根只公开 acorn/esbuild/pngjs，pnpm 为 isolated 布局；包级依赖并不因此成为任务源码的解析祖先。
- 当前未发现 Market 所需 UI kit 编译产物不足。存在并不证明完整类型图、所有运行依赖、浏览器兼容或未来新增 API 可用。
- 本轮唯一仓库写入为本文。不触碰 T03 工程76的 `install-validation*` 及其报告，不联系/召唤其他成员；#778 L2 独立处理。

## 契约、共享机制与副作用

| 证据 | 结论 / 操作边界 |
|---|---|
| `AGENTS.md:39–48,64–74` | 官方源码/发行包禁止修改；本包 test 为行为验证入口；L2/ego-browser 为独立运行验收要求。依赖共享不授予物化或启动权。 |
| worktree-ops `references/worktree-contract.md:25–28,64–68` | 不改依赖声明时允许只读复用主树 node_modules；通用示例不能盲套 monorepo，需保留 pnpm 包级解析拓扑。包级目录链是该原则的最小应用，不是脚本已有子命令。 |
| `/Users/x/.dsh/skills/worktree-ops` | 是软链，真源 `/Users/x/Desktop/Project/OPC/资产库/skills/opc-skills-worktree-ops`；任务树 `.agents/skills/worktree-ops` 不存在。不编辑共享技能。 |
| `scripts/worktree.sh:24–30,168–199,219–294` | ROOT 取当前 Git 顶层；无 deps/share/install 子命令。new 会 init、写 ignore/common exclude、fetch、建分支/工作树；不能作为本次依赖准备入口，更不能在任务树里再次 new。 |
| `package.json:32–38,50–51` | `wt:*` 只代理上述脚本；根 test/test:all 会跑多个包，不在范围。根 typecheck 也不是 Market。 |
| `plugins/omnimux-market/package.json:45–49` | build 首先 `rm -rf lib`，再 tsc、concat-client、复制 fixture/expert；prepare=`npm run build`；test=`npm run build && node --test --test-concurrency=1 lib/tests/*.test.js src/expert/*.test.js src/client/*.test.js`。缺依赖时盲跑会先毁本树产物。 |
| `scripts/concat-client.mjs:53–95`（Market 包内） | bundle UI kit，react/react-dom/官方 primitives 外置；esbuild `write:false` 后只写本包 `lib/client.js`，不构建 kit。 |
| `pnpm-workspace.yaml:3–4`、esbuild manifest | allowBuilds 放行 esbuild；其 postinstall=`node install.js`。安装不等只建立链接，还可能执行生命周期、改 store/锁/模块树。Market prepare 也具有构建副作用。 |
| `docs/contracts/dev-pipeline.md:21–46` | worktree L1 与 profile/L2 两种机制不同。L2 需受管 snapshot/独立 pnpm 模块树，禁止复制 seed node_modules；不能将本报告软链方案套用到 profile。sync/dev-env 不是此任务的依赖共享命令。 |

## 现场证据

| 检查 | 只读结果 |
|---|---|
| `T/node_modules`、`T/plugins/omnimux-market/node_modules` | 均不存在，非已有坏链；两个路径均被 Git ignore。 |
| `M/node_modules`、`M/plugins/omnimux-market/node_modules` | 均为真实目录、uid 501；包内各依赖是指向 `M/node_modules/.pnpm/…` 的现有软链。新增目录链接的目录项归本任务，目标目录及其后代不归本任务。 |
| 输入比对 | 主树与本树 root package/lock/workspace、Market package 内容相同；上述输入和 Market tsconfig、worktree.sh 对 base 无 diff；已安装 `.pnpm/lock.yaml` 与根锁字节相同。 |
| `M/node_modules/.modules.yaml:1180–1246` | 实为 JSON：pnpm@11.7.0、isolated、layoutVersion 5、virtualStoreDir `.pnpm`、store `/Users/x/Library/pnpm/store/v11`、pendingBuilds=[]。 |
| 包根闭包元信息 | 从十项直接依赖递归普通 `dependencies`，112 个不同真实包根存在，0 缺失。不是所有 exports/peer/optional/声明引用的完整证明；没有加载 Host 或调用其功能。 |
| esbuild 本机产物 | `M/node_modules/.pnpm/@esbuild+darwin-arm64@0.25.12/node_modules/@esbuild/darwin-arm64/bin/esbuild` 存在，mode 100755；未执行二进制或 postinstall。 |
| `git ls-files plugins/omnimux-market/lib` | 50 个受跟踪文件；调查时 `git diff --quiet -- plugins/omnimux-market/lib` exit 0。 |
| 包管理器 | root 声明 pnpm@11.7.0，Market 声明 pnpm@11.17.0；当前 PATH pnpm 为 DSH runtime shim，发行包 manifest 为11.8.0，并带 Electron runtime 环境。未运行 shim/Corepack，不假设它不会下载切换版本。 |

以下真实包路径统一以 `M/node_modules/.pnpm/` 为前缀。每行 package.json 的 name 正确，版本与 `pnpm-lock.yaml:273–305` 一致；声明的 main/types 文件已逐项检查存在（@types/node 本来无运行 main，不能把 require.resolve 失败当作缺包）。

| 包 | 安装/锁版本 | 真实路径后缀 |
|---|---|---|
| @deepseek-ai/cordis | 4.0.1 | `@deepseek-ai+cordis@4.0.1/node_modules/@deepseek-ai/cordis` |
| @deepseek-ai/dsh-tools | 0.1.0-rc.8 | `@deepseek-ai+dsh-tools@0.1.0-rc.8_ac9081d1e007de8a90a707560a8ae1c3/node_modules/@deepseek-ai/dsh-tools` |
| @deepseek-ai/schemastery | 3.18.1 | `@deepseek-ai+schemastery@3.18.1/node_modules/@deepseek-ai/schemastery` |
| @deepseek-ai/dsh-client-ui-primitives | 0.1.0-rc.8 | `@deepseek-ai+dsh-client-ui-primitives@0.1.0-rc.8_@deepseek-ai+cordis@4.0.1_@deepseek-ai_f3de8d3093797b94059925c3c8b20a9f/node_modules/@deepseek-ai/dsh-client-ui-primitives` |
| @types/node | 24.13.3 | `@types+node@24.13.3/node_modules/@types/node` |
| typescript | 5.9.3 | `typescript@5.9.3/node_modules/typescript` |
| esbuild | 0.25.12 | `esbuild@0.25.12/node_modules/esbuild` |
| react | 18.3.1 | `react@18.3.1/node_modules/react` |
| react-dom | 18.3.1 | `react-dom@18.3.1_react@18.3.1/node_modules/react-dom` |
| dsh-ui-kit | 0.1.0（file 源身份，锁不是固定 semver） | `dsh-ui-kit@file+..+..+personal+dsh-ui-kit_@deepseek-ai+dsh-client-ui-primitives@0.1.0-r_e00e670598d3e1b30755d8571e7350d4/node_modules/dsh-ui-kit` |

### UI kit 与硬链接风险

- 主树 file 源实际为 `/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit`，存在且 manifest name/version 为 dsh-ui-kit@0.1.0。同一相对 spec 在任务树会落到不存在的 `M/personal/dsh-ui-kit`，所以不能在本树照搬 install，即便 offline/frozen/ignore-scripts 也不解决相对源错位。
- 安装副本与该源的 `package.json`、`lib/index.js`、`lib/index.d.ts` **分别是同 device/inode 的硬链接**（nlink=11/5/5）。禁止通过任何一端直接改写它们；node_modules 不只是可随意重建的本树缓存。
- 三文件 SHA-256 分别为 `aad88fdc55a9d44d864c9c46d94f66d35f2742b328d8659789bab9030647fbd9`、`dbea743509a358dd2d8fe913d67530f1af0195b01e0410b5c0bc2c90f7ce84e7`、`362e28e0680be0fb2a20dfbec094402f7f15c814dbb7cc0e77489b88e2e587ac`。
- `src/client/boot.js:4` 当前需要 Button/FilterBar/IconButton/InputField/SearchField；安装 kit 的 JS 导出和声明均含这些项，19 个公开 JS 导出已静态核对。未发现缺少 lib/入口或 FilterBar 的证据，不能报外包阻塞。
- 若后续新增 UI 使用不存在的 kit 导出，应记录具体 import/产物缺口，由主理人按跨仓契约建依赖 Issue；不得本树任务代编译、改外包或偷偷换源。

## 给主理人的最小下一步（未执行）

**所需新授权：允许本树一个包级软链；允许本包 test 重建本树 `plugins/omnimux-market/lib/**`，及本树 `.dependency-validation/**` 临时测试/cache目录。禁止沿共享链接写任何文件。** 当前授权只有报告，不能执行以下写操作。

执行前由主理人确认工程76等本包写者已结束，重查最新新增测试的 IO 边界；不与正在写的源码竞争。若 lib 已有未提交改动，先停并核实归属；仅在原内容及 mode 均由 HEAD 保存时，无需冗余备份。

### A. 仅本树链接 + 完整无输出检查

下面脚本从指定树执行；不使用 `ln -sfn`，不覆盖真实目录/已有链接。主树包级 node_modules 自身必须为预期真实目录。执行时应复核上表版本/真实路径及输入未漂移，失败立即停，不转为安装。

```bash
set -eu
T=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773
M=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh
cd "$T"
test "$(git rev-parse --show-toplevel)" = "$T"
test "$(git rev-parse HEAD)" = 580234923268673562cacb5cd01aebdb780339e1
cmp package.json "$M/package.json"
cmp pnpm-lock.yaml "$M/pnpm-lock.yaml"
cmp pnpm-workspace.yaml "$M/pnpm-workspace.yaml"
cmp plugins/omnimux-market/package.json "$M/plugins/omnimux-market/package.json"
cmp pnpm-lock.yaml "$M/node_modules/.pnpm/lock.yaml"
test -d "$M/plugins/omnimux-market/node_modules"
test ! -L "$M/plugins/omnimux-market/node_modules"
test ! -e plugins/omnimux-market/node_modules
test ! -L plugins/omnimux-market/node_modules
ln -s "$M/plugins/omnimux-market/node_modules" plugins/omnimux-market/node_modules
node plugins/omnimux-market/node_modules/typescript/bin/tsc \
  -p plugins/omnimux-market/tsconfig.json --noEmit
```

仅 `ln` 写一个任务树目录项，tsc 不输出文件。**必须 exit 0 才进入 B；失败保留诊断，不运行会先删除 lib 的 test。** 不添加 baseUrl/typeRoots/paths 豁免，不以主树 compiler 可启动当作本树解析成功。不需要根级 node_modules 链接。

### B. 本包正式脚本与检查

```bash
set -eu
T=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773
cd "$T"
git diff --quiet -- plugins/omnimux-market/lib
mkdir -p .dependency-validation/tmp .dependency-validation/home .dependency-validation/dsh-home
export TMPDIR="$T/.dependency-validation/tmp"
export HOME="$T/.dependency-validation/home"
export DSH_HOME="$T/.dependency-validation/dsh-home"
export npm_config_cache="$T/.dependency-validation/npm-cache"
export npm_config_update_notifier=false
export PATH="/Users/x/.nvm/versions/node/v25.8.0/bin:$PATH"
/Users/x/.nvm/versions/node/v25.8.0/bin/npm --prefix plugins/omnimux-market run test
git diff --check
```

- 这里直接调用包 manifest 的正式 `test`，与 `pnpm --filter omnimux-market test` 的目标脚本相同；避免当前 pnpm shim/不同 packageManager 声明触发工具切换。不是另造测试 harness，不执行 install。受控 HOME/TMPDIR/DSH_HOME/cache 将默认文件写入限制到本树；这不代替对新增测试显式路径/网络行为的检查。
- 影响：重建本包 `lib/**`（含50个已跟踪文件、可能新增编译测试/JS、client.js和fixture），测试临时目录及 npm cache/log；不写源码/package/lock/config，不自动构建 kit/其他插件。
- test 已含 build，不要先额外跑一遍 build。保留全包计数、失败首条、exit code及 lib diff，由主理人判断产物保留策略；不自动 restore/清理他人产物。可按只读门禁要求随后运行 `node scripts/verify-stage-contracts.mjs`，但不是浏览器验收。
- 无论 B 成败均不启动 App/L2/同步 profile；UI 运行验收由主理人与 #778 后续合法 L2 条件单独接续。

## 与首次失败的信息差异、检查限度

| 首次 query 报告 | 本轮新增事实 |
|---|---|
| 全包 tsc：3条 TS2307 + 39条关联 any，共42条；pure strict/84项回归通过 | 未重跑或覆盖其结果；已定位合法依赖在主树包级 pnpm 入口，不是磁盘上完全没装。 |
| 只读主树 compiler 可运行，baseUrl/typeRoots 仍缺 Host 包 | compiler 执行路径不决定任务源 import 解析；包 export/types 真实存在且锁匹配，包级共享是可试的最小修复，而不是 typecheck 已通过。 |
| 正式 test 因先删 tracked lib 而未跑 | 已量化50个 tracked lib，并核实 prepare/esbuild生命周期、kit硬链接和 pnpm shim风险；继续禁止缺依赖盲跑。 |
| UI build/运行尚未验证 | 当前 kit 所需导出齐全，但未运行打包/完整 tsc/正式 test/浏览器；L2 #778问题与本树依赖共享无替代关系。 |

实际只读检查采用 `pwd`、`git rev-parse/status/check-ignore/ls-files/diff --quiet`、限定 `ls -l[d]`、read/grep及内存 Node fs/manifest/AST分析。元信息/闭包检查命令均 exit 0；首次 ls exit 1 是两个任务依赖目录和任务内技能路径不存在，已用 fs.existsSync/lstat 确认；两次 grep 空 include 参数错误已改用有效过滤，不是仓库故障。未扫描 secrets/用户库存/profile，未执行包生命周期、网络、提交/push/部署。报告交付检查包含 `git diff --check` 与本文未跟踪内容的直接空白检查。

**首次调查关闭准备度（历史）：当时仅调查可交付，环境修复和完整本包验证尚未执行。后续已获批落实，以下记录取代该未执行状态。**

## 获批落实记录（2026-09-08）

### 授权、基线与前置复核

- 本轮主理人明确批准一个包级软链、完整无输出类型检查成功后的正式本包 test 和50个已跟踪 lib 产物重建；此前仅报告的委派限制不再用于阻断上述操作。T03 依赖新增为另一阶段，未开始，未实施。
- cwd 唯一为 `T`，base = HEAD = `580234923268673562cacb5cd01aebdb780339e1`，branch=`agent/market-skill-workshop-issue-773`。`origin/main` 本地跟踪状态 behind 2；本次是指定固定 base 的本地增量验证，未 fetch、切分支、暂存或提交。
- 已完整读本报告首次版本130行、query报告148行、工作树AGENTS、Git/PR合同及worktree-ops全文/contract。新增 query/QA 测试为纯输入用例；复核正式脚本、concat-client 和测试 IO：临时 fixture 经 `tmpdir()` 定位，默认用户数据经受控 HOME/DSH_HOME；CLI add/install/restart 使用注入 stub，真实 Node 子进程仅用于 stdout/退出码/超时用例，不运行 DSH 安装。
- `expert/install.test.js` 不是全部 stub：git-source 用例实际复制本地素材。已逐项确认 Blotato 三技能真实源 `/Users/x/Desktop/Project/Github/blotato-skills/blotato/skills/{brand-brief,post-writer,post-grader}` 及 WorkBuddy `/Users/x/Desktop/Project/Github/workbuddyskills/experts/ad-creative-strategist` 存在；执行进入本地复制分支，目标均为本树临时 home，不需要 git clone/fetch。未启动模型、App、服务或 L2。
- `M/plugins/omnimux-market/node_modules` 当前仍为真实目录，不是链接；T 根/包级 node_modules 原先均不存在。10项实际 name/version/realpath 全部重查并断言通过，与上方版本表和路径后缀逐字一致。5次 `cmp`（root package、lock、workspace、Market package、installed lock）全部 exit 0。
- kit 三文件仍与外部源同 device/inode；device=`16777229`，package inode=`887738282`/nlink11、JS inode=`944818803`/nlink5、d.ts inode=`944818802`/nlink5。三项内容 SHA-256 与首次表述一致。
- `git diff --quiet HEAD -- plugins/omnimux-market/lib` exit 0；50个已跟踪文件原内容及 mode100644 均由指定 HEAD 保存；未建立冗余备份。

### 实际执行命令与退出码

下列命令在 `T` 执行；Node真实路径 `/Users/x/.nvm/versions/node/v25.8.0/bin/node`，版本 `v25.8.0`。所有节点只消费既有依赖；没有 install/rebuild/postinstall、Corepack bootstrap 或包管理器下载。PATH 中 pnpm 是 DSH wrapper，本轮未运行也未把它误判为依赖不支持；使用报告 B 已规定的既有 npm 执行 manifest 正式脚本，不替换测试 harness。

```bash
# C1：现场及输入核验，exit 0；lib_diff_exit=0，tracked lib=50。
pwd
 git status --short --branch -uall
 git rev-parse HEAD
 git rev-parse --show-toplevel
 git diff --quiet HEAD -- plugins/omnimux-market/lib
 git ls-files plugins/omnimux-market/lib | wc -l
 command -v node; node --version; command -v pnpm; command -v npm
 ls -l /Users/x/.nvm/versions/node/v25.8.0/bin/{node,npm,pnpm}
 du -sh ../../node_modules

# C2：5次cmp均exit 0；主树依赖总大小403M。
set -eu
T="$PWD"
M=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh
test "$(git rev-parse --show-toplevel)" = "$T"
test "$(git rev-parse HEAD)" = 580234923268673562cacb5cd01aebdb780339e1
cmp package.json "$M/package.json"
cmp pnpm-lock.yaml "$M/pnpm-lock.yaml"
cmp pnpm-workspace.yaml "$M/pnpm-workspace.yaml"
cmp plugins/omnimux-market/package.json "$M/plugins/omnimux-market/package.json"
cmp pnpm-lock.yaml "$M/node_modules/.pnpm/lock.yaml"

# C3：写前指纹，10项身份及4项本地素材断言成功；exit 0。
node .dependency-validation/fingerprint.mjs > .dependency-validation/before.json

# C4：唯一链接及无输出全包类型检查，均exit 0，只执行一次。
test ! -e plugins/omnimux-market/node_modules
test ! -L plugins/omnimux-market/node_modules
ln -s /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/plugins/omnimux-market/node_modules plugins/omnimux-market/node_modules
node plugins/omnimux-market/node_modules/typescript/bin/tsc -p plugins/omnimux-market/tsconfig.json --noEmit

# C5：正式脚本，只执行一次；最终result=0。
set -eu
T="$PWD"
git diff --quiet HEAD -- plugins/omnimux-market/lib
node --input-type=module -e "import fs from 'node:fs'; for(const name of ['tmp','home','dsh-home']) fs.mkdirSync('.dependency-validation/'+name,{recursive:true})"
export TMPDIR="$T/.dependency-validation/tmp"
export HOME="$T/.dependency-validation/home"
export DSH_HOME="$T/.dependency-validation/dsh-home"
export npm_config_cache="$T/.dependency-validation/npm-cache"
export npm_config_update_notifier=false
export PATH="/Users/x/.nvm/versions/node/v25.8.0/bin:$PATH"
set +e
/Users/x/.nvm/versions/node/v25.8.0/bin/npm --prefix plugins/omnimux-market run test > "$T/.dependency-validation/test.log" 2>&1
result=$?
printf '%s\n' "$result" > "$T/.dependency-validation/test.exit"
printf 'formal_package_test_exit=%s\n' "$result"
exit "$result"

# C6：测试结束后采集，随后按groups逐项deepEqual，exit 0。
node .dependency-validation/fingerprint.mjs > .dependency-validation/after.json
# 比较 shared/packageLinks/kitFiles/protectedFiles 全部相等。
git diff --name-status -- plugins/omnimux-market/lib
git diff --stat -- plugins/omnimux-market/lib
git ls-files --others --exclude-standard -- plugins/omnimux-market/lib
git diff -- plugins/omnimux-market/lib
git check-ignore plugins/omnimux-market/node_modules plugins/omnimux-market/lib/client.js
git diff --check
```

C1为分批检查命令的汇总；没有执行根 test 或根 build。C3/C6 的辅助脚本源码及 before/after JSON 保留在本树 `.dependency-validation/`，不是产品代码或测试替代实现，仅为本轮可复核证据。身份检查是 `fs.realpathSync` + manifest name/version 与本报告10项期望值严格相等；路径存在性使用 `lstatSync`/`existsSync`，不加载 Host。

唯一一次正式 test 原样展开：

```text
> omnimux-market@0.2.13-omni.0 test
> npm run build && node --test --test-concurrency=1 lib/tests/*.test.js src/expert/*.test.js src/client/*.test.js

> omnimux-market@0.2.13-omni.0 build
> rm -rf lib && tsc -p tsconfig.json && mkdir -p lib/tests/fixtures lib/expert && node scripts/concat-client.mjs && cp src/tests/fixtures/* lib/tests/fixtures/ && for f in src/expert/*.js; do case "$f" in *.test.js) ;; *) cp "$f" lib/expert/ ;; esac; done

wrote T/plugins/omnimux-market/lib/client.js (217813 bytes, 20 fragments)
ℹ tests 352
ℹ suites 7
ℹ pass 352
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2274.135542
formal_package_test_exit=0
```

实际客户端输出绝对路径中的 `T` 为本文定义的唯一工作树路径；原始日志未做缩写。测试输入31个文件：`lib/tests`23 + `src/expert`4 + `src/client`4；包括query22、QA23、aggregate13、catalog7、picker19共84项已知回归，不将84叠加为额外测试总数。无源码bug/断言失败，无失败重试或断言修改。一次 build 内含正常有输出 tsc 与 esbuild打包，只写Market的lib，没有构建UI kit或其他插件。独立无输出tsc采用当前tsconfig完整include（strict=true，原skipLibCheck=true），未加baseUrl/typeRoots/paths或其他豁免；诊断0条。

### 前后共享指纹

前：`2026-09-08T08:01:17.685Z`（16:01:17 +08:00）；后：`2026-09-08T08:02:22.859Z`（16:02:22 +08:00）。按排序路径递归 `lstat`，不跟随目录内软链；每节点记 kind/POSIX mode/device/inode/nlink，文件再记 bytes/内容SHA-256/mtimeMs，软链记原始target，最终以 `JSON.stringify(rows)` 的 SHA-256 汇总。主树 `node_modules` 包含 `.pnpm`真实存储及其所有文件，链接目录单独纳入；读取导致的atime不参与指纹。精确逐项deepEqual亦通过，而不只比较摘要。

| 集合 | 节点数前/后 | SHA-256前/后（完全相同） |
|---|---:|---|
| `M/node_modules` 全树 | 35703 / 35703 | `fe0861d106dd5ad9d25b7fd268b0fdb03f26197928eaadb5bacc95fe93e7e868` |
| `M/plugins/omnimux-market/node_modules` 目录/链接/脚本 | 18 / 18 | `37715317029168106c9bc388be90ca74d5bc38dbe0689a287df810e3de62323a` |
| 外部kit源 package.json + lib/index.js + lib/index.d.ts | 3 / 3 | `4a74b68d97dfed09772c28804d56205cfead66a65752bbbd7cdb41e8df47461e` |
| 本树Git tracked+非ignored untracked，排除Market lib/本文/验证临时目录 | 3165 / 3165 | `ed6d13ef2a5e19a58efa8a89ace1316c49412a7de407248062e392a462bd6b76` |

共享内容、mode、inode、nlink、文件mtime、链接目标及节点集合均未变。本树受保护集包含前序query源码/QA/validator报告、规格、其他包源码/产物、package/lock；未恢复或覆盖已有增量。该证据不是文件系统写审计，不覆盖遍历软链后未枚举的任意外部树；kit三项硬链接另外显式核验，未声称扫描官方发行包或用户sharedprofile。

### lib 完整变化清单

50个已跟踪文件全部重建且仍存在，mode全部100644；其中48项内容及mode与HEAD相同，2项内容变化（+36/-1），0删除。重建使原有文件inode/mtime可能变化，这与共享依赖指纹未变不同。

| 状态 | `plugins/omnimux-market/lib/` 相对路径 | bytes | 产物SHA-256 |
|---|---|---:|---|
| tracked修改 | `expert/catalog.js` | 11161 | `7e6d0b763add78bd801fe4d782b7f2ba825b8bb43615c2bc69d585d54dbd0de4` |
| tracked修改 | `tests/skill-aggregate.test.js` | 9786 | `eff0052ee73abf3f06dabc62180cebc395814d4cc56928fcc27e254a3774cf14` |
| 新增untracked | `client/skill-picker-logic.js` | 10407 | `29d60c584f473530d5cccce0b2de385aa12a74379347cdb0ea3301cf9e23027d` |
| 新增ignored | `client.js` | 217813 | `37d25f81ec30a79ad515458f0ab5500aa5d66fcb13f098119cb757b30f686847` |
| 新增untracked | `tests/workshop-query.qa.test.js` | 15698 | `09681b2d2c82bed62b103c62a74d9ecc6893c1559909346c1fd7da8d6c65bbcf` |
| 新增untracked | `tests/workshop-query.test.js` | 19931 | `88e2a972e3dcddb56ebe33f7787a087671da48dfdf25f66110330c0d84c63f10` |
| 新增untracked | `workshop-query-budget.js` | 2652 | `5e03104a6e03b58656c5572c3b8103af1d7d17ba4ec4300ae24ddd852af1db53` |
| 新增untracked | `workshop-query.js` | 14470 | `b0b59eaa1924d0d769fab6095a9b6e4f63165bec3c97e9fc79e7c0e4cb831027` |

另新增一个`lib/client/`目录；lib节点55→62（文件50→56），没有其他新增文件。两项tracked diff分别是已存在query增量的catalog技能元数据/strict own recommended，以及aggregate旧fallback回归；本轮没有编辑源表达式。所有lib变化原样保留给主理人/QA，不自动restore、不提交生成物。`client.js`与包级node_modules被既有规则ignore，没有改ignore规则。

### 工程一致性复核、交付与限度

**IS_PASS: YES，仅最小依赖恢复和当前Market全包静态/正式脚本工程自检。** 先noEmit成功再build/test的顺序满足；所有源码、规格和共享依赖保持原样，lib来自同一份当前源码及已核实工具版本；没有新增依赖声明、改断言、扩展源码修复或跨包构建。原query报告记录的历史失败仍保留，最新环境证据在本文，不代改query或QA结论。

本轮 `git diff --check` exit 0；本文为untracked，已另行直接检查全部行无尾随空白、围栏成对、证据文件存在、test.exit=0、链接目标精确且根node_modules未创建，全部exit 0。辅助读取曾尝试不存在的`src/expert/sources.js`，返回not found；实际本地源解析位于已读`src/expert/install.js:71–104`，与依赖或测试故障无关。所有执行shell批次最终exit 0，没有安装失败或源码测试失败。

本树 `.dependency-validation/` 是执行证据/临时cache，不是依赖目录或安装产物：保留fingerprint脚本、before/after清单、383行test日志和退出码以供QA；临时fixture/home/cache可在QA核验后按任务所有权清理，不沿共享软链清理。不创建额外正式报告。验证未额外运行Stage门禁（客户端源码未改）、浏览器/L2、live或真实库存写操作；未提交/push/部署、未改官方或sharedprofile。

**交付下一步：主理人转独立QA，核查本文、唯一软链、同一当前源码下的typecheck/test证据、共享指纹与lib清单。依赖缺失这一静态验证前置阻塞已解除，独立QA本身尚未完成；T03新增依赖、运行接线、G-01–04能力条件及完整工坊验收仍是独立事项。**
