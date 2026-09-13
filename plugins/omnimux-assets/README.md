# omnimux-assets

OmniMux **创作资产库**（v0.2）：一条资产是有名字、类型、描述、可选素材路径的创作对象，不是文件夹挂载。

- **六类常驻**：角色 / 场景 / 风格包 / 道具 / 知识包 / 自定义（自定义 = 未选分类）。这是**本地**资产类型；
  云端清单的六个分类见下文，两者不是一套
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
`manifest.json` + `{category}[/{sub_category}]/page-NNNN.json`，另加一份跨分类的 `all/` 分片（一级栏
「全部」读它），每页 24 条，前端按需拉取而不是一次载入整个库。

产物目录 `cloud-catalog/`（随插件提交，`package.json` 的 `files` 已列入）：

```
cloud-catalog/
├── manifest.json                              # categories / totalAssets / pageSize / sourceRoot
├── index.json                                 # id → 行（Host 用它解析媒体与收藏到本地）
├── all/page-NNNN.json                         # 跨分类全量：116 片，2782 条，按导航顺序拼
├── character/{female,male,lifestyle,business}/page-NNNN.json
├── scene/{nature,indoor,city,travel,creative,workplace}/page-NNNN.json
├── prop/object/page-NNNN.json
├── material/{hook,green-screen,clothing,pet,portrait,graphic-design,illustration,anime,concept-art}/page-NNNN.json
├── style/{live-action,anime-2d,render-3d,photography,traditional-art,video-tone}/page-NNNN.json
└── audio/{voiceover,sfx,bgm}/page-NNNN.json
```

## 分类体系（六大一级 + 29 个二级）

| 一级 | 二级（条数） |
| --- | --- |
| 角色 `character` | 女性角色 185 · 男性角色 144 · 生活居家 254 · 职场商务 43（多维归属，见下） |
| 场景 `scene` | 自然山水 70 · 城市街景 24 · 生活室内 19 · 出行车载 15 · 极境奇观 6 · 商务办公 5 |
| 道具 `prop` | 实物道具 125 |
| 素材 `material` | 钩子 705 · 绿幕 150 · 服饰穿搭 128 · 萌宠动物 127 · 人像写真 127 · 平面设计 62 · 概念艺术 44 · 商业插画 33 · 动漫分镜 22 |
| 风格 `style` | 真人影视 35 · 2D 动漫 35 · 3D 动画 35 · 调性氛围 35 · 胶片摄影 7 · 国风传统 4 |
| 声音 `audio` | 配音 527 · 背景音 108 · 音效 5 |

全库 2782 条，与各大类分片出自同一次构建。三条重构原则：

- **场景按画面里的地方分，不按采集批次分**。旧的两个架子（`ambience` 场景氛围 14 / `environment` 实景环境
  125）说的是「怎么收来的」，14 条氛围视频和 125 条 Loomi 实景本来是同一类东西——可拍摄的环境。两个批次标签
  已废除，`ambience` / `environment` 不再出现在清单里。
- **素材彻底废除表情包**（`meme` 161 条已删除）。gpt-image-2 的 161 张专业生图按其原生 `category` 落到四个架子：
  `graphic-design` / `illustration` / `anime` / `concept-art`（后者的 5 个题材类合并：photography / creative /
  architecture / ecommerce / cultural）。其余五个素材架子不变。
- **风格按视觉流派分，不按交付格式分**。旧的「生图预设 / 视频调性」只说这是图还是视频。`image-preset` 已废除，
  六派为：真人影视 / 2D 动漫 / 3D 动画 / 胶片摄影 / 国风传统 / 调性氛围。落架规则 = 数据源自带的分类 → 逐条补正表
  （`STYLE_SHELF_OVERRIDES`，例如「新中式水墨」按作品补到国风传统）→ 兜底调性氛围。

场景的逐条落架写在 `SCENE_SHELF_BY_ID`：60 条 Loomi 视频的标题只有摄影师昵称、没有画面信息，少量图片的标题也与
画面不符（`mat-living-room` 的画面是一条荒漠公路），所以 139 条逐条按画面复核，判定结果以一张表固化，未收录的新
素材再走标题关键词兜底（`SCENE_SHELF_RULES`）。

## Loomi 素材库的归类映射

`gxgen-data/inspiration-library/loomi/` 是一份离线快照：632 条素材（图片 333 + 视频 299），媒体文件已
全部下载到同级 `media/`。它是唯一一个「一个源喂三个大类」的数据源，所以下面的映射表在代码里叫
`LOOMI_SHELVES`，**源分类名与落地二级分类名是两个字段**（`sourceClass` / `subCategory`）：

| 源分类 | 条数 | 落地大类 | 落地二级分类 | 中文 / 英文 |
| --- | --- | --- | --- | --- |
| `prop` | 125 | 道具 | `object` | 实物道具 / Props & Objects |
| `scene` | 125 | 场景 | 逐条判定（`SCENE_SHELF_BY_ID`） | 自然山水 / 生活室内 / 城市街景 / 出行车载 / 极境奇观 / 商务办公 |
| `pet` | 127 | 素材 | `pet` | 萌宠动物 / Pets & Animals |
| `clothing` | 128 | 素材 | `clothing` | 服饰穿搭 / Fashion & Outfits |
| `portrait` | 127 | 素材 | `portrait` | 人像写真 / Portraits |

**不要直接把源分类名当二级分类名用**：源站把 `prop` 和 `scene` 各当一个独立大类，而本清单里 `prop` 是
一级大类的 id，`scene` 是大类 id 而二级架子按画面判定。早期实现按二级分类名去匹配源分类，结果
道具与场景两个大类一条都收不到（构建日志会显示 `prop 0 rows`）；匹配必须走 `sourceClass`。`scene` 是唯一
按「行」而不是按「源文件夹」落架的源分类，它在 `LOOMI_SHELVES` 里带的是 `resolveShelf` 而不是 `subCategory`。

每行还带 `meta.source_id` / `source_category` / `provider` / `creator` / `license` /
`attribution_required` / `source_url`，源站署名信息完整保留；标签固定三枚（源分类 + 媒体类型 + 图库），
媒体类型随行而非随架子，所以同一架子下视频行标「视频」、图片行标「图片」。

角色的二级分类是**多维**的：`sub_category` 是主架（性别），`sub_categories` 是完整归属表，所以同一位数字人
可以同时落在「女性角色」和「职场商务」下；分片子目录与计数都按归属表算，这也是架子总数之和大于 329 的原因
（女性 185 + 男性 144 + 生活居家 254 + 职场商务 43）。名字里读不出性别或场景线索的行不会被猜进任何一个
架子，只出现在「全部」。Loomi 的 632 条一条都不进角色：角色只收 Pippit 那 329 套实景数字人。

一级栏最左是跨六个分类的「全部」，默认选中，它自己不展开二级栏；其余大类按数据开二级栏：清单里有非空
子分类就展开（角色 / 场景 / 道具 / 素材 / 风格 / 声音），首个 Tab 固定是「全部」并带该大类总数。

生成脚本 `scripts/build-cloud-assets-catalog.mjs`：

- 默认读 `/Users/x/Desktop/Project/OPC/资产库`，可用 `--assets-root=` 换根、`--out=` 换输出、`--dry-run` 只统计
- 每个数据源都可缺失：缺源只让该分类变空，不会让整次构建失败
- 灵感社区是独立系统，按目录名跳过；只有专业生图画廊与 Loomi 两处按精确路径读它的素材
- 素材路径写 `file:<相对 assets-root 的路径>`；同时有本地副本与可公开访问的远端地址时，远端地址存进
  `meta.source_media_url`，换机器仍可播放。Loomi 的媒体已全部落盘，所以本地 `file:` 优先，远端只作兜底；
  某条源文件缺失时该行自动退回远端地址，不会写出打不开的定位符
- 角色只收 `gxgen-data/character-library/pippit-local-avatars-source/` 的实景数字人；`素材库/AI 网红/` 一类的
  零散图片不进清单，知识包（本地资产类型）也没有云端分类；风格只收三个策展预设文件 + `element-library/视频风格/`
  的模式预设，每条都带 `meta.prompt_text`；音效只收 `素材库/音频/音效/` 下的真实转场音效
- `all/` 分片与分类分片同一次构建产出，行按导航顺序拼接，所以「全部」的分页与各大类不会互相漂移

Host 侧（`src/cloud-catalog.js` + `src/http-routes.js`）：

| 路由 | 作用 |
| --- | --- |
| `GET /omnimux/assets/cloud/manifest` | 总控清单（本地兜底；网关可达时不走这条） |
| `GET /omnimux/assets/cloud/{category}[/{sub}]/page-NNNN.json` | 直通磁盘的分片文件（同上）；`{category}` 可取 `all` |
| `GET /omnimux/assets/cloud/search?q=&category=&sub_category=` | 清单内检索；`category=all` 匹配全部行，不当空分类 |
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
