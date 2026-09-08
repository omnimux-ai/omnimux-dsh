# Issue #778 — 单包 tarball 纳管综合独立 QA 终审报告

## 1. 终审结论与核心判定

- **当前结论**：**IS_PASS: NO（本地实现与机制验证完全达标，但整体未具备直接关闭或跳过门禁合入条件）**
- **智能路由决策**：**Send To: 主理人（Coordinator）**
- **审查基线**：
  - 任务工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`
  - 固定 HEAD / Base：`580234923268673562cacb5cd01aebdb780339e1`
  - 工作树状态：包含全部 T01、T02、T03 及收敛修正确认的本地未提交 dirty 实现，未提交、未推送。
- **核心结论摘要**：
  1. **本地核心测试套件 100% 通过**：独立完整执行 managed-tarball 149 项全量测试、sync 系列 45 项测试、gates 门禁 128 项测试及 dev-env 14 项测试，实测总计 **336/336 PASS，0 失败、0 跳过、0 异常**。
  2. **验收矩阵 A01–A08 全面闭合**：显式单包入口约束、身份/Hash 防漂移、恶意/超限 Archive 拦截（含 ARC01/05 返修）、受管内容保真、声明与锁闭包、非目标保护面无损、原门禁/幂等无 pnpm 进程复验、7 阶段 14 点发布 rename 及中断恢复（A08）均获严格证据支持。
  3. **A09 存在未决边界**：普通命名 sync 与 `test:gates`（128/128）已全绿回归，但 architecture §5.1 / §8 要求的“真实 Host 初始化启动并读取业务只读端点响应、保留 PID/端口/运行身份”尚未在此阶段集成运行，当前属于 PARTIAL。
  4. **云 CI 存在确定性阻塞**：依据 149 调查报告与本次实测，`package.json` 的 `test:managed-tarball` 注册未覆盖新增的 4 个测试文件；且 GitHub Actions runner（Ubuntu）缺少用户宿主机绝对路径下的 `agent-backup` 共享工具分发链，直接在云端运行会导致必然失败。

---

## 2. 实测数据与独立测试执行清单

测试执行统一加载任务私有隔离环境：
`source .workbuddy/managed-778-t01/env.sh`
`export AGENT_BACKUP_STATE_DIR="$HOME/final-qa-registry"`

### 2.1 Managed-tarball 完整套件（149 项）

- **执行命令**：
  ```sh
  node --test --test-reporter=tap \
    scripts/managed-tarball.test.mjs \
    scripts/materialize-cache.test.mjs \
    scripts/managed-tarball-t02.qa.test.mjs \
    scripts/managed-tarball-transaction.test.mjs \
    scripts/managed-tarball-recovery.test.mjs \
    scripts/managed-tarball-preparation.test.mjs
  ```
- **实测结果**：**149 tests / 149 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**
- **总耗时**：**627,327.84 ms（约 10.45 分钟）**，退出码 **exit 0**。
- **测试分组与 TAP 编号映射**：

| 文件 | 测试数 | TAP 编号 | 核心覆盖范围 | 结果 |
| --- | ---: | ---: | --- | --- |
| `scripts/managed-tarball-preparation.test.mjs` | 18 | 1–18 | no-op 零 pnpm 进程全图等价证明、旧图突变拒绝、DirectoryAnchor 祖先 FD 锚定与递归复制绑定 | PASS |
| `scripts/managed-tarball-recovery.test.mjs` | 19 | 19–37 | 缺失/截断/损坏 Journal、旧图/保护面外部漂移、活 PID 保护、compact receipt 重试、IO 故障注入、子进程生命周期回收 | PASS |
| `scripts/managed-tarball-t02.qa.test.mjs` | 16 | 38–53 | 独立 QA 归档与缓存用例（ARC01~05、GRAPH01~03、CACHE01~06、FS01） | PASS |
| `scripts/managed-tarball-transaction.test.mjs` | 46 | 54–99 | hoisted/isolated 真实 pnpm 安装、7 阶段发布 rename 前后 14 点故障注入、准备与提交阶段 SIGINT/TERM/KILL 中断、二次 KILL 恢复、IO 故障 | PASS |
| `scripts/managed-tarball.test.mjs` | 40 | 100–139 | 21 类恶意 Archive 拦截、双 512 结束块校验、有界解码流、十进制身份、flock 互斥、参数校验 | PASS |
| `scripts/materialize-cache.test.mjs` | 10 | 140–149 | 公开依赖私有 store 获取、断网离线重建、native 产物保持、embedded node_modules 区分、来源预检 | PASS |

### 2.2 Sync 系列测试套件（45 项）

- **执行命令**：
  ```sh
  node --test \
    scripts/sync-targets.test.mjs \
    scripts/sync-plugin-scope.test.mjs \
    scripts/sync-bypass.test.mjs \
    scripts/sync-release-policy.test.mjs
  ```
- **实测结果**：**45 tests / 4 suites / 45 pass / 0 fail / 0 skipped**，耗时 **53,538.93 ms**，退出码 **exit 0**。
- **细项构成**：
  - `scripts/sync-bypass.test.mjs`：4 tests 全部 PASS（546 ms）
  - `scripts/sync-plugin-scope.test.mjs`：10 tests 全部 PASS（8,546 ms）
  - `scripts/sync-release-policy.test.mjs`：8 tests 全部 PASS（50,725 ms）
  - `scripts/sync-targets.test.mjs`：23 tests 全部 PASS（53,447 ms，含 optimistic repeat install 修复验证与 platform optional 隔离）

### 2.3 Quality Gate 门禁测试（128 项）

- **执行命令**：
  ```sh
  corepack pnpm --config.verify-deps-before-run=false test:gates
  ```
- **实测结果**：**128 tests / 3 suites / 128 pass / 0 fail**，耗时 **126,829.76 ms**，退出码 **exit 0**。
- **说明**：此前 T01 报告中因临时 workspace 边界缺失导致 git-wt failing-gate 的 127/128 问题，在当前代码树中已完全解决，门禁测试恢复 100% 满分通过。

### 2.4 Dev-env 与 L2 负例测试（14 项）

- `scripts/managed-tarball-l2.test.mjs`：1 test PASS（未改 dev-env 拒绝外部 tarball seed）
- `scripts/dev-env-deps.test.mjs` 与 `scripts/dev-env-source.test.mjs`：13 tests 全部 PASS

---

## 3. PRD & Architecture §5.1 验收矩阵 A01–A09 逐项核定

| 编号 | 场景要求 | 实测证据与代码依据 | 真实判定 |
| --- | --- | --- | :---: |
| **A01** | 显式单包入口与目标约束 | `managed-tarball.test.mjs:ok 139`、`managed-tarball-transaction.test.mjs:ok 99`；`sync-to-app.sh` 严格校验 `--managed-tarball` 4 个必填参数，与批量/全量/Prod 参数互斥即 exit 2；目标仅限 Dev 或 `$HOME/.dsh-dev/tasks/<task>` 白名单；写前哨兵文件完好。 | **PASS** |
| **A02** | Hash、身份与输入漂移 | `managed-tarball.test.mjs:ok 122~125,133,136`；Python 使用 no-follow FD，十进制 5 字段身份比较，输入文件在复制后与提交前执行两轮 Hash 与 inode 校验，漂移即终止，目标区域零写入。 | **PASS** |
| **A03** | 恶意/超限 Archive | `managed-tarball.test.mjs:ok 101~121,126~132`；逐类覆盖穿越、绝对路径、软硬链接、特殊文件、NFC/大小写冲突；ARC01（输出 FD 打开后子目录/叶子替换）与 ARC05（双 512 结束块）经独立 QA 验证全部阻断，无包内脚本执行。 | **PASS** |
| **A04** | 保留内容的正常纳管 | `materialize-cache.test.mjs:ok 141,142`、`managed-tarball-transaction.test.mjs:ok 54,55`；tarball 完整清单（含隐藏文件、test、内嵌 node_modules 及预编译 native 文件）与受管源及安装后 payload 逐字节一致，不依赖仅 3 个入口文件。 | **PASS** |
| **A05** | 声明、锁与安装闭包 | `materialize-cache.test.mjs:ok 140,143`、`managed-tarball-transaction.test.mjs:ok 79`；spec 严格为 `file:.materialize-snapshots/plugins/<包名>`；私有 store 获取依赖并完成 offline frozen 验证；切断原 tarball 与外部 profile 后仍可独立重建。 | **PASS** |
| **A06** | 非目标面保持 | `materialize-graph.mjs:compare` 对比全图节点（name/version/integrity/occurrence/peer context）与 protectedDigests；`managed-tarball-t02.qa.test.mjs:ok 43~45`；非目标源、kit、presets、settings 哨兵零变更。 | **PASS** |
| **A07** | 原门禁、冲突及幂等 | `sync-targets.test.mjs` 等 45 项全绿；flock 排他写入；`managed-tarball-preparation.test.mjs:ok 1,2,6` 证明在已受管状态下重复执行，通过 `withoutPnpm: true` 零外部进程复验全图，严格幂等无附加修改。 | **PASS** |
| **A08** | 安装与提交失败恢复 | `managed-tarball-transaction.test.mjs:ok 57~75,80~98`；解包、生成锁、安装、7 次发布 rename 前后（14 点）及 live-verify 注入故障均由 journal intent 完整反向回滚；覆盖 SIGINT/TERM/KILL、二次 KILL 及 IO 异常。 | **PASS** |
| **A09** | 既有功能回归与独立 L2 | 普通 sync 45 项与 `test:gates` 128 项全绿；但 architecture §8 要求“经正式严格校验及独立 L2 初始化/启动真实 Host，读取只读业务端点并记录 PID/端口/日志”，当前仅完成脚本级负例测试，真实 Host 业务响应未在本次最终执行。 | **PARTIAL** |
| **A10** | 合入门槛（独立交付） | 本任务当前处于本地 dirty 工作树状态，尚未建立独立 PR，未经过 GitHub Merge Queue。 | **PENDING** |
| **A11** | 共享 Dev 协调与当前前态 | 合并后阶段操作；本轮严守不进行真实 Dev 物化约束。 | **N/A (Post-Merge)** |
| **A12** | Dev 单包修复与真实 seed | 合并后阶段操作；需在 A10/A11 完成后由授权主理人统一执行。 | **N/A (Post-Merge)** |

---

## 4. CI quality-gate.yml 与 package.json 审查及云地分工

结合 149 号调查报告（`docs/implementation/issue-778-ci-backup-availability.md`）及本地代码审计：

### 4.1 代码与配置审查现状

1. **`package.json` 注册缺失**：
   - 当前配置（第 48 行）：
     ```json
     "test:managed-tarball": "node --test scripts/managed-tarball.test.mjs scripts/managed-tarball-transaction.test.mjs scripts/managed-tarball-l2.test.mjs"
     ```
   - **缺失文件**：`materialize-cache.test.mjs`、`managed-tarball-t02.qa.test.mjs`、`managed-tarball-recovery.test.mjs`、`managed-tarball-preparation.test.mjs` 共 4 个核心测试文件未在 `package.json` 的 npm 脚本中注册。若按此脚本运行，仅执行其中部分用例。
2. **`.github/workflows/quality-gate.yml` 运行阻断**：
   - 本地 dirty 工作流在 `Test managed tarball transactions` 步骤中直接调用了 `pnpm test:managed-tarball`。
   - **阻断点**：GitHub Actions 运行在 `ubuntu-latest` 容器上，容器中既没有用户宿主机的 `/Users/x/.agents/skills/agent-backup/scripts/backup.py`，工作流中也没有配置下载、鉴权或挂载该工具的 Step。
   - 只要调用涉及真实 `backup.py` 的测试（如 `managed-tarball-transaction.test.mjs`），子进程寻找物理脚本即刻触发 ENOENT，CI 必红。
3. **远端 GitHub Actions 现状**：
   - 远端已合并的 `quality-gate.yml`（commit `74a2fd3` / `9b0ab28`）中根本未引入该步骤。

### 4.2 云 CI 与本地测试的分工核定

- **分工建议**：
  1. **云端 CI（GitHub Actions）定位**：
     - 执行通用静态检查、L0、契约校验、全插件单测以及轻量纯逻辑回归（即 `pnpm test:gates` 128 项及无外设依赖的 unit test）。
     - 在共享 backup 工具的受控远端分发闭环（统一发布源、版本 pin、校验和下载挂载）建立之前，**严禁将强依赖本机宿主绝对路径的交易/备份集成测试直接推入云 CI 硬门禁**。
  2. **本地/专用 Runner 定位**：
     - 负责运行涉及真实环境依赖的套件：包含真实 pnpm 候选安装、flock 互斥、宿主 `agent-backup` 捕获与恢复演练的 149 项 managed-tarball 测试集。
     - 本地执行时必须显式注入 `AGENT_BACKUP_STATE_DIR` 隔离，确保不污染全局生产备份索引。

---

## 5. 已知阻断与后续执行建议

### 5.1 当前已知阻断（Blockers）

1. **阻断 1（供应链闭环未决）**：云端 CI 缺少 `agent-backup` 工具分发链；`package.json` 未完整登记 6 个 managed 测试文件。
2. **阻断 2（A09 真实 Host 验收缺席）**：合成 profile 虽然通过静态与脚本负例校验，但尚未在隔离环境真实启动 Host 并抓取只读业务返回。
3. **阻断 3（提交状态）**：工作树存在大批 dirty 实现，尚未提交到 Git，未进入 PR/MQ 流程。

### 5.2 下一步执行路线（Next Steps）

1. **主理人决策云 CI 与测试拆分**：
   - 方案 A（推荐）：将 managed-tarball 纯逻辑测试（archive/cache/graph）与涉及真实 backup 的集成测试在 CI 中做前置分层；补齐 `package.json` 脚本定义。
   - 方案 B：由工具所有者提供 Actions 可消费的受控 shared-backup 远端资产（依 149 报告规范）。
2. **执行 A09 真实合成 Host 验证**：
   - 使用私有任务端口启动隔离 L2，获取实际 PID、URL、服务注册与只读端点响应，固化真实运行证据。
3. **独立 PR 与 Merge Queue**：
   - 在独立分支生成干净 commit，排除无关 dirty 文件，提交 PR 并由主理人驱动 Merge Queue 合入。
4. **Dev 协调与现场单包修复（合并后）**：
   - 在获得合并收据（state=MERGED）后，主理人协调 Dev 停写窗口，执行 viewer 0.1.0 纳管并启动真实 Dev 验证，进而解锁 #760。
