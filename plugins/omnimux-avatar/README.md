# omnimux-avatar

当前产品方向见[角色生成与视频复刻](../../docs/contracts/product-positioning.md)。本页保留该组件的技术职责与既有实现记录，不证明全部功能当前可用，也不扩展默认产品范围；模型/渠道信息属于内部执行，普通用户的简化入口仍需对应实现证据。


OmniMux **数字人管理**：把一个角色从「结构化设定」做到「可复用产出」。

- **形象是一等实体**：先在插件里建形象（起名 + 设定），再生成。设定 = 18 分类 × 170 选项 × 3 档位 + 方向说明 + 种子 + 参考图。
- **生成结果自动归档**：该形象首次生成成功后，自动在资产库「角色」分类下建档（资产名 = 形象名，封面 = 主图）；后续生成只追加文件，不新增资产。
- **多视角归档到形象自己的文件夹**：由主图派生的多视角设定板保存为该形象资产下的「多视角」目录，在资产库中可逐层点开。
- **入口**：左栏「数字人」行（新会话下方，rank 4.05，位于「项目」之下）→ 工作台 Tab `omnimux-avatar:studio`。

## 数据位置

```
$DSH_HOME/omnimux/avatar/
  avatars.json                     # 形象账本 { schema, revision, avatars[] }
  data/<avatarId>/main.png         # 该形象最新主图
  data/<avatarId>/多视角/turnaround.png
```

`DSH_HOME` 缺失时回落 `~/.dsh`（与 hub / assets / products 同一约定）。不读取其它 profile，不探测开发端口。

## 对外接口

**HTTP**（前缀 `/api/omnimux/avatar`）：`GET /taxonomy`、`GET /presets`、`GET /presets/asset?path=`、
`GET /avatars`、`POST /avatars`、`POST /avatars/update`、`POST /avatars/delete`、
`POST /sheet`、`POST /multiview`、`GET /tasks`、`GET /task`、`POST /tasks/delete`。
写路由一律先过 `connection.requestRejection`，再校验同源与 JSON，body 上限 64KB，响应 `Cache-Control: no-store`。

**Agent 工具**（与页面共用同一 store/service）：`avatar_create`、`avatar_list`、`avatar_get`、`avatar_update`、
`avatar_delete`（需 `confirm: true`）、`avatar_generate`、`avatar_multiview`、`avatar_tasks`、`avatar_library_sync`。

**消费的 Seam**：
- `ctx.get('imageGenerate').execute({...})` —— 唯一执行面；prompt 由本插件服务端拼装，前端不可注入。渠道缺失时如实抛 `needs-provider`，绝不返回空成功或假 `mode:'live'`。
- `ctx.get('assetLibrary')` —— `saveTypedAsset` / `attachFiles` / `findBySource`（由 `omnimux-assets` 提供）。
- `ctx.get('modelCatalog')` —— 模型与渠道目录（客户端走 `/omnimux/model-catalog`）。

## 数据集（Config-as-Code）

`data/taxonomy.json`（40,877 B，18 分类 / 170 选项 / 3 档位）与 `data/presets.json`（35 条灵感预设）
逐字节来自产品真源；`data/presets/*.webp` 为 70 张预设预览图（约 2.8MB）。
`GET /taxonomy` 只回 Go 同形（`version/source/tier_group/category_priority/categories/prompt_map`），
丢弃文件里的 `rules`/`counts`，避免前端类型漂移；`etag` = 原始字节 sha256 前 16 位十六进制。

## 与上游产品的偏差（本仓硬门禁强制）

原生 `<select>` → 自定义下拉浮层；字符图标 → 矢量 SVG；英文文案 → 中文（英文原文保留为 `en` 词条）；
网关 pricing/task API → 中枢模型目录 + 插件自有账本；`POST /pg/influencer/*` → `imageGenerate` seam；
参考图弱 URL 子串校验 → 按形象归属校验；localStorage 隐藏黑名单 → 真实删除；无真实百分比时不做假进度。

## 安装与验证

```sh
node --test src/*.test.mjs src/client/*.test.mjs src/client/components/*.test.mjs
npm run build            # esbuild → lib/client.js（ModuleLoader 包裹，ID = omnimux-avatar）
```

仓库级门禁：`pnpm verify:stages`、`pnpm verify:stage-scroll`、`pnpm test:ui`、`pnpm verify:tools`、`pnpm check:boundaries`。
