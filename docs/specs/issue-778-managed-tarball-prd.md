# Issue #778 — 单包 tarball 纳管增量 PRD

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 seed/独立 Host 验收与专属 baseline D/C/S 迁移要求退役，受管 tarball 内容、事务与安全要求不变。当前流程见 [dev-pipeline](../contracts/dev-pipeline.md) 与 [plugin-qa](../contracts/plugin-qa.md)。下文固定 SHA、阶段状态与失败是历史快照，不是当前仓库或 Dev 事实，不重标结果。

- 项目：`managed_tarball_778`；语言：简体中文；技术范围：既有 Shell / Node / pnpm 运维链，不新增 Web UI 或技术栈。
- Issue：[开放的 #778](https://github.com/omnimux-ai/omnimux-dsh/issues/778)；风险：实施至少 R1。
- 固定基线：`580234923268673562cacb5cd01aebdb780339e1`；2026-09-08 读取时任务 HEAD 与基线一致，工作树干净。
- 状态：需求交付，待架构设计、实现与独立 QA；本文不证明功能已实现、已合入或 Dev 已修复。

## 1. 问题、目标与证据边界

原始需求：在既有 `sync-to-app.sh` → `sync-stable.sh` 链增加显式单包 tarball 纳管能力，保留现有 viewer 的确切内容和装配，解除 #760 的 L2 seed 运维依赖；不与 #760 UI 混合提交。

用户提供的 #760 背景为 1289 项单测与两轮 QA 已完成，L2 被 viewer 外部绝对 `file:` tarball 阻断。已完整读取前序报告：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/slot-mention-menu-760/docs/implementation/issue-760-dev-seed.md`。该报告在当次调查中确认 `@crosery/dsh-viewer@0.1.0` 的 27 个普通文件与原 tarball 一致、受管 source 缺失，既有 plugin/sync/rebuild 没有合规保留内容入口。

**上述文件数、路径、hash、安装态与环境指纹均为历史证据，不是当前事实证明。** 本轮没有核查真实 Dev。正式操作前必须重新读取实际输入与目标状态；不因同名同版本或旧 hash 记录推断字节相同。

产品目标：
1. 将一个明确授权的现有包转为自包含、可重定位的受管 source，不更换功能包。
2. 将依赖声明、pnpm 锁和安装态作为一致整体更新，失败不遗留混合状态。
3. 不扩大共享环境写入面，并用未放宽的正式 L2 流程证明 seed 可用。

用户故事：
- 作为环境维护 Agent，希望显式指定一个 tarball 及预期身份/hash，以便恢复来源合规而不替换 viewer。
- 作为 QA Agent，希望在隔离样本中验证异常输入和安装失败，以便不拿真实 Dev 试错。
- 作为并行任务协调者，希望合入后在协调窗口执行单包修复，以便其他任务仍使用可追溯、无未合并 UI 的 Dev seed。

## 2. 增量范围与合理保守选择

全部下列需求为 **P0 / 必须**；本期不列 P1/P2 扩展。

- 仅扩展既有公开 `yarn omnimux:sync` 及产品仓内部链，复用现有安装机制；不新增第二套 deploy 入口。具体参数名、helper 划分与提交机制由架构师确定。
- 新模式必须显式接收一个本地 tarball、预期完整包名、精确版本和 SHA-256；不扫描目录、不自动推断/补齐身份、不接受批量或远端下载。模式内缺项或与全量同步参数混用必须失败。
- 本次真实操作仅允许 Dev 指定 viewer；不新增/升级其他包。预期身份为 `@crosery/dsh-viewer@0.1.0`，tarball hash 须与已授权来源重新核验；发生变化即停，不能现场改预期值让检查通过。
- 安全解包默认只接受规范 `package/` 根下普通文件和目录；拒绝软/硬链接、特殊文件、绝对路径、目录穿越、重名/规范化冲突及越界目标。限制解压文件数与总大小，具体限值由架构设计明确并测试。校验不得执行包内代码；不得为纳管新增 lifecycle script 执行许可，必要脚本无法安全禁用时停止并报告。
- 从已校验 tarball 建立 `.materialize-snapshots/plugins/<完整包名>`，不从 `node_modules` 反向补源；完整保留文件字节、必要 POSIX 模式和 package 元数据。viewer Host/Client/patch/peer 元数据、bundle 成员与次序必须保留。
- 唯一允许的持久业务变更为目标包受管 source、该包 dependency spec，以及 pnpm 为此生成的必要锁/安装态变化。其他依赖解析、包内容、source、kit、presets、App、设置与数据不变。pnpm 内部布局可重建，但不得借此接受其他包升级或内容漂移。
- 目标包以外的缺源、kit 漂移、不合规依赖或身份异常保持原有 fail-closed 行为；只有显式目标包的待纳管状态可被此次操作处理。已有目标 snapshot 内容冲突须拒绝，不静默覆盖。相同输入重复执行须幂等。
- 首次目标写入前完成校验和恢复可行性检查；从准备到提交都须防止输入/目标漂移。失败恢复 source、声明、锁与安装图的一致前态，不只恢复一行 JSON。前态可能仍不满足 seed 合同，恢复成功不等于修复成功。具体恢复机制由架构师设计并通过故障注入证明。

交互草案：CLI 展示解析后的目标、包名/版本/hash、预期变更范围；结束返回明确成功/失败、阶段、退出码及脱敏证据。不得将“复制成功”“安装成功”单独显示为全部完成；不新增图形界面。

## 3. P0 验收矩阵

所有行均为**待验收**。合并前使用任务私有合成 profile、source、pnpm store 与哨兵文件，不读写真实 Dev 作为测试夹具；隔离样本只能证明机制，不得冒充已修复的真实 seed。

| ID / 阶段 | 场景 | 可观察通过条件与证据 |
| --- | --- | --- |
| A01 合并前 | 显式单包入口与目标约束 | 正常参数经公开 sync 链到达纳管逻辑；缺参数、非法 name/version/hash、批量/全量冲突与不允许目标均非零退出；目标首次写入前拒绝，哨兵不变。 |
| A02 合并前 | Hash、身份与输入漂移 | 错误 hash/name/version、畸形或多义 package.json、校验后替换输入均失败；记录预期与实际判定，目标 source/声明/锁/安装态无变化。不能依赖文件名判定身份。 |
| A03 合并前 | 恶意/超限 archive | 穿越、绝对路径、软/硬链接、特殊文件、重名/规范化冲突、畸形/截断、文件数/大小超限逐类有负例；拒绝且无暂存边界外写入、无包内代码执行。目标父路径经链接逃逸也须拒绝。 |
| A04 合并前 | 保留内容的正常纳管 | 受管 source 与 tarball 完整清单的路径、字节 hash、必要模式一致；安装包对应 payload 无缺失/漂移；Host/Client/patch/peer 元数据及 bundle 次序前后相同。用全清单而非仅三个入口文件证明。 |
| A05 合并前 | 声明、锁与安装闭包 | spec 精确为 `file:.materialize-snapshots/plugins/<完整包名>`；pnpm 生成锁/安装态无外部 tarball 或原 profile 绝对路径残留。隔离样本移至另一任务位置、原输入不可用时，凭受管 source 与锁可重建；未复制原 node_modules/.npmrc 或指向共享环境的链接。 |
| A06 合并前 | 非目标面保持 | 正常、失败及重复执行均比较完整依赖解析图、非目标包内容/source 清单、kit、presets、App 哨兵、bundle、配置与数据。除目标 spec/source 及必要 pnpm 生成差异外零业务变化；peer/hoist 导致其他包身份或内容变化须失败并恢复。 |
| A07 合并前 | 原门禁、冲突及幂等 | 非目标缺源/kit 漂移/不合规自引用仍失败；目标已有冲突 source 不覆盖；相同输入重复执行无重复 bundle、无额外依赖漂移。原 L2 校验逻辑保持不变，不增加跳过或允许外部路径的开关。 |
| A08 合并前 | 安装与提交失败恢复 | 在解包、source 准备、声明/锁生成、pnpm 安装、提交各可变阶段注入失败，并覆盖受支持的中断恢复；最终 source/声明/锁/安装图与前态一致且可用，无半纳管或新旧图混用。恢复未完成时必须明确失败并阻止继续操作，不得报成功。 |
| A09 合并前 | 既有功能回归与独立 L2 | 相关脚本测试和 `pnpm test:gates` 全通过，普通命名 sync 不回归。合成 seed 经正式严格校验及独立 L2 初始化/启动，记录 task、SOURCE、commit、profile、端口、PID 与适用集成证据；不得用仅 HTTP 200 或静态检查替代。 |
| A10 合入门槛 | 独立交付 #778 | 独立 QA 复核 A01–A09、真实 diff 与所有适用 required checks；#778 独立 commit/PR，无 #760 未合并 UI。通过 GitHub Merge Queue 后读回 `state=MERGED`、`mergedAt`、merge commit，方可进入真实 Dev 操作。 |
| A11 合并后 | 共享 Dev 协调与当前前态 | 主理人先与正在只读核查该 seed 的任务协调写入窗口；记录目标、执行 owner、窗口和新前态。写前再次核验 tarball、当前 viewer payload/装配及整个允许影响面；发现漂移停止。未协调不得写，不能套用前序 27 文件/hash 作为当前证明。 |
| A12 合并后 | Dev 单包修复与真实 seed | 从干净、已合并 main 经公开 sync 仅纳管指定 viewer；前后清单符合 A04–A06，source/声明/锁/安装态一致。真实 Dev seed 通过未修改的严格检查，并用它经正式入口启动隔离 L2；保留运行身份与日志，不默认重启公共 App。 |

## 4. 授权、非目标与交付顺序

用户已明确同意新增最小纳管支持，且此前已授权仅 Dev 必要依赖恢复；该授权不扩展到其他环境/包或未合并业务代码。前序报告“等待支持扩展授权”已由本次用户决定解除，技术验收与共享写入协调仍不能跳过。Issue 的 `pre-authorized: false` 不否定本次直接授权，也不允许伪造审批或走无人值守 R1 旁路。

执行顺序：架构设计 → 隔离实现/失败恢复测试 → 独立 QA 与适用 CI → 正式 PR/MQ 确认合入 → 主理人协调共享 Dev 窗口及新前态 → 已合并入口执行单包修复 → 严格 seed 与正式 L2 验证 → 回传 #760 主理人恢复其独立运行 QA。

非目标与禁止项：
- 不删/禁用 viewer，不换 registry 包、不改版本、不重打改内容的替代包；不删除原始 tarball 或历史备份。
- 不改变 L2 seed 准入规则、source/main、required checks、QA 或 Merge Queue 门禁；不伪造/借用 seed、验收标签或旧运行证据。
- 不做全 profile rebuild、全量 sync、kit/presets 更新、App 打包/替换、配置/凭据/业务数据迁移或生产发布。
- 不改官方 DSH 的源码、复制品、安装包或 `~/.dsh`，不写 Prod `~/.omnimux`，不使用 `--prod`/`--all`；无第二套手工 cp/rsync 进 profile 的运维路径。
- 不默认重启 App 或强杀进程。若验收确需公共 Dev App 重启，须另行明确 App 与协调窗口；磁盘修复不得冒称进程已重载或媒体展示已通过。
- 不实现 #760 画布 UI，不把其未合并代码纳入 Dev；#778 成功不等于 #760 浏览器验收或合入条件自动满足。

本文写入范围仅此 PRD，不执行代码、commit/push/merge、跨仓修改、真实 Dev 操作或成员直连。后续架构若必须改桌面 fork 的转发入口，先交主理人建立跨仓依赖 Issue 并确认相应写入授权，不能默认扩大本仓任务。

## 5. 证据、交接与关闭标准

- 架构师下一步：在既有 sync 链中确定参数契约、安全归档限值、pnpm 非目标漂移判定、暂存/一致提交/中断恢复策略及测试入口；这些属于实现设计，无需当前用户再选方案。
- 工程/QA 报告必须逐行标记 PASS / FAIL / BLOCKED / 未执行，绑定实际 base/head/merge SHA、目标路径、运行身份、命令退出码及差异清单；不得记录秘密。
- #778 代码合入、Dev 依赖修复、真实 seed/L2 启动、viewer 运行交互是不同状态。A01–A12 全部具备实际证据后才具备本运维任务关闭条件。涉及运行交互的适用验收按 QA 合同执行；#760 UI 的 ego-browser + `verify:live` 仍由该任务独立完成。
- 本次 PRD 文档任务只需 Markdown 差异、链接与边界核查，不要求运行测试、L2 或 Dev 物化；不把本文中的验收条件写成已通过结果。

依据：[Git/PR 与授权](../contracts/plugin-git-pr.md)、[开发环境与物化](../contracts/dev-pipeline.md)、[公开运维入口](../contracts/ops-entry.md)、[QA 证据](../contracts/plugin-qa.md)、[仓库约束](../../AGENTS.md)。
