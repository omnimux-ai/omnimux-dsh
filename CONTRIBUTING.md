# 贡献指南 (Contributing to OmniMux)

感谢您关注并有意向为 OmniMux 贡献代码与生态！无论是提交 Bug 报告、提出功能建议、优化文档，还是编写全新的 Agent 插件，我们都非常欢迎。

---

## 1. 行为准则 (Code of Conduct)

参与 OmniMux 社区的所有成员均需遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。请保持友好、包容与互相尊重。

---

## 2. 参与方式 (How to Contribute)

### A. 提交 Issue
- **Bug 报告**：请使用项目提供的 Bug 报告模板，详细说明复现步骤、操作系统、Node/pnpm 版本以及相关日志截图。
- **功能建议 / RFC**：欢迎在 Discussions 或 Issue 中阐述您的业务场景与预期设计。

### B. 贡献代码 (Pull Request)
1. **Fork 本仓库** 到您个人的 GitHub 空间。
2. **克隆代码并创建特性分支**：
   ```bash
   git clone https://github.com/<your-username>/omnimux-dsh.git
   cd omnimux-dsh
   git checkout -b feat/your-awesome-feature
   ```
3. **安装依赖与环境就绪**：
   本项目要求 Node.js `>=22.19 || >=24` 与 `pnpm >=9`。
   ```bash
   pnpm install
   ```
4. **运行全量自动化测试与静态门禁**：
   ```bash
   pnpm test
   ./scripts/smoke.sh
   ```
5. **提交 Commit 规范**：
   遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：
   - `feat(plugin-name): add new feature`
   - `fix(hub): resolve auth token refresh`
   - `docs: update commercial licensing guide`
   - `refactor(client): flatten stage component`
6. **推送到远端并创建 Pull Request**：
   - 填写 PR 模板，勾选测试自检项。
   - 确保全量 CI 检查（Quality Gates / Test Suites）为绿色通过状态。

---

## 3. 开发架构与插件设计规范

- **执行中枢 (`plugins/omnimux/`)**：负责凭证路由、官方通道与统一外壳；不要在垂直业务插件中重复编写路由中枢或硬编码密钥。
- **业务垂直插件 (`plugins/omnimux-*`)**：每个插件聚焦自身领域（工作流、资产库、产品库、剪辑工坊、发布中心、灵感社区）。
- **设计系统约束 (`design.md`)**：
  - 100% 消费 DSH 原生 `--dsw-*` CSS 变量与设计规范；
  - 严禁硬编码 Hex/RGBA 裸颜色；
  - 遵循 32px 控件高基线与 8px 圆角体系。

---

## 4. 贡献者许可协议 (Contributor License Agreement)

当您向 OmniMux 仓库提交 Pull Request 时，即代表您同意：您所贡献的代码将以与本项目相同的 **OmniMux Sustainable Source License (Version 1.0)** 许可协议分发并包含在项目中。
