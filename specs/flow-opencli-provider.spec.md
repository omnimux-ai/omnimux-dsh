# Google Flow 本机生成通道接入 OmniMux 规格

- Issue: #2435
- 日期: 2026-09-20
- 上游依赖：OpenCLI 内置 flow 适配器（fork `laozhong86/OpenCLI` PR #1/#2 已合入，`clis/flow/{common,image,video,auth}.js`）

## 1. 目标与定位

将 Google Flow（flow.google.com）的 AI 生图与生视频能力作为 **OmniMux 本地增强生成能力** 接入：
1. **Agent 工具**：注册 `flow_image_generate` 与 `flow_video_generate`，支持在对话或智能体工作流中显式调用。
2. **工作台可视化调用**：在已落地的 OpenCLI 工具箱（`omnimux-social-harvest` 工作台）中展示 Google Flow 独立卡片、登录状态自检（`flow whoami`）与弹窗表单（生图/生视频）。

## 2. 架构边界与产品基线

- **与 Hub 云端网关隔离**：Flow 是基于本地浏览器逆向的 UI 自动化能力，不属于具备官方云端 API 文档的 Gateway 网关模型，不硬塞进 Hub 官方模型目录（`image-models.yaml` / `dispositions.json`），保持 80 款云端在售模型契约完整。
- **显式选择与零静默回退**：Flow 必须由用户显式选择（调用 Flow 工具或在工作台选 Flow 卡片）才触发，永不作为默认模型，绝不静默回退。
- **Fail-Closed 错误防护**：未安装 OpenCLI 或未登录 Google Flow 时，显式抛出结构化错误与指引（`HARVEST_NOT_INSTALLED` / `HARVEST_AUTH`），不产生伪造输出。
- **产物安全落盘**：产物下载至隔离路径（指定的 `dest` 或 `$DSH_HOME/omnimux-social-harvest/downloads/`），校验文件真实存在且非空，杜绝跨目录越界漏洞。

## 3. 工具与命令清单

### 3.1 平台注册表 (`registry.js`)
- 站点标识：`flow`（Google Flow）
- 命令：
  - `image`：AI 文生图（入参：prompt, ratio, count, output）
  - `video`：AI 文生视频 (Veo)（入参：prompt, ratio, output）
  - `login`：打开 flow.google.com 登录页
  - `whoami`：查看当前 Google Flow 登录状态

### 3.2 Agent 工具 (`tools.js`)
| 工具名 | 入参 | 功能说明 |
|---|---|---|
| `flow_image_generate` | `prompt`*, `ratio`, `count`, `dest` | 调用 Google Flow 生成图片，返回生成详情与落盘路径 |
| `flow_video_generate` | `prompt`*, `ratio`, `dest` | 调用 Google Flow 生成 Veo 视频，返回生成详情与落盘路径 |

## 4. 验收标准

1. `plugins/omnimux-social-harvest` 单元测试 100% 通过（平台注册表、参数校验、执行信封）。
2. `node scripts/test-agent-tools.mjs` 四层门禁全绿（含 Schema、沙箱容错与安全审计）。
3. `node scripts/verify-product-baseline.mjs` 零新增豁免通过。
4. PR 提交并合入 `main` 分支。
