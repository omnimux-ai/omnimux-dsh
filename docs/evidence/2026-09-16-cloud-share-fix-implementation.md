# 实现证据：云端作品分享创建链接静默失败修复（Issue #2075）

## 一、改了什么

### 1. `plugins/omnimux-inspiration/src/client/api.js`

- 新增导出纯函数 **`publishableMediaAddress(raw)`**：把媒体地址换成发布通道接受的那一种形态。
  - `/omnimux/inspiration/media/<sub>` → `/api/inspiration/v1/public/media/<sub>`（本机媒体代理路径 → 云端可发布路径）；
  - 已是 `/api/inspiration/v1/public/media/…` 前缀 → 原样保留；
  - 绝对 `http(s)` 地址 → 原样保留（是否被接受仍由中枢的闸门决定，客户端不越权判断）；
  - 空值 / 非字符串 / 含 `..` → `''`（调用方据此丢弃，而不是发布一个被拼坏的地址）。
- **`shareRequestPayload(row)`** 改为读取目录真源字段：`cover_key` / `coverKey` / `coverUrl` / `cover_url`，
  以及 `media_keys` / `mediaKeys` / `mediaUrls` / `media_urls`；读取后统一经 `publishableMediaAddress` 规范化。
  `mediaUrls` 逐个规范化并过滤空值。
- 未改动：`caption`（仍取 `caption ?? content`）、`type` / `title` / `category` / `embedUrl` / `sourceUrl`，
  以及「本地行必须返回 `undefined`」这条契约。

### 2. `plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx`

- 新增 `itemKey`（`item?.id` 的文本形式），弹窗复位副作用由 `[item?.id]` 改为 `[itemKey]`。
- 语义保持不变：真正切换到另一条 id 的记录时，仍然关闭分享浮层并清空错误。

## 二、逐条对照验收标准

| AC | 实现要点 | 证据 |
| --- | --- | --- |
| AC-1 字段真源对齐 | `shareRequestPayload` 现读取 `cover_key` / `media_keys` 及全部兼容形态 | 单测「reads the catalogue's own key spelling and hands the cloud its publishable form」「reads the mediaKeys camelCase spelling too」 |
| AC-2 地址形态规范化 | `publishableMediaAddress` 三种分支 + 拒绝 `..` | 单测「leaves an address that is already publishable, or absolute, exactly as it is」「refuses a traversal segment…」 |
| AC-3 浮层不误关闭 | 复位依赖改为 `itemKey` 文本身份 | 单测「keeps the popover open when the same entry answers its id as a string」+「still resets the popover when the user opens a different entry」 |
| AC-4 失败可读 | 浮层保留 → 既有 `setShareError` 路径得以呈现 | 真实浏览器断言「refusal-reason-is-shown-in-the-popover」「button-offers-a-retry」 |
| AC-5 本地链路零回归 | 未改本地分支；本地仍四步进度、地址仍为上传后云端地址 | E2E「AC4 本地条目分享链路不受影响」全绿 |
| AC-6 真实浏览器验证 | 工作树内 ego-browser 真机 15 项断言全通过 | `docs/evidence/inspiration-cloud-share-fix-verified.json` + `.png` |

## 三、验证命令与真实结果

| 命令 | 结果 |
| --- | --- |
| `node --test plugins/omnimux-inspiration/src/client/api.test.js` | **31 passed / 0 failed** |
| `node --test plugins/omnimux-inspiration/src/client/inspiration-share-modal.test.js` | **9 passed / 0 failed** |
| `corepack pnpm --filter omnimux-inspiration test` | **829 tests, 827 pass, 0 fail, 2 skipped** |
| `node --test tests/e2e/inspiration-cloud-share.e2e.test.mjs` | **7 passed / 0 failed**（含新增「发布的云端作品带着目录真源地址，并能被中枢接受」） |
| 4 个灵感相关 E2E 套件合并运行 | **19 passed / 0 failed** |
| `corepack pnpm check:boundaries` | ✅ 3326 个源文件边界校验通过 |
| `node tmp/verify-cloud-share-fix.mjs`（工作树内 ego-browser 真实 Chromium） | **15/15 断言通过**，任务空间已关闭 |
| `git diff --check` | 无空白问题 |

### 负向校验（证明新测试真的有判别力）

把复位依赖临时改回 `[item?.id]` 后重跑组件测试：

```
✖ keeps the popover open when the same entry answers its id as a string
✔ still resets the popover when the user opens a different entry
tests 9 / pass 8 / fail 1
```

即：旧实现下该用例**必定失败**，修复后通过；同时「换记录才复位」的用例在两种实现下都通过，
说明新依赖没有削弱既有语义。

### 与主干的失败对比

`corepack pnpm --filter omnimux test` 在主干上本就有约 13 项存量失败（`references.test.js` 等，与本改动无关）。
本次未运行该套件（改动只涉及 `omnimux-inspiration` 的客户端文件，未触及 `plugins/omnimux` 源码），
故不存在新增失败的可能；结论依据是：本次改动的全部文件都在 `plugins/omnimux-inspiration/` 与 `tests/e2e/` 内，
`plugins/omnimux/` 零改动。

## 四、真实浏览器验证覆盖的场景

在任务独立工作树内、以动态端口启动真实 Chromium（ego-browser），加载由工作树真实源码打包的
真实预览弹窗 + 真实样式表 + 真实中文文案，Host 侧以桩模拟实机观察到的真实行为
（目录行 id 为数字 `2789`、携带 `cover_key`/`media_keys`；POST 返回 202 且行 id 变为字符串 `"2789"`；
轮询返回失败并带真实中文原因），断言：

1. 点击「分享」浮层打开、出现「创建链接」；
2. 点击创建后，交给 Host 的载荷中 `coverUrl` 与两条 `mediaUrls` 均为云端可发布前缀，
   且载荷中不再出现本机代理前缀 `/omnimux/inspiration/media/`；
3. 载荷仍携带原文案；
4. 浮层在 16 次采样（4 秒）内**从未关闭**；
5. 浮层内出现真实中文失败原因，按钮变为「重新创建链接」；
6. 不伪造任何链接；Host 被真实询问过。

## 五、遗留与不确定项

1. 本工作树内的浏览器验证使用的是**受控桩**，不是真实云端网关；真实网关的最终发布结果
   仍需在开发版实机上由人工复核（该复核按仓库规范由人工执行，不是 Agent 交付前提）。
2. 本次只修复了「目录行字段名」与「浮层误关闭」两处。诊断证据中记录的另一现象——
   云端目录行的 `cover_key` 指向本机媒体代理路径、而真实云端地址需要前缀改写——已在本修复中处理；
   但**下游音频/视频类云端条目若其 `media_keys` 为空**，仍会走 AC-4 的可读失败路径（这是设计意图，不是缺陷）。
3. 未改动中枢 `resolveCloudMediaUrl` 的安全闸门；因此一个既不是云端前缀、也不是绝对 https 的相对裸键
   仍会被中枢拒绝——保持既有的越权防线。
