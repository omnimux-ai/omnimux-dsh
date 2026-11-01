# 规格：资产中心「公共 → 角色」首屏封面负载瘦身与请求减法 (Issue #3875)

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3875
- 前置：https://github.com/omnimux-ai/omnimux-dsh/issues/2151（分批与视口加载，已确认）
- 父任务：https://github.com/omnimux-ai/omnimux-dsh/issues/2147
- 状态：已确认（用户已确认全量推进，授权同步更新冲突规格与非目标）
- 工作树：`.worktrees/assets-cover-payload`（分支 `agent/assets-cover-payload-issue-3875`）

## 1. 现象与实测根因

用户在「资产中心 → 公共 → 角色」看到封面自下而上「拉窗帘」式逐块出现，首屏长时间停在灰块。

| 编号 | 实测事实 | 证据来源 |
| --- | --- | --- |
| R1 | 100 款免费数字人立绘为 1152×2048 PNG，单张 2.4–5.6 MB | CDN HEAD + PNG IHDR 解析 |
| R2 | `character/page-0000.json` 24 行全部为 PNG，合计 **79.1 MB**；前 15 张 48.6 MB | 逐条 HEAD 累加 |
| R3 | 111 张 PNG 行按 id 字典序**全部聚在目录最前**，`character` 前 3 页 100% PNG | 分页文件逐页统计 |
| R4 | 尾部 `preloadMedia(covers)` 无条件预拉末尾 15 张，与 `loading="lazy"` 互相抵消 | `CloudAssetsView.jsx` 源码 |
| R5 | 封面走本地 302 且 `Cache-Control: no-store`，跳转永不复用 | `http-routes.js:821` |
| R6 | 有封面的视频行也执行 `element.load()`；悬停即刻下载 424 KB WAV / 4 MB MP4 | 源码 + 逐条 HEAD |
| R7 | `https://omnimux.ai/cloud-assets-catalog/manifest.json` 连续 3 次 404（0.67/1.71/0.66 s） | curl ×3 |
| R8 | CDN 无图片缩放：`cdn-cgi/image` 404，`?w=520` 返回完整 2.9 MB 原图 | curl 探测 |

结论：卡顿主因是**封面总字节**，不是目录 JSON（29 KB/页）或 DOM 渲染。任何仅在前端做减法的方案都改变不了 79.1 MB 的事实。

## 2. 用户操作旅程

1. 打开资产中心 → 公共 → 角色。
2. 首屏在骨架之后**1 秒内**清晰成图，不再出现自下而上的逐块填充。
3. 向下滚动翻页时，新一批封面按视口出现，不回头抢占首屏带宽。
4. 鼠标从卡片上快速划过：不触发任何音视频下载；停留 ≥200 ms 后自动试听启动。
5. 点击播放键：仍为**零延迟**启动，不受悬停门槛影响。
6. 点开详情：仍显示高清原图，不受缩略图影响。

## 3. 期望界面反馈

- 首屏封面总字节 ≤ **2 MB**（现状 79.1 MB）。
- 单张封面请求 **0 次**本地 302 跳转（直连 CDN）。
- 首屏图片请求数 ≤ 列数 × 3（5 列 → 15），无尾部整批预取。
- 每次会话 **0 次**无效远端目录探测。
- 缩略图缺失/404 时**静默回落**原图，不出现空态、报错或布局跳动。

## 4. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | 角色页第 1 页封面预算 ≤ 2 MB（按缩略图清单离线计算，不联网） | 端到端契约测试 || AC-2 | 封面取图优先级为 `thumbUrl` → `coverUrl`(仅 https) → `cloudMediaUrl(id,'cover')` | 单测 + 源码契约 |
| AC-3 | `CloudAssetsView` 不再整批预取尾部封面；`loading="lazy"` 保留 | 源码契约 + 既有测试改写 |
| AC-4 | 有封面的视频行不执行进场 `element.load()`；无封面 `bareClip` 分支保留 | 源码契约 |
| AC-5 | 悬停自动试听需停留 ≥200 ms；显式点击仍零延迟 | 源码契约 + 浏览器证据 |
| AC-6 | 302 响应头为 `private, max-age=3600`，本地 stream 分支保持 `private, max-age=30` | Host 路由单测 |
| AC-7 | 默认目录源为本地哨兵，0 次远端探测；显式环境变量仍可覆盖 | `cloud-source.test.js` |
| AC-8 | 111 张 PNG 行中，除 6 张源文件已损坏外均在缩略图清单中有对应条目，单张 ≤ 160 KB | 端到端契约测试 |
| AC-9 | 目录构建新增 `thumb_url` 为可选字段，缺省空串，旧目录与旧客户端零影响 | 构建脚本单测 |
| AC-10 | 工作树内真实浏览器证据：首屏请求数、字节数、跳转次数落盘 | ego-browser + 结构化报告 |

## 5. 设计

### 5.1 缩略图生成（新增脚本）

- 位置：`plugins/omnimux-assets/scripts/build-cover-thumbnails.mjs`
- 输入：`cloud-catalog/index.json`
- 输出：`--out=<dir>` 下 `*.webp` 与 `thumb-manifest.json`（`row id → object key → bytes → width`）
- 规格：宽 **640 px**、`webp quality 78`（实测 69 KB；520w=54 KB、400w=34 KB 为备选档位）
- 默认只处理 PNG 行（111 张）；`--all` 可选扩展到全部有封面行
- `sharp` 复用仓库已装 `plugins/omnimux/node_modules/sharp@0.35.5`，**不新增任何依赖**；解析失败时以明确错误退出，不静默跳过
- 幂等：已存在且字节一致则跳过

### 5.2 目录字段

- `makeAsset` 与 `indexEntryOf` 新增可选 `thumb_url`，缺省 `''`
- `sortItems` 按 id 排序不变，缩略图字段只增加不重排，构建保持字节可复现

### 5.3 客户端取图

```
thumbUrl (https) → coverUrl (https) → cloudMediaUrl(id,'cover') 兜底
```

- `normalizeCloudAsset` 新增 `coverUrl`、`thumbUrl` 两个字段（当前 `cover_url` 被整个丢弃，只留 `hasCover` 布尔）
- `hasCover` / `hasMedia` 布尔语义保持不变，`cloudCardKind` 等判定零影响
- `cloud-preview.js` 不动，详情弹窗继续用原图

### 5.4 请求减法

- 删除 `CloudAssetsView` 的尾部 `preloadMedia(covers)` effect 与对应 import
- `CloudTileMedia`：删除有封面视频行的进场 `element.load()`，保留 `bareClip` 那次
- 悬停试听加 200 ms 停留防抖；`userControlledRef` 与 `autoplaySuppressed` 语义完全不变
- `media-cache.js` 保留导出（其它调用方与测试仍引用），仅解除本页面调用

### 5.5 Host 缓存头

- 302 分支：`no-store` → `private, max-age=3600`
- `sendPreview` 的 `private, max-age=30` 保持不动

### 5.6 目录源默认

- `DEFAULT_CLOUD_ASSETS_BASE_URL` 改为本地哨兵 `LOCAL_CLOUD_BASE_URL`
- 保留 `globalThis.__OMNIMUX_CLOUD_ASSETS_BASE_URL__` 与构建期 `CLOUD_ASSETS_BASE_URL` 覆盖能力
- 同步更新 `cloud-source.js` 头注释，避免代码与设计说明互相矛盾

## 6. 边界与降级

- **缩略图缺失/404**：回落 `coverUrl` → 再回落 `cloudMediaUrl`，两级都失败才走既有 `broken` 图标
- **目录仍为 `file:` 定位符**：直链分支自动跳过走本地路由（实测随包目录 `file:` 计数为 0，仍保留兜底）
- **断网/离线**：封面请求失败即灰底图标，卡片与标题照常渲染
- **`loading="lazy"` 不支持**：退回全量请求，不报错
- **节流后悬停**：显式点击仍零延迟；仅自动试听多 200 ms
- **不破坏的既有语义**：`autoplaySuppressed` 抑制循环、官方音色 preview-only fail-closed 门、`userControlledRef` 接管规则、瀑布流追加稳定性、比例缓存 CLS=0

## 7. 新用户基线

全新安装且签入后：

- 打开资产中心 → 公共 → 角色即可看到首屏秒开，**无需**任何本地配置、代理或开发机私有状态
- 缩略图未上传时自动回落原图，功能完全可用（只是慢），不报错、不空白
- 远端目录默认关闭，**不需要**联网探测即可渲染货架
- 缺 `sharp` 仅影响构建脚本，不影响运行时

## 8. 非目标

- 不改瀑布流分列算法与封面比例缓存（#2150 / #2152 领域）
- 不改详情弹窗用图（继续原图）
- 不改本地资产文件读写与入库链路
- 不在未授权情况下上传 R2 或改动线上目录
- 不通过 CSS/DOM 掩盖数据问题（不隐藏、不黑名单）

## 旧标准变更

本任务推翻了三条既有断言，因为它们各自钉住了本次要移除的旧行为。逐条声明：

- `plugins/omnimux-assets/src/client/cloud-source.test.js` :: `defaults to the production gateway when nothing is configured`
  - **原断言**：`DEFAULT_CLOUD_ASSETS_BASE_URL === 'https://omnimux.ai/cloud-assets-catalog'`，即默认走远端网关。
  - **必须改的理由**：该网关实测连续 3 次返回 404（0.67/1.71/0.66 s），每次会话都白等一次网络往返才回落本地；产品基线要求全新安装不依赖任何网关即可渲染货架（AC-7）。
  - **新期望证据**：`DEFAULT_CLOUD_ASSETS_BASE_URL === LOCAL_CLOUD_BASE_URL`，且 `cloudManifestUrl(configuredCloudBaseUrl({})) === '/omnimux/assets/cloud/manifest.json'`；同时新增一条用例证明远端网关仍是可显式配置的目的地。

- `tests/e2e/public-tab-skeleton-cache.e2e.test.mjs` :: `E2E: 卡片封面提前解码，滚动来回不闪白`
  - **原断言**：`assert.match(viewJsx, /preloadMedia\(covers\)/)`，要求视图对尾部整批封面预取。
  - **必须改的理由**：该预取与 `loading="lazy"` 的视口策略互相抵消，首屏未画完就把末尾十几张几兆大图挤进管道（R4、AC-3）。
  - **新期望证据**：断言视图**不再**包含 `preloadMedia(covers)`，且 `media-cache.js` 的既有上限与去重语义原样保留（`preloadMedia` 仍可被其它调用方安全调用）。

- `tests/e2e/assets-grid-viewport-paging.e2e.test.mjs` :: `E2E 契约三：封面懒加载并取消整批全量预解码 (AC-3)`
  - **原断言**：`assert.match(viewSrc, /items\.slice\(Math\.max\(0, items\.length - pageSize\)\)/)`，要求保留尾部下一屏预取。
  - **必须改的理由**：同上，尾批预取正是本次要移除的抢带宽来源；`loading="lazy"` 已由浏览器按视口负责。
  - **新期望证据**：断言 `loading="lazy"` 仍在、且 `preloadMedia` 与尾部 slice 预取均不存在于视图源码。

- `plugins/omnimux-assets/src/client/CloudAssetsView.test.js` :: `falls back to the type icon only when nothing is left to draw`
  - **原断言**：`assert.match(viewJsx, /if \(asset\.mediaType !== 'image' && hasClip\) setCoverFailed\(true\)\n    else onBroken\(\)/)`，钉住旧的单一 `setCoverFailed` 布尔回落。
  - **必须改的理由**：取图现在是一条三级阶梯（缩略图 → 原图 → Host 路由），失败必须逐级降档而不是一步置灰；旧断言钉住的正是被替换掉的实现（AC-2、AC-6）。
  - **新期望证据**：断言源码存在阶梯降档（`srcStep < coverLadder.length - 1` → `setSrcStep(srcStep + 1)`）与 `if (bareClip) onBroken()` 终局兜底；并由新增用例覆盖「缩略图 404 时仍能画出原图」的行为。

- `plugins/omnimux-assets/src/client/audio-hover-autoplay-suppression.e2e.test.js` :: `CloudAssetCard + useCloudAudition：悬停自动播放被拒后同一悬停不再自动重试（OCR #12）`
  - **原断言**：`fire(card,'mouseover')` 后一次 `flush()` 即断言 `instances.length === 1`（悬停立刻起播）。
  - **必须改的理由**：悬停起播现在要停留 200 ms 才发生（AC-5），立即 flush 必然读到 0 次；被断言的核心语义（同一悬停不自动重试、显式点击仍能重发）完全不变。
  - **新期望证据**：同一断言在等待 `HOVER_AUDITION_DELAY_MS` 之后成立；「同一悬停不再重启」「显式点击重新发起」两条原有断言原样保留。

- `plugins/omnimux-assets/src/client/audio-hover-toggle.e2e.test.js` :: `CloudAssetCard audio: explicit click owns the card until pointer leaves (#2989)`
  - **原断言**：`fire(card,'mouseover')` 后同步断言 `calls.length === 1`。
  - **必须改的理由**：同上，起播有 200 ms 停留门槛（AC-5）；「显式点击接管、指针移出不被强停」的语义不变。
  - **新期望证据**：等待门槛后再断言首次自动试听；接管与移出语义的断言原样保留。

- `plugins/omnimux-assets/src/client/audio-hover-toggle.e2e.test.js` :: `CloudAssetCard audio: save/chat press does not own the card; detail press still marks (#3058)`
  - **原断言**：悬停后立即断言已起播，再验证保存/会话按钮按下不算接管。
  - **必须改的理由**：同上，起播门槛使立即断言失效；「保存/会话按下不接管、详情按下接管」的语义不变。
  - **新期望证据**：等待门槛后再断言起播；两类按下的接管判定原样保留。

- `plugins/omnimux-assets/src/client/voice-preview-terminal-release.e2e.test.js` :: `F4：悬停自动试听后点击/键盘打开详情，stop 生效不自动重启（user-controlled 标记）`
  - **原断言**：`fire(card,'mouseover')` + 一次 `flush()` 后断言 `instances.length === 1` 且 `playingId` 已置位。
  - **必须改的理由**：同上，起播门槛（AC-5）；该用例验证的「打开详情 stop 后同一悬停不重启」语义不变。
  - **新期望证据**：等待门槛后断言起播与 playingId；后续 stop 与不重启的断言原样保留。

## 假设

1. 卡面显示宽度 ≤ 320 CSS px、按 2× DPR 计约 640 物理像素，故 640w WebP 在视觉上无可辨差异。
2. 角色页首屏卡顿的主因是封面总字节（79.1 MB），而非目录 JSON（29 KB/页）或 DOM 渲染开销。
3. 悬停自动试听加 200 ms 停留门槛不会让用户感到「点了没反应」，因为显式点击仍零延迟。

## 证伪方式

1. 若 640w 缩略图在真实浏览器 2× 屏上与 1152w 原图裁切对比**肉眼可辨模糊**，则假设 1 错 → 改升 960w 并重测单张字节。
2. 若改造后首屏字节降到 ≤2 MB 但首屏耗时仍 >2 s，则假设 2 错 → 转向目录 JSON 体积（`index.json` 4.3 MB）与 DOM 渲染分析。
3. 若真实浏览器中悬停 200 ms 后试听启动被记录为「无响应」（用户可见延迟 ≥1 s），则假设 3 错 → 回退到 120 ms 或改为仅显式点击播放。
4. 可执行验证命令：
   - `pnpm --filter omnimux-assets test`
   - `node --test tests/e2e/assets-cover-payload.e2e.test.mjs`
   - `pnpm verify:stages`、`pnpm verify:product-baseline`
   - `pnpm test:worktree-web`（真实浏览器证据）
