# 规格文档：资产库文件卡片移除媒体类型角标并新增「打开文件位置」入口

**文件：** `specs/asset-file-card-reveal.spec.md` ｜ **优先级：** P1 ｜ **模块：** `plugins/omnimux-assets`
**变更面：** Client 卡片渲染 / 本地 HTTP 路由 / 库层路径解析
**设计依据：** 用户截图与明确要求（移除图片/视频文件类型标签；新增打开文件位置图标，点击后打开文件夹位置）、[design.md](../design.md)、[UI guidelines](../docs/contracts/ui-design-guidelines.md)
**关联 Issue：** #1961

---

## 1. 业务目标与改造方案

### 1.1 背景与需求定义

用户截图指向「资产库 → 某个资产（如 `科技Vlogger-粉衣女郎Yuna`）→ 文件浏览网格」。该网格由 `AssetBrowse.jsx` 的 `MediaCard` 渲染，现状存在两处问题：

- **问题 1：媒体类型角标冗余**。图片/视频卡片右上角渲染 `图片` / `视频` 胶囊角标，而缩略图本身已自明类型，属于重复信息。
- **问题 2：缺少定位文件的入口**。用户看到的是文件副本，无法从界面直达文件在磁盘上的真实位置。

**解法**：
1. 图片、视频卡片不再渲染媒体类型角标；文件夹与其它文件类型（无缩略图、类型不自明）保留角标。
2. 每张卡片缩略图右上角新增「打开文件位置」图标按钮，点击后在访达中定位该文件（文件夹条目则打开该文件夹）。

### 1.2 技术方案

- **后端**：`library.js` 新增 `resolveEntryPath(assetId, fileId, subPath)`，复用既有 `resolveFileSubPath` 的双重 containment（词法 resolve + realpath 必须落在 file root 内）；`http-routes.js` 新增 `POST /omnimux/assets/library/reveal`，macOS 下调用 `/usr/bin/open`（文件 `-R` 定位，目录直接打开），非 darwin 返回 501。
- **前端**：`api.js` 新增 `revealAssetEntry()`；`AssetBrowse.jsx` 的 `MediaCard` 移除 image/video 角标、新增图标按钮（`stopPropagation`，不触发卡片自身的预览/打开）；`icons.jsx` 新增矢量图标；`locales.js` 新增中英文案；`styles.js` 新增按钮样式。

---

## 2. 验收标准（Acceptance Criteria）

### 2.1 角标收敛 (P0)
- **AC-101**：`kind === 'image'` 或 `kind === 'video'` 的卡片不再渲染 `.omnimux-assets-badge` 角标。
- **AC-102**：`kind === 'folder'` 与其它文件类型的卡片保留类型角标，文案分别为「文件夹」与「文件」。

### 2.2 打开文件位置入口 (P0)
- **AC-201**：图片/视频/文件夹/其它文件四类卡片均渲染「打开文件位置」图标按钮，带 `aria-label` 与 `title`。
- **AC-202**：点击该按钮不触发卡片自身的 `onOpen`（预览或进入子目录）。
- **AC-203**：文件条目 → 访达中选中该文件（`open -R`）；文件夹条目 → 打开该文件夹（`open`）。

### 2.3 安全与降级 (P0)
- **AC-301**：`subPath` 越过 file root（`..` 或逃逸软链）时返回 `path-denied`，绝不 spawn 任何进程。
- **AC-302**：非 macOS 平台返回 501 与明确 message，不静默失败。
- **AC-303**：跨源写请求沿用既有 `assertLocalWrite` 拒绝策略（403）。
- **AC-304**：失败以既有 `AssetsError` 语义返回，前端以错误提示呈现，不产生未捕获异常。

### 2.4 回归 (P1)
- **AC-401**：`pnpm --filter <assets-package> test` 全绿。
- **AC-402**：隔离工作树内真实浏览器验证通过，产出 PNG 证据。

---

## 3. 命令（Commands）

```bash
pnpm --filter @omnimux/omnimux-assets test      # 插件单测
pnpm verify:stages                              # Stage / 客户端契约校验
pnpm test:worktree-web                          # 隔离工作树 Web 验收
```

## 4. 结构（Structure）

| 路径 | 说明 |
| --- | --- |
| `plugins/omnimux-assets/src/client/AssetBrowse.jsx` | 文件浏览网格与卡片渲染 |
| `plugins/omnimux-assets/src/client/api.js` | 客户端 HTTP 封装 |
| `plugins/omnimux-assets/src/client/icons.jsx` | 矢量图标集合 |
| `plugins/omnimux-assets/src/client/locales.js` | 中英文案 |
| `plugins/omnimux-assets/src/client/styles.js` | 卡片与按钮样式 |
| `plugins/omnimux-assets/src/library.js` | 库层路径解析 |
| `plugins/omnimux-assets/src/http-routes.js` | 本地路由分发 |

## 5. 测试策略（Testing Strategy）

- 路由层：`http-routes.test.js` 覆盖 reveal 成功、越界拒绝、非 darwin 501、非法 body。
- 库层：`library.test.js` 覆盖 `resolveEntryPath` 的文件/目录/越界三态。
- 客户端：`AssetBrowse.test.js` 覆盖角标渲染条件与图标按钮存在性。
- 端到端：隔离工作树真实浏览器验证，PNG 证据留存。

## 6. 边界（Boundaries）

- **总是做**：改动前写规格；复用既有 containment 与 `AssetsError` 语义；提交前跑相关测试。
- **先问**：新增运行时依赖；改变资产库主网格（`AssetGrid`）的资产类型角标；引入文件系统写操作。
- **绝不做**：绕过 containment 直接 spawn 用户路径；修改官方 DSH 源码；提交密钥；越界修改其它插件。

## 7. 假设（Assumptions）

1. 目标平台为 macOS（`darwin`），非 macOS 仅需明确降级提示。
2. 「打开文件夹位置」对文件夹条目语义为打开该文件夹本身，对文件条目语义为在访达中选中该文件。
3. 资产库主网格（`AssetGrid`）的资产级类型角标不在本次范围内。

## 8. 非目标（Non-goals）

- 不新增重命名/删除/移动等文件系统写操作。
- 不改动云端资产视图（`CloudAssetsView`）。
- 不改动 `omnimux-workflow` 中既有的 `reveal-in-finder` 事件语义。
