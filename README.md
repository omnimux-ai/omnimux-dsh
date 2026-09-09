# OmniMux

<p align="center">
  <strong>The Open-Source Multi-Agent Creation & Operations Orchestrator for DeepSeek Harness</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Source--Available-blue.svg" alt="License: Source-Available"></a>
  <a href="COMMERCIAL.md"><img src="https://img.shields.io/badge/Edition-Community%20%7C%20Enterprise-success.svg" alt="Community | Enterprise"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.19%20%7C%7C%20%3E%3D24-brightgreen.svg" alt="Node Version"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/Ecosystem-DeepSeek%20Harness-purple.svg" alt="DSH Ecosystem"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-Welcome-orange.svg" alt="PRs Welcome"></a>
</p>

---

## 🌟 简介 (Introduction)

**OmniMux** 是专为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的开源多智能体（Multi-Agent）创作与社媒全链路运营编排平台。

我们参考了 **Multica**（将 Agent 视为团队员工进行协同与管理）与 **n8n**（可视化工作流自动化）的产品与商业架构，将 AI 创作团与增长团深度融合，提供从**创意灵感 → 脚本生成 → 视觉生图 → 视频分镜 → 剪辑出片 → 账号矩阵多平台发布 → 自动化互动监控**的全链路闭环。

---

## AI 应用：目标与当前交付状态

AI 应用的产品目标是 schema 驱动的通用应用，而非写死业务页面：唯一宿主入口，视频/图片/音频三类二级栏，选应用后收起且可重开；compact tabs 后单个左右大卡片，左表单、右历史/示例。空历史默认示例但不得伪造历史；发布者自主上传/选择多图、多视频与封面并保存 Demo 输入快照。

**纠正此前不实宣称**：针对固定审计基线 `e416238631cc78ef8caeab7b5313d9571947ef5a` 至目标 `a1ecf7bddc110992d870efd3b4e56511dfe43c9e`，Production Ready、零缺陷、端到端闭环、Apps 持久化、CI 已接入、11 组对抗测试、完整团队 TDD 均不成立。仅有 4 个 Apps 单测与 1 个 mock seam 单测通过、弱静态扫描通过；原区间 `git diff --check` 因行尾空白失败。上述结果不能替代真实宿主、媒体播放与执行验收。

固定目标 SHA 的原型仍为未挂载向导、内存 Registry、硬编码表单、4 秒 mock 成功、无真实播放器/上传选择器；原型代码留在 `omnimux-dsh-wt-contracts`，不代表 main、Dev 或生产已具备这些能力。本次仅将已审计文档融合到 main 基线，不合入原型代码，没有修复代码、接入 CI 或完成运行验收。

具体目标与需求—验收—实现状态见 [AI 应用 UI 规范](docs/contracts/ai-app-ui-spec.md)；目标职责、技术约束与已验证源码缺口见 [Canvas / Apps 边界](docs/contracts/workflow-app-boundary.md)。Canvas 调度，Hub 管凭证、provider HTTP 与模型路由，Apps 管表单、发布规范和域存储；Apps 不重造执行器。计费/退款/算力、评分、第四类 agent、VS SYNC/wipe、冗余回填及工作流源链接不属于本次 AI 应用需求。

## 🏗️ 架构与插件矩阵 (Architecture & Plugins)

OmniMux 采用“执行中枢 + 业务垂直插件”的微内核模块化架构：

```
                              ┌────────────────────────┐
                              │  DeepSeek Harness Host │
                              └───────────┬────────────┘
                                          │
                        ┌─────────────────▼─────────────────┐
                        │   plugins/omnimux (执行中枢)       │
                        │   - 产品外壳 / 品牌状态             │
                        │   - 统一账号凭证与鉴权              │
                        │   - 多模态模型统一调度通道         │
                        └─────────────────┬─────────────────┘
                                          │
        ┌───────────────────┬─────────────┼─────────────┬───────────────────┐
        │                   │             │             │                   │
┌───────▼──────────┐ ┌──────▼──────┐ ┌────▼─────┐ ┌─────▼───────┐ ┌─────────▼────────┐
│ omnimux-workflow │ │ omnimux-    │ │ omnimux- │ │ omnimux-    │ │ omnimux-publish  │
│ 无限画布工作流    │ │ assets/    │ │ clip     │ │ accounts    │ │ 多平台账号发布   │
│ DAG 编排 & 生成  │ │ products   │ │ 剪辑工坊  │ │ 矩阵管理    │ │ 分发与任务台账   │
│ 自动化任务调度   │ │ 创作资产库 │ │ 视频合成  │ │ 状态风控    │ │ 自动化数据回流   │
└──────────────────┘ └─────────────┘ └──────────┘ └─────────────┘ └──────────────────┘
```

* **`omnimux`**：执行中枢。统一产品外壳、账号鉴权、模型/出片服务路由。业务插件无缝复用。
* **`omnimux-workflow`**：工作流无限画布。拖拽编排 DAG、Agent 工具调用与多模态内容生成流。
* **`omnimux-assets` & `omnimux-products`**：创作资产与商品库。角色、场景、风格包与带货商品资产统一管理。
* **`omnimux-clip`**：剪辑工坊。集成专业微应用时间轴与视频轨道编排合成。
* **`omnimux-accounts`**：社媒矩阵账号池。多平台账号状态监控、授权与可用性保护。
* **`omnimux-inspiration`**：灵感复刻库。爆款视频拆解、提示词与多模态工程复刻。
* **`omnimux-publish`**：多账号内容发布中心。草稿箱、多平台并发分发与子任务台账管理。

---

## 💼 版本对比 (Community vs Enterprise)

OmniMux 采用与 **Multica** 相同的 **Open-Core** 模式与 **Sustainable Source** 许可：

| 特性 | Community Edition (社区开源自托管) | Commercial / Enterprise (商业企业版) |
| :--- | :---: | :---: |
| **源码完全开放与二次开发** | ✅ 自由修改与本地扩展 | ✅ 支持私有化源码交付与定制 |
| **个人使用 / 学术研究** | ✅ 永久免费 | ✅ 永久免费 |
| **企业内部业务自用 (Self-Hosted)** | ✅ 永久免费 (无限制) | ✅ 免费 (提供专属部署技术支持) |
| **全量创作/增长 Agent 调度** | ✅ 完整支持 | ✅ 支持多租户高并发与性能优化 |
| **企业单点登录 (SSO / SAML)** | ❌ | ✅ 完整支持 |
| **多租户权限与协作隔离 (RBAC)** | ❌ (单租户/本地隔离) | ✅ 完整支持多团队权限矩阵 |
| **商业转售与白标 OEM 贴牌** | ❌ (明确禁止) | ✅ 官方授权 OEM 品牌独立售卖 |
| **托管云服务运营 (Cloud SaaS)** | ❌ (明确禁止) | ✅ 官方商业 SaaS 运营授权 |
| **技术支持与服务 SLA** | 社区 GitHub 讨论区 / Issue | ✅ 专属企业响应群与 7×24h SLA |

*详细说明与授权流程请查阅 [COMMERCIAL.md](COMMERCIAL.md)。*

---

## 🚀 快速启动 (Quickstart)

### 环境要求
* **Node.js**：`^22.19 || >=24`
* **pnpm**：`>=9`
* **DeepSeek Harness (DSH)**：通过 `npx @deepseek-ai/dsh` 或本地 DSH 环境运行。

### 本地开发与交付

从 [AGENTS.md](AGENTS.md) 和[仓库 workflow](.agents/skills/omnimux-repo-workflow/SKILL.md)进入开发流程：

1. 在仓内隔离 worktree 实施，运行与变更面相关的自动化测试、静态检查和独立评审；选择依据见[插件 QA](docs/contracts/plugin-qa.md)。例如在当前任务 worktree 执行 `pnpm --filter <package> test`，文档变更执行 `git diff --check` 与 `pnpm doc:lint`。
2. PR 满足 required CI，经 Merge Queue 合入 `main`。CI `qa:pass` 只证明合入前静态与测试，不证明 Dev 已通过。
3. 影响已安装运行时才从已合并 `main` 经[正式同步入口](docs/contracts/ops-entry.md)物化 Dev `~/.omnimux-dev`。Web/Stage 在 45120 使用 ego-browser 与共享 `pnpm verify:live <stage>` 验收；纯文档、流程、脚本无需 App 物化。

没有合并前独立 App/Host 测试环境。不得将未合并 worktree link 或物化到 Dev/Prod；生产 `~/.omnimux`、`--prod`、`--all` 与正式发布仍需独立授权。完整边界见[开发环境合同](docs/contracts/dev-pipeline.md)。

---

## 🤝 贡献与社区 (Contributing)

我们非常欢迎开发者参与共建！无论是修复 Bug、编写文档，还是为 OmniMux 贡献新的 Agent Skills 或插件：
1. 查阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解代码规范与 PR 提交流程。
2. 遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 行为准则。
3. 发现安全问题请按照 [SECURITY.md](SECURITY.md) 私密通报。

---

## 🙏 开源公示与致谢 (Acknowledgements & Third-Party Credits)

OmniMux 的构建与演进站在了开源巨人的肩膀上，我们对以下直接 Fork、深度二开或集成的开源先锋项目致以由衷的敬意与感谢：

* **[@cocofhu/skillhub](https://github.com/cocofhu/skillhub)** (MIT License, by [@cocofhu](https://github.com/cocofhu))：`omnimux-market` 插件市场（技能/插件/专家/连接器四 Tab 架构）的 Fork 二开真源。
* **[Augani/openreel-video](https://github.com/Augani/openreel-video)** (MIT License, by Augani)：`omnimux-clip` 剪辑工坊全套 WebCodecs/WebGPU 时间轴与微应用 Vendorize 真源。
* **[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)** (MIT License, by DeepSeek AI)：官方核心 Agent 运行底座与 Harness 插件规范。
* **[anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)** (MIT License, by Anywhere Labs)：OmniMux 桌面端 Electron Shell 的 Fork 底座。
* **[@xyflow/react (React Flow)](https://github.com/xyflow/xyflow)** (MIT License, by xyflow)：`omnimux-workflow` 无限画布 DAG 节点连接与编排引擎。
* **[Umami Analytics](https://github.com/umami-software/umami)** (MIT License)：`omnimux-analytics` 隐私友好的插件指标与社媒运营分析。
* **[Blobatar](https://github.com/joshglendenning/blobatar)** (MIT License, by Josh Glendenning)：`omnimux` 账号与 Agent 动态色彩头像生成。
* **模式致敬**：感谢 **[Multica](https://multica.ai)**（AI 员工多智能体团队协同）与 **[n8n](https://n8n.io)**（可视化工作流与可持续源码许可）的产品与商业化启发。

*完整第三方开源项目清单与许可证声明详见 **[ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)**。*

---

## 📄 开源许可与商业授权 (License & Commercial)

* **开源自托管许可**：本项目遵循 **[OmniMux Sustainable Source License (Version 1.0)](LICENSE)**（Source-Available 模式）。个人使用、科研学术及企业内部自建业务完全免费。
* **商业授权**：若您需要将 OmniMux 包装成商业产品转售（OEM 贴牌）、搭建收费 SaaS 云服务或采购 Enterprise 企业版，请联系 `commercial@omnimux.ai` 或查阅 **[COMMERCIAL.md](COMMERCIAL.md)**。

---

<p align="center">
  <sub>Copyright © 2026 OmniMux Project. All rights reserved.</sub>
</p>
