# For You 图文作品的当前作品解析（Issue #3599）

## 1. 业务目标

For You 信息流里的**图文/轮播作品**（无 `<video>`、底部有轮播点）目前点任何菜单动作都报「这一页没有可操作的作品」。要让这类作品也能解析出当前作品地址（`/@作者/photo/<id>`），从而把「下载音频」交给宿主处理。

## 2. 根因（ego 实测 2026-10-21）

- 新版 For You 卡片：`[data-e2e="recommend-list-item-container"]`，地址栏保持 `/`，不改写作品地址。
- 视频卡内有 `div[id^="xgwrapper-0-"]`，id 末段即作品 id；现有第一步只认它。
- 图文卡既无 xgwrapper、也无 `<video>`、卡内也没有 `a[href*="/photo/"]`（实测 0 条），第 2/3 步全部落空 → `resolveTargetPost` 返回 null。
- 每张卡片（含图文卡）都渲染「…」更多按钮，带 `data-more-menu-item-id="<作品 id>」`；实测一张 7 图的图文卡 `hasVideo=false` 且 `xgwrapper=null`，但这个属性存在（`7693330722479688973`）。这是 DOM 属性，隔离世界可读，作为图文作品的取 id 通道。
- 注意：React 的 `__reactProps$…` 虽然能读到 id，但 content script 在隔离世界**看不到页面 JS 属性**，因此不使用该途径。

## 3. 范围

1. 抽出 `plugins/omnimux-browser/extension/src/content/tiktok-scene/active-post.ts`：`resolveActivePostUrl(doc, viewport): string | null`，`index.ts` 只调用。
2. 解析顺序：
   1) 视口中心卡片上的 `data-more-menu-item-id` / `data-item-id`（视频与图文通吃，修复主路径）；
   2) 该卡片内的 `/video/` 或 `/photo/` 链接；
   3) 没有卡片命中时，视口内最近的同类控件（必须能找到卡片大小的归属容器，避免串到邻卡）；
   4) 弹窗/容器内的作品链接；
   5) 播放器 id 兜底（更多按钮缺失的旧卡片）。
   - 作品类型先看卡片的 `data-e2e`（`feed-video`/`browse-video` → video，`feed-photo`/`browse-photo` → photo），再看 `<video>` 与 xgwrapper 是否存在；作者取卡内用户名/`a[href^="/@"]`，缺省 `i`。
3. 只读 DOM 属性，不读任何页面 JS 对象（隔离世界限制），不注入脚本。

## 4. 非目标

- 不改图文作品的展示、轮播交互与菜单项。
- 不改宿主侧下载/入库实现；不新增权限。
- 不为了让图文也能「下载视频」而改宿主语义。

## 5. 成功标准

- **S1** 图文卡（fixture）：`resolveActivePostUrl` 返回 `https://www.tiktok.com/@<author>/photo/<id>`；菜单点击后不再出现 `这一页没有可操作的作品`。
- **S2** 视频卡：仍返回 `/video/<id>`，与改造前一致。
- **S3** 无任何线索（无播放器、无链接、无 React id）时返回 `null`，不猜。
- **S4** 扩展单测全绿、构建通过、真实浏览器 fixture 证据留存。

## 假设

- 假设新版 For You 的图文卡与视频卡共用 `[data-e2e="recommend-list-item-container"]` 容器，且「不含 `<video>`」足以区分图文；若某天图文也带隐藏 video，则类型判断会退回 video，需要按 data-e2e 再细分。
- 假设新布局的卡片都渲染 `data-more-menu-item-id`，包括图文/轮播卡（已实测一张 7 图卡）；若某天该按钮被移除，则退回链接与播放器 id 两档，图文卡仍会是 null，需要新的 DOM 信号。
- 假设「卡片选择器命中的那张卡就是用户正在看的作品」；因此有卡片时不再退到别处的控件（避免把邻卡的 id 当成当前作品）。
- 假设宿主能用 `/@作者/photo/<id>` 这种地址提取图文的音频；若宿主不支持，它会返回自己的失败原因（比 noTarget 可操作）。

## 证伪方式

- 用 jsdom 夹具分别构造「只有 `data-more-menu-item-id` 的图文卡」「带 xgwrapper 的视频卡」「毫无线索的卡片」：若第一种返回 null 或类型不是 photo，或第二种不再是 `/video/`，或第三种瞎猜出作品，则实现被证伪。
- 在真实浏览器（extension-e2e + 构建产物）里渲染带 `data-more-menu-item-id` 的图文卡并点「下载音频」：若详情行仍显示 `这一页没有可操作的作品`，则修复被证伪。
- 若图文卡解析出的地址不是 `/photo/<id>`（例如拼成 `/video/`），也按证伪处理。

## 文档影响

只新增本 spec；无合同/README 变更。
