# OmniMux Device

> OmniMux 移动真机矩阵与设备智能体中枢（Mobile Device Farm & Agent Brain）

专为 DeepSeek Harness / OmniMux 打造的 iOS 物理真机自动化与设备池化中控系统。深度融合了 **`prod-FARM-IOS-Core` 的机房硬件池化守护**、**`dsh-ios` 的语义无障碍感知与本地 Vision OCR**，并搭载 **`TypeSafe Jev` 毫秒级快速决策模型**，实现真正由 AI Agent 自主闭环控制的多手机矩阵系统。

---

## 核心技术特性

* 📱 **真机集群池化管理**：多台 USB 连接 iPhone 自动探活、端口自动分配、自动锁屏解锁与崩溃自愈。
* ⚡ **快慢双脑协同回路**：顶层通用大模型（DeepSeek / Claude）负责长程意图理解，底层 TypeSafe Jev 负责百毫秒级极速微操判定。
* 🧭 **多模态语义无障碍感知**：基于 AXe 语义树与本地自编译 Apple Vision 毫秒级中英文 OCR，彻底告别脆弱的写死像素坐标。
* 🛡️ **安全与置信度硬门禁**：每个操作经过严格的概率校准，低于置信度阈值拒绝盲点，有效防止账号风控与误操作。
* 📺 **DSH 对话侧边栏实时投屏**：多机 MJPEG 流低延迟直通侧边栏，支持边聊边看、支持随时用鼠标人工接管。

---

## 文档指引

* [**产品需求规格说明书 (PRD.md)**](./PRD.md)：业务背景、用户旅程、核心特性规格与 KPI 指标。
* [**系统架构设计说明书 (ARCHITECTURE.md)**](./ARCHITECTURE.md)：三层解耦模型、双脑决策回路、WDA 硬件中控与 API 契约设计。

---

## 核心参考开源项目

本插件的工程架构立足于以下优秀开源实践的深度融合与进化：
1. **[Git-Agni/prod-FARM-IOS-Core](https://github.com/Git-Agni/prod-FARM-IOS-Core)**：提供了业界领先的 iPhone 硬件池化管理、锁屏解锁与 TikTok 发布链路设计经验（本地源码保留在 `/Users/x/Desktop/Project/Github/prod-FARM-IOS-Core`）。
2. **[ZSeven-W/dsh-ios](https://github.com/ZSeven-W/dsh-ios)**：提供了 DSH 体系下成熟的 iOS 语义化工具集、AXe 无障碍树与原生 Vision OCR 原生编译流水线（本地源码保留在 `/Users/x/Desktop/Project/Github/dsh-ios`）。
3. **[TypeSafe AI](https://typesafe.ai/)**：提供了基于 RLCD / RLVR 的毫秒级快速决策与置信度校准能力。
