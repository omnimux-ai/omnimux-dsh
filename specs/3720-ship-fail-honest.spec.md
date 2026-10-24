# Spec: ship 物化失败不得宣告交付闭环（Issue #3720）

- Issue: #3720（#3700 / PR #3704 的后续；用户 2026-10-24 明确要求处理「假成功」）
- 风险级别: R2（`scripts/worktree.sh` 交付脚本的退出码语义与物化兜底）

## 1. 目标与用户结果

`worktree.sh ship` 在「PR 已合入、主干已同步、工作树已清理，但开发版没更新」时，**不能再让人或自动化以为交付完成**：退出码非零、横幅不出现闭环字样，并尽量自己把开发版补上（增量失败时退回一次完整同步）。

## 2. 现状与根因

- `cmd_ship` 在 `MATERIALIZE_STATUS=failed` 后直接结束 → 脚本返回 0（PR #3704 明确保留了这一点）。
- 失败路径横幅仍以「✅ 交付全链路闭环完成」开头，与 [plugin-git-pr](docs/contracts/plugin-git-pr.md) 的「不得把『已合并』写成『已交付』」冲突。
- 失败原因通常是 shared kit 漂移：单插件同步拒绝覆盖 shared kit，脚本给出的补救是「无参数完整同步」，但需要人再跑一次。

## 假设

- 合并、快进主干、清理工作树这些事实与物化结果彼此独立：物化失败不应回退已完成的合并与清理，但必须让「交付未闭环」这件事对调用方**机器可读**（退出码）且**文字诚实**（横幅）。
- 增量失败后退回完整同步是安全且幂等的：它只写 `~/.omnimux-dev`，不写正式版，且这正是脚本自己给出的补救命令；它只在增量已经失败后触发一次，不会成为常规路径。
- 退出码 3 与既有语义不冲突：`1` 表示硬失败（PR 不匹配、主检出脏、无法确定合并点等），`0` 表示交付闭环（含物化成功或无需物化）。

## 证伪方式

- 若失败路径仍返回 0：用一个「每次都失败」的假 `sync-to-app.sh` 跑 ship，`result.status` 会是 0 而不是 3。
- 若横幅仍在说谎：同一场景下 stdout 会出现「交付全链路闭环完成」或「开发版已物化」。
- 若兜底只跑完整同步：假 sync 的调用序会缺少最后那次**带插件参数**的重试（应为 `增量 → 完整 → 增量重试`），那样不在默认清单里的插件（studio/device/intercept）根本进不了开发版却报成功。
- 若兜底关不掉：设 `OMNIMUX_SHIP_NO_FULL_SYNC=1` 后，同一个假 sync 应只被调用一次（带插件参数）并判 failed。
- 若刷新 kit 后重试仍失败却报成功：桩在第二次调用成功、第三次失败时，`result.status` 必须是 3 且横幅不出现闭环字样。

## 3. 范围与设计

- `scripts/worktree.sh`
  - `auto_materialize_and_reload()`：增量同步失败时（且未设 `OMNIMUX_SHIP_NO_FULL_SYNC=1`、且调用方允许）先跑一次无参数完整同步**刷新 shared kit**，然后**重试本次插件**的增量同步；三步都成功才算 `ok` 并打印「刷新 shared kit 后重试成功」。只跑完整同步会漏掉不在默认清单里的插件，所以必须有最后那次带参数的重试。kit 刷新属于宿主侧变更 → 强制受控重启。
  - 兜底只对 `ship` 开启：`remove` 是清理动作，不做额外全量同步与重启（保持原行为）。
  - `cmd_ship()`：失败路径横幅改为「⚠️ 交付未闭环：… 但开发版未更新」+ 补救命令 + `exit 3`；成功路径横幅保持「✅ 交付全链路闭环完成」。`--keep-worktree` 路径同样在失败时打印「交付未闭环」并退出 3。
  - 缺少 `scripts/sync-to-app.sh`（外来/不完整检出）单独记为 `pipeline-absent`：横幅如实说开发版未更新，但不套用退出码 3——那个退出码的语义是「本仓交付管线已尝试且失败」。
- `docs/contracts/plugin-git-pr.md`：补一句退出码与兜底语义（同一句既有约定里扩展，不新开段落）。
- `scripts/worktree-delivery.test.mjs`：更新两条既有用例的退出码断言，并新增兜底相关用例。

## 4. 非目标

不改合并核对、主干快进与 worktree 清理语义；不改物化范围判定（`plugins/` 过滤规则）；不改 `sync-to-app.sh` 对 shared kit 的拒绝策略；不触碰正式版；不重构 ship 的其它分支。

## 旧标准变更

- `scripts/worktree-delivery.test.mjs` :: `ship 物化失败时横幅如实说明开发版未更新（Issue #3700）`
  - 原断言：`result.status === 0`（「合并已确认时 ship 仍应返回 0」），且要求 stdout 匹配 `/交付全链路闭环完成/i`。
  - 必须改的理由：#3704 只改了文案，退出码与「闭环完成」措辞仍是假成功；本任务按 [plugin-git-pr](docs/contracts/plugin-git-pr.md) 的既有约定把失败路径改成非零退出且不宣告闭环。用例名同步改为 `ship 物化失败时以退出码 3 结束且不宣告交付闭环（Issue #3720）`。
  - 新期望证据：`result.status === 3`；stdout 不匹配 `/交付全链路闭环完成/`，改为匹配 `/交付未闭环/`；保留 `/开发版未更新/`、`/materialize=failed/`、`/sync-to-app\.sh/`，并断言不出现 `/开发版已物化/`。
- `scripts/worktree-delivery.test.mjs` :: `ship 物化成功时横幅说明开发版已物化（Issue #3700）`
  - 原断言：`result.status === 0` + 成功文案。
  - 必须改的理由：同一组用例的退出码语义要与新约定一致（成功仍为 0），并明确成功路径不得出现未闭环字样。
  - 新期望证据：`result.status === 0`、`/交付全链路闭环完成/`、`/开发版已物化/`、`/materialize=ok/`，且不出现 `/交付未闭环/`。
- 夹具助手 `shipRepoWithSyncScript(label, syncScript)` → `(label, syncScript, extraEnv = {})`，并显式清掉 `OMNIMUX_SHIP_NO_FULL_SYNC`：开发机若导出该变量，兜底用例会假失败。**既有断言未改**。
- 新增三条用例（不改既有标准）：`ship 增量失败后刷新 shared kit 并重试本次插件（Issue #3720）`、`OMNIMUX_SHIP_NO_FULL_SYNC=1 时不刷新 shared kit，直接判失败（Issue #3720）`、`shared kit 刷新后本次插件仍失败时判失败并退出 3（Issue #3720）`。
- 动态生成用例（`worktree ship merged-pr*` 组，由 `for` 循环生成、用例名是模板字面量）**未改动**：`dynamic-test-options-needs-review` 不可声明放行，所以「缺少安装脚本」路径必须保持原退出码 0 与横幅措辞，实现改用 `pipeline-absent` 状态达成这一点。

## 5. 验收

1. `node --test scripts/worktree-delivery.test.mjs` 全绿（含新增兜底用例）。**已达成**：34/34。
2. `pnpm test:gates` 与干净 main 同名（本机 12 条环境项除外）。**已达成**：484 项 / 472 通过 / 12 失败，失败项为 `--dsh`、`--all` 目标选择与 9 条 `EVIDENCE_FIXTURE_ENV_REQUIRED`、agent presets、Alpha release materialization policy（均为本机环境项，与本次改动无关）。
3. 假 sync 场景实测（**已达成**，三条新用例）：
   - 增量失败 → 刷新 shared kit → 重试成功：退出 0、`materialize=ok`、日志含「增量物化失败」「刷新 shared kit」「重试成功」，调用序 `1 1 / 2 0 / 3 1`；
   - 每次都失败：退出 3、不出现「交付全链路闭环完成」、出现「交付未闭环」与补救命令、`materialize=failed`；
   - `OMNIMUX_SHIP_NO_FULL_SYNC=1`：只调用一次（带插件参数）、退出 3；
   - kit 刷新后重试仍失败：退出 3、明确区分「kit 已刷新」与「插件仍失败」。
4. `git diff` 落在 `scripts/worktree.sh`、`scripts/worktree-delivery.test.mjs`、`docs/contracts/plugin-git-pr.md`、`specs/`。

## 6. 新用户基线

只影响 Agent/维护者交付脚本的失败语义；终端用户可见行为不变。

## 7. 文档影响

`docs/contracts/plugin-git-pr.md` 一句话补充（退出码与兜底）。
