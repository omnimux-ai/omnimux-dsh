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

托管块里的扩展名必须排序且覆盖本仓代码类型（`md/ts/tsx/js/jsx/mjs/yml/yaml`），文件以换行结尾，这样重复索引同一目录时该块字节稳定，已跟踪文件不会被改脏——`ship` / `remove` 对脏工作树是 `die`，这里必须做到零 diff。实测：本工作树跑真实 `sag-worktree init` 后 `diff` 无差异。

行为用例均显式隔离 `OMNIMUX_SAG_INDEX` / `OMNIMUX_SAG_GC` / `SAG_WORKTREE_BIN`，开发机导出这些开关不会让正确实现变红。

**残留风险（已知、未消除）**：`sag-worktree gc` 仍按「记录路径的目录不存在」判定孤儿，卷未挂载或仓目录改名时可能误删活索引，因此默认关闭、只由 `OMNIMUX_SAG_GC=1` 显式触发。

**残留风险（已知、未消除）**：零 diff 依赖仓外工具 `sag-worktree` 写入的托管块。仓库测试锁住了扩展名顺序与 `file_types` / `convert_other_formats` 三个字段，把「工具升级后悄悄改写块」的概率压到最低，但无法在 CI 里证明外部工具的未来输出；一旦漂移，`.sagignore` 会变脏，而 `ship` / `remove` 对脏工作树是 `die`。届时按测试报错同步字段即可，不需要改代码。

托管块里的 `file_types.code=false` 是 SAG 自己的内部分类位，扩展名白名单才是实际范围；实测 `sag -F AppWorkspaceView` 命中 8 个文件（其中 3 个 `.ts/.tsx`，另 5 个是本任务新增的 spec/文档），语义检索可直接命中原生 `.tsx` 源码，说明代码确实进了索引。

### 2.2 工作树生命周期钩子（`scripts/worktree.sh`）

| 生命周期点 | 动作 |
| --- | --- |
| `cmd_ship` 删除工作树后 | `sag-worktree remove <worktree>` |
| `cmd_remove` 删除工作树后 | 同上 |
| `clean_one` 批量清理后 | 同上 |
| `cmd_prune` / `cmd_clean` 结束且 `OMNIMUX_SAG_GC=1` | `sag-worktree gc` 回收孤儿索引 |

四条硬性要求：

- **不在建树时同步索引**：初次索引要处理近八千个文件，同步建树会把 `worktree.sh new` 卡住几分钟；索引由 `sag-worktree search` 首次检索时惰性建立。
- **永不直接写共享知识库**：脚本里不出现裸 `sag add` / `sag remove`，避免把工作树并进用户主库后被父根吸收、变成不可检索的 `excluded`。
- **best-effort**：本机没有 `sag-worktree` 就静默跳过；清理失败只打印一行警告，绝不 `die`、不改退出码、不阻断建树与交付（[product baseline](../docs/contracts/product-baseline.md)：开发机专有能力不能成为默认路径或失败源）。
- **孤儿回收默认关闭**：`sag-worktree gc` 会跨本机所有工作树删除索引目录，属全局不可逆动作，交付收尾不该顺手动到别的任务；只在 `OMNIMUX_SAG_GC=1` 时执行。
- `OMNIMUX_SAG_INDEX=0` 可整机关闭，`SAG_WORKTREE_BIN` 可指定可执行文件。

### 2.3 个人工具 `~/.local/bin/sag-worktree`（仓外，随本任务一并修正）

该脚本不在本仓版本库内，但本变更依赖它的两个行为，已在用户授权下修改：

1. `remove` 原本会删掉带托管块的 `.sagignore`；该文件入库后就是「删除已跟踪文件」，把工作树弄脏。改为**只删未跟踪的那份**。
2. `TYPES` 补上 `mjs`、`yml`（本仓有 1241 个 `.mjs`），并支持 `SAG_WORKTREE_TYPES` 覆盖。
3. 数据目录只按 basename 命名：`remove` 先核对 `worktree.path` 归属，不匹配时以**退出码 2** 跳过（本仓按「跳过」而不是「已清理」播报，避免假成功）；`init` 遇到同名不同路径直接拒绝，防止覆盖别人的归属记录。

这两处不写入本仓，PR 内记录为外部依赖说明；仓库侧不假设该脚本一定存在。

## 3. 验收标准

| # | 场景 | 预期 |
| --- | --- | --- |
| 1 | `worktree.sh ship` 删除工作树 | 删除后调用 `sag-worktree remove <绝对路径>` |
| 2 | `worktree.sh remove --abandon` | 同上 |
| 3 | `worktree.sh clean` 批量删除 | 每个被删工作树都清理；`OMNIMUX_SAG_GC=1` 时在批量清理之后回收孤儿索引 |
| 4 | `worktree.sh prune` / `clean` 且 `OMNIMUX_SAG_GC=1` | 在删完记录/批量清理**之后**调用 `sag-worktree gc` |
| 5 | 本机没有 `sag-worktree` | 建树与交付照常，退出码不变，无任何 SAG 输出（`worktree-delivery.test.mjs` 已有行为用例） |
| 6 | `OMNIMUX_SAG_INDEX=0`，或未设 `OMNIMUX_SAG_GC=1` | 前者完全不调用该工具；后者不触发全局 `gc` |
| 7 | `sag-worktree remove` 失败 | 交付照常完成，`stderr` 出现一行 `SAG 索引清理失败` 警告 |
| 8 | 建树 | 不触发任何索引动作 |
| 9 | `.sagignore` | 托管块 JSON 可解析、扩展名有序且含代码类型、源码目录未被排除 |
| 10 | 真实索引 | 任务工作树 `sag-worktree init` 后 `status` 报 `index_ready: true`，且一次语义检索返回真实代码片段 |

## 4. 假设

1. 假设 `sag-worktree` 的隔离知识库（`SAG_DATA_DIR`）与用户共享库互不影响，清理工作树索引时停掉的是该工作树自己的服务进程。
2. 假设 `sag-worktree remove` 对已经被删除的目录路径仍然有效（它只按路径推导数据目录），因此可以在 `git worktree remove` 之后再调用。
3. 假设开发者机器上可能根本没有安装 `sag` / `sag-worktree`；缺工具时必须静默降级而不是报错。

## 5. 证伪方式

1. 用桩可执行文件冒充 `sag-worktree`（记录 argv），在临时 git 仓里真实执行 `new` / `remove` / `prune` / `clean`：实测 `new` 记录为空、`remove` 记录 `remove <绝对路径>`、`prune` 记录 `gc`、`OMNIMUX_SAG_INDEX=0` 记录为空、PATH 去掉桩后 `new` 仍 exit 0 —— 若钩子阻塞交付，该断言立刻变红。
   仓库内已可复现的部分：`scripts/worktree-delivery.test.mjs` 新增用例用桩 `sag-worktree` 跑真实 `worktree.sh ship`，断言删除后恰好调用一次 `remove <该工作树>`，且不碰无关工作树；把 `cmd_ship` 的清理调用删掉该用例即变红。
   其余路径同样有仓库内行为用例（都落在既有文件 `scripts/worktree-delivery.test.mjs` 里，因此不受「新增测试文件不得导入 `node:child_process`」的限制）：`remove` 清理、`clean` 批量清理后回收孤儿、`prune` 开关生效与否、失败与跳过三态输出、以及本机缺工具时交付照常。行为用例显式隔离 `OMNIMUX_SAG_INDEX` / `OMNIMUX_SAG_GC` / `SAG_WORKTREE_BIN`，开发机导出这些开关不会让正确实现变红。
2. 把 `cmd_ship` 里的 `sag_forget_worktree` 调用删掉，第 1 条断言必须变红；把 `OMNIMUX_SAG_INDEX` 判断删掉，第 6 条断言必须变红；把 `cmd_new` 里重新塞回索引调用，第 8 条断言必须变红。
3. 真实索引不接受「命令执行成功」作为证据：必须在任务工作树里 `sag-worktree init` 后看到 `index_ready: true` 与非空 `indexed_files`，并跑一次语义检索拿到真实代码片段。

## 6. 文档影响

`docs/contracts/plugin-qa.md` 的「工作树测试配置准备」一节补一句：工作树索引由 `sag-worktree` 惰性建立、随工作树删除自动清理，缺该工具时静默跳过；主检出不索引 `.worktrees/`。其余契约不受影响，无 App 物化与浏览器验收需求。

## 旧标准变更

本任务在实施中替换了自己写下的断言（先按共享库多根写、后改为隔离库；评审后又收紧告警与顺序断言）。按写前门禁要求逐条声明如下。

注意：这些声明只被写前门禁消费。新增测试文件在 CI 侧 `scripts/verify-test-standard-declarations.mjs` 里因 `change.before === null` 被直接跳过，因此 `scripts/worktree-sag-index.test.mjs` 的用例名不参与 CI 复核；它不声称存在更早的合入基线。

- `scripts/worktree-delivery.test.mjs` :: `ship 删除工作树后清理该工作树的 SAG 隔离索引（Issue #4060）`

原断言：直接用 `join(repo, '.worktrees/sag-feature')` 与桩记录的 argv 全等比较；必须改的理由：macOS 上 `tmpdir` 给 `/var/...` 软链，而 `worktree.sh` 用 git 解析出 `/private/var/...` 真路径，全等比较在正确实现上也会失败；新期望证据：按 `/.worktrees/sag-feature` 后缀匹配且恰好一次，同时断言没有清理无关工作树。

- `scripts/worktree-sag-index.test.mjs` :: `收尾失败不影响交付`

原断言：清理与回收失败分支都用 `|| return 0` 静默，且 `gc` 开关只要求出现过 `OMNIMUX_SAG_GC` 字样；必须改的理由：首轮评审指出 AC7 的「失败一行警告」没实现，二轮评审指出开关断言可被注释满足（恒绿）；新期望证据：断言 `sag_forget_worktree` 与 `sag_collect_orphans` 都有 `echo ... >&2` 告警，且 `[ "${OMNIMUX_SAG_GC:-0}" = "1" ] || return 0` 这一行真实存在。

- `scripts/worktree-sag-index.test.mjs` :: `prune 与 clean 结束时回收孤儿索引`

原断言：只断言 `sag_collect_orphans` 出现在两个函数里，并把 `cmd_prune` 锚点取为裸子串 `git worktree prune`；必须改的理由：把调用挪到清理循环之前仍绿（测不出 AC3 顺序），而裸子串会被同函数的 `say "git worktree prune"` 命中，删掉真命令仍绿；新期望证据：用 `\n  git worktree prune\n` 行级锚点，并断言 gc 在真命令与最后一次 `clean_one` 之后。

- `scripts/worktree-sag-index.test.mjs` :: `带 SAG 托管块且扩展名覆盖本仓代码类型`

原断言：扩展名只做「包含必需项 + 已排序」的超集检查；必须改的理由：评审指出工具新增一个扩展名时本断言仍绿，但托管块已被改写、`.sagignore` 会变脏并让 `ship`/`remove` 的脏树检查 `die`；新期望证据：与工具当前输出精确相等（顺序敏感），工具变更新增扩展名时测试必须变红并要求同步。
