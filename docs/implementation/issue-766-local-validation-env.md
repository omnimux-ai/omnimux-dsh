# #766 独立本地验证环境恢复

## 结论

**部分恢复：jsdom / pngjs 依赖解析已解除；pnpm filter 默认隐式安装仍阻塞。完整环境 IS_PASS: NO。** 本报告不证明 Stage、完整 gates、全包业务、L2 或 Dev 可用。

- 唯一写树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-storage-766`（下称 TASK）；主树 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`（下称 MAIN），仅只读消费其受管普通依赖。
- HEAD 前后：`5485c25875cb9f71d7cb78a6aa69d07e07fffbab`，branch `agent/assets-storage-issue-766`。业务96/供应102的既有并行改动保留，未把全树脏状态归因于本任务。
- 写入仅本报告、TASK 根 `node_modules` 和 `plugins/omnimux/node_modules` 两个此前不存在的本地普通目录及下列5条链接。没有覆盖/删除既有内容；一次解析探针仅在本次新建 node_modules 内生成并清理自身目录。
- 未修改任何源码、package/lock/manifest、scripts/tests、其他工程报告；未网络安装、伪造安装状态、创建仓外 personal、修改外部 kit、官方 DSH、主树或共享 Dev/Prod；未另调成员、commit/push/部署、L2 start。
- 已全文读取本树 AGENTS、issue-766-assets-storage.md（70行）、issue-766-pagination.md（61行），加载 worktree-ops、omnimux-repo-workflow 与 Git/PR 合同；用户本次更窄白名单优先于技能的通用安装/交付建议。

## 历史错误与本次归因

1. 历史 Stage 审计10个组件后 `Cannot find module 'jsdom'`。`scripts/live-stage-contracts.mjs:39–42` 从 TASK hub package 创建 require；TASK hub 原无 node_modules，主树根没有顶层 jsdom，因此失败。主树 hub 已受管安装 jsdom 30.0.1。
2. 历史 ego-live-qa 12项中10项因 `ERR_MODULE_NOT_FOUND: pngjs` 失败。`scripts/ego-qa-test-helpers.mjs:66` 给临时夹具链接 `process.cwd()/node_modules`；TASK 根该目录原不存在，链接悬空。TASK 根直接 require pngjs 原能沿祖先目录解析主树，不等于夹具解析成功。
3. 历史 `pnpm --filter omnimux-assets test` 自动安装，worktree 的相对 `file:../../../../personal/dsh-ui-kit` 落到不存在目录；入口exit1/底层254。本次不重演 install。已核对 pnpm 11.7.0实现：默认 `verify-deps-before-run = install`（缓存源码dist/pnpm.mjs:145943）；安装状态缺失返回 `Cannot check whether dependencies are outdated`（193688–193695）；`error`模式抛错而非安装（246821–246866）。仅补普通依赖链接不能构造真实完整安装状态。

## 锁与实际共享链接

TASK/MAIN根 package完全相同，TASK lock、MAIN lock及MAIN已安装 `.pnpm/lock.yaml` 字节完全相同。YAML解析核对 `.`, `plugins/omnimux`, `plugins/omnimux-assets` importers，以及下列五种版本的package resolution/snapshot全部一致；不是仅比较版本字符串。

本次全部链接此前不存在，链接值和realpath均为表内绝对目标；直接指向已安装普通包，未链接外部 kit，未共享可写安装状态文件。

| TASK内链接路径 | 实际目标（MAIN相对路径） | 实际版本 |
| --- | --- | --- |
| `node_modules/acorn` | `node_modules/.pnpm/acorn@8.15.0/node_modules/acorn` | 8.15.0 |
| `node_modules/esbuild` | `node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild` | 0.28.2 |
| `node_modules/pngjs` | `node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs` | 7.0.0 |
| `plugins/omnimux/node_modules/jsdom` | `node_modules/.pnpm/jsdom@30.0.1/node_modules/jsdom` | 30.0.1 |
| `plugins/omnimux/node_modules/esbuild` | `node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild` | 0.25.12 |

根esbuild和hub esbuild分别遵循各自lock importer，不混用版本。包内传递依赖沿MAIN pnpm真实图只读解析，JSDOM实例及esbuild实际执行已验证。

**原有链接保留**：`TASK/plugins/omnimux-assets/node_modules -> MAIN/plugins/omnimux-assets/node_modules`。该链接指向真实目录，内含`.bin`、`@deepseek-ai`、dsh-ui-kit、esbuild、react、react-dom；未在其中新增任何文件，也未删除或替换它。

“只读共享”是本任务使用约束：仅解析/执行，未chmod共享源；symlink本身不是操作系统只读挂载，后续工程不可对它执行install或写入。

## 前后指纹

SHA-256，以下均前后相同：

| 对象 | SHA-256 |
| --- | --- |
| TASK/MAIN根package.json | `1e76a2e20459ff2edddc1061c8ab822bb53450517ca312ed7e9b87dc8da48a9d` |
| TASK/MAIN pnpm-lock.yaml、MAIN/node_modules/.pnpm/lock.yaml | `afd653587637df508a1d682d612658a8dbb65d11db0b63f0cb44044fdb138867` |
| MAIN/node_modules/.modules.yaml | `ca09bc84abe5c7849098d581886fa1b9d346c61a1b07f0d9570f074392b9a235` |
| acorn包树（10文件） | `44d25afa6fdda063ad40f0eea9bf119540167cf2b83163c4ee3391654f36b9eb` |
| 根esbuild包树（7文件） | `0f22b54222ee4b6fcc8537ccf1f7c3344ac0bcbc3ca4011f07f381098c8923b4` |
| pngjs包树（27文件） | `992458b1f5dda1d6cba160e25d1b06fd0c0c4575f8795be4ee1e98ed95ac3e96` |
| jsdom包树（658文件） | `44b6f5002a2d6caa3c27ecfa8f7d228d1146c4cbccd63b7278fcef2b4c150b96` |
| hub esbuild包树（7文件） | `594bd2edeb07f44fe9fc2d41cbed881a86e6008df3ede2cd1d194b45daf3229a` |

包树指纹算法：每层目录名以JS localeCompare排序；依次hash相对路径、NUL、lstat.mode、NUL；链接hash readlink字节但不递归其目标，目录递归，普通文件hash全内容。包树包含权限模式，忽略atime/mtime；不声称已哈希所有传递依赖或整台机器。TASK pnpm-workspace.yaml当前SHA `dfd0860608ca74e37202d46f11b225f95b3ae1e9852767dfe9d9429bf67c5e6d`，git diff证实未改。

## 命令与实际结果

均TASK cwd；Node/Corepack来自现有同一安装 `/Users/x/.nvm/versions/node/v25.8.0/bin/`：node v25.8.0、corepack 0.34.7，corepack真实目标为该安装内 `lib/node_modules/corepack/dist/corepack.js`。`COREPACK_ENABLE_NETWORK=0 corepack pnpm --version` 返回已缓存11.7.0，exit0。没有使用PATH中DSH Electron包装pnpm。

| 命令/探针 | 实际结果 | exit |
| --- | --- | --- |
| Node YAML解析比较三importer与五版本resolution/snapshot | 全部true | 0 |
| 只在缺失目录/链接落点创建5条symlink，逐个检查realpath | 五目标均MAIN/node_modules/.pnpm受管普通包 | 0 |
| Node createRequire按生产hub路径加载jsdom/esbuild | jsdom 30.0.1实例化DOM成功；esbuild 0.25.12 JSX transform成功 | 0 |
| root加载pngjs并解码原ego测试1×1 PNG，import生产live-stage-probe/ego-live-qa模块 | PNG width/height均1，生产模块import成功 | 0 |
| TASK/node_modules内探针复现fixture/node_modules→TASK/node_modules链接布局 | fixture createRequire解析pngjs 7.0.0到真实pnpm包；清理仅自身探针 | 0 |
| `node --test scripts/ego-browser-page.test.mjs` | **6/6，0 fail/cancel/skip，52.650334ms** | **0** |
| `COREPACK_ENABLE_NETWORK=0 pnpm_config_verify_deps_before_run=error /Users/x/.nvm/versions/node/v25.8.0/bin/corepack pnpm --filter omnimux-assets exec node --version` | **ERR_PNPM_VERIFY_DEPS_BEFORE_RUN: Cannot check whether dependencies are outdated**；未进入子命令，未install | **1** |
| 前后包树/锁/元数据指纹复核 | 表内均一致，原assets node_modules链接未变 | 0 |
| `git diff --exit-code -- scripts package.json pnpm-lock.yaml pnpm-workspace.yaml` | 无差异 | 0 |
| `git diff --check` | 通过 | 0 |

初始只读ls有预期exit1（缺root node_modules/jsdom/.npmrc）；已逐项观测确认缺失，不作为测试失败。首次查询pnpm.cjs不存在，改为发现缓存中的pnpm.mjs读取；未创建或安装工具。

## 未执行检查的安全判定

- **完整Stage未跑**：`live-stage-contracts.mjs:116–120`市场分支会执行concat-client并写 `plugins/omnimux-market/lib/client.js`，超出本次仅node_modules+报告白名单；Stage也实际加载正在变化的业务入口。没有删掉market或只选其他Stage冒充完整通过。
- **完整test:gates / verify-ci-gates未跑**：后者调用sync-targets、sync-release-policy，前者现有测试会调用真实sync/install链。`sync-targets.test.mjs:325,332,440,454`等虽用fake HOME，但仍触发安装/物化，不能在本授权内执行。也不对之前19条失败给出新的整体归因。
- **ego-live-qa整文件未跑**：`ego-task-lock.mjs:5–18`硬编码 `/tmp/omnimux-ego-<uid>/...`，测试还显式修改该锁；本次唯一写树限制不允许这些仓外写入。没有改测试、猴补fs、改计数或使用name-pattern跳过用例来制造通过。
- **仅执行既有无写盘adapter整文件**：ego-browser-page及live-browser-utils已完整读取，6项均为内存helpers，不连接真实浏览器、不创建profile、不触发sync。
- 全包业务、真实L2/ego/原生picker/Dev验收留待主理人统一安排；#778未被本任务修复，未重复start。

## 剩余限制与下一责任人

1. **pnpm filter未解除**：本地开发链接有包但无真实task安装状态；主树 `.pnpm-workspace-state-v1.json`含主树绝对项目路径，直接共享也会因task目录结构不同失败；本任务没有复制/篡改状态文件、timestamp或关闭依赖检查。真正恢复原样pnpm入口需要合法任务安装布局及有效相对file kit来源，当前禁install/禁package-lock修改/禁仓外路径条件下不强行构造。
2. 当前安全证据只覆盖依赖加载及6项adapter测试。主理人可在业务96/供应102完成后统一规划全包及门禁：先处理合法task安装状态，确认测试允许写入的隔离临时目录与Stage生成物范围，再执行原脚本，不以本报告替代测试。
3. 后续任何pnpm操作保持成对Node/Corepack，并使用 `pnpm_config_verify_deps_before_run=error` 让未准备完整的布局失败关闭；这是防意外安装，不是验证通过或绕过依赖检查。不可直接运行默认install模式到现有共享assets node_modules链接。

本任务可交接依赖解析修复；完整本地验证环境尚不可判完成，Issue #766不可据此关闭。
