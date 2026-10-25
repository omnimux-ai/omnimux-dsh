# 验收检查的「环境红」清扫

## 背景

上一条修的是「同步策略检查因网络抖动偶发变红」。同类问题可能还藏在别的验收检查里——**检查因为跟它要验的东西无关的原因变红**，久了大家就会习惯性忽略红灯，而假交付正藏在这种缝隙里。

所以把 `pnpm test:gates` 的验收面（约 37 个直接文件 + 一层嵌套）按六类逐个扫一遍。

## 扫描方式

不是靠读代码猜，而是**静态分类 + 逐条实测**：

1. 静态列出候选：可能联网的（跑 corepack/npm/pnpm/npx）、重定向用户目录的、依赖本机绝对路径的、要求外部环境变量的、起服务占端口的、跑 git 远端命令的。
2. 对每个候选做**对抗性实测**：把网络掐死（代理指向死端口）或把缓存清空，看它是否变红。
3. 与「干净 `origin/main` 上本来就红」区分开——那是既有问题，不是本次引入。

## 结论

**完整验收面 = 36 个直接测试文件 + 17 个嵌套测试文件 = 53 个**（`test:gates` 直接列出的，加上 `verify-ci-gates.test.mjs` 嵌套跑的那一层）。

| 类别 | 命中文件 | 判定 |
| --- | --- | --- |
| 可能联网（corepack） | `sync-release-policy`、`sync-targets`、`sync-source-identity`、`sync-repeat-install` | 前两条已修；`sync-source-identity` 的 `sync-stable.sh` 被 stub、`--skip-build` 跳过构建，压根不碰 corepack（死代理下 15/15）；`sync-repeat-install` **是缺陷，已修**（见下） |
| 重定向用户目录 | `sync-release-policy`、`sync-targets`、`sync-refresh-scope`、`sync-repeat-install`、`sync-source-identity`、`sync-plugin-scope`、`guard-worktree.qa`、`managed-tarball`、`resolve-omnimux-profile` | 后三个逐个实测：都不引用 corepack，也不因此变红 |
| 依赖本机绝对路径 | `guard-worktree`、`simulate-multi-agent-lifecycle`、`sync-targets`、`test-env-root-diagnosis`、`verify-product-baseline`、`worktree-app-qa-task`、`worktree-app-qa`、`worktree-delivery` | 全部只是 fixture 写死路径，没有一个**要求**某台机器上的路径存在 |
| 要求外部环境变量 | `evidence-contract`、`guard-quality-loop`、`managed-tarball-transaction`（+ preload 本身） | 由 `test:gates` 自带的 preload 满足；只有报 `EVIDENCE_FIXTURE_ENV_REQUIRED` 时才可判为前置条件问题 |
| 起服务/占端口 | `dev-replay`、`evidence-contract`、`guard-quality-loop`、`import-gxgen-inspirations`、`managed-tarball-t02.qa`、`materialize-cache`、`style-dom-probe`、`task-runtime-install` | 全验收面只有 `verify-dev-smoke` 真绑端口，且是 `listen(0, '127.0.0.1')` 随机端口，无占用风险 |
| git 远端/网络命令 | `worktree-delivery`（另 `auto-pipeline`、`ci-verdict`、`git-wt`、`qa-label` 只把 `gh` 当字符串 fixture） | 死代理下 `worktree-delivery` 34/34、`qa-label` 5/5、`ci-verdict` 10/10——用的是本地临时远端 |

**验收面里只发现一个真缺陷**（`sync-repeat-install`，见下），其余同类项均不成立。另有三项对抗性实测一并通过：`guard-worktree.qa` 17/17、`resolve-omnimux-profile` 6/6、`managed-tarball` 44/44。

## 变更点

扫描过程中发现**两个真实缺陷**：

- `scripts/sync-repeat-install.test.mjs`（**在 `test:gates` 里**）：它同时关掉 corepack 联网、又把缓存位置回落到 `$HOME/.cache/node/corepack`。缓存一旦落空（缓存不在，或 corepack 认的是别的 `XDG_CACHE_HOME`），用例就 **4/4 必红**，报的还是「网络被禁用」——而它验的是「重复 install 幂等」。这正是本次新写进契约的那条反模式，**却是我在扫描里判成「本来就对」的那一个**，由独立复核实测抓出。改为保留联网，缺缓存时自行补齐；实测空缓存 4/4、正常 4/4。
- `scripts/managed-tarball.test.mjs`：**在 macOS 上 14/44 必红，与网络无关**。它用系统临时目录建 scratch 目录，而 macOS 的 `/var` 是指向 `/private/var` 的符号链接；归档/物化脚本里的 `assertPath` 会（**正确地**）以 `symlink ancestor` 拒绝任何带符号链接祖先的路径——那是防越权检查。**该改的是测试自己别把符号链接路径喂进去**，而不是放宽那道检查。改为 `realpathSync(tmpdir())`，Linux 上是空操作。附带效果：该文件里那条「符号链接输入与解包祖先被拒」的用例**改前其实是假绿**（scratch 自身的 `/var` 祖先先触发），改后才真正测到它本意。
- `docs/contracts/plugin-qa.md`：把四类「环境红」写进「本机门禁前置条件」旁边的对照表，区分「偶发」与「确定」两种变体，并把「裸跑红可忽略」严格限定到 `EVIDENCE_FIXTURE_ENV_REQUIRED`。


## 假设

- 假设 1：macOS 上 `tmpdir()` 返回的路径含符号链接祖先（`/var` → `/private/var`）。依据：报错正是 `assertPath` 抛的 `symlink ancestor`，且只在 macOS 上出现。
- 假设 2：那 14 条失败同源，都来自同一个 scratch 目录。依据：全文件只有一处建临时目录，报错出现 17 次。
- 假设 3：`materialize-cache` 一类的红不是缺陷。依据：它的用例名与内容都是「先真装公共包、再验离线迁移」，联网是它的设计前提；且它不在 `test:gates` 执行链里。

## 证伪方式

对每一类都用对抗性条件实测，而不是看代码推断：

- 网络类：代理指向死端口（`127.0.0.1:1`），逐个跑候选文件。
- 缓存类：`COREPACK_HOME` 指向空目录。
- 平台类：直接在 macOS 上跑（本来就是这个环境），再与「改动前」对比。

若某个文件在对抗条件下变红，它就是同类缺陷；修复后再跑同一条件应变绿。

## 实测结果

| 检查 | 结果 |
| --- | --- |
| `managed-tarball`（macOS，改前 → 改后） | 30/44 → **44/44** |
| 死代理下 `worktree-delivery` / `qa-label` / `ci-verdict` | 34/34、5/5、10/10 |
| 死代理下 `guard-worktree.qa` / `resolve-omnimux-profile` | 17/17、6/6 |
| 无网络下 `evidence-contract` | 6/7，红的那条是 `EVIDENCE_FIXTURE_ENV_REQUIRED`——走 `test:gates` 即满足，与网络无关 |
| 空缓存 + 有网络下 `sync-repeat-install`（改前 → 改后） | 4/4 红 → **4/4 绿** |
| 完整验收面 53 个文件在死代理下（独立复核跑的） | **全绿** |
| `pnpm test:gates` | **485/485 全绿** |

## 已知边界

- `materialize-cache.test.mjs`、`managed-tarball-preparation.test.mjs` 在无网络时会红，**未修**：它们的联网是设计前提（先真装公共包、再验离线迁移），不在 `test:gates` 执行链里，修法要么造假、要么改变它们验的东西。已在契约里记录，避免误判。
- `sync-refresh-scope.test.mjs` 不在 `test:gates` 执行链里；上一轮对它的修补属同类正确性修补，不计入验收面的修复数量。
- 本次只扫 `scripts/*.test.mjs` 这一层（`test:gates` 的实际验收面）。`tests/e2e/`、插件包内测试、Python 侧未扫。
- 端口类只做了逐条实测，没有做「端口被占用」的对抗条件；这一类若将来出问题，现象会是绑定失败而非偶发红。

## 新产品基线

无影响：只改测试与文档。
