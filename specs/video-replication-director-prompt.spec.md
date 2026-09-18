# 规范：留档「视频复刻总监」角色定义 Prompt V2 与独立审查报告

> 任务真源：Issue #2285 · 分支 `agent/docs-video-replication-prompt-issue-2285` · 基线 `origin/main` = `effc39da7`。
> 本文件是本任务人与 Agent 共享的验收真相源：写码前定死「建什么、怎样算完成」。

## 1. 业务目标与背景

### 1.1 现状
用户提出打造专门负责视频复刻的总指挥专家，重点要求：
- 分类不同类型的复刻意图并精准路由到技能市场的对应复刻技能包；
- 避免上下文污染，专家仅作为调度中枢，在检测未安装时提示用户安装，安装后动态通过 `skill` 工具加载规程；
- 借鉴 Hypit 视频制作心法并无缝联动 OmniMux 创作画布（Workflow 节点拓扑）、资产库（omnimux-assets）和 Clip 剪辑工坊多轨落地能力。

经独立子代理「提示词导演」（Prompt Director）进行全面专业审查（评分 8.5/10），并在模糊意图两阶段分诊漏斗、上下文洁癖防倾倒硬门禁、四大工件标准与版权算力采样风控 4 个维度针对性强化，升级为生产级 V2。用户要求将生成的 Prompt 文档与审查报告进行仓库正式提交与合并留档。

### 1.2 目标与文件落地
在仓库内落地归档以下正式文档：
1. `docs/prompts/video-replication-director.md`：视频复刻总监 - 瑞普 (Replicate) 完整角色定义 Prompt V2；
2. `docs/reports/2026-09-18-prompt-director-review.md`：提示词导演完整独立审查报告（含 6 维深度评估与 5 项强化方案）；
3. `specs/video-replication-director-prompt.spec.md`：本任务规格文档。

## 2. 验收标准
1. 文件在隔离工作树中规范落地，格式完整保真；
2. `git diff --check` 无任何空白与格式异常；
3. 属于纯文档沉淀（R3 级别改动），无需 App 物化，通过 Pull Request 与 GitHub Merge Queue 正式合并入 `main` 分支。
