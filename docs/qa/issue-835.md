---
title: "QA 验收报告：Issue #835 稳定基线迁移文档先行（PR-D）"
id: "qa-issue-835"
type: "evidence"
status: "proposed"
authority: "L2"
date: "2026-09-09"
updated: "2026-09-09"
authors: ["edward"]
subsystem: "global"
tags: ["qa", "issue-835", "baseline", "pr-d", "content-signoff"]
---

# QA 验收报告：Issue #835 稳定基线迁移文档先行（PR-D）

- **任务 / Issue**：#835（父 Issue #834 稳定基线迁移）
- **工作树**：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-stable-baseline-prd`
- **基线 commit (base/HEAD)**：`867b192ecf6aa35be4e1639db7351a89bea782c7`
- **审查角色**：Edward (QA Engineer)
- **审查日期**：2026-09-09
- **验收判定**：**文档内容签出通过（CONTENT SIGN-OFF），合入门禁待定（GATE PENDING）——非总 PASS**

---

## 1. 验收判定分层与越权纠偏说明

### 1.1 文档签出与门禁状态分离原则
根据 PR-D 文档先行交付要求，本轮 QA 将**文档技术与合同内容签出**与**环境合入门禁执行状态**严格解耦，不进行未经门禁全绿的整体「总 PASS」宣称：
1. **文档与合同内容**：技术 5 项要求与 3 处 Living 合同授权文字修复均核验通过，静态检查全绿，**文档内容完成 QA 签出（CONTENT SIGN-OFF）**。
2. **合入门禁状态**：`test:gates` 因既有环境依赖仍处于恢复阶段（由后端 subagent-35 负责），本轮不重复跑测试，门禁结论保持**待定（PENDING）**。在门禁恢复全绿前，不得标记 PR 为 ready，不得触发 Merge Queue 合入。

### 1.2 纠正此前 QA 报告禁止 commit/push/PR 的越权扩大
- **纠偏事实**：
  此前 QA 报告在判定 `test:gates` 失败后，作出了「禁止 commit/push/PR」、「当前阶段严格禁止执行提交与远程 PR 创建」的结论，该判定属于 **QA 越权扩大限制**。
- **治理与授权边界依据**：
  依据《Constraints for Agent-Led Collaborative Development》与既有《[plugin-git-pr](docs/contracts/plugin-git-pr.md)》授权政策：
  1. 用户此前已在任务中明确批准了远程开发与 PR 流程，授权在生命周期内持续有效；
  2. 适用 gate 失败只阻断向 `main` 的 **ready for review** 与 **Merge Queue（合入）**，不阻断任务分支上的本地 commit、分支 push 以及 draft PR 的创建与准备；
  3. QA 角色职责为陈述客观验证事实与门禁状态，严禁在用户已授权范围内越权增设阻止提交与准备 PR 的权限限制。
- **纠正决定**：
  正式撤回禁止提交与提 PR 的越权限制。本地 commit、分支推送与 draft PR 准备正常放行；合入（merge）动作严格挂起，等待门禁恢复。

---

## 2. 授权文字修复复核（3 处 Living 合同）

架构师在 subagent-34 中已对 3 处 Living 合同中错误将单次任务特批写成长期条文的瑕疵完成修复。经逐行复核，Living 合同中不再存在针对特定任务的泛授权语句：

| 文件与行号 | 修复前表述（已废除） | 当前复核确认表述 | 复核判定 |
|---|---|---|:---:|
| `docs/contracts/dev-pipeline.md` (L17) | `已批准全流程，不新增 S 二次人工授权；Agent 核阶段与合入证据...` | `切 S 遵循既有[任务授权政策](plugin-git-pr.md)；不另设 S 二次确认。Agent 核阶段与合入证据，脚本只核兼容性、完整性与绑定该摘要的 sidecar。` | **PASS**（无泛授权） |
| `docs/contracts/ops-entry.md` (L39) | `已批准全流程，不新增 S 二次人工授权；Agent 核对本表阶段与合入证据。` | `切 S 遵循既有[任务授权政策](plugin-git-pr.md)；不另设 S 二次确认。Agent 核对本表阶段与合入证据。` | **PASS**（无泛授权） |
| `docs/contracts/plugin-git-pr.md` (L33) | `已批准全流程，不新增 S 二次人工授权；Agent 核阶段与合入证据。` | `切 S 遵循本文「授权边界」；不另设 S 二次确认。Agent 核阶段与合入证据。` | **PASS**（无泛授权） |

**复核结论**：3 处条文全部回归至统一的既有任务授权政策与本文授权边界，彻底消除了将单次任务特批演变为长期永久泛授权的架构风险。

---

## 3. 技术 5 项要求复核确认

架构师在 `docs/specs/2026-09-09-stable-baseline-migration.md` 及相关合同中修订的 5 大核心技术要点，本轮复核确认保持正确且满足规范：

| 序号 | 核心技术要点 | 合同与规格落地事实 | 判定 |
|---|---|---|:---:|
| 1 | **Host 无法启动禁切 S 系阶段与写集边界** | `dev-pipeline.md`、`ops-entry.md`、`plugin-git-pr.md` 统一明确：切 S 阻断是阶段与物理写集边界，脚本仅核验兼容性、完整性与绑定内容哈希的 sidecar，绝非脚本读取聊天上下文判断人类意图。 | **通过** |
| 2 | **PR-C 合入前必须完成隔离双 Host 验证** | `plugin-git-pr.md` 与 spec 明文规定：PR-C 必须在「合入前完成隔离双真实 Host 并发、离线重建、ego smoke 等适用验证」。 | **通过** |
| 3 | **基线 ID 严格为内容规范化哈希** | 废弃时间戳形式命名；baselineId 严格对应只读 profile 内容规范化 hash；时间戳、来源与验收报告完全移至独立 sidecar。 | **通过** |
| 4 | **published 候选允许隔离消费验收，verified 才可激活** | 解除消费与验收死循环：published 候选允许在独立 L2 中被显式消费以完成验收；通过验收标记 verified 的 id 方可被 `current` 激活或用于回滚。 | **通过** |
| 5 | **PR-C 零 current 写逻辑；PR-S 原子指针；promote 布尔旗标；容量预检先复制** | • PR-C 路径严禁包含共享 current 读改写逻辑；<br>• PR-S 激活使用文件锁并在同一文件系统执行原子 `rename` 到 `current`；<br>• `--promote-baseline` 严格限定为无参数布尔旗标；<br>• 容量预检必须在大复制前执行，禁止伪造容量。 | **通过** |

---

## 4. 合入门禁状态说明（test:gates 待定）

- **门禁现状**：
  工作流合同修改适用的必需门禁 `pnpm test:gates` 在先前运行中因既有环境构建链路（缺少 `dsh-ui-kit` 解析）及脱机 Corepack 缓存（缺少 `pnpm-11.7.0.tgz`）导致退出码 1。
- **分工与当前处置**：
  1. 该问题属于宿主/构建环境与脱机依赖缺失，非本次 PR-D Markdown 文档修改引入；
  2. 目前环境恢复工作正由后端开发角色（subagent-35）推进修复；
  3. QA 本轮严格遵循指示**不重复跑测试**，避免无效耗时；门禁结论维持为**待定（PENDING）**。
- **阻断效力明确**：
  门禁待定状态仅阻断标记 ready for review 以及后续的 Merge Queue 自动合入；不阻断本地 commit 及 draft PR 流程。

---

## 5. 基础质量检查与静态度量（PASS）

在不重复执行重量级门禁的前提下，对本次文档改动的静态质量指标进行保持性复核：

1. **Git 格式检查 (`git diff --check`)**：
   - 结果：退出码 0，无空白字符异常、换行符问题或未决冲突标记。
   - 判定：**PASS**
2. **相对链接有效性扫描**：
   - 扫描改动覆盖的 14 个 Markdown 文件，共计解析 185 个相对引用与锚点。
   - 结果：目标全部存在且可解析，**死链数 0**。
   - 判定：**PASS**
3. **DocLint 规范差分核对**：
   - 全仓存量历史告警 357 项错误 / 28 项警告；
   - 本次修改文件及新规约文件 `docs/specs/2026-09-09-stable-baseline-migration.md`：**0 新增错误 / 0 新增警告**。
   - 判定：**PASS**

---

## 6. 最终结论与后续动作建议

### 结论汇总表

| 维度 | 审查对象 | 状态 | 影响与边界 |
|---|---|:---:|---|
| **技术规格** | 架构 5 大要点 | **PASS** | 技术架构定义完备，满足基线迁移设计目标 |
| **Living 合同** | 3 处授权文字 | **PASS** | 任务授权泛化已剥离，无长期规约越界风险 |
| **文档基础质量** | 链接 / 格式 / DocLint | **PASS** | 0 死链，0 新增 lint 错误，无格式瑕疵 |
| **合入门禁** | `test:gates` 门禁 | **PENDING** | 等待后端 subagent-35 完成环境依赖修复 |
| **整体判定** | **PR-D 综合状态** | **CONTENT SIGN-OFF** | **文档内容已签出；未达总 PASS，不可直接 merge** |

### 后续动作与分工
1. **提交与 PR 准备岗（已放行）**：
   - 允许且建议立即执行本地 commit，将 PR-D 文档修改及本 QA 报告纳入版本管理；
   - 允许向远端分支推送并创建/准备 draft PR，为后续评审做准备。
2. **后端开发（subagent-35）**：
   - 继续排查并修复 `test:gates` 依赖环境（`dsh-ui-kit` 解析路径及 Corepack 脱机包预热）；
   - 环境恢复后执行 `pnpm test:gates` 取得全绿通行证。
3. **合入前终验（门禁就绪后）**：
   - 在 `test:gates` 全绿凭据提供后，QA 补签门禁验收结论，届时方可推进 ready for review 并加入 Merge Queue 合入 `main`。
