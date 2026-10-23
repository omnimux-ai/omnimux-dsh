# Issue #3640 添加节点平铺面板 — 真实浏览器验收证据

- 验收时间：2026-10-23 19:02 (+08:00)
- 执行者：teammate `browser-evidence`
- 结论：**5/5 断言 pass**；未修改任何源码或测试。
- 浏览器：ego-browser（ego lite，guide v2.1.0），未使用 IAB。

## 1. 源码身份

| 项 | 值 |
| --- | --- |
| 工作树 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/workflow-addnode-flat-menu` |
| 分支 | `agent/workflow-addnode-flat-menu-issue-3640` |
| `git rev-parse HEAD` | `70439270bd278276c0dd85fecf256d8d86881b5c` |
| 取证前 HEAD | `70439270bd278276c0dd85fecf256d8d86881b5c` |
| 取证后 HEAD | `70439270bd278276c0dd85fecf256d8d86881b5c`（未变） |
| 本任务是否改源码 | 否（`git status` 与取证前一致，仅新增证据目录） |

## 2. 依赖准备

工作树根目录 `node_modules` 与 `node_modules/.pnpm` 已由 Lead 并行安装就绪，`ps aux | grep pnpm install` 无进程，故跳过 `pnpm install`。

## 3. 执行命令

```bash
# 1) 选取一个随机高位空闲端口（向 OS 申请临时端口后释放复用）
node -e 'const n=require("net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})'
# -> 60653

# 2) 在 worktree 内起画布 harness（dev-only 视觉入口）
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/workflow-addnode-flat-menu
node plugins/omnimux-workflow/scripts/canvas-harness.mjs --port 60653
```

harness 启动日志：

```
skipped .../plugins/omnimux-workflow/lib/canvas.js (--harness does not write production bundle)
wrote .../plugins/omnimux-workflow/dist-harness/canvas-harness.js (18047812 bytes)
canvas harness: http://localhost:60653/
```

HTTP 探测：`curl -s -o /dev/null -w '%{http_code} %{size_download}' http://127.0.0.1:60653/` → `200 358`

## 4. 服务 URL 与端口

| 项 | 值 |
| --- | --- |
| 端口 | `60653`（OS 分配的随机空闲高位端口） |
| URL | `http://localhost:60653/`、`http://127.0.0.1:60653/` |
| 页面标题 | `omnimux-workflow canvas harness (W4)` |
| 入口 | `plugins/omnimux-workflow/scripts/canvas-harness.mjs`（页面 = `src/canvas/harness/harness.tsx`） |
| Node | v25.8.0（`/Users/x/.nvm/versions/node/v25.8.0/bin/node`，非 DSH shim） |
| 清理 | harness 以受管后台任务运行，取证结束后停止；`dist-harness/` 为 harness 自建产物 |

## 5. 浏览器空间

| 项 | 值 |
| --- | --- |
| spaceId | `248` |
| 空间名 | `omnimux-3640-flat-menu-20261023-1852` |
| ownership | `agent`（本任务新建，非接管用户空间） |
| 收尾 | `finish({ keep: [] })`，未保留任何页面 |
| 收尾自查 | `listTaskSpaces()` 仅剩 id 249（`omnimux-3639-retest-20261023-1900`，属另一 agent），本任务无残留空间 |
| UA | `Chrome/154.0.0.0`（`Macintosh; Intel Mac OS X 10_15_7`） |

## 6. 截图文件名

全部为真实可解码 PNG（Pillow `Image.verify()` 通过；6 张 sha256 互不相同，非占位图、非首页冒烟图）。

| 文件 | 像素 | 字节 | sha256 | 内容 |
| --- | --- | --- | --- | --- |
| `dock-panel.png` | 1728x883 | 102575 | `8bd5ff96…50ee9b` | dock「+」面板：8 项平铺、无分类标题/计数/折叠箭头 |
| `search-director.png` | 1728x883 | 82889 | `707d8ef6…87cef1f` | 搜索框输入「导演台」，仅剩「导演台」一行 |
| `context-drill-panel.png` | 1728x883 | 102163 | `af99bb82…f6ad61d8` | 画布空白处右键钻取面板：7 项平铺、无「导入素材」、有返回键 |
| `dock-panel-zoom.png` | 885x1500 | 218564 | `a33c2184…201134d3` | `dock-panel.png` 面板区域 3x 放大 |
| `search-director-zoom.png` | 1180x780 | 115431 | `994773e5…c69cd0c8b` | `search-director.png` 面板区域 4x 放大 |
| `context-drill-panel-zoom.png` | 840x1275 | 169006 | `e11472cc…6e97c8db4` | `context-drill-panel.png` 面板区域 3x 放大 |

机器可读明细另见 `browser-facts.json`（含全部断言原始 DOM 读数）。

## 7. 逐条断言结果

### A1 面板内没有分类标题、计数或折叠箭头（旧版为 素材/数据/合成/创作 四组）— **PASS**

dock 面板 `.wf-node-menu--dock` 实测：

| 探针 | 读数 |
| --- | --- |
| `.wf-node-menu__group` | 0 |
| `.wf-node-menu__group-header` | 0 |
| `.wf-node-menu__group-caret` | 0 |
| `.wf-node-menu__group-title` | 0 |
| `.wf-node-menu__group-count` | 0 |
| `.wf-node-menu__list` 直接子元素 | 8 × `BUTTON.wf-node-menu__item`（无分组包裹层） |
| list 内 `svg` 数 / 条目数 | 8 / 8（每项恰 1 个图标，无额外折叠箭头） |
| 面板全文 | `添加节点N文本表格HTable图片视频MiniMax H3音频导演台视频剪辑Clip导入素材` |
| 「素材/数据/合成/创作」作为独立叶子文本节点出现次数 | 各 0 |

右键钻取面板 `.wf-node-menu--context`：五个分组选择器同样全为 0；list 直接子元素 7 × `BUTTON.wf-node-menu__item`；`svg` 7 == 条目 7；旧四组词独立文本节点各 0。

### A2 条目顺序 = 文本、表格、图片、视频、音频、导演台、视频剪辑、导入素材 — **PASS**

dock 面板实际渲染顺序（8 项，逐一对应）：

```
["文本", "表格", "图片", "视频", "音频", "导演台", "视频剪辑", "导入素材"]
```

徽标同步读数：`[null, "HTable", null, "MiniMax H3", null, null, "Clip", null]`

### A3 菜单显示「导演台」「视频剪辑」— **PASS**

- dock：第 6 项 `导演台`、第 7 项 `视频剪辑`
- 钻取面板：第 6 项 `导演台`、第 7 项 `视频剪辑`
- 节点类型名未受影响：`node.type.director` 仍为「3D 导演台」、`node.type.video_composition` 仍为「视频合成」（本轮不改，符合任务声明）

### A4 搜索「导演台」后仅剩导演台一项且文字高亮 — **PASS**

| 探针 | 读数 |
| --- | --- |
| 搜索框 value | `导演台` |
| 条目数 / 可见条目数 | 1 / 1 |
| 条目文案 | `["导演台"]` |
| `mark.wf-node-menu__match` 数量 | 1 |
| mark 文本 / 标签 / class | `导演台` / `MARK` / `wf-node-menu__match` |
| mark 计算样式 | `background-color: rgb(251, 251, 252)`；`border-radius: 3px`；`padding: 0px 1px` |
| 标签本身计算样式 | `background-color: rgba(0, 0, 0, 0)`（透明） |
| `highlightApplied` | `true` |
| 空态 `.wf-node-menu__empty` | 未出现 |

说明：高亮底色走的是浅色 surface token，1x 截图上视觉对比很弱；**高亮是否生效以 DOM 结构 + 计算样式为准**（label 透明、mark 有底色，两者不同即证明样式已应用）。

### A5 右键钻取面板同样无分类、且不含「导入素材」— **PASS**

- 画布空白处右键 → pane 主菜单文案：`["导入素材", "添加节点", "撤销", "重做", "创建工作流", "粘贴", "全选"]`
  - 此处「导入素材」是 pane 右键菜单**自身的顶层项**（设计如此），不是调色板条目
- 点击「添加节点」（索引 1）进入钻取面板：`.wf-node-menu wf-node-menu--context`
- 条目数 7：`["文本", "表格", "图片", "视频", "音频", "导演台", "视频剪辑"]`
- `containsImportAsset` = `false`
- 分组选择器全为 0（同 A1）
- `hasBackButton` = `true`（返回主菜单）

## 8. 未覆盖项与限制

1. **英文 locale 未复核**：只验了默认 `zh`。`dict.en.ts` 有 `palette.item.director='Director'`、`video_composition='Video Clip'`，但本轮未在浏览器里切 locale 验证。
2. **未点击条目**：本轮只验面板结构与文案，未验证点击后真实创建节点/触发导入。
3. **未验暗色主题**下的面板样式（harness 有 dark 开关，未使用）。
4. **未验快捷键 N** 打开 dock 面板。
5. **未专门验面板滚动行为**；截图显示 8 项在视口内完整可见，无需滚动。
6. **dock 独有「导入素材」的导入流程未验**（只验了它出现在 dock、不出现在钻取面板）。
7. **harness 是 dev-only 视觉入口**，构建明确 skip 生产 bundle（`lib/canvas.js`）；本证据覆盖画布岛内的 add-node 面板，**不覆盖 Dev app 或 Electron shell**。
8. **视口与截图像素尺寸不一致**：收尾测量 `innerWidth 1716 / innerHeight 815 / DPR 2`，而截图是 1728x883。测量发生在截图之后、窗口尺寸可能变化；截图尺寸如实记录，未据此反推 CSS 视口。
9. 本任务为**只读取证**：未修改源码、未改测试、未在主检出写文件。

## 9. 交付路径提示（需 Lead 决策）

本目录 `.agent-reports/` 被 `.git/info/exclude:21` 命中，`docs/evidence/*` 被同文件第 23 行命中——两者都不会出现在 `git status` 的未跟踪列表里。仓库既有先例（如 `.agent-reports/3542-timeline-embeds/report.md`、`.agent-reports/account-column-converge-3436/`）是**已被跟踪**的文件，说明该目录的内容是通过 `git add -f` 进入变更集的。

已用只读方式验证（`git add --dry-run -f`，未改动索引）：

```
add '.agent-reports/3640-add-node-flat-palette/browser-facts.json'
add '.agent-reports/3640-add-node-flat-palette/context-drill-panel-zoom.png'
add '.agent-reports/3640-add-node-flat-palette/context-drill-panel.png'
add '.agent-reports/3640-add-node-flat-palette/dock-panel-zoom.png'
add '.agent-reports/3640-add-node-flat-palette/dock-panel.png'
add '.agent-reports/3640-add-node-flat-palette/report.md'
add '.agent-reports/3640-add-node-flat-palette/search-director-zoom.png'
add '.agent-reports/3640-add-node-flat-palette/search-director.png'
```

即：**交付时需 `git add -f .agent-reports/3640-add-node-flat-palette/`**，普通 `git add` 或 `git add .` 不会拾取该目录。索引未被我改动（`git diff --cached` 为空），Git 状态仍由 Lead 掌握。
