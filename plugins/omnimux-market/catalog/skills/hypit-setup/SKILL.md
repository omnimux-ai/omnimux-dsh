---
name: hypit-setup
description: Guide the user to install official Hypit (skill + executable) from Hypit.AI sources. OmniMux only provides discovery and session guidance; it does not redistribute Hypit code or binaries. Keep Hypit name and copyright on any surfaced CLI/report output.
---

# Hypit-克隆爆款视频（安装引导）

本技能是 **OmniMux 自有的安装向导**，不是 Hypit 引擎本体。

- 版权与品牌归 **Hypit.AI**；展示其 CLI/报告时不得去掉名称与版权信息。
- OmniMux **不捆绑、不镜像** Hypit 源码、可执行包或官方 handbook 全文。
- 用户确认后，只从 **Hypit 官方公开渠道** 安装。

## 何时使用

用户在技能市场点了「Hypit-克隆爆款视频」的安装/试用，或明确说要启用 Hypit。

## 安装步骤（Agent 执行）

1. **说明第三方性质**（一两句）：即将按 Hypit 官方方式安装；能力与许可以官方为准。
2. **安装官方 Skill**（知识包，非 OmniMux 目录拷贝）：

```bash
npx skills add hypit-ai/hypit -g
```

3. **安装官方可执行包**（与 Skill 生命周期分离）：

```bash
npm install --global @hypit/hypit
```

若用户只要项目内依赖，可用：

```bash
npm install --save-dev @hypit/hypit
```

4. **验收**：

```bash
hypit --version
hypit --help
hypit paths
```

找不到命令时检查 `npm prefix --global` 与 PATH；可用 `npm exec --no -- hypit --version` 探测。
5. **报告结果**：版本、路径、失败时的原始错误。不要回落到「从 OmniMux 安装包解压 Hypit」。
6. **装好之后**：按已安装的官方 Hypit Skill 继续；需要可执行能力时用本机 `hypit`，保留品牌信息。

## 禁止

- 不得把 Hypit 源码/二进制拷进 OmniMux 安装目录或技能市场私有镜像。
- 不得改名换皮后当 OmniMux 自有引擎售卖。
- 不得在未获授权时做多租户/SaaS 托管 Hypit。
- 不得自动代用户提交付费/账号注册。

## 官方参考

- 仓库：`https://github.com/hypit-ai/hypit`
- Skill 安装：`npx skills add hypit-ai/hypit -g`
- 可执行包：`@hypit/hypit`
