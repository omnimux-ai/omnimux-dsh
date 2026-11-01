# 项目页「AI应用」同时列出官方内置应用（Issue #3876）

- 任务工作树：`.worktrees/workflow-builtin-app-library`（分支 `agent/workflow-builtin-app-library-issue-3876`）
- 基线：`origin/main@45ec0189e`
- 类型：Feature（`omnimux-apps` host 只读接口 + `omnimux-workflow` 客户端）
- 授权范围：Issue #3876 正文 In scope 四条；不做内置应用删除/隐藏/上下架/版本管理，不改内置清单内容，不新建服务端注册表。

## 1. 用户问题

「项目」页 →「AI应用」分类只读 `localStorage['omnimux_apps_manifests']`（发布向导写入的用户自发布应用）。官方随包内置的 10 个应用（`plugins/omnimux-apps/catalog/builtin-apps.json`：7 个 `app-creatify-*` + 3 个 `app-builtin-*`）在该分类里没有任何入口：用户看不到、也打不开。新装用户进入该分类看到的是「还没有 AI 应用」的假空态，而产品其实自带 10 个可用应用。

## 2. 目标

「AI应用」分类合并展示两类应用：用户已发布的（可删可编辑，行为不变）+ 官方内置的（只读，可打开表单）。两者都为空才是真空态。

## 3. 关键用户旅程

### J1 新装用户进入「AI应用」分类

1. 打开「项目」页 → 点「AI应用」；
2. 期望：显示 10 张内置应用卡片（名称/分类/封面来自 manifest），不再出现「还没有 AI 应用」；
3. 期望：内置卡片带「官方」标识，与用户自发布应用可区分。

### J2 点内置卡片 → 打开应用表单

1. 点内置应用卡片；
2. 期望：右侧栏新增/聚焦 `type='omnimux-workflow:app'`、`id='app_<appId>'` 的标签页，标题为应用名；
3. 期望：标签页渲染该应用的 `formSchema` 表单（不是「暂无已加载的 AI 应用」空态）。

### J3 内置卡片不提供删除

1. 悬停内置卡片；
2. 期望：不出现「更多」菜单（无删除、无编辑入口）——内置应用属于出厂内容，不在本页管理。

### J4 用户已发布应用与内置应用同名

1. 用户覆盖发布了某个内置应用（同 `appId`）；
2. 期望：列表里该 `appId` 只出现一张卡片，且是用户版本（可删可编辑）。

### J5 两类都为空

1. 内置清单不可用（插件缺失/接口失败）且本地无已发布应用；
2. 期望：显示既有空态文案；内置清单失败时额外给出可理解的错误提示，不静默当作「没有内置应用」。

## 4. 数据与契约

| 项 | 决定 |
| --- | --- |
| 内置应用真源 | `plugins/omnimux-apps/catalog/builtin-apps.json`（经 `builtinCatalogData.ts` 内联），不在 workflow 侧复制第二份 |
| 读取通道 | 新增只读 HTTP 缝 `GET /omnimux-apps/api/apps`、`GET /omnimux-apps/api/apps/:appId`；workflow 客户端按公开 HTTP 缝消费，不 import 跨包私有模块 |
| 卡片条目 | 复用 `toPublishedAppEntry` 同构字段；`coverUrl` 取 `metadata.coverUrl`，缺失时取 `showcase.items[0].posterUrl` |
| 排序 | 用户已发布在前（`createdAt` 倒序，既有规则），内置在后（清单顺序稳定） |
| 去重 | 同 `appId` 保留用户版本 |
| 标识 | 内置条目 `isBuiltin: true`，卡片 badge 文案走 `projects.appBuiltinBadge` |
| 标签页身份 | 沿用 `meta.appId`；`AppTab` 本地缓存缺失时按 appId 走 `GET /omnimux-apps/api/apps/:appId` 解析 |

## 5. 验收标准

### 5.1 host 接口（`omnimux-apps`）

- **AC-1** `GET /omnimux-apps/api/apps` 返回 `{ apps: ApplicationManifest[] }`，内容为内联内置清单；非 GET 返回 405。
- **AC-2** `GET /omnimux-apps/api/apps/:appId` 优先返回用户已发布存储中的 manifest；存储无记录时返回内置 manifest；都没有返回 404 `{ error: 'app_not_found' }`。
- **AC-3** 既有执行路由（POST/GET executions、cancel、POST manifest）行为不变。

### 5.2 客户端数据（`omnimux-workflow`）

- **AC-4** `mapBuiltinAppEntry(manifest)` 输出 `appId/name/category/coverUrl/description/version/isBuiltin/manifest`；`coverUrl` 按 `metadata.coverUrl` → `showcase.items[0].posterUrl` → 空串 的优先级取值；缺 `appId` 返回 `null`。
- **AC-5** `mergeAppEntries(published, builtin)`：用户条目在前、内置在后；同 `appId` 只保留用户条目；输入非数组按空数组处理。
- **AC-6** `fetchBuiltinApps()` 失败（网络/非 2xx/坏 JSON）返回 `{ entries: [], error: true }`，不抛异常、不伪造空清单为成功。

### 5.3 页面与标签页（行为）

- **AC-7** 「AI应用」分类下渲染合并后的卡片；只有内置应用时不出空态。
- **AC-8** 内置卡片不渲染「更多」菜单（`[aria-haspopup="menu"]` 数量只等于用户应用数）；点内置卡片仍打开 `app_<appId>` 标签页。
- **AC-9** 用户已发布应用卡片行为不变：菜单含「编辑」「删除」，删除走二次确认。
- **AC-10** `AppTab` 在 `localStorage` 无该 appId 缓存时调用 `GET /omnimux-apps/api/apps/:appId` 并渲染返回的 manifest；接口 404/失败时保持既有空态，不伪造内容。

## 假设

内置清单随包可用：`omnimux-apps` 是 profile bundles 名单内的随包插件，`GET /omnimux-apps/api/apps` 在真实运行环境可达，其 host 路由与 workflow 客户端同源。

## 证伪方式

若内置插件未装载或路由未注册，`fetchBuiltinApps()` 会返回 `error: true`，页面出现错误提示且内置卡片为 0——此时「官方应用已显示」的结论被证伪；同时可用 `curl` 直接请求该路由验证是否 404。

## 非目标

内置应用的删除/隐藏/上下架/版本管理；改写内置清单内容；新建服务端注册表；改动发布向导与用户已发布应用语义。

## 旧标准变更

- `plugins/omnimux-apps/src/host/routes.list.test.mjs` :: `executions 路由接住存储异常，回稳定 500 而不是空响应（评审 N2）`
  - 原断言：错误文案与「响应体不得包含该路径」的断言里写死了**开发机真实家目录前缀**。
  - 必须改的理由：用例本身是本分支新增的，但其中的真实家目录前缀被 CI leak gate（`.gitleaks.toml` 的 `absolute-home-path` 规则）判为 4 处泄漏，导致 Leak gate 与 Static L0 双红。
  - 新期望证据：改成 `/opt/synthetic/...` 合成路径，断言意图（底层错误里的绝对路径不得回给浏览器）完全不变。

- `plugins/omnimux-apps/src/host/routes.list.test.mjs` :: `写路径 500 也不透绝对路径（评审 N5）`
  - 原断言：错误文案写死同一条真实家目录前缀下的具体文件路径，并断言响应体不含该前缀。
  - 必须改的理由：同上，真实家目录前缀触发 leak gate。
  - 新期望证据：改为 `/opt/synthetic/private/...` 合成路径，断言意图不变。

- `plugins/omnimux-workflow/tests/ai-app-library.e2e.test.mjs` :: `旅程 8：内置应用与用户应用合并展示，内置卡片无删除入口且标签页按 appId 解析（Issue #3876）`
  - 原断言：只断言标题、badge 与空态，未验证 `formSchema` 是否真的渲染成表单控件（第三轮评审 N3：把 `properties` 强制清空后该用例仍绿）。
  - 必须改的理由：内置应用标签页的核心价值就是「能填表并执行」，只断言标题会让「表单没渲染」静默通过。
  - 新期望证据：追加「容器内必须存在真实表单控件」与「字段标题必须出现」两条断言；实测强制 `EMPTY_PROPS` 后该用例变红。
