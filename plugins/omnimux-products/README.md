# omnimux-products

OmniMux **产品库**（P0）：一条产品是名称 + 怎么卖 + 可选主图路径引用，不是资产库第七类。

- **媒体只记 `real_path`**：不拷贝、不移动、不改原文件。保存时拒绝无效、相对、不存在、非文件或不可读路径；校验失败不改变商品。已保存的文件后来消失时，该素材不显示
- **删除只删 JSON 行**：永不 `rm` 用户原文件
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
npm test      # node --test src/*.test.js
npm run build # esbuild → lib/client.js（ModuleLoader 包裹，ID = omnimux-products）
```

## 数据位置

全部落 `$DSH_HOME || ~/.dsh` → `omnimux/products/`（本插件唯一可写区；目录 `0700`、JSON `0600`）：

```
omnimux/products/
└── library.json     # schema 1：products[] + revision（媒体只有 real_path）
```
