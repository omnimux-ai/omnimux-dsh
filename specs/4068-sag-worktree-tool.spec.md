# 规格说明：把工作树语义索引工具收进仓库（Issue #4068）

**文件：** `specs/4068-sag-worktree-tool.spec.md` ｜ **优先级：** P1 ｜ **风险：** R1（触及 `scripts/`、根 `package.json`）

## 1. 背景

#4060 已把「每个工作树持有隔离 SAG 知识库」的收尾钩子接进 `scripts/worktree.sh`，但索引工具本身仍住在开发机家目录（`~/.local/bin/sag-worktree`）。它有两个结构性缺陷，在 #4060 的独立评审里被实测出来：

1. **数据目录只按工作树文件夹名命名**：`~/…/worktrees/<basename>`。两个仓都叫 `publish-fix` 的任务会共用一份索引——后 `init` 的覆盖归属记录，先 `remove` 的删掉别人的索引。
2. **孤儿回收没有仓边界**：只按「记录路径不存在」判断，卷未挂载或仓目录改名时会误删活索引。

另外它不在版本库、不在 CI、不在评审范围里，行为只能靠口口相传。

## 2. 方案

### 2.1 新增 `scripts/sag-worktree.mjs`

Node CLI，子命令与旧脚本保持一致（`init` / `status` / `search` / `list` / `remove` / `gc`），核心判定抽成可单测的纯函数：

| 判定 | 规则 |
| --- | --- |
| 数据目录名 | `文件夹名-<工作树绝对路径 sha256 前 8 位>`，跨仓同名任务天然分开 |
| 归属 | 记录路径与请求路径一致才允许删；不一致 `mismatch`、无记录 `unrecorded`，两种都跳过 |
| 孤儿回收 | 只有「记录路径确实不存在 **且** 记录里的仓根等于当前仓根」才删；跨仓、跨卷、无记录一律不动 |
| 扩展名白名单 | 与入库 `.sagignore` 托管块精确一致，空设置退回默认 |

退出码契约（`worktree.sh` 依赖它区分播报）：`0` 成功、`2` 跳过（归属不符、无记录或用法错误）、`3` blocked（本机没有 `sag`，`init` 专用）。`worktree.sh` 对 `remove` 的映射是：`0` → 已清理、`2` → 跳过清理、`3` → 静默跳过（能力不存在，不是故障）、其他 → stderr 警告。

凭据处理：只读既有 SAG 配置与 `credentials.json`，经 stdin 传给隔离数据目录，不打印、不落进本仓、不写日志。

### 2.2 `scripts/worktree.sh` 解析顺序

`SAG_WORKTREE_BIN`（显式覆盖）→ 仓内 `scripts/sag-worktree.mjs` → `PATH` 里的 `sag-worktree`。命令用 bash 数组承载，避免拼接字符串带来的引号问题。家目录旧脚本仍可兜底，但不再是默认依赖。

### 2.3 文档

`docs/contracts/plugin-qa.md` 工作树测试准备一节：把「由开发机上的 `sag-worktree` 管理」改为「仓内 `scripts/sag-worktree.mjs`」，并写明数据目录命名与回收边界。

## 3. 验收标准

| # | 场景 | 预期 |
| --- | --- | --- |
| 1 | 两个仓下的同名工作树 | 数据目录名不同（路径哈希区分） |
| 2 | 归属不符 / 无记录 | 删除跳过，退出码 2，不报成功 |
| 3 | 记录路径消失但仓根不同 / 卷未挂载 / 无记录 | 回收一律不动 |
| 4 | 记录路径消失且仓根一致 | 回收删除该目录 |
| 5 | `SAG_WT_TYPES` 空值 | 退回默认白名单，且默认白名单与 `.sagignore` 托管块精确一致 |
| 6 | 既有 SAG 配置缺 url/model | `configArgs` 响亮抛错，不生成半套配置 |
| 7 | 归属记录 | 写入后可读回规范路径；空记录读成 null 而不是抛错 |
| 8 | `worktree.sh` 解析顺序 | 显式 `SAG_WORKTREE_BIN` 优先；未指定时优先仓内实现，其次 PATH；缺 `sag` 时交付照常、退出码不变 |
| 9 | 本机没有 `sag` | `init` 报 blocked（退出码 3）且不写任何记录（`worktree-delivery.test.mjs` 有端到端用例） |
| 10 | 配置缺失（`sag config` 无 url/model） | 整洁单行报错、退出码 1，且**不留下**归属记录 |
| 11 | 软链路径（如 `/tmp` → `/private/tmp`） | 目录被删前后哈希一致，索引不会变成永久孤儿；用例自建软链父目录，不依赖系统 tmpdir 是否含软链（Linux CI 同样能区分新旧实现） |
| 12 | `sag config --url` 失败且已建数据目录 | 回收该目录，下次 `init` 仍是配置失败而不是「归属不符」，保持可重试；但 `match`（已有合法索引）时的失败**不得**回收既有索引 |
| 13 | `search` 在无索引时 | 自动懒建索引（写入归属记录）后执行检索 |
| 14 | 缺少子命令参数 | 按用法错误退出 2，不抛 TypeError（`worktree-delivery.test.mjs` 有回归用例） |

## 4. 假设

1. 假设 `sag` 的隔离知识库行为（`SAG_DATA_DIR` + `sag add/check/remove/service`）与 #4060 实测一致，版本升级后行为变化由 `init` 的失败分支暴露，不静默降级。
2. 假设同一台机器上多个隔离知识库可以并存，各自独立服务进程与数据目录；本工具只操作自己派生出的那个目录。
3. 假设开发者可能没装 `sag`：此时必须报告 blocked 并保持工作树交付不受影响，而不是假成功。

## 5. 证伪方式

1. 纯函数层：`node --test scripts/sag-worktree.test.mjs` 覆盖命名、归属、回收、类型解析、记录往返。把 `dataDirName` 里的哈希去掉（退回按文件夹名命名），第 1 条断言必须变红。
2. 行为层：`scripts/worktree-delivery.test.mjs` 里用桩验证 `worktree.sh` 的解析顺序——把仓内实现排到 PATH 之后，或把 `SAG_WORKTREE_BIN` 挪到仓内实现之后，对应用例必须变红。
3. 真实层：在本任务工作树里跑 `node scripts/sag-worktree.mjs init .` 与一次 `search`，要求 `status` 报 `index_ready: true`、`indexed_files` 非 0，并返回真实代码片段；只跑通命令不算通过。

## 6. 文档影响

只改 `docs/contracts/plugin-qa.md` 的一节（把索引工具从开发机脚本改成仓内脚本，补命名与回收边界）；无 App 物化、无浏览器验收。

## 旧标准变更

本任务修改了 #4060 引入的既有断言（`scripts/worktree-sag-index.test.mjs` 的「缺工具时静默跳过，并支持整机关闭与自定义可执行文件」），因为默认依赖从家目录脚本改成仓内实现：

- `scripts/worktree-sag-index.test.mjs` :: `缺工具时静默跳过，并支持整机关闭与自定义可执行文件`

原断言：要求源码里出现 `SAG_WORKTREE_BIN:-sag-worktree`，即默认依赖家目录脚本；必须改的理由：默认依赖改成仓内 `scripts/sag-worktree.mjs`，旧断言会把「仍然默认依赖个人脚本」当成正确；新期望证据：断言解析顺序为「显式 `SAG_WORKTREE_BIN` → 仓内 mjs → PATH 里的 `sag-worktree`」，且 `OMNIMUX_SAG_INDEX=0` 仍可整机关闭。

- `scripts/worktree-delivery.test.mjs` :: `清理失败与「索引不属于该路径」必须给出不同输出（Issue #4060）`

原断言：用桩退出码 `3` 代表通用失败并期待 stderr 警告；必须改的理由：`3` 已被本任务征用为「本机没有 sag」的 blocked 语义（`worktree.sh` 对它静默跳过），继续用它当通用失败会把两种语义混在一起；新期望证据：通用失败改用退出码 `4` 并断言 stderr 出现「退出码 4」的警告，跳过分支（退出码 `2`）仍只播报「跳过清理」。

- `scripts/worktree-delivery.test.mjs` :: `清理失败与「索引不属于该路径」必须给出不同输出（Issue #4060）`

原断言：同上一条（退出码 `3` 当通用失败）；必须改的理由与证据见上，另加本轮新增的 init/blocked/无记录/gc 四条端到端用例一起覆盖 CLI 行为。

- `scripts/worktree-delivery.test.mjs` :: `配置缺失时 init 整洁报错且不留半套归属记录（Issue #4068）`

新增用例（无原断言可削弱），用于把验收 #10 从函数层升级到 CLI 层：断言退出码 1、stderr 出现 `cannot read Jev url/model` 且不含 Node 原始堆栈、`SAG_WT_HOME` 下不出现任何数据目录。

- `scripts/worktree-delivery.test.mjs` :: `配置命令失败时要回收已建的数据目录，保持可重试（Issue #4068）`

新增用例（无原断言可削弱），覆盖验收 #12：断言失败后 `SAG_WT_HOME` 为空、二次 `init` 仍以 1 结束且 stderr 不含 `refuse:`（即没有退化成需要手删的死态）。

- `scripts/worktree-delivery.test.mjs` :: `search 在没有索引时自动建库后执行检索（Issue #4068）`

新增用例（无原断言可削弱），覆盖验收 #13：断言起点无索引、`search` 后恰好生成一份带归属记录的隔离索引。

- `scripts/worktree-delivery.test.mjs` :: `已有合法索引时再 init 失败不能删掉既有索引（Issue #4068）`

新增用例（无原断言可削弱），覆盖验收 #12 的边界：先建出合法索引，再让配置失败后 `init`，断言数据目录与归属记录原样保留。

- `scripts/worktree-delivery.test.mjs` :: `缺少子命令参数按用法错误退出 2（Issue #4068）`

新增用例（无原断言可削弱），覆盖验收 #14：`init` / `status` / `remove` 缺参均退出 2、有 `usage:` 提示、不泄漏 `TypeError`。
