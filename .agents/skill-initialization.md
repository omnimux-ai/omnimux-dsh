# 工作区技能初始化记录（编程场景）

本文件记录本仓 `.agents/skills` 的选择依据与验收结果，供后续复跑复盘。它是记录，不是开关配置，也不替代文件系统入口。

- 工作区：`omnimux-dsh`（OmniMux 外置 DSH 插件产品仓）
- 场景：编程；执行 App：DSH（本仓 `.agents/skills` 已被会话识别）
- 初始化日期：2026-10-22
- 依据：`workspace-skill-init`（catalog `opc-skills-workspace-skill-init`）、`skill-ops`

## 项目画像与假设

| 项 | 事实/证据 |
| --- | --- |
| 交付物 | 插件、一级页/Stage、Taskboard、hub 与领域插件；MVP 为短视频复刻链路 |
| 技术栈 | Node ESM + pnpm workspace 多包；门禁与 QA 由 `scripts/`、`package.json` 提供 |
| 流程权威 | [AGENTS.md](../AGENTS.md) 与 `docs/contracts/`；worktree、PR、ship 均有脚本 |
| 阶段 | 迭代交付期：`main` 持续合并，CI 与门禁齐全 |
| 验收 | [plugin QA](../docs/contracts/plugin-qa.md) 的最小命令集 + 隔离 worktree 内真实浏览器证据 |
| 执行 App | DSH；其他 harness 的发现机制未验证 |

假设：本仓继续以仓库契约为第一权威，不引入与门禁并行的第二套工程流程。

## 现有入口

| 入口 | 类型 | 覆盖 |
| --- | --- | --- |
| [omnimux-repo-workflow](skills/omnimux-repo-workflow/SKILL.md) | 原生 | Issue、隔离 worktree、规格、最小命令集、PR、收尾 |
| [dsh-plugin-dev](skills/dsh-plugin-dev/SKILL.md) | 资产库软链 | OmniMux 插件与一级页实现 |
| [omnimux-form-authoring](skills/omnimux-form-authoring/SKILL.md) | 原生 | 配置式任务表单 |
| [omnimux-rc-upgrade](skills/omnimux-rc-upgrade/SKILL.md) | 原生 | Harness pin/RC 升级与漂移诊断 |
| `minimax-design-reference-router`（本机软链，未纳入版本管理） | 资产库软链 | 桌面端画布/多进程设计真源路由 |
| `short-drama-router`（本机软链，未纳入版本管理） | 资产库软链 | 短剧 Agent 开发资源分流 |
| [tiktok-drama-center](skills/tiktok-drama-center/SKILL.md) | 原生 | Drama Center 入驻与合规操作 |

## 编程阶段判重

| 阶段 | 现有入口 | 决定 |
| --- | --- | --- |
| 需求/规格 | `omnimux-repo-workflow`、`scripts/guard-quality-loop.mjs`、`specs/` | 由仓库契约覆盖，不装 spec/TDD 框架 |
| 隔离开发 | [scripts/worktree.sh](../scripts/worktree.sh)、`pnpm wt:*` | 由仓库脚本覆盖，不装 worktree-ops |
| 实现 | `dsh-plugin-dev`、设计路由 | 保留 |
| 验证 | AGENTS.md 验证矩阵、`pnpm verify:*`、ego-browser（用户级） | 按需，无需项目入口 |
| 评审 | 仓库要求独立评审；用户级 `open-code-review`（`ocr` 已安装） | 按需候选，暂不重挂 |
| 交付 | `worktree.sh ship`、Git/PR 契约 | 保留 |
| 维护（hooks/AGENTS.md） | 仓库门禁脚本与 `.dsh/hooks.json` | 按需候选 |

判重标准：仓库脚本、门禁或规格模板已完成同一步时不装通用技能，避免同一步出现两套默认。

## 按需候选（不预装）

| 能力 | catalog ID | 触发条件 |
| --- | --- | --- |
| 代码评审方法 | `agent-skills-code-review-and-quality`；用户级 `open-code-review` | 需要可复用评审清单或差分审阅时 |
| 规格方法对照 | `agent-skills-spec-driven-development` | 需要外部方法论对照；不得替换 `specs/` 门禁 |
| 通用工作树规范 | `opc-skills-worktree-ops` | 只在脱离本仓脚本时考虑 |
| Hooks 门禁设计 | `opc-skills-agent-hooks-guardian` | 新增或重构 `.dsh/hooks.json` 守卫时 |
| AGENTS.md 编辑 | `opc-skills-agents-md` | 需要瘦身或重写常驻约束时 |

## 验收

- 7 个入口均保留（在主检出处核对）：3 个软链第一跳为资产库 `skills/<catalog-id>`（其中 2 个按 `.gitignore` / `.git/info/exclude` 仅存在于本机），4 个原生目录未被替换，`SKILL.md` 均可读。
- 本轮未新增入口，因此无重复源、无新断链；目录刷新需新会话，属本次会话观察，不是仓库可验证结论。
- 未改动用户级技能目录，未安装插件，未执行发布、付费或生产写入。
- 依赖状态：`ocr` CLI 可用；ego-browser 由用户级提供。

## 重跑规则

- 相同需求重跑保持入口不动，不创建重复别名。
- 项目阶段变化（如新增内容/社媒交付）时重新取证并只补差集，不自动清空旧集合。
- 任何入口增删走 worktree + PR，并在本文件更新对应行。
