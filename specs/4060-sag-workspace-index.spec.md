# 规格说明：SAG 语义索引随任务工作树生命周期收尾（Issue #4060）

**文件：** `specs/4060-sag-workspace-index.spec.md` ｜ **优先级：** P1 ｜ **风险：** R1（触及 `scripts/`）

## 1. 背景与实测约束

本仓开发全部在 `<repo>/.worktrees/<task>` 中进行，主检出只是 `main` 的只读镜像。SAG（本地语义检索 CLI）在本工作区此前从未初始化（`sag check` 报 `coverage: none`）。

用隔离知识库（`SAG_DATA_DIR`，不改动用户共享库）实测出三条硬约束：

1. **父子根互斥**：先注册 worktree 根、再注册仓根，worktree 根会从列表消失，其路径变成 `excluded`。
2. **点开头目录扫描期硬跳过**：以仓根为根时，`.worktrees/`、`.agents/`、`.github/` 一律不进索引；`.sagignore` 里写 `!.worktrees/` 也救不回来（普通目录 `gen/` 写 `!gen/` 是能恢复的）。因此「主检出一根覆盖全部」在本仓物理上不可能。
3. **删目录后根不会自愈**：`sag list` 仍报 `ready` 与旧文件数，必须显式 `sag remove`，否则幽灵根累积。

结论：工作树不能并入共享知识库。采用**每工作树一份隔离知识库**（`SAG_DATA_DIR` 独立 + 独立服务），索引在第一次检索时惰性建立；本仓脚本只负责收尾时清理，避免孤儿索引占磁盘。

## 2. 方案

### 2.1 入库 `.sagignore`（仓根）

把检索范围写进版本库，主检出与每个工作树各取一份同样的规则。入库还解决一个真实坑：索引初始化会往被索引目录写 `.sagignore` 托管块，若该文件未入库，每个工作树都会多出一个未跟踪文件，`worktree.sh audit` 会把它当成「有未提交改动」而拒绝清理。

排除三类低价值内容：现场证据（`docs/evidence/`、`qa-evidence/`、`deliverables/`、`artifacts/`、`tests/e2e/*-evidence/`、`**/.browser-scratch/`）、构建派生文件（`**/harness/dist/`、`panel-browser-built.js`、`pnpm-lock.yaml`）、历史归档（`archive/`）。源码目录（`plugins/`、`packages/`、`scripts/`、`specs/`）一律保留。

托管块里的扩展名必须排序且覆盖本仓代码类型（`md/ts/tsx/js/jsx/mjs/yml/yaml`），这样重复索引同一目录时该块字节稳定，已跟踪文件不会被改脏。

### 2.2 工作树生命周期钩子（`scripts/worktree.sh`）

| 生命周期点 | 动作 |
| --- | --- |
| `cmd_ship` 删除工作树后 | `sag-worktree remove <worktree>` |
| `cmd_remove` 删除工作树后 | 同上 |
| `clean_one` 批量清理后 | 同上 |
| `cmd_prune` / `cmd_clean` 结束 | `sag-worktree gc` 回收孤儿索引 |

四条硬性要求：

- **不在建树时同步索引**：初次索引要处理近八千个文件，同步建树会把 `worktree.sh new` 卡住几分钟；索引由 `sag-worktree search` 首次检索时惰性建立。
- **永不直接写共享知识库**：脚本里不出现裸 `sag add` / `sag remove`，避免把工作树并进用户主库后被父根吸收、变成不可检索的 `excluded`。
- **best-effort**：本机没有 `sag-worktree` 就静默跳过；失败只打印警告，绝不 `die`、不改退出码、不阻断建树与交付（[product baseline](../../docs/contracts/product-baseline.md)：开发机专有能力不能成为默认路径或失败源）。
- `OMNIMUX_SAG_INDEX=0` 可整机关闭，`SAG_WORKTREE_BIN` 可指定可执行文件。

### 2.3 个人工具 `~/.local/bin/sag-worktree`（仓外，随本任务一并修正）

该脚本不在本仓版本库内，但本变更依赖它的两个行为，已在用户授权下修改：

1. `remove` 原本会删掉带托管块的 `.sagignore`；该文件入库后就是「删除已跟踪文件」，把工作树弄脏。改为**只删未跟踪的那份**。
2. `TYPES` 补上 `mjs`、`yml`（本仓有 1241 个 `.mjs`），并支持 `SAG_WORKTREE_TYPES` 覆盖。

这两处不写入本仓，PR 内记录为外部依赖说明；仓库侧不假设该脚本一定存在。

## 3. 验收标准

| # | 场景 | 预期 |
| --- | --- | --- |
| 1 | `worktree.sh ship` 删除工作树 | 删除后调用 `sag-worktree remove <绝对路径>` |
| 2 | `worktree.sh remove --abandon` | 同上 |
| 3 | `worktree.sh clean` 批量删除 | 每个被删工作树都清理，最后回收孤儿索引 |
| 4 | `worktree.sh prune` | 结束时调用 `sag-worktree gc` |
| 5 | 本机没有 `sag-worktree` | 建树与交付照常，退出码不变，无输出 |
| 6 | `OMNIMUX_SAG_INDEX=0` | 完全不调用该工具 |
| 7 | `sag-worktree remove` 失败 | 交付照常完成，只打印一行警告 |
| 8 | 建树 | 不触发任何索引动作 |
| 9 | `.sagignore` | 托管块 JSON 可解析、扩展名有序且含代码类型、源码目录未被排除 |
| 10 | 真实索引 | 任务工作树 `sag-worktree init` 后 `status` 报 `index_ready: true`，且一次语义检索返回真实代码片段 |

## 假设

1. 假设 `sag-worktree` 的隔离知识库（`SAG_DATA_DIR`）与用户共享库互不影响，清理工作树索引时停掉的是该工作树自己的服务进程。
2. 假设 `sag-worktree remove` 对已经被删除的目录路径仍然有效（它只按路径推导数据目录），因此可以在 `git worktree remove` 之后再调用。
3. 假设开发者机器上可能根本没有安装 `sag` / `sag-worktree`；缺工具时必须静默降级而不是报错。

## 证伪方式

1. 用桩可执行文件冒充 `sag-worktree`（记录 argv），在临时 git 仓里真实执行 `ship` / `remove` / `clean` / `prune`，断言调用序列与路径；把 PATH 里的桩去掉再跑一次，断言退出码仍为 0 —— 若钩子阻塞交付，该断言立刻变红。
2. 把 `cmd_ship` 里的 `sag_forget_worktree` 调用删掉，第 1 条断言必须变红；把 `OMNIMUX_SAG_INDEX` 判断删掉，第 6 条断言必须变红；把 `cmd_new` 里重新塞回索引调用，第 8 条断言必须变红。
3. 真实索引不接受「命令执行成功」作为证据：必须在任务工作树里 `sag-worktree init` 后看到 `index_ready: true` 与非空 `indexed_files`，并跑一次语义检索拿到真实代码片段。

## 6. 文档影响

`docs/contracts/plugin-qa.md` 的「工作树测试配置准备」一节补一句：工作树索引由 `sag-worktree` 惰性建立、随工作树删除自动清理，缺该工具时静默跳过；主检出不索引 `.worktrees/`。其余契约不受影响，无 App 物化与浏览器验收需求。

## 旧标准变更

本任务第一版把钩子写成「建树时登记共享库索引根」，在确认以隔离库为真源后改为「只在删除时清理」。测试文件 `scripts/worktree-sag-index.test.mjs` 是本任务新建、尚未合入任何基线，但已被写前门禁记录，故按门禁要求逐条声明：

- `scripts/worktree-sag-index.test.mjs` :: `SAG 索引随工作树生命周期登记与清理 (#4060)`

原断言：describe 分组按「登记与清理」组织；必须改的理由：方案从共享库多根切换为隔离库，用例已按「删除时清理 / best-effort / .sagignore」重组；新期望证据：`node --test scripts/worktree-sag-index.test.mjs` 三组全绿。

- `scripts/worktree-sag-index.test.mjs` :: `new 在建成工作树之后登记索引根`

原断言：`cmd_new` 必须调用 `sag_index_worktree`；必须改的理由：建树同步索引会把交付卡几分钟，改为惰性建立；新期望证据：反向断言 `cmd_new` 不含任何索引调用。

- `scripts/worktree-sag-index.test.mjs` :: `ship 删除工作树之后清理索引根`

原断言：`ship` 删除后调用 `sag forget`；必须改的理由：改为隔离库清理；新期望证据：`sag_forget_worktree` 出现在 `git worktree remove --force` 之后。

- `scripts/worktree-sag-index.test.mjs` :: `remove 与 clean 同样清理索引根`

原断言：同名断言作用于共享库清理；必须改的理由：同上方案切换；新期望证据：`cmd_remove` 与 `clean_one` 都在删除工作树后调用清理。

- `scripts/worktree-sag-index.test.mjs` :: `不把主检出注册成根，缺 .sagignore 时跳过`

原断言：登记前检查主根与 `.sagignore`；必须改的理由：隔离库没有「根」概念，风险变成「误写共享库」；新期望证据：源码不出现裸 `sag add`/`sag remove`，且 prune/clean 调用 `sag_collect_orphans`。

- `scripts/worktree-sag-index.test.mjs` :: `带 SAG 托管块且扩展名覆盖代码类型`

原断言：托管块含八类扩展名；必须改的理由：托管块改由 `sag-worktree` 的 TYPES 生成，需与之一致；新期望证据：块内扩展名排序且覆盖 `md/ts/tsx/js/jsx/mjs/yml/yaml`。

- `scripts/worktree-sag-index.test.mjs` :: `登记与清理都是 best-effort，不阻断建树与交付`

原断言：两个辅助函数都不 `die`；必须改的理由：函数从「登记+清理」变为「清理+回收孤儿」；新期望证据：三个辅助函数都不 `die`、不改退出码，失败分支 `|| return 0`。

- `scripts/worktree-sag-index.test.mjs` :: `缺少 sag 可执行文件时静默跳过，并支持整机关闭与自定义可执行文件`

原断言对象是 `SAG_BIN`；必须改的理由：可执行文件改为 `sag-worktree`；新期望证据：探测 `command -v "${SAG_WORKTREE_BIN}"`、`OMNIMUX_SAG_INDEX=0`、`SAG_WORKTREE_BIN:-sag-worktree` 均存在。
