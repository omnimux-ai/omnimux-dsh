# 规格：修复 #3878 引入的 image 行取图死路与缩略图未生效 (Issue #3879)

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3879
- 前置：https://github.com/omnimux-ai/omnimux-dsh/issues/3875（#3878 已合并）
- 状态：已确认（独立评审结论经逐条核实全部属实）
- 工作树：`.worktrees/assets-cover-ladder-fix`（分支 `agent/assets-cover-ladder-fix-issue-3879`）

## 1. 现象

#3878 合并后，独立评审返回 **2 BLOCKER + 3 HIGH**，经逐条核实全部属实。最严重的一条是相对 base 的**功能回归**。

| 编号 | 缺陷 | 核实证据 |
| --- | --- | --- |
| D1 | `media_type: 'image'` 的行绕过取图阶梯 | `CloudAssetsView.jsx:80` `imageSrc = mediaType === 'image' ? cloudMediaUrl(id,'media') : coverSrc` |
| D2 | image 行 404 后永久停在破图（回归） | `handleImageError` 递增 `srcStep`，但 `imageSrc` 不读 `coverSrc` → 渲染 src 不变；base 版本立即 `onBroken()` |
| D3 | 随包目录 0 行带 `thumb_url` | `index.json` 6388 行、`page-0000.json` 24 行，计数均为 0 |
| D4 | 缩略图对象 CDN 404 | `curl .../thumbs/character-...webp` → 404；原图 → 200 |
| D5 | e2e 依赖 gitignored 路径 | 读 `.workbuddy/evidence/.../thumb-manifest.json`，`.gitignore:10` 忽略 → 干净 checkout 必崩 |
| D6 | 悬停 timer 依赖不稳定 | `onTogglePlay` 依赖 `audition`，`useCloudAudition` 每次渲染返回新对象 → effect 重跑清 timer |
| D7 | 页分片会写入空串 `thumb_url` | `makeAsset` 加 `thumb_url: ''`，`pageSpecs` 原样序列化 → 6388 行字节全变 |
| D8 | `directMediaUrl` 接受 http:// | 与 AC-2「仅 https」不符，且测试固化了该偏离 |

## 2. 用户操作旅程

1. 打开资产中心 → 公共 → 场景（`media_type: 'image'` 的 4322 行）。
2. 某张封面请求失败（网络抖动、CDN 404）：卡片**立刻**退到类型图标，不停在破图。
3. 有缩略图的对象行（`thumb_url` 存在时）：卡片先取缩略图，失败再退原图，再失败退 Host 路由。
4. 鼠标从卡片快速划过（<200 ms）：不触发任何音视频下载。
5. 鼠标停留 ≥200 ms：自动试听启动；即使父级在这 200 ms 内多次重渲染，试听仍按时触发。

## 3. 期望界面反馈

- 任何单张封面失败都**不会**留下永久破图/灰块；最差是类型图标。
- image 行在有 `thumb_url` 时下载的是缩略图，不是几兆原图。
- 悬停试听的触发时机与父级重渲染频率无关。

## 4. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | image 行取图阶梯为 `thumbUrl` → `coverUrl` → Host `which=media` | 单测 + 源码契约 |
| AC-2 | 任意行在阶梯耗尽后调用 `onBroken()`（不再依赖「error 触发三次」） | **真实派发 error 事件**的行为测试 |
| AC-3 | 悬停试听在父级每 60 ms 重渲染时仍于 ~200 ms 后触发一次 | 行为测试 |
| AC-4 | 快速划过（<200 ms）不触发试听 | 行为测试（负向断言） |
| AC-5 | 不传 `--thumb-manifest` 构建时，页分片与 index 均不出现 `thumb_url` 键 | 构建脚本单测 |
| AC-6 | e2e 不读 `.workbuddy/`；清单在测试内现场生成或作为仓库 fixture | 干净 checkout 可跑 |
| AC-7 | `directMediaUrl` 仅接受 https | 单测 |
| AC-8 | 交付表述与事实一致：缩略图未上传前不得声称已生效 | 文档审查 |

## 5. 设计

### 5.1 image 行阶梯（修 D1/D2）

```js
const coverLadder = hasCover
  ? [asset.thumbUrl, asset.coverUrl, cloudMediaUrl(asset.id, 'cover')].filter(Boolean)
  : []
const ladder = asset.mediaType === 'image'
  ? [asset.thumbUrl, asset.coverUrl, cloudMediaUrl(asset.id, 'media')].filter(Boolean)
  : coverLadder
const imageSrc = ladder[srcStep] ?? ''
```

`handleImageError` 统一走 `ladder`：`srcStep < ladder.length - 1` 递增；否则 `onBroken()`（video 且有 clip 时才交给 clip）。

### 5.2 悬停 timer 稳定化（修 D6）

把 `onTogglePlay` 放进 ref，effect 依赖只保留 `hovering`/`canPlay`/`playing`/`autoplaySuppressed`：

```js
const toggleRef = useRef(onTogglePlay)
useEffect(() => { toggleRef.current = onTogglePlay }, [onTogglePlay])
```

timer 回调调用 `toggleRef.current(asset)`，`asset` 同样经 ref 或从闭包稳定读取。

### 5.3 页分片不写空串（修 D7）

`thumb_url` 从 `makeAsset` 移除，改在 attach 阶段直接给行赋值；页分片序列化前做一次「非空才发射」的投影，或让 `pageSpecs` 复用 `indexEntryOf` 的行形状。

### 5.4 表述与测试诚实（修 D3/D4/D5/AC-8）

- e2e 的缩略图清单改为**测试内调用 `planThumbs`/`buildManifest` 现场生成**，不读 `.workbuddy/`。
- 文档与 commit 表述降级为「工具就绪；上传 CDN 并用 `--thumb-manifest` 重建目录后才生效」。
- 删除或修正「79 MB → 1.74 MB」的既成事实式表述。

### 5.5 收紧 https（修 D8）

`directMediaUrl` 改为 `/^https:\/\//i`，同步改测试与规格 AC-2。

## 6. 边界与降级

- 缩略图未上传时：`thumb_url` 为空 → 阶梯直接从原图开始 → 行为等同改造前，无回归。
- `file:` 定位符：两个直连字段为空 → 走 Host 路由。
- 断网：封面失败退图标，卡片与标题照常渲染。
- 不破坏既有语义：`autoplaySuppressed` 抑制循环、官方音色 preview-only fail-closed、`userControlledRef` 接管、瀑布流追加稳定性、比例缓存 CLS=0。

## 7. 新用户基线

全新安装签入后：打开资产中心即可正常浏览，无需任何网关或本机配置；缩略图缺失时自动回落原图（慢但可用），不报错、不空白、不留破图。

## 8. 非目标

- 不重做缩略图方案，不改 302 缓存策略。
- 不在未授权情况下上传 R2。
- 不通过 CSS/DOM 掩盖数据问题。

## 旧标准变更

- `plugins/omnimux-assets/src/client/CloudAssetsView.test.js` :: `branches the card body on the row kind`
  - **原断言**：`import { cloudAudioTheme, cloudCardKind, isOfficialVoicePreviewAsset, isOfficialVoicePreviewPlayable } from './cloud-feed-helpers.js'`（逐字导入行）。
  - **必须改的理由**：阶梯抽成 `coverLadderOf` / `nextLadderStep` 两个纯函数后，导入行多了两个符号；逐字钉死导入行的断言必然失配，而它要证明的「按 kind 分支」语义未变。
  - **新期望证据**：断言导入行包含 `coverLadderOf` 与 `nextLadderStep`，其余三条 `kind` 分支断言原样保留。

- `plugins/omnimux-assets/src/client/CloudAssetsView.test.js` :: `never points the image at a clip`
  - **原断言**：`assert.match(viewJsx, /const imageSrc = asset\.mediaType === 'image' \? cloudMediaUrl\(asset\.id, 'media'\) : coverSrc/)`，钉住 image 行绕过阶梯的旧写法。
  - **必须改的理由**：该写法正是 BLOCKER 1（D1/D2）的成因——image 行拿不到缩略图，且 404 后永久破图。
  - **新期望证据**：断言 image 行阶梯为 `[thumbUrl, coverUrl, cloudMediaUrl(id,'media')]`，且渲染 src 来自 `ladder[srcStep]`；`retriedWithMedia` 与旧三元写法仍不得出现。

- `plugins/omnimux-assets/src/client/CloudAssetsView.test.js` :: `falls back to the type icon only when nothing is left to draw`
  - **原断言**：#3878 引入的 `srcStep < coverLadder.length - 1` + `setSrcStep(coverLadder.length)` 文本匹配。
  - **必须改的理由**：该实现本身有缺陷（image 行死路），本次改为统一 `ladder` 并让耗尽必然 `onBroken()`；旧断言钉住的正是被替换的实现。
  - **新期望证据**：断言统一 `ladder` 的存在、`srcStep < ladder.length - 1` 递增、以及耗尽时 `onBroken()` 的调用路径；并由新增的真实派发 error 行为测试覆盖。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约一：角色首屏封面预算从 79 MB 降到 2 MB 以内 (AC-1)`
  - **原断言**：读 `.workbuddy/evidence/.../cover-payload-report.json`，断言 `originalMB > 70`、`thumbnailMB <= 2`、`coveredRows === 24`、`reductionPercent >= 90`。
  - **必须改的理由**：该文件在 `.gitignore` 内，干净 checkout 与 CI 必崩；且这些数字在缩略图未上传 CDN 前不代表交付事实（D3/D4/D5）。
  - **新期望证据**：改为断言随包目录的**可选字段契约**——不出现空串 `thumb_url`，出现时必须是 https。真实字节收益改由「上传后」的人工验收，不再冒充。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约二：PNG 行除损坏源外均有缩略图，单张 ≤ 160 KB (AC-8)`
  - **原断言**：读 gitignored 清单，断言 `rows.length === 105`、无单张 > 160 KB。
  - **必须改的理由**：同上，依赖未入库产物；且「105 张」是某次运行的快照，不是契约。
  - **新期望证据**：改为对 `planThumbs`/`buildManifest` 的**现场生成**断言：计划覆盖 111 张、清单字段与宽度/质量正确、6 张损坏源在编码阶段才暴露。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约八：image 行也走取图阶梯，不会绕过缩略图 (AC-1, AC-2)`
  - **原断言**：匹配视图源码里的内联阶梯数组字面量 `[asset.thumbUrl, asset.coverUrl, cloudMediaUrl(asset.id,'media')]`。
  - **必须改的理由**：阶梯已抽成 `coverLadderOf` / `nextLadderStep` 纯函数，内联字面量不再存在；继续钉死源码文本会让断言只验证「字面量长这样」，而真实行为已由 `cloud-feed-helpers.test.js` 覆盖。
  - **新期望证据**：断言视图委托给 `coverLadderOf` 与 `nextLadderStep`，并保留「image 行不得绕过阶梯」与「耗尽必落兜底」两条结构断言。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约七：卡片取图优先级为 缩略图 → 原图 → Host 兜底 (AC-2)`
  - **原断言**：`assert.equal(directMediaUrl('http://a/b.webp'), 'http://a/b.webp')`，把「接受 http」固化成契约。
  - **必须改的理由**：与 AC-2「仅 https」直接矛盾（D8）。
  - **新期望证据**：`directMediaUrl('http://a/b.webp') === ''`；其余阶梯顺序断言保留。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约八：视图不再整批预取尾部封面，视频不提前拉流 (AC-3, AC-4)`
  - **原断言**：只断言 `preloadMedia` 不存在与 `bareClip` 存在。
  - **必须改的理由**：原用例未覆盖 image 行绕过阶梯这一 BLOCKER（D1/D2），改名后承载 image 行阶梯契约。
  - **新期望证据**：新增断言 image 行阶梯包含 `thumbUrl`、渲染 src 来自 `ladder[srcStep]`、耗尽必走 `onBroken()`。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约九：悬停试听有停留门槛，显式点击不受限 (AC-5)`
  - **原断言**：断言 `setTimeout(() => { onTogglePlay(asset) }, ...)` 与依赖数组含 `onTogglePlay`。
  - **必须改的理由**：该写法正是 D6 的成因（父级重渲染清 timer）。
  - **新期望证据**：断言 `togglePlayRef.current(asset)`、`useRef(onTogglePlay)` 存在，且 `onTogglePlay` **不在**依赖数组。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约十：默认目录源为本地，远端仅显式配置 (AC-7)`
  - **原断言**：`configuredCloudBaseUrl({}) === LOCAL_CLOUD_BASE_URL` 等三条。
  - **必须改的理由**：文件整体重写后编号顺延，用例语义与断言完全保留。
  - **新期望证据**：与原断言一致。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约十一：302 响应可缓存，本地 stream 缓存策略不变 (AC-6)`
  - **原断言**：源码正则三条（`max-age=3600`、无 `no-store`、`max-age=30`）。
  - **必须改的理由**：同上，编号顺延。
  - **新期望证据**：与原断言一致。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约十二：清单构建保持确定性（同输入同输出）`
  - **原断言**：`deepEqual` 两次构建产物、行序与总量。
  - **必须改的理由**：同上，编号顺延。
  - **新期望证据**：与原断言一致。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: 全部用例
  - **原断言**：读取 `.workbuddy/evidence/.../thumb-manifest.json` 与 `cover-payload-report.json`。
  - **必须改的理由**：`.workbuddy/` 被 gitignore，干净 checkout 与 CI 必崩（已实测 ENOENT）；且这些数字在缩略图未上传前不代表交付事实。
  - **新期望证据**：清单在测试内现场生成；断言改为「工具产出正确」而非「线上已生效」，并在缩略图未上传时明确断言回落行为。

## 假设

1. 随包目录的 11 张 PNG image 行（`scene-nature` 3、`prop-digital-3c` 8）在有 `thumb_url` 时会显著受益，因为它们当前下的是 121–179 KB 原图之外的最大 PNG。
2. 父级重渲染频率是悬停失效的真实成因，而不是测试环境的 setState 合并假象。
3. 真实浏览器对同一 404 只触发一次 `error`，因此「靠多次 error 自增到耗尽」不可依赖。

## 证伪方式

1. 若 11 张 image 行的原图本就在 200 KB 以下、缩略图收益可忽略，则假设 1 错 → 应把 image 行也纳入「只对 PNG 生成缩略图」的判断并复核收益。
2. 若在真实浏览器中高频重渲染下悬停仍稳定触发，则假设 2 错 → 回滚 5.2 的 ref 改造，只保留负向断言。
3. 若实测同一 404 会触发多次 `error`，则假设 3 错 → 仍保留 AC-2 的显式 `onBroken()`，因为依赖错误次数本身就是不可维护的契约。
4. 可执行验证：
   - `node --test plugins/omnimux-assets/src/client/*.test.js`
   - `node --test tests/e2e/assets-cover-payload.e2e.test.mjs`（干净 checkout 下必须可跑）
   - `pnpm --filter omnimux-assets test`
