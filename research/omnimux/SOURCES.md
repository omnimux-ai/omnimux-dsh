# 来源索引

> **历史定位边界（2026-10-08）**：本文的社媒全链路、短剧首发、矩阵增长和旧“唯一定位”属于所记日期的研究或决策；产品定位部分已由[角色生成与视频复刻](../../docs/contracts/product-positioning.md)替代。原历史正文、证据与技术分工保留，不据此恢复旧产品路线、执行旧请求示例或宣称当前功能已交付。


研究日期：2026-08-14。  
本地对照：`/Users/x/Desktop/Project/OmniMux`（new-api 维护 fork + `cli/`）与 sibling `/Users/x/Desktop/Project/OmniMux-docs`。  
CLI 版本：`@omnimux/cli` **0.3.0**（`cli/package.json`）。

只收录一手源：官方产品页、Mintlify 文档仓、本机 OmniMux 源码与 skill 合同。二手解读不进主文档。本目录不拷 skill 正文。

## 官方 / 公开页

| 文件 | URL | 用途 | 抓取备注 |
|---|---|---|---|
| `sources/official/01-omnimux-ai.md` | https://omnimux.ai/ | 产品定位、Agent 交付、不是端到端生成器 | 本地抽取，文案与 `docs/brand` 一致 |
| `sources/official/12-llms-txt.md` | https://omnimux.ai/llms.txt | Agent 可读产品简报、公开面清单 | 本地抽取，干净 |
| `sources/official/02-docs-en.md` | https://docs.omnimux.ai/en | 文档首页：制作 + 编排、全球渠道 | 导航噪音多，定位句可用 |
| `sources/official/03-docs-zh.md` | https://docs.omnimux.ai/zh | 中文文档首页，与英文同构 | 同上 |
| `sources/official/13-docs-llms.txt.md` | https://docs.omnimux.ai/llms.txt | 完整文档索引：视频模型页、任务查询、发布 API | 最有用的公开目录 |
| `sources/official/05-codex-cli.md` | https://docs.omnimux.ai/en/integration-guide/codex-cli | 把 OmniMux 配成 Codex 的模型提供方 | 集成面，不是短剧方法 |
| `sources/official/11-updates-en.md` | https://docs.omnimux.ai/en/updates | API Updates 存在；模型 ID 以线上定价为准 | 本地抽取到 changelog 入口 |
| `sources/official/14-video-task.md` | https://docs.omnimux.ai/en/api-reference/tasks/video-task | 官方 poll 路径与状态词 | 从 OmniMux-docs MDX 抄录 |
| `sources/official/15-connection-usage.md` | https://docs.omnimux.ai/en/faqs/connection-usage | 两套凭证、两套 base URL、402/403 | 同上 |

## 本机仓（真源）

| 路径 | 用途 |
|---|---|
| `OmniMux/docs/brand/omnimux-brand-strategy.md` v1.5+ | 对外主定位、能力主轴、不做端到端生成器 |
| `OmniMux/docs/brand/platform-introduction.md` | 平台介绍页结构：制作 + 编排 |
| `OmniMux/FORK.md` | 上游 QuantumNous/new-api；origin `laozhong86/OmniMux`；CLI 发布面 `omnimux-cli` |
| `OmniMux/AGENTS.md` | 网关分层、产品定位硬句、Gxgen 是 type 61 渠道 |
| `OmniMux/cli/AGENTS.md` | 用户级 CLI 边界、密钥、skill 扁平安装 |
| `OmniMux/cli/skill/README.md` + `manifest.json` | 17 个可安装 id、role |
| `OmniMux/cli/skill/omnimux/SKILL.md` + `docs/setup.md` + `docs/actions-exec.md` | CLI 动作、`tokens exec`、skill install |
| `OmniMux/cli/src/lib/skill.js` | 安装实现：link/copy、schema 2、二进制不带 skill/ |
| `OmniMux/cli/docs/ERROR_CONTRACT.md` | Agent RPC `contract_version: 1` |
| `OmniMux/cli/skill/video-*/SKILL.md` 与 `schemas/` | 方法论合同；开发期只读，不拷进本仓 |
| `OmniMux/cli/skill/video-creation/OMNIMUX.md` | 出片绑定：`POST /v1/video/generations` |
| `OmniMux/dto/video.go` + `dto/task.go` | 提交/任务 DTO |
| `OmniMux/docs/openapi/relay.json` | 公开视频路径 OpenAPI |
| `OmniMux/docs/ops/apimart-media-onboard-zh.md` | 客户入口示例：Seedance/Kling 按秒 |
| `OmniMux-docs/en/api-reference/tasks/video-task.mdx` | 文档仓 poll 页 |
| `OmniMux-docs/data/changelog/entries/2026-08-07-seedance-2-5.json` | Seedance 2.5 上架口径 |

## 本仓对照（不是 OmniMux 真源）

| 路径 | 用途 |
|---|---|
| `research/dsh/POSITIONING.md` | 已定站位：OmniMux 是灵魂面，dsh 是借来的 harness |
| `plugins/omnimux/` | 对外主包，Phase A 只挂载 |
| `plugins/omnimux-drama/` | `series/` 磁盘合同 |
| `fixtures/demo-series/series/` | 圣经 / 分集 / shots.json 样例 |
| `.agents/skills/short-drama-router/references/catalog.md` | dest 指针，安装命令不在本会话执行 |

## 未抓到或抓残

- `https://docs.omnimux.ai/en/introduction`、`/en/cli`、`/en/skills`、`/en/api-reference/video`：公开 URL 404。视频合同以 `docs/llms.txt` 里的模型页 + `tasks/video-task` + 本机 `relay.json` 为准。
- 根 `OmniMux/README.md` / `README.zh_CN.md`：仍是上游 New API 文案，没有 OmniMux 产品覆盖层。产品句以 `docs/brand/` 与官网为准。
- 根 `OmniMux/VERSION`：空文件。CLI 版本看 `cli/package.json`。

## 未采用

- Gxgen 产品页、`server/skills`、`gxgen` CLI（本路由器 reject）。
- `ugc-commerce-video-skill` 当作短剧脊柱（电商转化，不是系列叙事）。
- 把 `/api/social/v1` 发布当成 Drama Center 入驻。
