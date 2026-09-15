# 开源公示与第三方项目致谢 (Acknowledgements & Third-Party Notices)

OmniMux 的诞生与演进离不开全球开源社区与先锋项目的杰出贡献。我们在开发过程中遵循开源社区的署名与共享精神，对直接 Fork、深度二开、Vendorize 引入或深度集成的第三方开源项目进行公开公示，并致以最诚挚的感谢！

---

## 一、直接 Fork 与深度二次开发的模块 (Forked & Vendorized Subsystems)

### 1. `omnimux-market` (插件与技能市场)
* **上游原始项目**：[@cocofhu/skillhub](https://github.com/cocofhu/skillhub) (v0.2.13)
* **原始作者 / 维护者**：[@cocofhu](https://github.com/cocofhu)
* **开源许可证**：[MIT License](https://opensource.org/licenses/MIT)
* **在 OmniMux 中的定位与改造**：
  * 基于 SkillHub 进行 Fork 二次开发，升级为 OmniMux 专属的扩展中枢；
  * 重构扩展为四大功能 Tab：**技能 (Skills) · 插件 (Plugins) · 专家 (Experts) · 连接器 (Connectors)**；
  * 深度适配 DSH 原生主题变量（`--dsw-*`）与中枢设置页。
* **致谢辞**：感谢 @cocofhu 打造的高效优雅的 Agent 技能检索与管理架构，为 OmniMux 扩展生态奠定了坚实基础。

---

### 2. `omnimux-clip` (OpenReel 视频剪辑工坊)
* **上游原始项目**：[Augani/openreel-video](https://github.com/Augani/openreel-video)
* **原始作者 / 维护团队**：Augani 及 OpenReel Contributors
* **开源许可证**：[MIT License](https://opensource.org/licenses/MIT)
* **在 OmniMux 中的定位与改造**：
  * 遵循微应用引入契约（`docs/contracts/openreel-vendor-contract.md`），完整 Vendorize 官方前端全套源码（多轨时间轴、视口、资源库、属性检查器）至 `plugins/omnimux-clip/src/client/openreel/`；
  * 封装 WebCodecs / WebGPU 导出管线，与 OmniMux 工作流画布实现 JSON 事件双向打通；
  * 映射官方 CSS 样式至 DSH `--dsw-*` 原生 Token 体系。
* **致谢辞**：致敬 Augani 团队在 Web 端非线性视频编辑（NLE）与 WebCodecs 高性能渲染领域的开创性工作！

---

### 3. `omnimux-desktop-fork` (桌面客户端底座)
* **上游原始项目**：[anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)
* **原始作者 / 维护团队**：Anywhere Labs
* **开源许可证**：[MIT License](https://opensource.org/licenses/MIT)
* **在 OmniMux 中的定位与改造**：
  * 作为 OmniMux 桌面端（Electron Shell）发布与物化的底座；
  * 注入 OmniMux 专属品牌 Chrome、多插件预装 Profile、统一开发与同步流水线（`yarn omnimux:*`）。
* **致谢辞**：感谢 Anywhere Labs 团队构建的极简且高性能的 DSH 桌面壳工程底座。

---

## 二、底层宿主与核心基础设施 (Core Host & Infrastructure)

### 4. DeepSeek Harness (DSH)
* **官方项目**：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
* **出品方**：DeepSeek AI 团队
* **开源许可证**：[MIT License](https://opensource.org/licenses/MIT)
* **在 OmniMux 中的定位**：
  * OmniMux 的核心插件运行底座与 Agent 工具调用宿主；
  * OmniMux 严格遵循 DSH 插件规范开发，不 fork harness 核心，全量复用其强大的沙箱与上下文调度能力。
* **致谢辞**：向 DeepSeek 团队开源如此卓越的 Agent 运行时与 Harness 架构致以崇高敬意！

---

## 三、核心开源依赖与引擎 (Core Dependencies & Engines)

| 项目名称 | 来源仓库 | 许可证 | 在 OmniMux 中的应用 |
| :--- | :--- | :---: | :--- |
| **Augani/openreel-video (OpenReel)** | [Augani/openreel-video](https://github.com/Augani/openreel-video) | MIT | `omnimux-clip` 专业微应用多轨时间轴、WebCodecs 与硬件加速剪辑引擎 |
| **React Flow (@xyflow/react)** | [xyflow/xyflow](https://github.com/xyflow/xyflow) | MIT | `omnimux-workflow` 无限画布节点连接与 DAG 拓扑编排引擎 |
| **Umami Analytics** | [umami-software/umami](https://github.com/umami-software/umami) | MIT | `omnimux-analytics` 隐私友好的插件使用指标与社媒运营数据计算 |
| **Blobatar** | [joshglendenning/blobatar](https://github.com/joshglendenning/blobatar) | MIT | `omnimux` 执行中枢账号与 Agent 动态色彩头像哈希生成 |
| **AIGC Provider Runtime Kit** | [laozhong86/aigc-provider-runtime-kit](https://github.com/laozhong86/aigc-provider-runtime-kit) | MIT | `omnimux` 多模态流式协议通信与运行时统一适配工具库 |
| **Dagre** | [dagrejs/dagre](https://github.com/dagrejs/dagre) | MIT | 工作流画布有向图自动分层布局算法 |

---

## 四、商业模式与产品架构灵感致敬 (Inspirations & Tributes)

* **[n8n (n8n-io/n8n)](https://n8n.io)**：
  * 启发了我们建立兼顾“开发者自由修改开源”与“商业可持续变现”的 **Sustainable Source / Source-Available** 双轨制许可架构，以及节点级可视化编排的产品思想。
* **[OpenReel Video (Augani/openreel-video)](https://github.com/Augani/openreel-video)**：
  * 为 OmniMux 提供了强大的开源多轨时间轴剪辑内核，让 AI 视频生成摆脱了不可控的模板拼装，迈入工业级精剪与微调。

---

## 五、开源许可证合规说明 (License Compliance Notice)

OmniMux 严格尊重上述所有开源项目的原作者知识产权与开源许可证条款：
1. 本项目中包含的所有第三方源代码或分发包均保留其原始的版权声明（Copyright Notices）与许可证文本；
2. 即使 OmniMux 顶层采用 Sustainable Source License 保护商业权益，**本项目中所有独立引入的第三方 MIT / Apache 2.0 组件，其上游原始代码依然保持原有宽松开源许可证权利不变**。

*如有任何版权归属疑问或遗漏，欢迎联系 `opensource@omnimux.ai`，我们将第一时间核实并更新致谢清单！*
