# 虚拟形象管理插件（omnimux-avatar）· 任务规格

Issue: #3176 · 分支 `agent/avatar-influencer-clone-issue-3176` · 基点 `origin/main`

## 1. 背景与目标

OmniMux 主仓 `web/src/features/influencer/` 已有一套「AI 形象设定台」：左栏结构化选项构建角色，右栏是灵感预设库与自己的生成历史，支持一键套用预设、随机、重生成，以及由主图派生多视角设定板。

本任务把它 1:1 复刻为 DSH 插件 `omnimux-avatar`，并新增两条主仓没有的能力：

1. 生成结果**自动保存到资产库「角色」分类下**；
2. 形象的**多视角图保存到该形象自己的「多视角」文件夹内**，在资产库中可点进去逐层浏览。

产品定位从「一次性设定台」变为「形象管理」：形象是一等实体，可创建、可复用、可累积产出。

## 2. 用户操作旅程

### J1 · 首次进入（默认落灵感库）
1. 用户在左栏点击「虚拟形象」入口 → 工作台 Tab 打开。
2. 页面默认落在**灵感库**：35 条预设以瀑布流呈现。
3. 用户点任一张卡片 → 打开大图预览弹窗，左侧是整张角色设定板（可切换「适应视图 / 原始尺寸」），右侧是「方向」（文字 brief）与「设定」（每条参数的标签 chips）。
4. 用户点「套用」→ 弹窗关闭，左栏被整组填充（档位 + 全部选项 + brief + seed 一起替换），并提示「已套用到左侧面板」，页面滚回左栏。

### J2 · 手工设定与生成
5. 左栏顶部是「形象」行：显示当前形象名，可切换、可「新建形象」。
6. 用户切档位（普通 / 夸张 / 极限）→ 若原有选项在该档不可见，被丢弃并提示「N 项在当前档位不可见，已移除」。
7. 用户点选卡片 → 选中项立刻高亮（紫色描边环）；再点一次取消。
8. 若所选组合命中硬冲突 → **本次点击被拒绝**（选中状态不变），并弹出冲突说明。
9. 用户点「随机」→ 18 个分类全部被填满，且结果**永不违反硬冲突**。
10. 用户点模型配置 → 浮层内选品牌 / 模型 / 渠道三级；选完浮层收起，触发按钮显示「模型 · 渠道」。
11. 用户点「生成」→ 按钮进入提交态；左栏底部显示预估积分。
12. 生成任务以进度卡片出现在右栏历史区首位，标签显示「排队中 / 生成中」，底部有一条细进度条。
13. 生成成功 → 右栏自动切到**历史记录**页签，卡片显示成图。

### J3 · 首次生成自动入库（新增）
14. 该形象**首次**生成成功时，系统自动在资产库「角色」分类下建档：资产名 = 形象名，封面 = 主图。
15. 用户切到资产库页 → 「角色」分类下能看到这条资产，缩略图就是刚生成的主图。
16. 用户再对该形象生成一次 → **不新增资产**，只把新主图追加到同一条资产下。

### J4 · 多视角派生与归档（新增）
17. 用户点开一张已完成的卡片 → 弹窗预览，点「生成多视角」。
18. 弹窗关闭，主图卡片左下角出现一个 1:1 缩略格，显示虚线环 + 百分比（无真实百分比时显示「生成中」）。
19. 多视角成功 → 缩略格变成可点的大图入口。
20. 该形象在资产库中的资产下，出现一个名为**「多视角」的文件夹**；点进去能看到这张多视角大图。
21. 该资产的**封面仍是主图**（不能被文件夹顶替）。

### J5 · 历史管理与重生成
22. 用户在历史记录页签切换「时间线 / 网格」浏览方式，选择被记住，下次进入沿用。
23. 卡片失败时显示失败原因与「重试」；点重试会用该卡片自己的参数重新提交。
24. 点「删除」→ 该条从画廊消失（真实删除，不是本地隐藏）。
25. 关闭页面再打开 → 形象列表与任务历史仍在；已完成的任务不再轮询。

## 3. 期望界面反馈

| 场景 | 反馈 |
|---|---|
| 灵感库为空（数据不可解析） | 空态：图标 + 「暂无预设」+ 「灵感预设当前不可用」 |
| 历史为空 | 空态：「这里还没有内容」+「在左侧选好设定后点生成，或点随机来一个形象」 |
| 首次加载历史 | 3 张 9:16 骨架卡 + shimmer |
| 加载下一页 | 底部 shimmer 行，`role=status`，可访问名「正在加载更多…」 |
| 加载下一页失败 | 底部「加载历史失败」按钮，点击重试 |
| 已到末页 | 居中浅色「没有更多记录了」 |
| 图片加载失败 | 占位「预览不可用」 |
| 任务排队 / 生成中 | 卡片内 shimmer + 角标「排队中」/「生成中」+ 底部进度条 |
| 任务失败 | 红色失败原因（最多 3 行）+「重试」按钮 |
| 多视角未生成 | 主图卡片无缩略格 |
| 多视角生成中 | 左下 72×72 缩略格，虚线边 + 环形进度 + 百分比 |
| 多视角失败 | 缩略格红边 + 「!」 |
| 多视角就绪 | 缩略格显示大图缩略，可点开大图弹窗（重新生成 / 删除 / 下载） |
| 套用预设成功 | 轻提示「已套用到左侧面板」 |
| 从任务回填表单 | 轻提示「已从该任务填入表单」；该任务无设定参数时提示「该任务不含设定参数」 |
| 档位切换丢弃选项 | 警告提示「N 项在当前档位不可见，已移除」 |
| 命中硬冲突 | 错误提示（4 条冲突文案之一），选中状态不变 |
| 模型未就绪 | 提交按钮禁用；模型触发按钮显示「选择模型」 |
| 中枢未配置图像渠道 | 明确不可用提示，**不产生空成功、不产生假任务** |
| 资产已建档 | 轻提示「已保存到资产库 · 角色」 |
| 形象重名 | 提示冲突并给出可读原因（不静默改名） |

## 4. 验收用例（可测）

**AC1 灵感库**
- 打开页面默认落在灵感库；`usablePresets` 返回 35 条；每条预览图与设定板图都能加载。
- 点「套用」后，左栏处于选中态的卡片数 == 该预设 `selection` 的选项总数（逐条比对，不是抽样）。
- 预设无法在 taxonomy 上解析时整条被丢弃，不出现在网格里。

**AC2 设定交互**
- 18 个分类全部渲染；顺序按 `category_priority`，其余按数据集顺序。
- 单选取分类点第二项 → 第一项被替换。
- `freak_face` 同 slot 的两项 → 后者替换前者。
- `accessory` 选 `acc_none` → 清空其它配饰；再选任一配饰 → `acc_none` 被清空。
- 已选项再点一次 → 取消，且该分类键被删除（不留空数组）。
- 命中 4 条硬冲突任一 → 返回原选中集 + 提示，不发生部分修改。
- 切档位丢弃不可见项，返回被丢弃项的标签数组。

**AC3 随机**
- 每个在当前档位有可见选项的分类都被填上恰好一个值。
- 4000 次 × 3 档随机，**零次**命中硬冲突。
- 永不给 `female` / `trans_woman` / `non_binary` 分配胡须类选项。
- `body_curvy` 任何档位都不出现；`body_ultra` 在 `normal` 档不出现。
- 权重在 20000 次采样下落在：male 0.65–0.69、suits 0.38–0.42、retro 0.18–0.22、lampshade 0.18–0.22。

**AC4 自动入库**
- 形象首次生成成功 → 资产库出现 `type:'character'`、`source:'omnimux-avatar:<id>'` 的资产，`files[0]` 是主图，`cover_file_id` == `files[0].id`。
- 「生成成功」= 任务转入 `ready` 的那一刻（`POST /sheet` 直接 live，或轮询 `GET /task?refresh=1` 转 ready），由服务端自动触发，**不依赖界面额外点一次同步**。
- 同形象第二次生成成功 → 资产数量不变，该资产 `files` 长度 +1，`cover_file_id` **不变**。
- 资产名与形象名一致；超 40 字符或重名时按规则截断/加序号，并返回可读冲突提示。
- 归档步骤自身失败时，任务仍为 `ready`（图已产出），失败原因落在该任务的 `syncError`，并可通过 `POST /sync` 重试。

**AC5 多视角文件夹**
- 多视角成功后，该资产下新增一个 `kind:'directory'` 的 file ref，名为「多视角」。
- 通过资产库的目录浏览接口能列出该文件夹内至少 1 个图片项。
- 追加目录后 `cover_file_id` 仍指向主图（不是目录）。
- 同一形象重复生成多视角 → 不新增第二个「多视角」目录 ref。

**AC6 任务生命周期**
- 提交返回 `taskRef`；用 `task_ref` 续取能拿到终态与产物路径。
- 终态（成功/失败）后不再轮询。
- 页面隐藏时轮询暂停，可见后立即续一次。
- 页面关闭重开，未完成任务仍能从插件存储恢复并继续轮询。

**AC7 不可用路径**
- 中枢未配置图像渠道 / 未登录时，提交返回明确的 `needs-provider` / `needs-omnimux` 语义，且**不写入任何任务记录、不创建资产**。
- 生成失败时只留 `failed` 记录与上游错误原文，不产生半文件、不产生资产。

**AC8 契约与门禁**
- `pnpm --filter omnimux-avatar test` 全绿。
- `pnpm --filter omnimux-assets test` 全绿（含新增 append/findBySource 用例）。
- `pnpm check:boundaries`、`pnpm check:package-files`、`pnpm registry:verify`、`pnpm verify:tools`、`pnpm test:agent-tools` 全绿。
- `pnpm verify:stages`、`pnpm verify:stage-scroll`、`pnpm verify:stage-inset`、`pnpm verify:slots`、`pnpm test:ui`、`node --test scripts/verify-anti-slop.test.mjs` 全绿。
- `pnpm verify:product-baseline` 全绿（无 dev-only 默认路径）。
- 客户端源码不含 `claimProductStage`、不 `slots.inject('shell.overlay')`、不 import Node 内置模块。
- 真机浏览器：在本工作树内走 J1–J5 的真实导航与交互，留存功能路径专属截图。

## 5. 新用户基线（product baseline）

插件在**全新用户机器**上必须能解释自己的缺失：

- 存储根为 `$DSH_HOME/omnimux/avatar/`；`DSH_HOME` 缺失时回落 `~/.dsh`（与 hub / assets / products 约定一致），**不得**回落任何开发机绝对路径。
- 中枢图像渠道未配置 → 提交返回 `needs-provider`，界面提示「尚未配置图像生成渠道」，不进入提交态。
- 官方账号未登录且无 BYOK → 返回 `needs-omnimux`，同样明确提示。
- 灵感库预览图与选项缩略图属插件自带资源与产品 CDN，**不依赖**开发机本地服务、dev 端口或 dev profile。
- 不读取其它 profile 的状态；不探测 dev 端口。

## 6. 与源的契约偏差（本仓硬门禁强制）

| # | 源做法 | 本插件做法 | 强制来源 |
|---|---|---|---|
| D1 | 原生 `<select>` | 官方组件库下拉浮层（品牌/模型/渠道） | UI01/UI04 |
| D2 | `✦` / `▾` / `!` 字符图标 | 矢量 SVG | 禁 emoji/字符图标 |
| D3 | 全英文文案 | 全中文；英文原文保留为 en 词条 | 文案规范；下拉首项固定「全部」 |
| D4 | 网关 taxonomy / pricing / groups / task API | 插件自带 taxonomy；模型与渠道取 `/omnimux/model-catalog`；任务读插件自有存储 | 中枢独占模型与执行面 |
| D5 | `POST /pg/influencer/sheet|multiview` | `ctx.get('imageGenerate').execute(...)`，prompt 仍由服务端拼装 | 中枢唯一执行面 |
| D6 | 参考图用 URL 子串包含 `/v1/tasks/<id>/artifacts/` 校验 | 按形象自己记录的主图归属校验 | 只移植意图，不移植弱校验 |
| D7 | 生成图靠网关公网直链取回 | 生成直接落盘到形象目录 | 本地优先 |
| D8 | 删除 = localStorage 隐藏黑名单 | 插件存储真实删除 | 禁止 `HIDDEN_*` 式遮蔽 |
| D9 | 显示真实百分比 | 无真实百分比时显示「生成中」，不做假进度 | 禁欺骗性 UI |

## 7. 数据模型与接口契约（实现前冻结）

### 7.1 存储
```
$DSH_HOME/omnimux/avatar/
  avatars.json
  data/<avatarId>/main.png
  data/<avatarId>/多视角/turnaround.png
```
`Avatar = { id, name, sheet:{tier,selection,brief,seed,image_url}, assetId|null, assetSource, tasks:[...], createdAt, updatedAt }`

### 7.2 HTTP（前缀 `/api/omnimux/avatar`）
`GET /taxonomy`、`GET /presets`、`GET /presets/asset?path=`、`GET /avatars`、`POST /avatars`、`POST /avatars/update`、`POST /avatars/delete`、`POST /sheet`、`POST /multiview`、`POST /sync`、`GET /tasks`、`GET /task`、`POST /tasks/delete`。

**自动入库触发点（AC4/AC5 的唯一执行路径）**：任务状态转为 `ready` 时，生成服务必须调用一次归档回调——
`kind:'sheet'` → `librarySync.syncSheet`；`kind:'multiview'` → `librarySync.syncMultiView`。触发点有三处：
`POST /sheet` 且 `mode:'live'`、`POST /multiview` 且 `mode:'live'`、`GET /task?refresh=1` 轮询到终态。
归档失败**不得**把已产出的图改写成失败任务：原因写在该任务的 `syncError` 字段上，任务保持 `ready`。
`POST /sync`（body `{ avatarId, kind: 'sheet'|'multiview'|'both' }`）是给界面用的手动补偿入口，
返回 `{ sheet, multiView, status }`；`avatar_library_sync` 工具走同一条服务方法。

`/taxonomy` 只回 Go 同形 `{version,source,tier_group,category_priority,categories,prompt_map}`（丢弃 `rules`/`counts`），并带 `etag`（sha256 前 16 位十六进制）与 `Cache-Control: private, max-age=300`。

所有写路由：`connection.requestRejection` 先行 + 同源校验 + `application/json` + body 上限 + `Cache-Control: no-store`。

### 7.3 资产库 seam（跨插件，冻结签名）
`ctx.get('assetLibrary')` →
- `ingestDownloadedImage(input)`（既有，不动）
- `saveTypedAsset({ name, type, description, tags, files, source })` → `{ asset }`
- `attachFiles({ assetId, files })` → `{ asset }`（追加，不重拷既有 ref、不改封面）
- `findBySource(source)` → `{ asset } | null`

`omnimux-assets` 内部新增 `library.appendFiles(assetId, incoming)` 与 `library.findBySource(source)`；`update()` 的整组替换语义**不改**。

### 7.4 Agent 工具
`avatar_create`(写) · `avatar_list` · `avatar_get` · `avatar_update`(写) · `avatar_delete`(写，需 `confirm:true`) · `avatar_generate`(写) · `avatar_multiview`(写) · `avatar_tasks` · `avatar_library_sync`(写)。与 UI 共享同一 store/service。

### 7.5 复刻硬数字（不得漂移）
18 分类 / 170 选项 / 3 档（normal 124、freak 167、total 170 可见）；默认档 `total`；`max` = proportions 2、freak_face 4、distinctive 2、accessory 3，其余 1；仅 `freak_face` 带 `slot`；`category_priority = [gender, body_type, hair, hair_colour, aesthetic]`；`promptOrder` 18 项固定顺序。

## 8. 门禁与验证命令

```
pnpm --filter omnimux-avatar test
pnpm --filter omnimux-assets test
pnpm check:boundaries && pnpm check:package-files && pnpm registry:verify
pnpm verify:tools && pnpm test:agent-tools
pnpm verify:stages && pnpm verify:stage-scroll && pnpm verify:stage-inset && pnpm verify:slots
pnpm test:ui && node --test scripts/verify-anti-slop.test.mjs
pnpm verify:product-baseline
pnpm test:worktree-web      # 真机浏览器验收（工作树内）
```

不使用 `pnpm test:all` / `pnpm verify:all`。

## 9. 文档影响

- 新增 `plugins/omnimux-avatar/README.md`（双语配对检查 `pnpm doc:pairing`）。
- 更新 `docs/contracts/plugin-agent-tools-inventory.md`（9 个工具行 + 计数）。
- 更新 `docs/contracts/workbench-split.md` §Occupants 与 `docs/contracts/sidebar-extra-entries.md` §Current occupants。
- 更新 `plugins/omnimux-assets/README.md`（seam 扩展说明）。
- 交付证据落 `docs/evidence/omnimux-avatar-3176/`。

## 10. 不在本次范围

- 不新增模型、不改中枢模型路由、不做模型上架。
- 不改 OmniMux 主仓任何文件（只读复制数据集与预览图）。
- 不做生产蓝绿/正式上线（需另行指令）。
- 不做视频生成相关验证。
