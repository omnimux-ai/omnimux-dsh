# omnimux-market · 插件市场

OmniMux 的 DeepSeek Harness 插件市场：一个插件、四个 tab——**技能 / 插件 / 专家 / 连接器**。基于开源的 [@cocofhu/skillhub](https://github.com/cocofhu/skillhub) v0.2.13（MIT）二次开发，fork 改名而来。

- **取代** 第三方插件 [`@cocofhu/skillhub`](https://www.npmjs.com/package/@cocofhu/skillhub)（原版请自行禁用，功能已全部包含在本插件）
- **取代** `omnimux-gallery`（已标记 DEPRECATED 待下线，其「专家 / 技能 / 连接器」能力已迁移到本插件的对应 tab）

## 功能

侧栏底部的 **插件市场** 按钮在聊天区打开独立面板，四个 tab 可切换：

| Tab | 数据来源 | 能做什么 |
| --- | --- | --- |
| 技能 | [SkillHub](https://skillhub.cn) 公开 API | 关键词 / 分类搜索，卡片点开详情（概述、版本历史、TRACE 评测），zip 安装、指定版本、卸载 |
| 插件 | SkillHub 的 DSH 插件目录（GitHub MIT 开源插件） | 分类浏览、仓库详情，install-plan 校验 pinned commit 后在宿主进程执行安装，进度条 + 一键重启 |
| 专家 | 本地静态目录 `catalog/`（105 条：专家 + 专家团） | 分类 / 关键词过滤；点卡片即 **召唤**：未安装先装进 skills 目录，把 `/技能名` 手势写进当前输入框；空白会话自动切换专家模式预设 |
| 连接器 | 本地静态目录 `catalog/`（18 条） | 点卡片切换 **安装 / 卸载**；MCP 连接器写入 profile 的 `cordis.patch.yml` 托管段（见下） |

对话流内同样可用技能搜索卡片与详情抽屉；界面跟随 Harness 中英文。

### 连接器装卸需要重启 Host

连接器本质是 profile `cordis.patch.yml` 里的 MCP 客户端行，**只在 Host 启动时读取**。安装 / 卸载成功后请重启 `dsh web`（或对应 Host）才生效，面板会给出提示。

MCP 行写在 `# --- omnimux-market managed ---` 与 `# --- end omnimux-market managed ---` 注释对之间（行 id 前缀 `esc-mcp-`，与 omnimux-gallery 互认已装状态）。**请勿手编托管段**——卸载时插件只回收自己写的内容，标记对之外的用户内容一个字节都不会动。

## 环境要求

- Node.js 22+
- DeepSeek Harness Web（`dsh web`）

## 安装

```sh
dsh plugin --profile omnimux add omnimux-market
```

或随 OmniMux 仓库物化分发（维护者从 fork 主入口执行）：

```sh
cd ~/Desktop/Project/omnimux-desktop-fork
yarn omnimux:sync omnimux-market
yarn omnimux:restart
```

安装后重启 Host 并强制刷新浏览器。本地开发见下文「开发」。

## 目录数据来源

`catalog/`（`index.json` + 技能包 + 头像）来自 [infometa/workbuddyskills](https://github.com/infometa/workbuddyskills) 的同步漏斗：omnimux-gallery 的 `scripts/sync-workbuddyskills.mjs` 抓取上游仓库、按 schema=1 校验后产出。当前 omnimux-market 直接复用 gallery 的产出，漏斗脚本随 gallery 下线时一并迁入本插件。

## 配置

**设置 → 插件 → 插件配置 → 插件市场**：API 地址、安装目录（默认 `$DSH_HOME/skills`）、搜索结果上限。保存即时生效，写入用户目录的 `omnimux-market.json`，不进 git。

自更新已禁用（fork 已分叉，上游 release 会覆盖改名）：版本随 omnimux-dsh 仓库发布，不走 GitHub release 更新。

## 开发

```sh
cd plugins/omnimux-market
pnpm install
pnpm run build
node --test lib/tests/*.test.js   # 宿主 + 客户端逻辑
node --test src/expert/*.test.js  # 专家 / 连接器目录、装卸、召唤
```

源码 `src/`，构建产物 `lib/`（由 `prepare` 生成，不进版本库）。客户端拆在 `src/client/*.js`，`npm run build` 用 `scripts/concat-client.mjs` 拼成单个 ModuleLoader 文件 `lib/client.js`（宿主只认这一份）。合入前在隔离 worktree 完成相关自动化/静态检查与独立评审，通过 required CI/MQ；合入后才从 `main` 物化 Dev。Host（`src/*.ts`）变更需重新加载目标 Host，Client 物化后刷新指定页面，再在 45120 使用 ego-browser 与共享探针验收。不存在合入前独立运行环境；详见[插件 QA](../../docs/contracts/plugin-qa.md)。

## 安全

安装第三方技能 / 插件等于在本机落下可被 Agent 读取的文件或代码。连接器安装会把 MCP 客户端行写进 profile。请只安装你信任的来源。

## 许可证

[MIT](LICENSE)

基于 [@cocofhu/skillhub](https://github.com/cocofhu/skillhub) v0.2.13（MIT）二次开发，版权与修改说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。SkillHub、DeepSeek 等名称归其各自所有者，本项目与它们没有从属或背书关系。
