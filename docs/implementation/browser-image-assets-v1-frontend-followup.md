---
title: "V1 前端接续补齐报告（job32 续作）"
id: "implementation-browser-image-assets-v1-frontend-followup"
type: "log"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# V1 #3052 前端接续补齐报告 · job32 失败续作

实施者：前端开发工程师 · 裴像素。日期：2026-10-03。
工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets`；分支 `agent/cross-browser-image-assets-issue-3051`；基线 `d95764912e36da01d879ab65d6340469b48a4625`。

性质声明：上轮 job32 内容生成失败、无输出，本报告**接续其已落盘的工作树改动而非重写**；不声称上轮已完整交付，不挪用未产生的证据。已读四件套（PRD/Prototype/UI-Spec/Plan）、`specs/browser-image-assets.spec.md`、wire 合同、上一 frontend-report 与 QA 首报/第二轮。

## 1. 范围与门禁

- 只写 `extension/src/` 与已授权的 `tests/image-assets-capsule-v1.spec.ts`、`tests/image-assets-background-v1.spec.ts`。未碰 Host `src/`、assets、根配置、既有基线测试断言；未 git add/commit/push/merge、未物化、未开浏览器空间（主理人 133 使用中）。
- 已按四件套确认 UI-Spec §2/§3 文案字典未动；本轮无新增可见 UI 元素，无 V2 角标。

## 2. job32 已覆盖项（保留未倒退）

接续盘点确认以下已由 job32 实现且有测试背书，本轮未倒退：

- 配对批准 URL+token 原子持久化：`index.ts` pairing 分支写 `{bridgeUrl: ws://127.0.0.1:<approved-port>/ext/bridge, token}` 后 `startBridge()`（spec `pairing target binding` 用例覆盖）。
- 切目标/换 socket 时 `caps = null`（`startBridge` onStateChange），旧 cap 不得授权新代次；`pendingImageAssetSaves` 断连即全量 `save-unconfirmed`，无重投、无灵感/多端口兜底。
- overlay 媒体渲染代次 `mediaGeneration`：A→B→A 旧回执不点亮新渲染（spec 已有用例）；同媒体会话 `saved` 再按不发第二请求；图片 busy 仅锁第一槽，copy/attach 可用；busy 主动锚定显示；`isAssetSaveReceipt`/`mapAssetSaveOutcome` 均为 `Number.isSafeInteger(lrev) && lrev >= 0`。

## 3. 本轮缺陷与红绿证据（逐项）

### D1 · 冷启动 settings 竞争：配对地址+token 可能被 `loadSettings` 覆盖（原子绑定缺口）

- 现象：`persistSettings` 直接合到 `settings` 内存对象；`loadSettings` 异步完成时无条件 `settings = loaded`，把刚写入的 `{approvedUrl, token}` 打回默认空值——后续任何 `startBridge()` 用空 token 握手，批准目标名存实亡。
- RED：`.tmp/f10-red-bg.log`（`keeps the approved token ... cold`）+ `.tmp/g4-cold-redcheck.log`（摘除修复后复跑确认红，exit 1）。
- GREEN：`.tmp/g3-cold.log`（exit 0）、`.tmp/g5-green-bg.log` 22/22（exit 0）。
- 修复：`persistSettings` 先 `await settingsReady` 再合并（`index.ts`），保证写永远落在已加载设置之上；不重做存储协议。

### D2 · 当前 hello 代次 localTarget 原子绑定

- 现象：`DSH_MEDIA_TO_ASSETS` handler 捕获的是 `bridge.connected` 布尔 + 全局 `caps`，relay 只认"此刻连着"——写请求与完成 hello 的具体 socket/目标之间没有绑定；reconnect 换目标后旧代次请求可能骑上新 socket。
- RED：`.tmp/f10-red-bg.log` 中 `hello generation target binding` 两项（旧 `SaveImageTarget` 形状即拒绝，exit 1）。
- GREEN：`.tmp/g5-green-bg.log` 22/22（exit 0）。
- 修复：
  - `bridge.ts`：新增 `helloGeneration`/`localTarget`——`hello.ok` 仅当 `this.generation === generation && this.ws === socket` 时递增；`start()` 重设 helloCount；`localTarget` 只在活着的认证 socket 下返回 `{generation,url}`。
  - `save-image-assets.ts`：`SaveImageTarget` 改为 `localTarget{generation,url,caps}` + `currentHelloGeneration()`；代次不符→`host-unavailable`，绝不重投（无发送=未送达语义）。
  - `index.ts` handler 捕获 `bridge.localTarget`（而非布尔+caps）传入 relay。
- 集成佐证（不新增缺陷断言，复用 job32 既有用例）：socket 死亡后重连新 hello 代次，新 socket 上 `omnimux.saveImageAsset` 发送次数为 0。

### D3 · unknown 第一槽四渠道一致（title/aria/tooltip 同 typeUnknown）

- 现象（QA 首报前端待冻源项）：`saveIntent === 'unknown'` 时 capsule `labelFor` 回落 `hints.action`=`加入灵感库`/`Add to library`，`title` 仅在 `image-asset` 时盖章——aria 承诺灵感写入、tooltip 说 typeUnknown，四渠道不一致。
- RED：`.tmp/f11-red-capsule.log` 3 项（zh aria=`加入灵感库`、en=`Add to library`、title 缺失，exit 1）。
- GREEN：`.tmp/g6-green-capsule.log` 36/36（exit 0）。
- 修复：`capsule.ts` `labelFor` unknown→`hints.image.typeUnknown`；title 盖章条件扩为 `image-asset || unknown`。tooltip 侧 `resolveHint` 已正确，无需动。

## 4. 真实命令与退出码（全部直接 node，无 pnpm）

| 命令 | 结果 | 日志 |
|---|---|---|
| `vitest run tests/image-assets-background-v1.spec.ts` | exit 0 · 22/22 | `.tmp/g5-green-bg.log` |
| `vitest run tests/image-assets-capsule-v1.spec.ts` | exit 0 · 36/36 | `.tmp/g6-green-capsule.log` |
| 相关回归 38 文件（media-* / background-* / bridge） | exit 0 · 604 pass + 1 expected fail | `.tmp/g8-media-bg.log` |
| `vitest run`（extension 全量） | exit 0 · 124 文件 / 1357 pass + 1 expected fail | `.tmp/g9-ext-all.log` |
| `tsc -p tsconfig.json --noEmit` | **exit 2 · FAIL**（23 项全为基线预存错误：App.tsx、ModelSelector、chat-bubble-ui-polish、fixtures、media-hover-video-visibility、tiktok-conflict、tool-activity-card、overlay.ts:594/598/737、twitter-copilot；本改动文件零错误，diff 后仅剩基线集合） | `.tmp/g11-tsc.log` |
| `node scripts/build.mjs`（Chrome） | exit 0 · ✓ built | `.tmp/g12-build-chrome.log` |
| `node scripts/build.mjs --firefox` | exit 0 · ✓ built | `.tmp/g13-build-firefox.log` |
| `node scripts/verify-plugin-boundaries.mjs` | exit 0 · 3882 文件 | `.tmp/g14-boundaries.log` |
| `git diff --check` | exit 0 | `.tmp/g15-diffcheck.log` |

**整体不记 PASS**：基线 tsc 即 FAIL（exit 2），本轮只保证本改动文件无新增错误；不声称类型全绿。

## 5. worker wiring 实测边界

本轮 worker 侧测试经 `tests/image-assets-background-v1.spec.ts` 的 FakeWebSocket/事件桩**真实驱动** `background/index.ts` 消息路由 + 真实 `BridgeClient` 重连循环 + 真实 `createRpc` 关联：消息→localTarget 捕获→generation 校验→rpc 帧→rpc.result→sendResponse 全链在 worker 代码上执行（22 用例）。未替身 `BridgeClient`/`createRpc`/`saveImageAssetRpc` 内部逻辑。

未实测：真实 Chrome/Firefox service worker + 真实宿主 WebSocket 的完整闭环、SW 回收期间在飞保存、配对页真机交互。这些保留给主理人 #47 浏览器空间与 PM_SIGN_OFF 前终验，本报告不冒充已通过。

## 6. UI-Spec 终验自查

- unknown：title/aria/tooltip 三渠道统一 `无法确认素材类型，请刷新后重试` / `Media type could not be confirmed. Refresh and try again.`；点击不发起任何写入（无 TO_ASSETS/TO_INSPIRATION 消息）。图标仍为基线 bulb，未换资产图形。
- idle/busy/done/五失败与 unconfirmed 字典逐字未动；busy 仅第一槽；saved 重复按不发请求；旧回执不串新媒体——均有既有用例持续绿。
- 无第四动作、无徽章/副标题/装饰图标/Emoji。
- **FRONTEND_SELF_CHECK: PASS**（仅限本轮补齐面：代次绑定 + unknown 四渠道 + 配对原子持久化）。
