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
npm test      # node --test src/*.test.js（Host 纯函数层，临时目录夹具）
npm run build # esbuild → lib/client.js（ModuleLoader 包裹，ID = omnimux-assets）
```

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
- 卡片封面本轮用类型占位，真实缩略图 / 视频首帧是 P1
- 无 FSEvents；靠 5s revision 轮询
- 导入 / 导出资产包本轮不做
