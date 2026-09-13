# omnimux-assets

OmniMux **创作资产库**（v0.2）：一条资产是有名字、类型、描述、可选素材路径的创作对象，不是文件夹挂载。

- **六类常驻**：角色 / 场景 / 风格包 / 道具 / 知识包 / 自定义（自定义 = 未选分类）
- **素材物化（2026-08-30）**：导入 copy 进 `$DSH_HOME/omnimux/assets/data/files/<id>/`。用户原文件不删、不改名。删资产记录可回收受管副本。合同：`docs/contracts/project-assets-contract.md`
- **入口**：侧栏「资产库」→ 一级页「+ 添加资产」弹窗。本轮不做导入资产包
- **产物**：`assets_upload` 仍写入自有 artifacts 区；一级页不再作为主视图

一级页入口：侧栏「资产库」行（新会话下方）。页面以 `shell.overlay` 覆盖会话列，顶栏 chrome `12px 20px 12px`。

## 安装与验证

日常进 App：

```sh
cd /Users/x/Desktop/Project/omnimux-desktop-fork
corepack yarn omnimux:sync omnimux-assets
corepack yarn omnimux:restart
```

开发：

```sh
npm test                # node --test src/*.test.js src/client/*.test.js
npm run build           # esbuild → lib/client.js（ModuleLoader 包裹，ID = omnimux-assets）
npm run build:cloud-catalog   # 重扫本地素材库 → cloud-catalog/ 静态分片清单
```

## 云端素材中心（cloud tab）

一级页「云端」标签是一个只读的**静态分片清单**，加载模型照搬 OmniMux 灵感社区：
`manifest.json` + `{category}[/{sub_category}]/page-NNNN.json`，每页 24 条，前端按需拉取而不是
一次载入整个库。

产物目录 `cloud-catalog/`（随插件提交，`package.json` 的 `files` 已列入）：

```
cloud-catalog/
├── manifest.json                              # categories / sub_categories / total / pages / sourceRoot
├── index.json                                 # id → 行（Host 用它解析媒体与收藏到本地）
├── knowledge/{prompt,note,storyboard}/page-NNNN.json
├── character/{digital-human,virtual-influencer}/page-NNNN.json
├── scene/ambience/page-NNNN.json
├── prop/{green-screen,hook-video}/page-NNNN.json
├── style/{image-preset,video-tone}/page-NNNN.json
└── audio/{voiceover,sfx,bgm}/page-NNNN.json
```

六大分类共 3333 条：知识包 1502（含短剧拆镜 143）、角色 428（329 实景数字人 + 99 虚拟红人）、
场景 14、道具 160（150 绿幕贴片 + 10 商品特写）、风格 592（583 生图预设 + 9 视频调性）、
声音 637（配音 527 = 509 火山引擎官方音色 + 18 实录；音效 2；背景音 108）。

生成脚本 `scripts/build-cloud-assets-catalog.mjs`：

- 默认读 `/Users/x/Desktop/Project/OPC/资产库`，可用 `--assets-root=` 换根、`--out=` 换输出、`--dry-run` 只统计
- 每个数据源都可缺失：缺源只让该分类变空，不会让整次构建失败
- 灵感社区是独立系统，按目录名跳过
- 素材路径写 `file:<相对 assets-root 的路径>`；同时有本地副本与可公开访问的远端地址时，远端地址存进
  `meta.source_media_url`，换机器仍可播放（453 行只有本地副本，其余 708 行带远端回退）

Host 侧（`src/cloud-catalog.js` + `src/http-routes.js`）：

| 路由 | 作用 |
| --- | --- |
| `GET /omnimux/assets/cloud/manifest` | 总控清单（本地兜底；网关可达时不走这条） |
| `GET /omnimux/assets/cloud/{category}[/{sub}]/page-NNNN.json` | 直通磁盘的分片文件（同上） |
| `GET /omnimux/assets/cloud/search?q=&category=&sub_category=` | 清单内检索 |
| `GET /omnimux/assets/cloud/media?id=&which=media\|cover` | 本地素材直接流式返回，远端素材 302 到 CDN |
| `POST /omnimux/assets/cloud/save` | 「收藏到本地」：复制/下载进本地资产库 |

### 清单元数据来源：网关优先，本地兜底

同一份清单存在两处：生产网关（Caddy 静态路由 `/cloud-assets-catalog/*`，见 OmniMux 仓库
`deploy/geminix/caddy/Caddyfile.tpl` 与 `scripts/ops/cloud-assets-catalog-publish.sh`）和随插件提交的
`cloud-catalog/`。`src/client/cloud-source.js` 按下面的顺序决定读哪一份：

| 优先级 | 来源 | 配置方式 |
| --- | --- | --- |
| 1 | 运行时覆盖 | `window.__OMNIMUX_CLOUD_ASSETS_BASE_URL__` |
| 2 | 构建期注入 | `CLOUD_ASSETS_BASE_URL=<url> npm run build` |
| 3 | 生产网关 | `https://omnimux.ai/cloud-assets-catalog` |

探活 `manifest.json` 成功就走网关，失败自动回退本地 Host；响应必须是 JSON——SPA 兜底会拿 200 +
HTML 应答任意未知路径，只看状态码会把 HTML 当清单。`local` / `off` / `host` / 空串可跳过探活强制只用本地，
每会话只探一次，手动刷新时强制重探。

只有**清单元数据**走网关：媒体字节仍由 Host 代理（`file:` 定位符只有本机能解析），检索与「收藏到本地」也留在
Host 一侧，避免同一份逻辑在网关与本地各写一遍而漂移。

代价是网关与本地副本可能不同期：网关清单比本地新时，页面上能看到、但本地 `index.json` 还没有的行，试听与收藏
会失败。换目录重新构建本地副本（`npm run build:cloud-catalog`）即恢复一致。

安全边界：

- 分片路径逐段通过白名单校验后再拼接，`..`、绝对路径、未知 scope 一律拒绝
- `media` 只接受 `index.json` 里存在的 id，id 是句柄而不是路径
- `file:` 定位符解析后必须仍落在清单记录的 `sourceRoot` 内，越界即视为不可用
- `which=cover` 只返回图片：没有海报的行返回 404，不会把整段视频塞进 `<img>`
- 远端下载上限 512 MB，且走 loopback 写校验

## 数据位置

全部落 `$DSH_HOME || ~/.dsh` → `omnimux/assets/`（本插件唯一可写区；目录 `0700`、JSON `0600`）：

```
omnimux/assets/
├── library.json           # schema 2：assets[] + revision；files[] 记仓内相对路径
├── mappings.json          # v0.1 遗留；启动时一次性迁成 custom 资产
├── data/files/<assetId>/  # 全局受管物理副本（2026-08-30）
├── artifacts.json         # 产物索引（一级页隐藏）
├── scans/<mapping_id>.json
└── artifacts/<aa>/<sha256>.<ext>
```

用户桌面原文件留在原地。删除资产删 `library.json` 行并回收 `data/files/<id>/`。

## 只读红线

- 对用户桌面原路径只读；禁止 rename / unlink 原文件。**允许** copy 进 `data/files/`
- 删除资产永不触碰用户原文件；可删受管副本；UI 确认文案写明
- 仓内副本缺失且无法惰性迁移时，不进入 API visible files
- 不 import hub 任何内部模块
- POST 路由一律过 loopback 写校验

## 响应密钥保护

资产 HTTP JSON 只序列化一次，并按该序列化输出检查键名和字符串值。含大小写敏感
`access_token` 的内容一律拒绝；`sk-` 后跟 ASCII 字母数字时，只有前一字符是 ASCII
字母数字才视为普通词内文本。因此 `Task-owned`、`risk-taking` 可正常返回，而下划线、
中文或空白后的 token 前缀会固定返回 500 `{ error: 'refused to emit a secret' }`。

## Agent tools

- `assets_list`：优先 `scope=assets`（可选 `type`）；旧 `mappings` / `mapping_files` / `artifacts` 仍可用
- `assets_search`：按名称 / 描述 / 标签 / handle 检索
- `assets_get`：按 id 或 handle 取一条（含描述与当前可见路径）
- `assets_upload`：上报产物到自有目录；**不会自动变成某类资产**

引用句：`@角色/林晓`

## 已知限制（v0.2）

- 系统选择窗仅支持 macOS；其他平台 `picker-unsupported`
- 添加素材支持多选文件 / 多选文件夹；文件夹只记一条目录引用，详情里一层一层进，不拍平子孙文件
- 本地资产卡片封面本轮用类型占位，真实缩略图 / 视频首帧是 P1
- 无 FSEvents；靠 5s revision 轮询
- 导入 / 导出资产包本轮不做
- 云端清单是**构建期快照**：本地素材库变了要重跑 `npm run build:cloud-catalog`
- 509 款火山引擎官方音色只有描述、没有试听样本，卡片不显示试听按钮
- 云端音频试听一次只放一条（换卡或切分类会停掉上一条）
- 云端卡片没有「加入对话」，本地资产才有
