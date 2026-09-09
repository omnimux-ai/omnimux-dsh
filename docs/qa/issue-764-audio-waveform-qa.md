---
title: "Issue #764 音频波形独立 QA 最终复验报告"
id: "evidence-issue-764-audio-waveform-qa"
type: "evidence"
authority: "L3"
status: "accepted"
date: "2026-09-08"
updated: "2026-09-09"
authors: ["严过关"]
---

# Issue #764 音频波形独立 QA 最终复验报告

## 历史证据身份补注（2026-09-09）

本报告是 Issue #764 音频波形第 2 轮返修验证的历史记录，按[文档治理合同](../contracts/docs-governance-standard.md)归为 L3 evidence。`status: accepted` 仅表示接受其作为历史记录保存，不表示当前测试 PASS、当前独立最终验收通过或获得合并授权。`date` 及作者取自原文；`updated` 是本次元数据与身份补注的实际修订日，不是重新执行测试的日期。

- **目标与阶段**：历史目标是复验 F3 并发账本覆盖、F4 错误状态遮盖及相关离线回归；下文“最终”“当前”“本轮”等措辞均指 2026-09-08 的原报告阶段，不指本次文档治理或当前运行状态。
- **版本身份**：原报告未记录历史审查 base SHA、实际测试 HEAD SHA、测试时 dirty 状态及完整 dirty 路径清单，均为**未知/未记录**。代码位置与命令中的路径仅说明当时审查和执行范围，不等于完整 dirty 清单。其他阶段的 base 或 SHA 仅属于其明确记载的阶段，不能推定为本报告测试身份；本次文档治理 HEAD 不用于回填历史身份。
- **执行时间与环境**：原文记录日期为 2026-09-08，工作树为 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audio-waveform-764`，命令及环境变量见第 2.1 节；精确执行时间、时区与其余环境版本未记录。原文明确记录的退出码予以保留，其余命令退出码未知，不从 PASS 字样补推。
- **结果与证据位置**：本文件第 1–4 节是保留的历史报告正文；原始日志或独立证据产物位置未记录。历史离线 PASS、68/68 定向测试、1331/1331 全包回归及真实浏览器/macOS Native **BLOCKED** 均原样保留，本次未重跑或重新确认这些结果。
- **权限与未完成项**：原文“具备合入主分支代码质量要求”及安排合并的建议仅作为当时意见保留，**不构成当前放行许可**。当前权限依[Git/PR 授权合同](../contracts/plugin-git-pr.md)与当前任务授权确定。真实环境验收缺口仍是本历史记录的未完成项；是否已解除需另行取得当前证据，由主理人另开独立 QA 实例验收，本次历史文档作者不执行最终独立验收。

以下为原报告正文，历史结果、数目、命令和建议未作改写。

## 结论

- **QA 工程师**：严过关；2026-09-08；**最终复验（第 2 轮返修验证完成）**。
- **智能路由判定**：**ROUTE: NoOne**（源码与测试用例无遗留 Bug，无需再派发给 Engineer 或 QA）。
- **验收结论**：**IS_PASS: YES（离线自动化测试与代码审查全部通过） / 真实环境端到端验收: BLOCKED**。
- **实跑测试结果**：
  - 音频定向测试（12 个文件）：**68 tests / 68 pass / 0 fail / 0 cancelled / 0 skipped**（原失败 2 项全部转为 PASS）。
  - Omnimux Workflow 完整包回归：**1331 tests / 1331 pass / 0 fail / 80 suites**（100% 通过）。
  - 类型检查（`pnpm --filter omnimux-workflow typecheck`）：**exit 0**（`tsconfig.canvas.json` 与 `tsconfig.host.json` 零诊断）。
  - Stage 合同验证（`pnpm verify:stages`）：**PASS**（10 个 Stage 组件，8 个侧边栏目标运行时合同完整）。
  - 架构边界检查（`pnpm check:boundaries`）：**PASS**（验证通过 2142 个插件源码文件，无跨界与非法依赖）。
  - 代码格式与 Git 检查（`git diff --check`）：**PASS**（无残余空格、缩进异常或冲突标记）。
- **缺陷闭环状态**：**Known Issues: 0**（F3 与 F4 均已彻底修复并通过回归验证）。
- **真实环境声明**：由于 Dev seed 的 `@crosery/dsh-viewer` 未受管 tarball 问题尚未恢复，真实浏览器（ego-browser）与 macOS native 文件系统交互仍处于 **BLOCKED** 状态。严禁将离线全绿冒充真实环境验收。

---

## 1. 代码审查分析

### 1.1 `ProjectAssetsStore.ts` 的 `ingest` 修复（解决 F3：并发账本覆盖）

- **代码位置**：`plugins/omnimux-workflow/src/workflow/workspace/ProjectAssetsStore.ts:425-478`
- **审查要点**：
  1. **跨 Await 账本合并安全**：
     - 在执行异步 `copyFileIntoImported` 跨越等待期后，新增 `const latest = load(workspaceId);` 重新从磁盘读取最新账本状态，摒弃原先复用旧内存快照 `current` 的错误做法。
     - 初始化 `mergedItems = [...latest.current.items]`，确保并发执行的 `ingestAudio` 或其他写入操作所产生的最新项被完整保留。
     - 以 `existingRel = new Set(latest.current.items.map(...))` 进行 `relative_path` 去重，安全合并 `stagedItems`。
  2. **版本自增（Rev）一致性**：
     - 最终写入通过 `persist(latest.filePath, latest.current, { folders: latest.current.folders, items: mergedItems })`。
     - `persist` 内部使用 `rev: current.rev + 1`（即 `latest.current.rev + 1`），保证了版本号单调递增，无任何版本覆盖或并发自增竞态。
  3. **路径与项目绑定安全**：
     - 重新加载后严密校验 `latest.projectRoot === projectRoot && latest.filePath === filePath`，一旦项目在并发期间发生绑定迁移立即抛出 `path-denied`。
     - 调用 `assertProjectWriteSafe` 双重防御 `.omnimux` 目录和账本文件，防止路径穿越或跨项目非法写。
     - 重新核验 `parentExists(latest.current, parentId)`，防止父目录在复制期间被并发删除导致悬空资产。
- **审查结论**：**通过**。逻辑严谨、并发友好、版本自增正确、无路径安全漏洞。

### 1.2 `AudioPreview.tsx` 的状态优先级与清理（解决 F4：错误状态遮盖）

- **代码位置**：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.tsx:90-142,171-174`
- **审查要点**：
  1. **状态渲染优先级调整**：
     - 状态栏文案渲染从原先的 `error || fileMessage || waveStatus` 调整为：
       `fileMessage || error || waveStatus || (target ? 'audio.projectCopy' : 'audio.remote')`
     - 显式操作产生的 `fileMessage`（如“正在保存...”、“网络或跨域访问失败”、“已保存到项目”）拥有最高优先级，不再被静态或历史媒体加载错误强行遮盖。
  2. **显式动作状态清理**：
     - 在 `save()` 开始时立即执行 `setError(null)` 与 `setFileMessage('audio.saving')`。
     - 在 `fileAction()`（打开/定位）开始时立即执行 `setError(null)` 与 `setFileMessage(null)`。
     - 在 `toggle()` 播放前主动执行 `setError(null)`，仅在 `media.play()` 明确拒绝时设置 `audio.playFailed`。
  3. **错误捕获与用户提示**：
     - `save()` 失败时精准映射异常错误码（如 `audio-save-network`、`audio-save-budget`、`audio-save-timeout` 等）至对应 i18n 提示文案并赋给 `fileMessage`，操作按钮准时解锁，用户可清晰理解失败原因并重试。
- **审查结论**：**通过**。状态优先级清晰，错误清理彻底，交互体验与无障碍提示均符合设计规范。

---

## 2. 独立测试验证记录

### 2.1 运行命令与环境变量

所有命令均在唯一工作树 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audio-waveform-764` 下执行：

```bash
export TMPDIR="$PWD/.audio-checks"
export pnpm_config_verify_deps_before_run=warn

# 1. 12 个音频定向测试
node --test \
  plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview{,.qa}.test.mjs \
  plugins/omnimux-workflow/src/canvas/editor/utils/audioWaveform{,.qa}.test.mjs \
  plugins/omnimux-workflow/src/canvas/editor/utils/saveRemoteAudio{,.qa}.test.mjs \
  plugins/omnimux-workflow/src/canvas/editor/hooks/useSaveRemoteAudio{,.qa}.test.mjs \
  plugins/omnimux-workflow/src/workflow/audioFileAction{,.qa}.test.mjs \
  plugins/omnimux-workflow/src/workflow/audioBytes{,.qa}.test.mjs

# 2. Omnimux-Workflow 全包回归测试
pnpm --filter omnimux-workflow test

# 3. 类型检查
pnpm --filter omnimux-workflow typecheck

# 4. Stage 契约校验
pnpm verify:stages

# 5. 依赖架构边界检查
pnpm check:boundaries

# 6. Git Diff 格式检查
git diff --check
```

### 2.2 测试结果矩阵

| 验证项目 | 测试范围 | 耗时 | 结果 | 关键断言与说明 |
| --- | --- | --- | --- | --- |
| **音频定向测试** | 12 个测试文件 (68 tests) | 792ms | **68 PASS / 0 FAIL** | **F3 复现用例** `QA2 concurrent local ingest...` **PASS**；<br>**F4 复现用例** `QA2 a failed remote save remains visible...` **PASS** |
| **Workflow 全包回归** | 80 个测试套件 (1331 tests) | 5167ms | **1331 PASS / 0 FAIL** | 零失败、零跳过、零取消，全量回归 100% 通过 |
| **TypeScript 类型检查** | Canvas + Host 两套编译配置 | ~3s | **exit 0** | 零类型错误，类型定义严格对齐 |
| **Stage 合同验证** | 10 Stage / 8 Sidebar targets | ~1s | **PASS** | 满足产品 Stage 与侧边栏注册要求 |
| **架构边界校验** | 2142 源码文件跨包依赖 | ~1s | **PASS** | 无非法 cross-plugin 引用，遵循 hub 隔离原则 |
| **Git Diff 检查** | 当前工作树改动与新增代码 | <0.5s | **PASS** | exit 0，无任何残余空格、无效缩进或冲突遗留 |

---

## 3. 真实运行环境证据（实事求是声明）

- **当前现状**：
  - 独立 L2 环境目前受制于 Dev seed 的 `@crosery/dsh-viewer` 未受管外部 `file:` tarball 问题（归属于独立任务 Issue #778 解决中），无法正常完成标准初始化。
- **真实验收边界**：
  - **真实浏览器（ego-browser）UI 验收**：**BLOCKED**（无法在隔离或 Dev 真实环境中通过 ego-browser 执行真实 Canvas 拖拽、Waveform SVG 真实声学采样峰值渲染、200px/350px/450px 真实布局与点击命中测试）。
  - **macOS Native 文件操作验收**：**BLOCKED**（无法在真实桌面容器中验证调起 Finder reveal 或系统默认播放器的外部系统调用）。
- **QA 准则落地**：
  - 严禁将离线 Node.js / JSDOM / Mock 测试全部通过伪称为“真实环境验收通过”。
  - 当前代码在纯逻辑、静态类型、契约边界及全量单元回归层面已完全就绪，具备合入主分支代码质量要求；但真实端到端集成测试需在 Issue #778 解除 L2 阻塞后由主理人统一安排验证。

---

## 4. 最终判定与责任分配

- **智能路由判定**：**ROUTE: NoOne**
- **结论**：本轮已彻底修复前轮遗留的并发账本覆盖（F3）与错误状态遮盖（F4），未引入新的源码或测试缺陷，所有离线自动化质量门禁全绿。
- **后续动作建议**：
  1. 工程师寇豆码（Alex）已完成本次 Issue #764 的代码修复，无需继续返修。
  2. 请主理人审阅最终 QA 报告，并根据环境恢复节奏安排合并及后续的真实环境端到端验证。
