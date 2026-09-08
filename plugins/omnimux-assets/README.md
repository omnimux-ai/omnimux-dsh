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

默认内容根仍为 `$DSH_HOME || ~/.dsh` → `omnimux/assets/`。根指针与迁移恢复信息保存在 `omnimux/assets-storage/`；自定义根仅能通过已确认迁移计划切换，不修改 `DSH_HOME`。应用自建控制目录 `0700`、JSON `0600`，不递归改变用户树权限：

```
omnimux/assets/
├── library.json           # schema 2：assets[] + revision；files[] 记仓内相对路径
├── mappings.json          # v0.1 遗留；启动时一次性迁成 custom 资产
├── data/files/<assetId>/  # 全局受管物理副本（2026-08-30）
├── artifacts.json         # 产物索引（一级页隐藏）
├── scans/<mapping_id>.json
└── artifacts/<aa>/<sha256>.<ext>
```

用户桌面原文件留在原地。选定根已有内容按 `adopted` 原位纳管，删除记录不删原文件。`managed` 内容仅按 inventory、完整哈希、身份及共享引用逐文件回收；不递归删除 ID 目录或用户树。

### 保存位置与迁移（Issue #766，工程验证中）

搜索框左侧设置按钮打开保存位置弹窗：选择单目录、只读预检、确认计划，再迁移合并。覆盖前保留校验后的目标版本；跳过项保留源并显式标记未迁入。旧源不会在迁移期间删除。已完成任务不能重新执行旧账本；反向切根必须新建计划。

- 安全文件助手 `src/storage-fs.py` 使用插件内固定 CPython 3.13.15+20260807（macOS arm64/x64），不依赖系统 Python 或 PATH。启动核验供应清单、全载荷摘要及安装权限；同步/异步使用同一绝对执行文件与 `-I -S -B -u`，环境仅允许固定 locale。载荷缺失或改变明确报 `storage-platform-unsupported`；不联网下载、不安装系统依赖、不回退不安全复制。供应来源和许可证见 `runtime/python-supply.json`、`runtime/licenses/NOTICE.md`。
- 本次正式平台验证目标为 macOS 本地卷；系统目录选择另需 `osascript`。NAS、云占位文件、多个 Host 共享写和新旧插件混跑同根不支持。
- Home 与根写锁由非 detached 助手持有；第二 writer 拒绝。迁移期间请停止外部编辑，应用锁不能阻止其他进程更改内容。
- 自定义根掉盘或损坏不回落默认空库。控制区仍供恢复任务查询；历史任务/媒体版本仅本机存储。
- 完成至少 7 天后才可检查清理清单，并且需要逐项复验和确认；无自动删除。存在未迁入项不允许清理旧源。
- 工程测试不等于可发布结论：L2/ego、原生选择、真实可移除卷、Intel原生/最低系统与最终安装信任链证据仍需独立验收；不声称上游二进制已有正式签名/公证。当前集成结果见仓库 `docs/implementation/issue-766-final-integration.md`。

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
