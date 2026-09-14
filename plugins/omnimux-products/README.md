# omnimux-products

OmniMux **产品库**（P0）：一条产品是名称 + 怎么卖 + 可选主图路径引用，不是资产库第七类。

- **媒体只记 `real_path`**：不拷贝、不移动、不改原文件。保存时拒绝无效、相对、不存在、非文件或不可读路径；校验失败不改变商品。已保存的文件后来消失时，该素材不显示
- **删除只删 JSON 行**：永不 `rm` 用户原文件
- **链接导入**：二级表单页左栏顶部粘贴商品落地页 → `POST /omnimux/products/import-from-link`，由本插件直接抓取页面（title/meta/OpenGraph/JSON-LD + 列表与正文），过滤导航噪音后回填名称、卖点、受众、品牌、特性、价格、SKU、促销、链接、分类。解析失败只给温和提示，不阻塞手填；仅本机 POST 可用，且不写库；不调用 OmniMux 云、不读任何 `OMNIMUX_*` 凭据
- **二级表单页**：添加/编辑产品是同 Tab 内的整屏子视图（`position:absolute; inset:0`），不是弹窗：顶部常驻返回栏与面包屑，底部常驻动作条，中间双栏（左：解析 / 基础信息 / 商业化 / 品牌战略；右：双端首屏截图 / 分类标签 / 素材列表）。有未保存修改时，返回、取消与 Esc 会先弹三选一确认（继续编辑 / 放弃修改 / 保存并返回）；未修改则直接返回列表
- **脏数据指纹**：`useProductFormState` 用 canonical 指纹比对初始快照，字段域与 `buildPayload` 严格对齐（数字产品不比对价格/SKU/促销，实体产品不比对隐藏战略），纯 UI 状态（标签草稿、面板展开）不参与判定
- **草稿截图只读预览**：创建态下截图已写盘但产品记录还不存在，走 `GET /omnimux/products/draft-media/{id}`（内存登记表，TTL 15 分钟、容量 200，只放行本插件媒体目录内的文件）
- **引用**：`@产品/{name}`
- **Agent 六工具**：`products_list` / `search` / `get` / `read_media` / `create` / `update`（无 delete 工具）
- **入口**：侧栏「产品库」（rank 6）→ 一级页「+ 添加产品」

一级页入口：侧栏「产品库」行（新会话下方）。页面以 `shell.overlay` 覆盖会话列，顶栏 chrome `12px 20px 12px`。关页用 `everOpened` + `display:none` 保活。

## 安装与验证

日常进 App：

```sh
cd /Users/x/Desktop/Project/omnimux-desktop-fork
corepack yarn omnimux:sync omnimux-products
corepack yarn omnimux:restart
```

开发：

```sh
npm test      # node --test src/*.test.js src/client-form-subscreen.test.js src/client/*.test.js tests/e2e/*.spec.js
npm run build # esbuild → lib/client.js（ModuleLoader 包裹，ID = omnimux-products）

真机几何证据（真实无头 Chrome，动态端口、独立 profile、测完即焚）：

```sh
node scripts/verify-product-secondary-page.mjs   # → .workbuddy/evidence/product-secondary-page/
```
```

## 数据位置

全部落 `$DSH_HOME || ~/.dsh` → `omnimux/products/`（本插件唯一可写区；目录 `0700`、JSON `0600`）：

```
omnimux/products/
└── library.json     # schema 1：products[] + revision（媒体只有 real_path）
```
