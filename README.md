# OmniMux

<p align="center">
  <strong>角色生成与视频复刻</strong><br>
  <sub>用文字或照片建立角色，结合参考视频制作角色视频</sub>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License: AGPL-3.0"></a>
  <a href="COMMERCIAL.md"><img src="https://img.shields.io/badge/Commercial-Dual%20Licensing-success.svg" alt="Commercial dual licensing"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.19%20%7C%7C%20%3E%3D24-brightgreen.svg" alt="Node Version"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/Ecosystem-DeepSeek%20Harness-purple.svg" alt="DSH Ecosystem"></a>
  <a href="https://discord.gg/omnimux"><img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2.svg?logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://x.com/omnimux_ai"><img src="https://img.shields.io/badge/X%20(Twitter)-@omnimux__ai-black.svg?logo=x&logoColor=white" alt="Twitter"></a>
  <a href="#-社区交流与开发者群-community"><img src="https://img.shields.io/badge/WeChat-开发者交流群-07C160.svg?logo=wechat&logoColor=white" alt="WeChat"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-Welcome-orange.svg" alt="PRs Welcome"></a>
</p>

<p align="center">
  <img src="docs/assets/omnimux-ui-preview.png" alt="OmniMux 桌面插件历史界面示意" width="100%">
</p>

---

## 简介

**OmniMux 聚焦角色生成与视频复刻。** 从文字描述或有权使用的照片建立角色，结合参考视频制作角色视频，核心创作能力为生图与生视频。现行定位与表述边界见[产品定位](docs/contracts/product-positioning.md)。

本仓是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的桌面插件工程，不是官网工作台源码。官网的角色创建旅程不等于本仓已经逐项完成；实际能力须核对[能力记录](docs/capabilities.md)、当前代码及对应版本证据。

灵感、素材、画布与必要剪辑服务于角色视频成片。多账号矩阵、自动排期和独立运营分析不是默认产品主线；不承诺固定降本比例、零抽成或素材始终只留本地。

## AI 应用：历史目标与审计边界

以下通用应用是历史方案，不是当前产品扩展任务；现行范围见[产品定位](docs/contracts/product-positioning.md)。历史目标是 schema 驱动的通用应用，而非写死业务页面：唯一宿主入口，视频/图片/音频三类二级栏，选应用后收起且可重开；compact tabs 后单个左右大卡片，左表单、右历史/示例。空历史默认示例但不得伪造历史；发布者自主上传/选择多图、多视频与封面并保存 Demo 输入快照。

**纠正此前不实宣称**：针对固定审计基线 `e416238631cc78ef8caeab7b5313d9571947ef5a` 至目标 `a1ecf7bddc110992d870efd3b4e56511dfe43c9e`，Production Ready、零缺陷、端到端闭环、Apps 持久化、CI 已接入、11 组对抗测试、完整团队 TDD 均不成立。仅有 4 个 Apps 单测与 1 个 mock seam 单测通过、弱静态扫描通过；原区间 `git diff --check` 因行尾空白失败。上述结果不能替代真实宿主、媒体播放与执行验收。

固定目标 SHA 的原型仍为未挂载向导、内存 Registry、硬编码表单、4 秒 mock 成功、无真实播放器/上传选择器；原型代码留在 `omnimux-dsh-wt-contracts`，不代表 main、Dev 或生产已具备这些能力。本次仅将已审计文档融合到 main 基线，不合入原型代码，没有修复代码、接入 CI 或完成运行验收。

具体目标与需求—验收—实现状态见 [AI 应用 UI 规范](docs/contracts/ai-app-ui-spec.md)；目标职责、技术约束与已验证源码缺口见 [Canvas / Apps 边界](docs/contracts/workflow-app-boundary.md)。Canvas 调度，Hub 管凭证、provider HTTP 与模型路由，Apps 管表单、发布规范和域存储；Apps 不重造执行器。计费/退款/算力、评分、第四类 agent、VS SYNC/wipe、冗余回填及工作流源链接不属于本次 AI 应用需求。

## 工程结构与能力状态

执行中枢负责身份、凭证、模型路由与媒体执行；领域插件管理各自的素材、灵感、画布和剪辑职责。结构与术语见 [CONTEXT.md](CONTEXT.md)，调用边界见[中枢合同](docs/contracts/hub.md)。

已有账号、发布、运营分析等插件保留其技术职责，但不因存在源码而成为当前对外承诺。安装阶段以[插件生命周期清单](plugins/omnimux/src/plugin-lifecycle.json)为准，真实可用性以[能力记录](docs/capabilities.md)及当前验收为准，不维护第二份正式可用徽章或素材数量表。

## 文档入口

| 需要了解什么 | 入口 |
| --- | --- |
| 当前产品方向与宣传边界 | [产品定位](docs/contracts/product-positioning.md) |
| 角色视频制作的目标与验收 | [角色生成与视频复刻指南](docs/guides/ecommerce-video-replication.md) |
| 开发文档与适用合同 | [文档导航](docs/README.md)、[智能体约束](AGENTS.md) |
| 灵感库合集整理与能力状态 | [灵感插件说明](plugins/omnimux-inspiration/README.md#本地灵感合集)、[能力记录](docs/capabilities.md) |
| 中枢接口目录快照 | [接口面板](docs/tools/hub-interfaces.html)，不是部署状态或上游能力真源 |
| 软件使用与商业授权 | [许可原文](LICENSE)、[商业授权说明](COMMERCIAL.md)，不等于生成免费 |
| 第三方来源与许可 | [致谢与第三方声明](ACKNOWLEDGEMENTS.md) |

## 💼 许可

OmniMux 自行编写的插件代码采用 **[AGPL-3.0](LICENSE)**，另附 [NOTICE](NOTICE) 中的 AGPLv3 第 7 条署名要求；同时提供商业授权，与 [new-api](https://github.com/QuantumNous/new-api) 的做法相同。

| 用法 | AGPL-3.0（免费） | 商业授权 |
| :--- | :---: | :---: |
| 个人、团队或企业使用、修改、自行部署，包括商业用途 | ✅ | ✅ |
| 修改后对外提供服务或分发，且公开修改后的源码 | ✅ | ✅ |
| 修改后对外提供服务或分发，但不公开修改 | ❌ | ✅ |
| 移除 `Powered by OmniMux` 署名，以自有品牌发布 | ❌ | ✅ |

从上游 fork 或引入的代码保留原许可（多为 MIT），见 [CONTRIBUTING.md](CONTRIBUTING.md) 第 4 节与 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)。2026-10-28 之前发布的版本按其发布时的许可证授权。许可不等于生成免费，详见 [COMMERCIAL.md](COMMERCIAL.md)。

统一源码公开仓：[omnimux-ai/omnimux-ai](https://github.com/omnimux-ai/omnimux-ai)（`plugins/` 将收录本仓源码）。

## 🚀 快速启动 (Quickstart)

### 环境要求
* **Node.js**：`^22.19 || >=24`
* **pnpm**：`>=9`
* **DeepSeek Harness (DSH)**：通过 `npx @deepseek-ai/dsh` 或本地 DSH 环境运行。

### 本地开发与交付

从 [AGENTS.md](AGENTS.md) 和[仓库 workflow](.agents/skills/omnimux-repo-workflow/SKILL.md)进入开发流程：

1. 在仓内隔离 worktree 实施，运行与变更面相关的自动化测试、静态检查和独立评审；选择依据见[插件 QA](docs/contracts/plugin-qa.md)。例如在当前任务 worktree 执行 `pnpm --filter <package> test`，文档变更执行 `git diff --check` 与 `pnpm doc:lint`。
2. PR 满足 required CI，经 Merge Queue 合入 `main`。CI `qa:pass` 只证明合入前静态与测试，不证明 Dev 已通过。
3. 界面变更在任务隔离工作树内取得实际功能路径浏览器证据；合入后仅影响已安装运行时的改动物化 Dev `~/.omnimux-dev`。45120 的开发版验收由人工负责；纯文档无需安装或重启应用。完整规则见[插件 QA](docs/contracts/plugin-qa.md)。

没有合并前独立 App/Host 测试环境。不得将未合并 worktree link 或物化到 Dev/Prod；生产 `~/.omnimux`、`--prod`、`--all` 与正式发布仍需独立授权。完整边界见[开发环境合同](docs/contracts/dev-pipeline.md)。

---

## 💬 社区交流与开发者群 (Community)

可选择常用的平台参与讨论，交流 AI 视频出片技巧、探讨插件二次开发、反馈需求与跟踪最新进展：

<table>
  <thead>
    <tr>
      <th align="center" width="50%">微信 / 企业微信开发者交流群</th>
      <th align="center" width="50%">全球社交媒体与开发者频道</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center" valign="middle">
        <img src="docs/assets/community-wechat-group.png" alt="OmniMux 微信 / 企业微信开发者交流群" width="220"><br>
        <sub>扫码加入 <strong>OmniMux 开发者交流群</strong><br>（微信或企业微信均可扫码进入）</sub>
      </td>
      <td align="center" valign="middle">
        <p>
          <a href="https://discord.gg/omnimux"><img src="https://img.shields.io/badge/Discord-Join%20OmniMux-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
        </p>
        <p>
          <a href="https://x.com/omnimux_ai"><img src="https://img.shields.io/badge/X%20(Twitter)-Follow%20@omnimux__ai-black?style=for-the-badge&logo=x&logoColor=white" alt="Twitter"></a>
        </p>
        <p>
          <a href="https://github.com/omnimux-ai/omnimux-dsh/discussions"><img src="https://img.shields.io/badge/GitHub-Discussions-0969DA?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Discussions"></a>
        </p>
        <sub>欢迎提交 Issue、参与功能共建或在 Discord / X 与全球开发者互动！</sub>
      </td>
    </tr>
  </tbody>
</table>

---

## 🤝 贡献与共建 (Contributing)

我们非常欢迎开发者参与共建！无论是修复 Bug、编写文档，还是为 OmniMux 贡献新的 Agent Skills 或插件：
1. 查阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解代码规范与 PR 提交流程。
2. 遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 行为准则。
3. 发现安全问题请按照 [SECURITY.md](SECURITY.md) 私密通报。

---

## 🙏 开源公示与致谢 (Acknowledgements & Third-Party Credits)

OmniMux 的构建与演进站在了开源巨人的肩膀上，我们对以下直接 Fork、深度二开或集成的开源先锋项目致以由衷的敬意与感谢：

* **[@cocofhu/skillhub](https://github.com/cocofhu/skillhub)** (MIT License, by [@cocofhu](https://github.com/cocofhu))：`omnimux-market` 插件市场（技能/插件/专家/连接器四 Tab 架构）的 Fork 二开真源。
* **[Augani/openreel-video](https://github.com/Augani/openreel-video)** (MIT License, by Augani)：`omnimux-clip` 剪辑工坊全套 WebCodecs/WebGPU 时间轴与微应用 Vendorize 真源。
* **[Crosery/dsh-viewer](https://github.com/Crosery/dsh-viewer)** (MIT License, by Crosery)：`omnimux-viewer` 全能媒体渲染器插件真源，提供 36 种媒体与文档格式的就地内联播放能力。
* **[omdsh-dev/dsh-browser](https://github.com/omdsh-dev/dsh-browser)** (MIT License, by Yuxiang Lin)：`omnimux-browser` 浏览器伴侣插件与 Chrome 扩展底座真源，打通网页媒体感知与双向桥接。
* **[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)** (MIT License, by DeepSeek AI)：官方核心 Agent 运行底座与 Harness 插件规范。
* **[anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)** (MIT License, by Anywhere Labs)：OmniMux 桌面端 Electron Shell 的 Fork 底座。
* **[@xyflow/react (React Flow)](https://github.com/xyflow/xyflow)** (MIT License, by xyflow)：`omnimux-workflow` 无限画布 DAG 节点连接与编排引擎。
* **[Umami Analytics](https://github.com/umami-software/umami)** (MIT License)：`omnimux-analytics` 隐私友好的插件指标与社媒运营分析。
* **[Blobatar](https://github.com/joshglendenning/blobatar)** (MIT License, by Josh Glendenning)：`omnimux` 账号与 Agent 动态色彩头像生成。
* **模式致敬**：感谢 **[n8n](https://n8n.io)**（可视化节点编排与可持续源码许可）的产品与商业化启发。

*完整第三方开源项目清单与许可证声明详见 **[ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)**。*

---

## 📄 许可与商业授权 (License & Commercial)

* **许可**：OmniMux 自行编写的代码采用 **[AGPL-3.0](LICENSE)**，附 [NOTICE](NOTICE) 中的第 7 条署名要求。可以免费使用、修改、自行部署，包括商业用途；修改后对外提供服务或分发时须公开对应源码，并保留署名。
* **商业授权**：不想公开修改、需要移除 OmniMux 品牌，或公司政策不接受 AGPL 时，请联系 `hello@omnimux.ai` 或查阅 **[COMMERCIAL.md](COMMERCIAL.md)**。

---

<p align="center">
  <sub>Copyright © 2026 OmniMux Project and Contributors. Licensed under AGPL-3.0.</sub>
</p>
