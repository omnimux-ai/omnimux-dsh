# 数字产品网站双端首屏截图规范

**文件：** `specs/digital-product-website-screenshots.spec.md` ｜ **优先级：** P0 ｜ **模块：** `plugins/omnimux-products`

## 1. 问题与目标

### 1.1 现象（用户真实旅程）

用户在「产品库 → 添加产品」里粘贴一个数字产品／网站类链接、点击智能解析。六大品牌战略面板被模型成功推演并填满，**但弹窗下方的「主图文件」区域依然空白**——用户拿到了一份完整的战略报告，却没有任何一张可以当作封面使用的图片，必须离开当前流程、手动打开网页截图、再拖回上传。

对照实现（`/Users/x/Desktop/Project/Gxgen` 的 `services/browser-engine/app/web_page_screenshot.py`）在同一输入下会同时产出电脑端与手机端首屏截图。本仓库缺少这一能力。

### 1.2 根因

| # | 位置 | 事实 |
|---|---|---|
| 1 | `link-importer.js` `importProductFromUrl` | 只做 HTML/Markdown 文本抽取，**全程不启动任何浏览器**，草稿里没有任何本地媒体路径。 |
| 2 | `link-importer.js` `IMPORT_DRAFT_EXTRA_KEYS` | 仅 `kind` / `brand_strategy` / `analysis`，**不含 `media` 与 `cover_media_id`**。 |
| 3 | `useProductFormState.js` `applyImportedData` | 回填 name / selling / … / categories / strategy，**完全不触碰 `mediaState`**，因此即便服务端返回了媒体，界面也不会刷新。 |
| 4 | `ProductMediaSection.jsx` `MediaItem` | 接收 `coverId` 属性但**从未渲染**，"哪一张是主封面"在界面上不可见。 |

四处缺口串联即为"文本满、图片空"的用户观感。

### 1.3 目标

数字产品（网站类）链接导入时，在**不显著增加用户等待时间**的前提下，自动产出电脑端与手机端首屏截图各一张，落盘持久化、自动挂到主图文件列表，并默认把电脑端截图勾选为主封面；任一环节失败都必须**优雅降级**，绝不阻断文本字段与品牌战略的生成。

## 2. 状态与视口契约

### 2.1 视口契约（与对照实现逐项对齐）

| 键 | 视口宽×高（CSS px） | `deviceScaleFactor` | `isMobile` | `hasTouch` | 产出位图（px） |
|---|---|---|---|---|---|
| `desktop` | 1440 × 900 | 1 | false | false | **1440 × 900** |
| `mobile` | 390 × 844 | 2 | true | true | **780 × 1688** |

> 上表两行产出位图已在本机实测确认（`pngjs` 解码：desktop 1440×900；mobile 780×1688，即 390×844 @2x）。

**不变量：**

1. 两个视口**并发**采集，总墙钟时间取二者较慢者，而非相加。
2. 截图仅取首屏（`captureBeyondViewport: false`），不做整页长图。
3. 采集使用系统真实 Chrome/Chromium 的**独立临时用户目录**，不读写用户日常 Chrome 配置，不携带用户 Cookie 与登录态。
4. 截图目标 URL 必须通过既有 SSRF 守卫（`assertAllowedUrl` / `isPrivateHost`），协议仅允许 `http` / `https`。

### 2.2 存储契约

| 项 | 约定 |
|---|---|
| 目录 | `<dsh home>/omnimux/products/media/`（由 `resolveProductsPaths()` 新增 `mediaDir` 字段统一给出，禁止调用方自行拼接） |
| 目录权限 | `0o700` |
| 文件权限 | `0o600` |
| 命名 | `site-<主机名短写>-<viewport>-<UTC 时间戳>-<4位随机>.png`，例：`site-platform-example-com-desktop-20260914T031932Z-9f3a.png` |
| 写入方式 | 先写 `<name>.png.tmp`，`fsync` 后 `rename` 原子替换（与 `library.js` 既有 `atomicWrite` 同纪律） |
| 主机名短写 | 主机名转小写，非字母数字折叠为 `-`，去首尾 `-`，截断至 40 字符 |

**不变量：**

5. 截图的**内存缓冲**可与页面解析并发产生，但**落盘只发生在草稿通过 `isUsableImport` 之后**——导入最终失败时磁盘上不残留孤儿图片。
6. 落盘后若后续步骤抛错，必须 best-effort 删除本步骤写入的文件。
7. `mediaDir` 为**可选项**：`createLibraryStore` 的既有测试直接构造 `{ libraryFile }`，新增字段不得让其报错（读取方一律 `paths.mediaDir ?? join(dirname(paths.libraryFile), 'media')` 兜底）。

### 2.3 数据协议契约

`importProductFromUrl` 的返回在既有 `IMPORT_FIELD_KEYS` + `IMPORT_DRAFT_EXTRA_KEYS` 之上新增三个键：

```jsonc
{
  // …既有字段 name / selling_points / … / categories / images / kind / brand_strategy / analysis…
  "media": [
    { "id": "med_a1b2c3d4", "real_path": "/…/products/media/site-…-desktop-….png", "original_name": "site-…-desktop-….png" },
    { "id": "med_e5f6a7b8", "real_path": "/…/products/media/site-…-mobile-….png",  "original_name": "site-…-mobile-….png"  }
  ],
  "cover_media_id": "med_a1b2c3d4",
  "screenshots": {
    "status": "captured",
    "viewports": [
      { "kind": "desktop", "ok": true,  "width": 1440, "height": 900,  "bytes": 18485, "reason": null },
      { "kind": "mobile",  "ok": true,  "width": 390,  "height": 844,  "bytes": 37357, "reason": null }
    ],
    "reason": null
  }
}
```

**不变量：**

8. `media` 顺序**恒为** `[desktop, mobile]`；因此 `library.normalizeMedia` 写库时 `sort_order` 为 0 的即为电脑端。缺失的视口从数组中省略，不占位、不补空项。
9. `cover_media_id` 恒等于 `media[0].id`（电脑端）；`media` 为空数组时 `cover_media_id` 恒为 `null`。
10. `media[].id` 采用既有 `newRecordId('med')` 格式（`med_` + 8 位十六进制），使 `library.normalizeMedia` 原样保留该 id 而非另发新 id —— 否则 `cover_media_id` 落库瞬间即失效。
11. `screenshots` 为**带内降级报告**：即使全部失败，该键也必须存在，请求仍为 HTTP 200，文本字段与 `brand_strategy` 照常返回。
12. `media` / `cover_media_id` / `screenshots` 仅在 `kind === 'digital'` 时产出；实体商品保持既有形状（不新增键）。

### 2.4 前端回填契约

`applyImportedData(data)` 在既有回填之上增加：

1. **合并而非覆盖**：导入的媒体以 `id` 优先、`real_path` 兜底去重后**追加**到当前 `media` 尾部。用户已经拖入的文件绝不被丢弃。
2. **封面择一采用**：当前 `coverId` 为 `null` 时采用导入的 `cover_media_id`；用户已显式选过封面时**保留用户选择**。
3. **可达性守卫**：仅当 `cover_media_id` 确实存在于合并后的列表时才写入，否则保持原值 —— 与 `library.js` 写库时的校验口径一致（见 `library.js` 第 573、626-629 行）。
4. **空载荷零副作用**：`data.media` 缺失或非数组时不改动任何媒体状态。
5. **可见性**：主图列表中被勾选为主封面的行必须有**可见的选中态**（当前 `MediaItem` 收了 `coverId` 却不渲染，属缺陷）。

## 3. 并发时序契约

页面解析与截图采集必须**重叠**，而不是串行相加：

```
t0  ┌─ 解析链接请求进入
    │
t1  ├─ readPageSource（既有：hub 阅读器 ∥ 守卫 GET，并发）
    │     └─→ 得到 page，据此判定 kind
    │
t2  ├┬─ analyzeLandingPage（慢：模型调用，秒级）  ←┐ 两者并发
    │└─ captureSiteScreenshots（快：实测桌面端 949ms）│
    │        └─ 返回纯内存 PNG 缓冲，暂不落盘        │
    │                                              │
t3  ├──────────────────────────────────────────────┘  汇集
    │
t4  ├─ isUsableImport 判定 → 不通过则抛错，磁盘零残留
    │
t5  ├─ 落盘双端 PNG（原子写）→ 组装 media / cover_media_id
    │
t6  └─ 返回草稿（HTTP 200）
```

**不变量：**

13. `captureSiteScreenshots` 在 `t2` 与模型调用**并发**启动，其耗时被模型调用吸收，导入总耗时上界不超过"原耗时 + 落盘时间"。
14. 截图链路自身的总预算为 25 秒硬上限；即使浏览器进程挂死，请求仍必须在预算内返回降级结果。
15. 浏览器进程必须在返回前关闭（含异常路径），临时用户目录必须删除；不得残留僵尸进程或临时目录。

## 4. 降级策略

四级降级，每一级都**不阻断**文本与品牌战略：

| 级别 | 触发条件 | 行为 | `screenshots.status` | `screenshots.reason` |
|---|---|---|---|---|
| L0 正常 | 双端成功 | 返回两条媒体，电脑端为主封面 | `captured` | `null` |
| L1 部分成功 | 仅一端成功 | 返回成功的那一条并置为主封面 | `captured` | 失败视口的原因码 |
| L2 全部失败 | 导航超时／截图失败／预算耗尽 | `media: []`、`cover_media_id: null` | `failed` | 见下表原因码 |
| L3 环境缺失 | 宿主无 Chrome/Chromium | 不启动任何进程，立即返回 | `skipped` | `no-browser` |
| L4 不适用 | `kind` 判定为实体商品 | 完全不进入截图链路 | `skipped` | `not-digital` |

**原因码枚举：** `no-browser` ｜ `launch-failed` ｜ `nav-failed` ｜ `nav-timeout` ｜ `capture-failed` ｜ `budget-exceeded` ｜ `unsafe-url` ｜ `not-digital`。

**不变量：**

16. 截图链路中**任何**抛出的异常都在 `captureSiteScreenshots` 内部被吞掉并转为原因码；不得向 `importProductFromUrl` 冒泡。
17. `no-browser` 场景下不得产生任何进程 spawn 尝试失败的重试循环，也不得向用户弹出错误对话框。
18. 降级不影响 `analysis.mode`（模型答案仍为 `model`）与 `brand_strategy` 的完整性。
19. 用户可见的提示为**中性陈述**（"截图未生成，可手动上传"），不得阻断弹窗、不得遮挡战略面板。

## 5. 验收用例表

| # | 场景 | 操作 | 预期结果 |
|---|---|---|---|
| 1 | 双端截图成功 | 数字产品链接 + 可用浏览器 | ✅ HTTP 200；`media.length === 2`；`media[0]` 为 desktop、`media[1]` 为 mobile；`cover_media_id === media[0].id`；`screenshots.status === 'captured'` |
| 2 | 位图几何正确 | 用例 1 产出的两个 PNG 用 PNG 解码器读取 | ✅ desktop 为 **1440×900**；mobile 为 **780×1688**（390×844 @2x） |
| 3 | 文件真实落盘 | 用例 1 后按 `media[].real_path` 读盘 | ✅ 两文件均存在、为普通文件、可读；父目录权限 `0o700`、文件权限 `0o600` |
| 4 | 落盘位置合规 | 检查 `real_path` 前缀 | ✅ 前缀为 `<dsh home>/omnimux/products/media/`，无越界写入 |
| 5 | 媒体 id 与封面自洽 | 用例 1 的 `media[].id` 走 `library.normalizeMedia` | ✅ 提供的 id 被**原样保留**（非重新生成）；`cover_media_id` 仍能在结果列表中命中 |
| 6 | 双端并发而非串行 | 打桩使每一端固定耗时 400ms | ✅ 总耗时 < 700ms（并发）；串行实现会 ≥ 800ms |
| 7 | 单端失败降级 | 打桩使 mobile 导航超时、desktop 正常 | ✅ `media.length === 1`、该条为 desktop、`cover_media_id === media[0].id`、`screenshots.status === 'captured'` 且 reason 含 `nav-timeout` |
| 8 | 双端失败降级 | 打桩使两端均失败 | ✅ `media: []`、`cover_media_id: null`、`screenshots.status === 'failed'`、请求仍 **200**、`name` 与 `brand_strategy` 完整 |
| 9 | 无浏览器环境 | 注入"探测不到任何浏览器" | ✅ `screenshots.status === 'skipped'`、`reason === 'no-browser'`、无 spawn、无异常、请求 200 |
| 10 | 实体商品不触发 | 解析一个实体商品链接 | ✅ 结果**不含** `media` / `cover_media_id` / `screenshots` 三键；未启动浏览器 |
| 11 | 预算熔断 | 打桩使浏览器永不返回 | ✅ 在 25 秒预算内（测试注入 200ms）返回 L2 降级，原因码 `budget-exceeded`，无未处理的 Promise 拒绝 |
| 12 | 进程与临时目录清理 | 用例 1 / 8 / 11 结束后检查 | ✅ 无残留 Chrome 子进程；临时用户目录已删除 |
| 13 | 拒绝内网地址 | 链接指向 `127.0.0.1` / `10.x` / `169.254.x` | ✅ 截图链路以 `unsafe-url` 跳过；不发起任何外部连接 |
| 14 | 前端回填媒体 | 表单已有 1 个用户文件，导入返回双端截图 | ✅ 媒体总数 3；导入的两条追加在尾部；用户文件未被移除 |
| 15 | 前端默认主封面 | 表单当前 `coverId` 为 `null`，导入带 `cover_media_id` | ✅ `coverId` 被置为导入值，且该值存在于合并后的列表 |
| 16 | 不覆盖用户封面 | 用户已手动选定封面 A，导入带 `cover_media_id` = B | ✅ `coverId` 仍为 A，不被导入篡改 |
| 17 | 前端空载荷无副作用 | `applyImportedData({ name: '只改名字' })` | ✅ `media` 与 `coverId` 保持原值 |
| 18 | 封面可见 | 列表渲染后观察 | ✅ 被勾选为主封面的行有可辨识的选中态（非仅按钮文案不变） |
| 19 | 链接导入端到端 | 真实运行 `POST /omnimux/products/import-from-link` | ✅ 200；随后 `POST /omnimux/products` 携带返回的 `media` 建品成功；GET 回读时 `cover_media_id` 命中电脑端截图 |

## 6. 验证命令

```bash
# 插件单测（含上表服务端与契约用例，以及 tests/e2e 的端到端用例）
pnpm --config.verify-deps-before-run=false --filter omnimux-products test

# 真实宿主双端截图探活（产出 PNG 证据到 tmp/）
node scripts/verify-site-screenshots.mjs

# UI 规范静态门禁
node scripts/scan-ui-gates.mjs
```

### 6.1 已落地的自动化覆盖

| 用例 | 覆盖点 | 位置 |
|---|---|---|
| 6, 9, 11, 13 | 并发性、无浏览器、预算熔断、SSRF 拒绝 | `plugins/omnimux-products/src/site-shots.test.js` |
| 3, 5, 10, 14, 17 | 路径、权限、原子写、回滚、媒体 id、三键形状 | `plugins/omnimux-products/src/site-shots-store.test.js`、`src/link-importer.test.js` |
| 1, 4, 7, 8, 12, 18 | 双端顺序、落盘前缀、单端/双端降级、清理、封面可见态 | `plugins/omnimux-products/src/screenshot-contract.test.js`、`tests/e2e/website-screenshots.spec.js` |
| 15, 16 | 封面择一采用、用户选择不被篡改 | `plugins/omnimux-products/src/client/url-import-bar.test.js` |
| 全表 19 条 | 契约常量与命名真源 | `plugins/omnimux-products/src/screenshot-contract.test.js` |

### 6.2 真实宿主探活结果（2026-09-14，Node v25.8.0 / Chrome 152.0.7977.83）

```
[verify] browser: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
[verify] capturing https://example.com/
[verify] status=captured reason=null elapsed=3203ms
[verify]   desktop: ok=true 1440x900 bytes=18485 reason=null
[verify]   mobile:  ok=true 390x844  bytes=37357 reason=null
[verify]   wrote site-example-com-desktop-20260914T033053Z-6fdb.png 1440x900 mode=600
[verify]   wrote site-example-com-mobile-20260914T033053Z-cfe3.png  780x1688 mode=600
[verify] verdict: PASS
```

两张 PNG 的位图几何（`pngjs` 解码）与 §2.1 表格逐位一致；目录 `0o700`、文件 `0o600` 实测成立。证据落盘于 `tmp/site-screenshots-evidence/`。

## 7. 边界

- **总是**：截图链路全程可注入替身（浏览器路径探测、进程启动、CDP 传输三层各自可打桩），单测**绝不**启动真实浏览器、**绝不**访问真实网络或用户凭据。
- **总是**：保留 25 秒预算上限、五级降级语义与原因码枚举；任何优化都不得把截图失败变成请求失败。
- **总是**：落盘后立即以 `fs.chmod` 显式设权限，不依赖 umask。
- **先问**：调整视口尺寸或 `deviceScaleFactor`；改动 `media` 的返回顺序；更换主封面默认策略（改"择一采用"为"强制采用"）；把截图链路默认开启到实体商品。
- **绝不**：把浏览器二进制、用户日常 Chrome 配置目录或任何凭据打包进插件；绝不在测试中放宽断言以适应实现；绝不为了"截图先跑通"而绕过 SSRF 守卫。

## 8. 残留风险（不在本次范围）

1. **首次冷启动开销**：无浏览器的宿主首帧探测约数百毫秒；本机实测已装 Chrome 152，探测为文件系统检查，开销可忽略。
2. **动态站点首屏不完整**：懒加载／骨架屏站点在 600ms 静默窗后可能仍非最终视觉；本次不引入滚动或更长的等待策略。
3. **截图不进入品牌战略推理**：截图仅作为媒体资产，不参与模型上下文，因此不影响战略质量，也不受模型通道降级影响。
4. **并发导入的资源竞争**：多个导入同时触发会各起一个浏览器实例；本次不做浏览器实例池化，靠 25 秒预算与进程清理兜底。
