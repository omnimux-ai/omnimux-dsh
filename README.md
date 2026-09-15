# OmniMux

<p align="center">
  <strong>The Open-Source AI Marketing Video Engine & Viral Reproduction Studio</strong><br>
  <sub>开源企业级 AI 营销短视频生成与爆款视频复刻出片中枢</sub>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Source--Available-blue.svg" alt="License: Source-Available"></a>
  <a href="COMMERCIAL.md"><img src="https://img.shields.io/badge/Edition-Community%20%7C%20Enterprise-success.svg" alt="Community | Enterprise"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.19%20%7C%7C%20%3E%3D24-brightgreen.svg" alt="Node Version"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/Ecosystem-DeepSeek%20Harness-purple.svg" alt="DSH Ecosystem"></a>
  <a href="https://discord.gg/omnimux"><img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2.svg?logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://x.com/omnimux_ai"><img src="https://img.shields.io/badge/X%20(Twitter)-@omnimux__ai-black.svg?logo=x&logoColor=white" alt="Twitter"></a>
  <a href="#-社区交流与开发者群-community"><img src="https://img.shields.io/badge/WeChat-开发者交流群-07C160.svg?logo=wechat&logoColor=white" alt="WeChat"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-Welcome-orange.svg" alt="PRs Welcome"></a>
</p>

---

## 🌟 简介 (Introduction)

**OmniMux** 是专为跨境电商、短视频创作者、MCN 机构与出海营销团队打造的**开源企业级 AI 营销短视频出片与爆款视频复刻中枢**（基于 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 运行时）。

针对传统云端视频生成平台（如 **Topview.ai**、**Creatok.ai** 等）普遍存在的**高昂积分抽成（出片成本昂贵）**、**黑盒死板模板（无法精细调控分镜与剪辑）**、**商业素材外泄风险**以及**缺乏矩阵分发落地**等核心痛点，OmniMux 提供了**完全自托管、零点数抽水、深度可控**的企业级全链路出片解决方案：

打通从 **爆款灵感逆向拆解 → 电商链接/卖点智能出片 → 无限节点画布精控分镜 → 专业多轨时间轴剪辑精修 → 社媒多账号矩阵全托管批量发布** 的工业级商业闭环。

---

## 🥊 行业标杆对标与核心壁垒 (Benchmarking & Core Moat)

相比于行业知名的商业闭源工具，OmniMux 在自托管私有化、全流程掌控力与出片性价比上具备压倒性优势：

| 核心对比维度 | OmniMux (本项目) | Topview.ai (电商出片标杆) | Creatok.ai (社媒裂变标杆) | 传统云端模板视频 SaaS |
| :--- | :--- | :--- | :--- | :--- |
| **核心业务定位** | **企业级 AI 爆款视频复刻与矩阵出片中枢** | 跨境电商商品链接转广告视频 (URL to Video) | 社媒短视频爆款脚本复刻与批量裂变 | 固定模板换字换图拼装 |
| **视频生成模式** | **爆款反推 + 多模态节点画布 + 多轨剪辑工坊** | 云端黑盒自动拼接，依赖标准广告模板 | 预设短视频模板套用，偏向通用社媒脚本 | 简单图层时间线叠加 |
| **模型与算力自由度** | **完全私有化自选**，直连各大主流多模态模型 | 平台绑定官方模型，无法自定义底层引擎 | 平台绑定模型，黑盒闭源不可调整 | 无大模型直连能力 |
| **后期精细剪辑** | **内置专业多轨时间轴工坊 (OpenReel 引擎)** | 仅支持基础字幕与音乐微调，无法深改分镜 | 基础模块替换，缺乏多轨时间轴精剪能力 | 简单替换，极难二次创作 |
| **社媒矩阵分发闭环** | **内置多平台账号池风控、批量排期与数据回流** | 仅支持生成后单视频下载，无矩阵分发中枢 | 仅支持部分社媒单账号发布，无矩阵风控体系 | 无社媒矩阵托管能力 |
| **商业模式与成本** | **开源自托管 / 企业授权，零点数抽水** | **高昂积分点数制**（按生成时长与次数重度抽成） | **SaaS 订阅制 + 严格条数限制**，规模化极贵 | 按年高额软件费 + 点数充值 |

### 🚀 OmniMux 四大降维打击优势
1. **零抽水与成本直降 70%~90%**：彻底终结第三方 SaaS 平台昂贵的“积分点数消耗”。自托管直接调用主流模型底层 API，按实际算力原价付费，无中间商差价。
2. **兼具 Creatok 爆款解构与 Topview 链接出片**：既能上传热门爆款视频一键提取“前 3 秒黄金吸睛点（Hook）+ 叙事节奏 + 分镜工程”，也能输入电商链接或卖点一键生成高转化带货短视频。
3. **无限节点画布 + 内置多轨时间轴剪辑（拒绝开盲盒）**：不仅提供一键出片，更拥有类似 ComfyUI 的节点级自由画布，支持单独调节任意镜头模型与参数；内置专业级 OpenReel 多轨时间轴剪辑工坊，字幕、音轨、画中画随心精调。
4. **原生多账号矩阵安全风控与自动化发布**：自带社媒矩阵账号池、防关联安全风控与全托管批量定时发布，直接完成从“视频批量制作”到“矩阵规模化获客”的商业落地。

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

---

## 🧩 核心插件功能矩阵与开发阶段 (Plugin Matrix & Lifecycle)

OmniMux 遵循“一切皆插件”的模块化设计，业务垂直插件各司其职且松耦合，当前全量插件的功能与演进阶段如下：

### 1. 多模态内容创作与视频出片中枢

| 插件模块 (Package) | 中文定位 | 核心功能亮点 | 当前阶段 (Status) |
| :--- | :--- | :--- | :---: |
| **`omnimux`** | 执行中枢底座 | 统一产品外观、全模态模型统一路由调度、账号鉴权与凭证安全托管 | ![GA](https://img.shields.io/badge/%E5%B7%B2%E5%86%85%E7%BD%AE-GA-2EA44F?style=flat-square) |
| **`omnimux-workflow`** | 工作流无限画布 | 基于 React Flow 的可视化 DAG 画布，支持模型节点连线、参数微调与分镜生图/生视频 | ![GA](https://img.shields.io/badge/%E5%B7%B2%E5%86%85%E7%BD%AE-GA-2EA44F?style=flat-square) |
| **`omnimux-clip`** | 视频剪辑工坊 | 集成 OpenReel 引擎，提供专业级多轨时间轴、WebCodecs 硬件加速与画中画/音轨精修 | ![GA](https://img.shields.io/badge/%E5%B7%B2%E5%86%85%E7%BD%AE-GA-2EA44F?style=flat-square) |
| **`omnimux-viewer`** | 全能媒体渲染底座 | 支持 36 种音视频/图片/文档本地就地内联播放、画中画与放大预览，告别纯文本文件名 | ![GA](https://img.shields.io/badge/%E5%B7%B2%E5%86%85%E7%BD%AE-GA-2EA44F?style=flat-square) |
| **`omnimux-assets`** | 创作资产库 | 300+ 热门数字人角色、声音音色库、背景与风格预设统一存储与管理 | ![GA](https://img.shields.io/badge/%E5%B7%B2%E5%86%85%E7%BD%AE-GA-2EA44F?style=flat-square) |
| **`omnimux-products`** | 电商商品库 | 跨平台商品信息抓取、白底图清洗、卖点提炼与带货分镜脚本智能派生 | ![GA](https://img.shields.io/badge/%E5%B7%B2%E5%86%85%E7%BD%AE-GA-2EA44F?style=flat-square) |
| **`omnimux-inspiration`** | 爆款灵感复刻库 | 热门带货短视频逆向拆解、黄金前 3 秒吸睛钩子 (Hook) 分析与结构化工程导出 | ![Beta](https://img.shields.io/badge/%E5%85%AC%E6%B5%8B-Beta-F59E0B?style=flat-square) |

### 2. 社媒矩阵增长与运营自动化

| 插件模块 (Package) | 中文定位 | 核心功能亮点 | 当前阶段 (Status) |
| :--- | :--- | :--- | :---: |
| **`omnimux-publish`** | 多平台发布中心 | 草稿箱管理、多平台（TikTok/YouTube/X等）并发排期分发、任务台账与回流 | ![Beta](https://img.shields.io/badge/%E5%85%AC%E6%B5%8B-Beta-F59E0B?style=flat-square) |
| **`omnimux-accounts`** | 矩阵账号池风控 | 社交媒体多账号授权绑定、状态心跳监控、代理 IP 隔离与防关联安全保障 | ![Beta](https://img.shields.io/badge/%E5%85%AC%E6%B5%8B-Beta-F59E0B?style=flat-square) |
| **`omnimux-browser`** | 浏览器伴侣扩展 | Chrome 扩展双向安全桥接、网页素材直链嗅探、原生侧边栏对话交互 | ![GA](https://img.shields.io/badge/%E5%B7%B2%E5%86%85%E7%BD%AE-GA-2EA44F?style=flat-square) |
| **`omnimux-automation`** | 自动化任务工作台 | 独立会话定时无人值守调度、巡检监控与执行历史总览卡片 | ![Beta](https://img.shields.io/badge/%E5%85%AC%E6%B5%8B-Beta-F59E0B?style=flat-square) |
| **`omnimux-analytics`** | 运营与插件指标分析 | 隐私友好的本地数据计算（基于 Umami 内核），出片与发布效果数据看板 | ![Beta](https://img.shields.io/badge/%E5%85%AC%E6%B5%8B-Beta-F59E0B?style=flat-square) |
| **`omnimux-intercept`** | 社媒爆速监测与截流 | 推文存活时速算法计算、三档爆速评级、高赞评论与引用转发草稿一键生成 | ![Alpha](https://img.shields.io/badge/%E5%AE%9E%E9%AA%8C-Alpha-6B7280?style=flat-square) |

### 3. 插件生态与应用形式

| 插件模块 (Package) | 中文定位 | 核心功能亮点 | 当前阶段 (Status) |
| :--- | :--- | :--- | :---: |
| **`omnimux-market`** | 扩展与技能市场 | 基于 SkillHub 架构，提供技能 (Skills)、插件、专家角色与连接器四合一生态 | ![GA](https://img.shields.io/badge/%E5%B7%B2%E5%86%85%E7%BD%AE-GA-2EA44F?style=flat-square) |
| **`omnimux-forms`** | 任务配置表单 | Schema 驱动的配置式表单向导，快速引导出片参数并生成会话草稿 | ![Beta](https://img.shields.io/badge/%E5%85%AC%E6%B5%8B-Beta-F59E0B?style=flat-square) |
| **`omnimux-apps`** | AI 独立应用工坊 | 针对特定出片业务的独立轻量交互界面，支持表单与结果对照 | ![Alpha](https://img.shields.io/badge/%E5%AE%9E%E9%AA%8C-Alpha-6B7280?style=flat-square) |

---

## 📚 开发者资源与生态文档 (Developer Resources)

我们为开源贡献者与二次开发团队提供了完备的规范与文档支持：

| 关注目标 | 资源与文档入口 | 说明 |
| :--- | :--- | :--- |
| **快速上手与业务实战** | [跨境电商与社媒短视频出片实战指南](docs/guides/ecommerce-video-replication.md) | 从爆款视频拆解、商品转视频到多轨剪辑与矩阵分发的端到端手册 |
| **执行中枢接口全景** | [执行中枢接口全景面板](docs/tools/hub-interfaces.html) | 模型能力、智能体工具、账号平台与发布通道的实时映射与门禁真源 |
| **开发与协作约束** | [AGENTS.md 开发规范](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | 涵盖 Agent 驱动开发约束、质量闭环与多 Worktree 物理隔离守卫 |
| **商业模式与授权申请** | [商业与企业许可指南](COMMERCIAL.md) | 社区开源自托管 vs 商业企业版授权、成本优势与 OEM 白标申请 |
| **开源第三方项目公示** | [致谢与第三方声明](ACKNOWLEDGEMENTS.md) | 完整收录所有 Fork、引入的开源插件、底层引擎与许可证溯源 |

---

## 💼 版本对比 (Community vs Enterprise)

OmniMux 采用标准的 **Open-Core** 模式与 **Sustainable Source** 许可：

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
* **[liustack/dsh-viewer](https://github.com/liustack/dsh-viewer)** (MIT License, by [@liustack](https://github.com/liustack))：`omnimux-viewer` 全能媒体渲染器插件真源，提供 36 种媒体与文档格式的就地内联播放能力。
* **[Lum1104/dsh-browser](https://github.com/Lum1104/dsh-browser)** (MIT License, by [@Lum1104](https://github.com/Lum1104))：`omnimux-browser` 浏览器伴侣插件与 Chrome 扩展底座真源，打通网页媒体感知与双向桥接。
* **[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)** (MIT License, by DeepSeek AI)：官方核心 Agent 运行底座与 Harness 插件规范。
* **[anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)** (MIT License, by Anywhere Labs)：OmniMux 桌面端 Electron Shell 的 Fork 底座。
* **[@xyflow/react (React Flow)](https://github.com/xyflow/xyflow)** (MIT License, by xyflow)：`omnimux-workflow` 无限画布 DAG 节点连接与编排引擎。
* **[Umami Analytics](https://github.com/umami-software/umami)** (MIT License)：`omnimux-analytics` 隐私友好的插件指标与社媒运营分析。
* **[Blobatar](https://github.com/joshglendenning/blobatar)** (MIT License, by Josh Glendenning)：`omnimux` 账号与 Agent 动态色彩头像生成。
* **模式致敬**：感谢 **[n8n](https://n8n.io)**（可视化节点编排与可持续源码许可）的产品与商业化启发。

*完整第三方开源项目清单与许可证声明详见 **[ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)**。*

---

## 📄 开源许可与商业授权 (License & Commercial)

* **开源自托管许可**：本项目遵循 **[OmniMux Sustainable Source License (Version 1.0)](LICENSE)**（Source-Available 模式）。个人使用、科研学术及企业内部自建业务完全免费。
* **商业授权**：若您需要将 OmniMux 包装成商业产品转售（OEM 贴牌）、搭建收费 SaaS 云服务或采购 Enterprise 企业版，请联系 `hello@omnimux.ai` 或查阅 **[COMMERCIAL.md](COMMERCIAL.md)**。

---

<p align="center">
  <sub>Copyright © 2026 OmniMux Project. All rights reserved.</sub>
</p>
