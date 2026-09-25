# 公共资产卡片「保存到本地」· 实现契约与任务分解

| 项 | 值 |
| --- | --- |
| Issue | #2663 |
| 工作树 | `.worktrees/assets-cloud-card-save` |
| 分支 / base | `agent/assets-cloud-card-save-issue-2663` ← `origin/main` @ `fcc4ef3c5` |
| 作者 | 架构师 高见远 |
| 状态 | **终局契约**（下游按此实现，本文不提供备选方案） |
| 边界 | 本文只定义数据流、状态归属、并发语义、测试契约与改动拓扑。**文案措辞与图标造型由产品经理（许清楚）的 UI/文案 Spec 决定**，本文以「PM 供给槽位」形式引用，不预设字符串与图形 |

用户原始需求：

> 所有公共资产 卡片在鼠标悬停的卡片的时候 卡片右上角会有加入会话的按钮，在这个按钮左侧新增按钮图标：保存到本地，点击后将自动下载保存到本地资产库对应分类下。

---

## 0. 结论摘要

| 议题 | 终局结论 |
| --- | --- |
| 控制器注入路径 | **stage 单例经 props 逐层注入**；`CloudAssetCard` 不持有控制器，只吃 `saved`/`saving`/`onSave` 三个 props |
| 改动拓扑 | 生产改动落在 7 个文件；`AssetsBody` 已持有 `cloudSave`，注入路径只差 `AssetsStage.jsx:287` 一行 |
| 并发模型 | **按 asset id 单飞**（`savingIds: Set`）取代现有全局布尔 `inFlightRef`；删除「不同卡片在途时静默丢弃」 |
| 分类归位 | **NO-BACKEND-CHANGE**（`typeForCategory` 全覆盖且是唯一合法落点；实测证据见 §5） |
| 保存成功语义 | **REQUIRES-BACKEND-CHANGE**（3 处 `stageRemote` 静默 `return null` → 落成「200 + 零文件」的空资产，违反 `docs/contracts/product-baseline.md` §3.6，且使「失败路径可见反馈」不可实现，见 §2.3 / §5.4） |
| 幂等 | 二次点击幂等：同会话由 `savedIds` 短路；跨会话由 Host 的 `source: cloud:<id>` 复用兜底——**为此客户端必须停发 `name`**（当前恒发，实测会造出 `Bedroom (2)` 重复条目，见 §3.3） |
| 必须改写的既有断言 | **8 处（4 个文件）**，逐条见 §6.1（含 PM Spec 复核新增的 3 处）；另有 2 处断言**保持不变**并给出理由 |
| 与 PM Spec 的关系 | 本文件是数据流 / 状态归属 / 并发 / 测试契约 / 改动拓扑的唯一真源；`specs/asset-card-save-to-local.spec.md`（许清楚）是 UI 元素与逐字文案的唯一真源。两者**已对齐**：图标、类名、字典键、状态表达、控件次序全部采纳 PM 结论（详见 §4.5 / §6.1）。**唯二分歧已在本文件裁决并升级**：PM §8.1 的「禁止改动」清单含 `cloud-save.js` / `cloud-catalog.js` / `http-routes.js`，而本文件判定必须改（§3.3、§5.4、§8-R12）——依据是 PM 自己写的两条验收项在该清单下**必然不通过** |

---

## 1. 保存能力的注入路径（唯一结论）

### 结论

**stage 单例经 props 逐层注入。**`useCloudSave` 继续只存在于 `AssetsStage.jsx:399` 一处；`CloudAssetsView` / `CloudCategoryRow` 接收「读面 + 回调」，`CloudAssetCard` 只接收三个叶子 props（`saved` / `saving` / `onSave`）。**禁止**卡片或视图自持 `useCloudSave`。

### 理由

**（1）`savedIds` 的共享半径决定了控制器的作用域。**

`savedIds` 必须同时被三个表面读到：分类网格卡片、「全部」行布局卡片、预览弹窗页脚。而 `CloudAssetsView` 随页签挂载/卸载——`AssetsStage.jsx:284-285` 明确注释「leaving it unmounts the feed, which is what stops an in-flight audition and releases its audio」。控制器若建在视图内，切一次页签就丢一次 `savedIds`，而弹窗（由 `AssetsStage` 持有）保留自己的那份，两者会对同一行给出矛盾结论。唯一同时覆盖卡片与弹窗的存活域就是 `AssetsStage`——这已是现状（`AssetsStage.jsx:399`），无需搬迁。

**（2）每卡片一个控制器的代价是状态割裂，不只是渲染开销。**

`CloudAssetCard` 的实例数等于网格里的卡片数：骨架期是 `pageSizeFor(gridColumns)`，此后每越过一次底部 sentinel 涨一页（`CloudAssetsView.jsx:542-556`），滚动数百张是常态。若每卡片一个 `useCloudSave`：

- 每卡片 3 个 `useState` + 2 个 `useRef` + 3 个 `useEffect`（`useCloudSave` 现有实现：`savedIds`/`savingId`/`notice` 三态、`savedRef`/`inFlightRef` 两 ref、两 effect，外加通知条 2.4 s 定时器）；
- 更致命的是 **N 份互不可见的 `savedIds` 与 N 个互不相让的 `inFlightRef`**：从弹窗保存过的行，卡片不知道；A 卡片在途时 B 卡片点击会被 B 自己的 `inFlightRef` 放过，却在对 Host 的并发写入上与 A 竞争；
- `AssetsStage.jsx:551` 的通知条是**单条全局**的，N 个控制器会有 N 个写者。

**（3）注入成本为零——接缝是现成的。**

`AssetsBody`（`AssetsStage.jsx:255`）**已经**在解构 `cloudSave`（第 256 行），而它正是渲染 `<CloudAssetsView>`（第 287 行）的那个函数；`AssetsStage.jsx:559` 早已把 `cloudSave` 传给它。也就是说从 stage 到视图的管道**今天就已经铺好**，只是末端的 `<CloudAssetsView>` 没有消费它。这是本次改动爆炸半径意外地小的唯一原因，也是不应另起炉灶的理由。

### 被否决的形态（记录理由，防止回退）

| 形态 | 否决理由 |
| --- | --- |
| 卡片自持 `useCloudSave` | 状态割裂（§1.2）+ 每卡片 8 个 hook 槽位；且弹窗与卡片必然对同一行给出矛盾结论 |
| 视图内建一个控制器再注入卡片 | 随页签卸载丢 `savedIds`（§1.1），弹窗与卡片失联 |
| 全局模块单例（绕过 React） | 无法触发重渲染；`notice` 的 2.4 s 自清与 `savedIds` 的 UI 反馈都失效 |
| 每卡片一个 `useCloudSave` + 用 `memo` 压开销 | 只压渲染，不解决状态割裂；且 `CloudAssetCard` 目前未包 `memo`，引入会牵动全部既有卡片的 props 稳定性 |

---

## 2. 完整数据流图

### 2.1 成功路径

```
[用户在卡片右上角控件簇内点击「保存到本地」]
  ↓  CloudAssetCard.handleSave(event)
     · event.stopPropagation()        ← 必须，否则冒泡触发根节点 onClick={openPreview} 打开预览弹窗
     · onSave?.(asset)                ← asset 即该卡片的 catalog 行 {id, name, category, ...}
  ↓  CloudAssetsView 经 props 收到 onSave（= AssetsStage 的 cloudSave.save）
  ↓  useCloudSave.save(asset)                                   use-cloud-save.js:38
     · flight.admit(id) → 'accept' | 'invalid' | 'in-flight' | 'saved'   （见 §4.2 新增纯模块）
     · setSavingIds(flight.savingIds 的快照)；setNotice('')
  ↓  saveCloudAssetToLocal(asset)                               cloud-save.js:21
     · id = String(asset?.id ?? '')；空 → { ok:false, error:'no-asset' }（不发请求）
     · request = io.request || cloudSaveToLocal
  ↓  cloudSaveToLocal(id)                                       client/api.js:270
     · assetsRequest('/omnimux/assets/cloud/save', { method:'POST', body:{ id } })
       —— 注意：**不再带 name**，见 §3.3
  ↓  [HTTP] POST /omnimux/assets/cloud/save
  ↓  cloudSaveRoute(req)                                        http-routes.js:327
     · cloud 缺失 → AssetsError('catalog-unavailable') → 503
     · library 缺失 → AssetsError('catalog-unavailable') → 503
     · jsonBodyProblem(req) → 400 invalid-json
  ↓  cloud.saveToLocal(id)                                      cloud-catalog.js:362
     · getRow(id) 未命中 → AssetsError('catalog-not-found') → 404
     · baseName = options.name?.trim() || row.name
     · 【去重】!options.name → library.list().find(source === `cloud:${row.id}`) 命中即直接返回既有资产（不下载）
     · 【重名】while (library.get(targetName)) targetName = `${baseName} (${n++})`
     · 封面：resolveResource(row.cover_url, row.meta.source_cover_url)
              local（resolveLocal 已验存在）→ 直接引用；remote → stageRemote → cloud-catalog/.staging
     · 主媒体：同封面，且与封面同源时跳过
     · library.add({ name, type: options.type || typeForCategory(row.category), description, tags, files,
                     source: `cloud:${row.id}` })            cloud-catalog.js:424-431
              → materializeIncomingFiles → 复制入 vault
     · finally { cloud.clearStaging() }                       http-routes.js:334
  ↓  200 { asset, lrev: library.revision() }
  ↓  saveCloudAssetToLocal 成功分支 → notifyAssetsChanged(io)  cloud-save.js:36
     · window.dispatchEvent(AssetsChangedEvent)
  ↓  useCloudSave：flight.settle(id, true) → setSavedIds / setSavingIds → setNotice(t('cloud.save.notice').replace('{name}', …))
  ↓  [本地 feed 刷新] use-assets-feed.js
     · subscribeAssetsChanged({ handler: refreshNow }) → refreshNow（REFRESH_GUARD_MS = 250 去抖）
     · 另一路 hubEvents.subscribe('*') 亦驱动 refreshNow，同一去抖窗内只刷一次
  ↓  [本地资产库] 新条目出现在 typeForCategory 决定的分类下
```

Host 侧的第三条入口同样走同一个 `saveToLocal`：Agent 工具 `assets_cloud_save`（`index.js:159`，docstring 见 `index.js:17`）→ `cloud.saveToLocal(id, { name, type })`（`index.js:177`）→ emit `omnimux:assets:changed`。本文的改动不得破坏它（见 §6.1 D 组）。

### 2.2 失败分支（逐条给出可见性）

| 触发点 | 现状行为 | 卡片可见反馈 | 判定 |
| --- | --- | --- | --- |
| `id === ''` | 不发请求，`return { ok:false, error:'no-asset' }` | 卡片根本无 id，不会出现 | 保留 |
| 同 id 已在途（`admit → 'in-flight'`） | 不重发 | 该卡 `saving` 态（`disabled` + `aria-busy="true"` + 原生 spinner）已解释「正在保存」 | **允许静默**（可见状态即解释） |
| 同 id 已保存（`admit → 'saved'`） | 不重发 | 该卡 `saved` 态（`disabled` + 「已保存」可访问名 + 勾） | **允许静默**（同上） |
| Host 503 `catalog-unavailable` | `{ ok:false, status:503, error:'cloud catalog is not mounted' }` | 通知条 `t('error.saveFailed')` | 保留（文案见下） |
| Host 404 `catalog-not-found` | 同上 `error:'cloud asset not found'` | 通知条 `t('error.saveFailed')` | 保留 |
| Host 413 `file-too-large` | `AssetsError` 直抛（`cloud-catalog.js:447/451`），映射 413 | 通知条 `t('error.saveFailed')` | 保留 |
| Host 400 `type-invalid` | `normalizeType` 抛（`library.js:60`），映射 400 | 通知条 `t('error.saveFailed')` | 保留（正常不可达，见 §5） |
| Host 500 无 message / `save-failed` | `error` 回落到 `'save-failed'` | 通知条 `t('error.saveFailed')` | 保留 |
| fetch 抛异常（离线/中断） | `catch` 分支 | 通知条 `t('error.saveFailed')` | 保留 |
| **远端 HTTP 非 2xx（404/403/500…）** | **后端 `stageRemote:444` `return null` → 静默丢弃该文件 → 仍 `library.add` → 返回 200** | **无任何反馈，卡片翻到「已保存」** | **必须修（§5.4）** |
| **远端网络故障 / 超时 abort** | **后端 `stageRemote:458-459` 吞掉非 AssetsError → 同上返回 200** | 同上 | **必须修（§5.4）** |
| 环境无 fetch 实现（`stageRemote:437`） | `return null` → 同上 | 同上 | **必须修（§5.4）** |

**失败文案的单一出口（采纳 PM Spec §5.6，本文件锁定为实现约束）**：上表每一行的**用户可见文案都是 `t('error.saveFailed')`**，除此以外没有任何分支把宿主 `message`、错误码或异常文本写进 DOM。`saveCloudAssetToLocal` 返回的 `error` 字符串因此**降级为诊断信息**——只允许进控制台/开发日志。这条把「失败反馈」收窄成一个可断言的形状：**可见即 `error.saveFailed`，不是它就不是失败反馈**。

> 该约束同时解释了为什么 §5.4 的后端修复是必需的：`error.saveFailed` 只在 Host 真的回了非 2xx 时才有机会出现。远端取用失败今天是 200，于是最常见的失败**永远不会**触发这条文案。

### 2.3 为什么 §2.2 的最后三行是本次的必改项

新用户机器的实况（实测，见 §5.2）：`plugins/omnimux-assets/cloud-catalog/` **零媒体字节**（`find … -not -name "*.json" | wc -l` = 0），`manifest.json` 的 `sourceRoot` 为 `""`。`resolveLocal` 在 `sourceRoot === ''` 时返回 `''`（`cloud-catalog.js:187`），于是每一条 `file:` 定位符都解析失败，`resolveResource` 必然落到 `meta.source_*_url`——而它们在 6411 行里有 5040 / 5554 行是 `http`。

**结论：对全新用户，远端下载不是兜底路径，而是唯一路径。** 而这条路径上的 HTTP 失败与网络失败**全部静默化为“保存成功、零文件”**。实测（`/tmp/saveprobe/probe2.mjs`，注入 `fetchImpl`）：

```
=== 1. fetch 正常（200） ===            → files=1   ✓
=== 2. 远端返回 HTTP 404 ===            → RESOLVED 返回: files=0   ✗ 无错误
=== 3. 远端网络故障 / 超时 abort ===    → RESOLVED 返回: files=0   ✗ 无错误
=== 4. 远端体积超限 ===                 → THROW file-too-large       ✓ 已可见
=== 5. 描述型行（本就无媒体）===        → RESOLVED 返回: files=0   ✓ 合法
```

这三行直接违反 `docs/contracts/product-baseline.md` §3 禁止清单第 6 条「失败后静默返回模板或启发式结果而不告知用户」，并且让本 Issue 要求交付的**「失败路径的可见反馈」测试在实现上不可能通过**——最常见的失败根本没有被报告为失败。因此它不是可延后的风险，而是本 Issue 的阻塞项。

---

## 3. 并发与去重契约

### 3.1 现有全局单飞的失败模式（必答项）

`use-cloud-save.js:29` 的 `inFlightRef` 是**单个布尔值**，`save()` 第 40 行的守卫是 `if (id === '' || inFlightRef.current || savedRef.current.has(id)) return false`。

失败模式：A 卡片保存中，用户点击 B 卡片 → `inFlightRef.current` 为真 → **立刻 `return false`，不发请求、不设 `notice`、不改任何可见状态**。B 卡片毫无反应。

**这是不可接受的。** 判据不是「UX 不够好」，而是：在弹窗单入口时代这个分支近乎不可达（同一时刻只有一个月亮按钮），而本 Issue 把入口铺到**每一张卡片**上——一个用户看得见、hover 会亮、点了却什么都不发生的控件就是缺陷，QA 必然立案。用户需求原文是「点击后将自动下载保存到本地资产库对应分类下」，静默丢弃直接违背它。

### 3.2 精确契约

> **C1（按 id 单飞）** 同一 `asset.id` 同时只允许一次在途请求。第二次点击由 `admit()` 判为 `'in-flight'` 并丢弃——**允许静默**，因为该卡此刻处于 `saving` 态（`disabled` + `aria-busy="true"`），用户看得见原因。
>
> **C2（不同 id 互不阻塞）** A 在途时点击 B **必须**发出独立请求。`admit()` 只按 id 判定，不存在任何全局闸门。
>
> **C3（可见状态按 id 集合表达）** `useCloudSave` 返回 `savingIds: Set<string>` 取代 `savingId: string`。卡片 `saving = savingIds.has(asset.id)`；弹窗 `saving = savingIds.has(previewCloudId)`。同一行的两个入口共享同一在途标记——从卡片发起的保存，弹窗也显示进行中（**语义增强**，非兼容妥协）。
>
> **C4（已保存幂等）** 同会话内 `savedIds.has(id)` → 不请求、不通知，卡片渲染 `saved` 态。丢弃由可见状态解释。
>
> **C5（不变量 I1）** `savedIds ∩ savingIds = ∅` 恒成立：`admit()` 对已 saved 的 id 直接返回 `'saved'` 而不入在途集；`settle(id, ok)` 先 `inflight.delete(id)` 再按 `ok` 落 `saved`。由此两态互斥，卡片的 `loading` / `disabled` / 图标 / 标签四者不会出现矛盾组合（不再需要派生的三值状态串，见 §4.5）。
>
> **C6（无全局并发上限）** 不引入队列，也不引入上限拒绝。理由：并发的唯一来源是用户逐张 hover 点击，`MAX_REMOTE_SAVE_BYTES = 536870912`（512 MiB）逐文件封顶，`UnhandledRejection` 与套接字池由 undici 兜住；且引入上限就必须新增一条 PM 尚未编写的拒绝文案，凭空制造跨团队依赖。**触发条件（登记于 §8-R3）**：若实测出现连续 5 张以上并发保存导致内存或体验问题，再引入上限时按「可见拒绝 + 卡片回 idle」实现，不得退回静默丢弃。

### 3.3 二次点击行为契约

| 场景 | 契约 |
| --- | --- |
| 同会话内再次点击同一卡片 | `savedIds` 命中 → 不发请求、不发通知；卡片维持 `saved` 态（按钮 `disabled`） |
| 刷新/切页签后再点同一卡片（`savedIds` 已清空，卡片显示 idle） | 发一次请求；**Host 必须复用**既有 `source === 'cloud:<id>'` 资产：返回 200、库内条目数不变、不重新下载 |
| 从弹窗保存过、再从卡片点 | 同一 `savedIds` / 同一 id 单飞，行为与上两行一致 |

**为让第二行成立，必须修一处客户端缺陷。** 实测（`/tmp/saveprobe/probe.mjs`）：

```
=== B. 同一行二次保存，不带 name（后端去重分支） ===
  library rows before=5 after=5  returned name="Bedroom"  sameId=true          ✓ 复用
=== C. 同一行二次保存，带 name（真实客户端走的路径） ===
  library rows before=5 after=6  returned name="Bedroom (2)"                   ✗ 重复
  rows sourced from this cloud id: 2
```

根因：`cloud-catalog.js:366` 的去重分支带前置条件 `if (!options.name && …)`，而客户端**恒发**行名——`cloud-save.js:25` 是 `request(id, { name: asset?.name })`；卡片路径的 `asset.name` 与弹窗路径的 `item.title`（`cloud-preview.js:51`：`title: String(asset?.name ?? '')`）都恰好等于 `row.name`，因为它们都由 `normalizeCloudAsset` 从同一行拷贝（`cloud-feed-helpers.js:162`）。于是这个「重命名」信号永远为真，去重永远不触发，走 `369-373` 的重名循环造出 `Bedroom (2)` 并**重新下载一次远端媒体**。该缺陷今天已经存在于弹窗路径，只是被 `savedIds`（会话内 Set）遮住；本 Issue 跨会话暴露面放大后必须一并收口。

**处置（终局）：修客户端，不动 Host 去重策略。**

- 改 `cloud-save.js:25` → `request(id, {})`，客户端不再转发行名。首存结果不变（Host 用 `row.name`），二存走 Host 去重复用。
- 不改 `cloud-catalog.js:366`：`name` 参数对 Agent 工具 `assets_cloud_save` 是**正当的重命名能力**（`index.js` 的 tool schema 暴露 `name`，Agent 可传一个真正不同的名字来刻意建一份副本）。「显式重命名 ⇒ 另存一份」是 Host 的合法策略，UI 两条路径只是**误用**了它。因此修在被误用的一侧。
- `type` 同理停发（客户端从未发过），分类一律由 `typeForCategory` 决定；本 Issue 不引入显式分类覆盖。

### 3.4 `notice` 单条全局通知的多张卡行为契约

> **C7（last-writer-wins，不排队）** `notice` 保持单条字符串、`CLOUD_NOTICE_MS = 2400` 后自清、每次 `save()` 起始先清空。连续保存多张卡时**允许后一条覆盖前一条**。
>
> **C8（成功的主反馈是卡片持久态，不是通知条）** 用户「如何知道前面那张成功了」的答案是：**那张卡片仍停留在 `saved` 态**。`savedIds` 是 stage 作用域的持久状态（跨卡片、跨弹窗、跨分类筛选保持），通知条只是瞬时点缀、best-effort。
>
> **C9（失败必可见，且只有一句）** 任何失败分支都必须写 `notice`，且**不得**写入 `savedIds`（失败后该卡回到 idle，这本身就是「它没落地」的持久信号）。**失败文案是唯一的 `t('error.saveFailed')`**，宿主 message / 错误码 / 异常文本只进控制台（PM §5.6，本文件在 §2.2 末段与 §6.1 A4 锁成断言）。因此即使通知条被后续成功覆盖，用户仍能一眼看出哪张卡还是 idle。

排队/堆叠通知（多行、逐条退场）被否决：需要队列结构、逐条定时器与消解规则，为一个 2.4 s 的提示引入的状态机不成比例；而 C8 已经提供了信息不失真的持久通道。PM §7.5 对本节 C7/C8 的结论完全一致（「后一条覆盖前一条，2400ms 计时重新起算」）。

---

## 4. props 契约与改动点

### 4.1 组件 props（精确签名）

```js
/**
 * 分类网格 + 「全部」行布局的公共资产视图。
 * @param {{
 *   t: (key: string) => string,
 *   open?: boolean,                       // 默认 true
 *   onPreview?: (asset: any) => void,
 *   query?: string,                       // 默认 ''
 *   savedIds?: Set<string>,               // 默认 模块级 NO_IDS（空集），只读
 *   savingIds?: Set<string>,              // 默认 模块级 NO_IDS（空集），只读
 *   onSave?: (asset: any) => void,        // 默认 undefined（不传即无保存入口语义）
 * }} props
 */
export function CloudAssetsView(props) { … }

/**
 * 「全部」分类的横向卡片行。
 * @param {{
 *   category: { id: string, zh?: string, en?: string, total?: number },
 *   t: (key: string) => string,
 *   onSelectCategory: (categoryId: string) => void,
 *   onTogglePlay: (asset: any) => void,
 *   onPreview?: (asset: any) => void,
 *   playingId?: string,
 *   refreshKey?: number,                  // 默认 0
 *   savedIds?: Set<string>,               // 默认 模块级 NO_IDS，原样下传
 *   savingIds?: Set<string>,              // 默认 模块级 NO_IDS，原样下传
 *   onSave?: (asset: any) => void,        // 默认 undefined，原样下传
 * }} props
 */
export function CloudCategoryRow(props) { … }

/**
 * 单张公共资产卡片。**不持有控制器**，只呈现状态。
 * @param {{
 *   asset: any,
 *   t: (key: string) => string,
 *   playing: boolean,
 *   onTogglePlay: (asset: any) => void,
 *   onPreview?: (asset: any) => void,
 *   aspect?: string,
 *   saved?: boolean,                      // 默认 false
 *   saving?: boolean,                     // 默认 false
 *   onSave?: (asset: any) => void,        // 默认 undefined
 * }} props
 */
export function CloudAssetCard(props) { … }
```

**命名取舍（终局）**：卡片/视图层用 `onSave`，**不叫 `onSaveToLocal`**。`AssetPreviewModal` 已占用 `onSaveToLocal` 且其载荷是 preview item（`{ sourceAssetId, title, … }`），而这里传的是裸 catalog 行（`{ id, name, … }`）。同一个 `AssetsStage` 里存在两个同名不同载荷的 prop 是纯粹的踩坑面，故此处避开。

**默认值实现**：`savedIds`/`savingIds` 缺省时逐个文件声明 `const NO_IDS = new Set()` 并作为默认值，**不跨文件导出共享**——避免在两个既有互相 import 的文件之间新增标识符（`CloudCategoryRow.jsx` 已从 `CloudAssetsView.jsx` 取 `CloudAssetCard`，属既存循环 import，不在本次扩大它）。

### 4.2 新增文件：`plugins/omnimux-assets/src/client/cloud-save-flight.js`

**为什么必须新增**：本仓库客户端**没有 React 测试渲染器**（`plugins/omnimux-assets/package.json` 的 devDeps 只有 esbuild；测试命令是 `node --test src/*.test.js src/client/*.test.js tests/e2e/*.spec.js`），既有客户端测试全部是「读源码做断言」或「import 纯模块做行为断言」。§6.2 要求的**重复点击不产生第二次请求 / 不同 id 不互相阻塞 / 失败后可重试**这三条是行为契约，留在 hook 里就只能退回源码断言。把飞行策略提成纯模块即可行为化验证——这正是仓库既有的手法：`request-coalescer.js` 就是这样一个从 `api.js` 抽出的纯策略模块，自带 `request-coalescer.test.js`。

```js
/**
 * 保存飞行的纯策略：按 asset id 单飞 + 已保存去重。
 *
 * 与 React 无关，因此可在 node --test 下行为化验证（见 cloud-save-flight.test.js）。
 * `admit` 原子地判并占位，`settle` 原子地释放并按结果落库——
 * 单线程事件循环下无需额外锁，且不变量 savedIds ∩ savingIds = ∅ 由构造保证。
 *
 * @returns {{
 *   savedIds: Set<string>,
 *   savingIds: Set<string>,
 *   admit: (id: string) => 'accept' | 'invalid' | 'in-flight' | 'saved',
 *   settle: (id: string, ok: boolean) => void,
 *   reset: () => void,
 * }}
 */
export function createCloudSaveFlight() { … }
```

- `admit('')` → `'invalid'`；`admit(id)` 已在途 → `'in-flight'`；已保存 → `'saved'`；否则 `savingIds.add(id)` 并返回 `'accept'`。
- `settle(id, ok)` → 先 `savingIds.delete(id)`，`ok === true` 时 `savedIds.add(id)`。
- 无上限、无队列（C6）。

### 4.3 `useCloudSave` 的新返回签名

```js
/**
 * @param {{ t: (key: string) => string }} options
 * @returns {{
 *   savedIds: Set<string>,       // 已落地本地库的 catalog 行 id
 *   savingIds: Set<string>,      // 正在保存中的 catalog 行 id（取代原 savingId: string）
 *   notice: string,              // 单条全局通知，last-writer-wins
 *   save: (asset: any) => Promise<boolean>,
 * }}
 */
```

实现要点：

- `const flightRef = useRef(null); if (flightRef.current === null) flightRef.current = createCloudSaveFlight()`。
- 保留 `savedIds` / `savingIds` 两个 `useState`（初值空 `Set`）作为渲染镜像；每次 `settle` 后用 `new Set(flight.savedIds)` / `new Set(flight.savingIds)` 刷新。
- **可删除**：`savedRef` 及其 `useEffect`（第 28、31 行）——`flight` 已在 ref 里，读到的就是当前值。这是一处净简化。
- `save()` 形状：成功分支是**唯一**写 `ok = true` 的地方；`finally { flight.settle(id, ok); setSavedIds(...); setSavingIds(...) }`。失败分支写 `notice` 后 `return false`（C9）。
- 通知条文案键（**PM Spec §5.1 定名**）：成功 `t('cloud.save.notice')`（由 `modal.save.notice` 改名收敛，卡片与弹窗共用），形态 `setNotice(t('cloud.save.notice').replace('{name}', String(asset?.name ?? '')))`；失败 `setNotice(t('error.saveFailed'))`——**唯一出口，不带插值、不夹带宿主原文**（见 §2.2 末段）。既有 `.replace('{name}', …)` 机制不变，`{name}` 必须保持字面。
- 失败分支的形状随之收窄：`if (!result.ok) { console.error('[assets] cloud save failed', result.error); setNotice(t('error.saveFailed')); return false }`；`catch (caught) { console.error(caught); setNotice(t('error.saveFailed')); return false }`。`result.error` / `caught` 进控制台，**不进 DOM**。`errText` 在本文件不再被使用。

### 4.4 `AssetsStage.jsx` 改动点（含行号）

| 行 | 现状 | 目标 |
| --- | --- | --- |
| 282-283 | 注释「Cards carry no save control — the only route out of a card is into the conversation — so the stage's controller serves the preview modal alone.」 | 改写为新契约：控制器同时服务卡片与弹窗，`savedIds`/`savingIds` 经 `AssetsBody` 下传 |
| **287** | `<CloudAssetsView t={t} open={visible} onPreview={onCloudPreview} query={feed.query} />` | 追加 `savedIds={cloudSave.savedIds} savingIds={cloudSave.savingIds} onSave={cloudSave.save}`（**本 Issue 唯一的一处注入改动**） |
| 399 | `const cloudSave = useCloudSave({ t })` | 不变（仍是全 stage 唯一控制器） |
| 448 | `void cloudSave.save({ id, name: String(item?.title ?? '') })` | 保持调用形态；`name` 不再被转发到请求体（§3.3 改在 `cloud-save.js`），此处可不动 |
| 551 | `{cloudSave.notice !== '' ? <p className="omnimux-assets-cloud-notice">{cloudSave.notice}</p> : null}` | 不变 |
| 559 | `cloudSave={cloudSave}`（传给 `AssetsBody`） | 不变（管道已存在） |
| 579 | `saved={previewCloudId !== '' && cloudSave.savedIds.has(previewCloudId)}` | 不变 |
| **580** | `saving={previewCloudId !== '' && cloudSave.savingId === previewCloudId}` | 改 `cloudSave.savingIds.has(previewCloudId)` |

### 4.5 `CloudAssetCard` 控件簇的目标结构

```jsx
<div className="omnimux-assets-cloud-actions">
  {/* 保存到本地：DOM 中必须先于气泡按钮 —— 簇是 flex 行且不反向，先者居左 */}
  <IconButton
    variant="ghost"
    size="sm"
    className="omnimux-assets-cloud-action omnimux-assets-cloud-save"
    aria-label={saveLabel}
    title={saveLabel}
    disabled={saved}
    loading={saving}
    onClick={handleSave}
  >
    {saved ? <CheckIcon size={16} /> : <IconDownloadOutline16 size={16} />}
  </IconButton>

  <IconButton variant="ghost" size="sm" className="omnimux-assets-cloud-chat" …>
    {added ? <CheckIcon size={16} /> : <ChatIcon size={16} />}
  </IconButton>
</div>
```

**逐项对齐 PM Spec 的取舍（本节采纳 PM 结论，并把技术后果写清）**

| 项 | 结论 | 技术依据 / 后果 |
| --- | --- | --- |
| 图标 | idle `IconDownloadOutline16`（16px，从 `@deepseek-ai/dsh-client-ui-primitives` 具名 import）；saved 复用既有 `CheckIcon` 16px | 已验证：该包 `lib/types/icons/index.d.ts:95` 导出 `IconDownloadOutline16`；`build-client.mjs:30-38` 的 `external` 已含该包（宿主 `__ModuleLoader__` 提供，零包体积）。**`icons.jsx` 一行不改** |
| 忙态 | `loading={saving}`，不用自造 spinner | 已验证 `dsh-ui-kit` 的 `IconButton` 继承 `ButtonProps.loading`：内部 `isDisabled = Boolean(disabled) \|\| loading`（`Button.tsx:111`）、`aria-busy={loading \|\| undefined}`（`:127`）、`loading ? <IconLoadingOutline16 size={16} /> : children`（`:131`）。**`aria-busy` 由 IconButton 自己发，卡片不写** |
| 禁用 | `disabled={saved}`（`saving` 由 `loading` 覆盖） | 两个来源合流成 IconButton 的单一 `isDisabled`，不重复表达同一事实 |
| 类名 | `omnimux-assets-cloud-action`（共享底板/反色）+ `omnimux-assets-cloud-save`（专属钩子） | 底板规则收敛到共享类，两键天生一致；样式改动见 §4.6 |
| 标签 | `const saveLabel = saved ? t('card.savedToLocal') : t('card.saveToLocal')` | **只需两个键，saving 态沿用 idle 文案**（PM §5.3）——可访问名不因瞬时忙态跳变。两属性同值同源（`aria-label` 与 `title`） |
| **不加 `data-*` 状态属性** | 无 `data-state`、无 `data-saved` | PM §3.2 明令「禁止新增 `data-*` 状态属性」并点名不得复活 `data-saved`。三态经 `disabled` + `aria-label` + 图标即可观测，**本文件不引入第四种观测通道**。§6.2 的 S 组断言相应改为锁 `loading`/`disabled`/标签三元组 |
| **不加 `aria-pressed`** | 卡片保存键**不带** `aria-pressed` | 该动作是一次性的（无「取消保存」），`aria-pressed` 会宣称一个不存在的可切换状态。弹窗既有的 `aria-pressed` 按 PM 边界**保持原样不动**（本次只改其 zh 文案） |
| `handleSave` | 首行 `event.stopPropagation()` | 与既有 `handleAdd`（`CloudAssetsView.jsx:220`）同形；卡片根节点 `onClick={openPreview}`（`:261`）会吃掉未拦截的点击，导致「点保存顺带开弹窗」。`disabled` 的原生按钮虽不派发 click，仍保留此行作为按键落在边缘时的第二道防线（PM §7.1） |
| 持久勾 | saved 态**不得**挂 1800ms 定时器 | PM §5.5 的主信号：加入会话的勾是瞬时回馈（`addedTimerRef`，`CloudAssetsView.jsx:293`），保存的勾是持久态。**两个勾的时长差就是它们唯一的区分手段**，给保存挂定时器会抹掉它 |

- `const saveState` **已随 `data-*` 一并取消**；C5 的互斥不变量（`savedIds ∩ savingIds = ∅`）依然成立，只是不再需要一个派生的三值字符串。
- 网格渲染点：`CloudAssetsView.jsx:637-638` 的 `renderItem` 透传 `saved`/`saving`/`onSave`；行渲染点：`CloudCategoryRow.jsx:153` 透传同一组。
- 「全部」行布局的簇级显隐在 `styles.js:1593-1601`，自动覆盖两键，**无需改动**（PM §3.3 同结论）。

### 4.6 样式改动点（`styles.js`）

| 位置 | 改动 | 理由 |
| --- | --- | --- |
| 1319-1335（`.omnimux-assets-cloud-card .omnimux-assets-cloud-chat` 规则块） | 选择器**收敛为共享类** `.omnimux-assets-cloud-card .omnimux-assets-cloud-action`，两键同时获得底板、描边、`opacity: 0`、过渡与 hover 反色；`.omnimux-assets-cloud-save` **不得单独复写任何底板色值** | PM §8.1「底板选择器收敛为共享类」。收敛而非并列两份，是为了让「两键底板必然一致」成为结构事实，而不是靠两份声明保持同步 |
| 1328-1331（`:hover` / `:focus-within` 显隐组） | 跟随收敛为 `.omnimux-assets-cloud-card:hover .omnimux-assets-cloud-action` / `:focus-within .omnimux-assets-cloud-action` | 两键同源同触发：`hover` 与 `focus-within` 缺一，键盘可达性就退化（PM §7.6） |
| 1305-1312 注释 | 「the one route out of a card, which mounts the asset into the conversation」已不成立，改写为两个控件的簇 | 注释不是文案，但会误导下一个 agent（PM §9 末段同判断） |
| 1310-1318 | `.omnimux-assets-cloud-actions` 已是 `position:absolute; top:8px; right:8px; z-index:5; display:flex; align-items:center; gap:6px`，**一行不改** | 本就是为多按钮准备；`gap:6px` 是 PM 锁定的骨架值（簇总宽 62px，最窄 190px 卡仍余 120px） |
| 1399-1406（`.omnimux-assets-cloud-notice`） | **新增唯一一条规则**：追加 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` | PM §3.4：超长资产名换行会把工具区向下顶，破坏单行流 |
| 1593-1601 | `.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-actions` 的显隐是**簇级**的，自动覆盖两键，**无需改动** | 与 PM §3.3 同结论，双形态共享同一块样式 |

**⚠️ 连带后果（下游必须知悉）**：底板选择器收敛后，既有测试 A5 的**切片锚点会失效**——它 `indexOf('.omnimux-assets-cloud-card .omnimux-assets-cloud-chat')`，该字符串在新样式表中不复存在，切片变空会让 5 条断言全部失去意义（不是变红，是变成空断言而恒绿——比红更危险）。锚点必须同步改为 `.omnimux-assets-cloud-card .omnimux-assets-cloud-action`。见 §6.1 A5。

---

## 5. 分类归位的正确性证据与后端判定

### 5.1 事实链

**(a) 本地库接受的全部类型**（`library.js:17`）：

```js
export const ASSET_TYPES = Object.freeze(['character', 'scene', 'style', 'prop', 'knowledge', 'custom'])
```

**(b) 非法类型会抛错**（`library.js:57-61`）：

```js
export function normalizeType(type) {
  const raw = str(type).trim()
  if (raw === '') return 'custom'
  if (!TYPE_SET.has(raw)) throw new AssetsError('type-invalid', 'unknown asset type')
```

**(c) 映射函数**（`cloud-catalog.js:543-548`）：

```js
function typeForCategory(category) {
  // The library's own vocabulary already covers every cloud category except
  // audio, which is not a creative-object type and therefore lands in custom.
  return category === 'character' || category === 'scene' || category === 'style' || category === 'prop' || category === 'knowledge'
    ? category
    : 'custom'
}
```

**(d) 公共目录实际出现的 category**（`cloud-catalog/index.json` 全文统计，6411 行）：

| category | 行数 | 占比 | `typeForCategory` 落点 |
| --- | ---: | ---: | --- |
| character | 429 | 6.69% | `character` |
| scene | 3396 | 52.97% | `scene` |
| prop | 940 | 14.66% | `prop` |
| **material** | **855** | **13.34%** | **`custom`** |
| style | 151 | 2.36% | `style` |
| **audio** | **640** | **9.98%** | **`custom`** |
| knowledge | 0 | 0% | （分支存在但无数据） |

独立旁证：`CloudCategoryRow.test.js:52` 把同一组六个 id 写进断言 —— `const cats = ['character', 'scene', 'prop', 'material', 'style', 'audio']`。两处独立取证一致。

**(e) 端到端实测**（`/tmp/saveprobe/probe.mjs`，走真实 `cloud.saveToLocal`）：

```
category=scene      -> type=scene
category=material   -> type=custom
category=audio      -> type=custom
category=prop       -> type=prop
category=knowledge  -> type=knowledge
```

### 5.2 判定

> ## 分类归位：**NO-BACKEND-CHANGE**

依据：

1. **映射是全覆盖且取值合法的。** 六个真实分类中四个（character / scene / prop / style）映射到自身；`material` 与 `audio` 落到 `custom`。而 `custom` **是它们唯一合法的落点**——`ASSET_TYPES` 里根本没有 `material` 或 `audio`，任何其他返回值都会在 `library.js:60` 抛 `type-invalid` 让保存失败。所以「落兜底」在这里不是降级，而是**唯一解**。
2. **`knowledge` 分支是死代码但无害**：6411 行里 category 从不等于 `knowledge`。保留它使映射对未来的目录扩展保持封闭，不构成缺陷。
3. **不做「素材→prop / audio→prop」之类的强行对齐。** 那会把 1495 行（23.32%）的音视频素材伪装成「道具」，是比落在 `custom` 更严重的数据语义错误，且一旦落库需要数据迁移才能纠正。
4. **路由透传正确**：`cloudSaveRoute` 传 `{ name: body.name, type: body.type }`（`http-routes.js:332`），客户端从不发 `type` → `options.type` 为 `undefined` → `typeForCategory` 全权决定。链路无旁路。

**结论对「对应分类下」的答复**：用户诉求在四个创意对象分类上被逐字满足；素材与声音两类落到本地库的「自定义」。这不是缺陷，而是本地库类型词表与云端分类体系**边界不同**的必然结果。

**给 PM / QA 的交付前提示（非文案决策）**：验收时对 `material` / `audio` 两类卡片，本地库条目的类型标签会是「自定义」（`library.js:26` 的 `TYPE_CITES.custom`）——请按预期行为验收，不要立为 Bug。若产品期望这两类有独立归处，那是**本地库类型词表扩容**的独立议题（需同时改 `ASSET_TYPES`、`TYPE_CITE`、`typeForCategory`、以及本地库分类筛选 UI），不在本 Issue 范围内。

### 5.3 一处必须记录并修掉的旁证缺陷（非分类问题）

`typeForCategory` 的注释（`cloud-catalog.js:544-545`）声称「the library's own vocabulary already covers every cloud category **except audio**」，**遗漏了 material（855 行，13.34%）**。这是纯注释缺陷，不影响行为，但会误导下一位读者以为 material 已被覆盖。随本次改动一并订正注释（零行为变更）。

### 5.4 保存成功语义：**REQUIRES-BACKEND-CHANGE**

分类没问题，但保存**成功语义**有问题：§2.3 已证明远端下载失败会静默产出「200 + 零文件」的空资产。这与 `docs/contracts/product-baseline.md` §3 禁止清单第 6 条直接冲突，并使本 Issue 必须交付的「失败路径可见反馈」测试无法实现。

**最小改动方案（3 处代码点 + 1 处状态码表 + 2 处测试）**

1. `cloud-catalog.js:437` — 无 fetch 实现时不再 `return null`：
   `throw new AssetsError('remote-fetch-failed', 'remote asset download failed')`
2. `cloud-catalog.js:444` — 远端非 2xx 不再 `return null`：
   `throw new AssetsError('remote-fetch-failed', \`remote asset answered HTTP ${response.status}\`)`
3. `cloud-catalog.js:458-459` — 非 `AssetsError` 的异常（含 abort/超时）不再吞掉：
   `throw new AssetsError('remote-fetch-failed', 'remote asset download failed')`
4. `cloud-catalog.js:394` / `:414` 两个调用点各包一层 try/catch，**只捕获、不立即抛**，以便封面失败时主媒体仍有机会落地；`file-too-large` 仍立即上抛（保持既有快速失败）：
   ```js
   } catch (error) {
     if (error instanceof AssetsError && error.code === 'file-too-large') throw error
     remoteFailure = error
   }
   ```
5. 在 `library.add`（`:424`）之前补最后一道闸：
   ```js
   // 行声明了定位符却一个文件都没落地 —— 失败必须可见，不得落一条空资产
   if (files.length === 0 && remoteFailure) throw remoteFailure
   ```
   这道闸的形状是刻意的：它放行**描述型行**（`audio-voiceover-bbb` 一类本就无媒体，`files: []` 合法，既有测试 `saves a descriptor-only row as a library record with no files` 必须继续绿），也放行**部分成功**（封面 404 但主媒体落地 → 资产可用），只拦「声明了却全丢」。
6. `http-routes.js` 的 `STATUS_BY_CODE`（17-55 行）新增 `'remote-fetch-failed': 502,`。502 语义正确（上游取媒体失败即错误的网关）；客户端的 `assetsRequest` 读到 `ok === false`，`saveCloudAssetToLocal` 返回 `{ ok:false, status:502, error:<host message> }`，`useCloudSave` 据此走失败分支写 `t('error.saveFailed')`——**用户的可见结果是那句中文，宿主 message 只进控制台**（§2.2 末段）。

**改完后 §2.2 的最后三行即刻变为**：`{ ok:false, status:502, error:'remote asset answered HTTP 404' }` → 通知条 `保存到本地失败。`，卡片回到 idle（C9），`savedIds` 不写、该行**不再留下空资产**。

---

## 6. 测试契约

### 6.1 既有反向锁定断言：逐条处置

> 总原则：这些断言是产品决策的产物。本次决策变更是「重新引入卡片按钮」，因此**改写的是产品意图，保留的是架构意图**。严禁删除测试或用 `assert.ok(true)` 放水。

#### 文件 A：`plugins/omnimux-assets/src/client/CloudAssetsView.test.js`

| # | 测试名（现） | 旧断言 | 新断言 | 保留的意图 |
| --- | --- | --- | --- | --- |
| A1 | `renders the bubble icon and nothing else in that corner` | `assert.equal((cluster.match(/<IconButton/g) ?? []).length, 1)`；`assert.match(cluster, /<ChatIcon size=\{16\} \/>/)` | 改名 `renders the save plate left of the bubble and nothing else in that corner`；`assert.equal((cluster.match(/<IconButton/g) ?? []).length, 2)`；`assert.ok(cluster.indexOf('omnimux-assets-cloud-save') < cluster.indexOf('omnimux-assets-cloud-chat'))`；`assert.match(cluster, /<IconDownloadOutline16 size=\{16\} \/>/)`；`assert.match(cluster, /<ChatIcon size=\{16\} \/>/)`；**新增「无第三控件、无硬编码可见文字」两条**：`assert.equal((cluster.match(/<IconButton/g) ?? []).length, 2)`（与控件计数同源，作为显式上限）与 `assert.equal((cluster.match(/>[^<>{}]*[\u4e00-\u9fa5][^<>{}]*</g) ?? []).length, 0)`（簇内任何可见中文都必须来自 `t()` 插值，不得写死——与 A3 的字典锁互补） | 右上角仍是**有界**控件簇；气泡控件身份不变（类名/图标/尺寸）；**新增的必须在其左侧**（DOM 序即视觉序，簇是 `display:flex` 不反向）；两键都是纯图标按钮，没有悄悄塞进来的第三个入口或硬编码文案 |
| A2 | `removes the save control and its state from the card, the feed and the stylesheet` | `doesNotMatch(viewJsx, /PlusIcon\|cloud-save\|handleSave\|saveToLocal\|data-saved\|savedIds\|savingId/)`；`doesNotMatch(feedJs, /useCloudSave\|saveToLocal/)`；`doesNotMatch(ASSETS_CSS, /omnimux-assets-cloud-save/)` | 改名 `adds the save control to the card without moving the request out of the controller`，拆成正负两组：<br>**正向（控件确实存在）**——`assert.match(viewJsx, /omnimux-assets-cloud-action omnimux-assets-cloud-save/)`、`assert.match(viewJsx, /const handleSave/)`、`assert.match(viewJsx, /<IconDownloadOutline16 size=\{16\} \/>/)`、`assert.match(viewJsx, /savedIds/)`、`assert.match(viewJsx, /savingIds/)`、`assert.match(ASSETS_CSS, /\.omnimux-assets-cloud-card \.omnimux-assets-cloud-action/)`。<br>**负向（原意图升级为更精确的锁）**——`assert.doesNotMatch(viewJsx, /PlusIcon/)`（卡片不得复用弹窗的加号字形）、`assert.doesNotMatch(viewJsx, /data-saved/)`、`assert.doesNotMatch(viewJsx, /localStorage/)`、`assert.doesNotMatch(viewJsx, /saveCloudAssetToLocal/)`、`assert.doesNotMatch(viewJsx, /cloudSaveToLocal/)`、`assert.doesNotMatch(viewJsx, /\bfetch\(/)`、`assert.doesNotMatch(feedJs, /useCloudSave/)`、`assert.doesNotMatch(feedJs, /saveToLocal/)`；`ASSETS_CSS` 中 save 专属类名**只允许出现 `omnimux-assets-cloud-save` 一个**（不得再长出第二个 save 类名分支） | 四条架构意图逐条保留：<br>(i) **卡片不得直连传输层**——请求只允许存在于 `cloud-save.js` / `use-cloud-save.js`；<br>(ii) **`use-cloud-assets-feed.js` 不得持有保存控制器**（原样保留）——feed 只管分页/搜索/试听；<br>(iii) **卡片不得持有本地已保存状态**——不得 `useState` 型 saved 标记、不得 `localStorage`、不得 1800ms 型保存回执定时器（保存的勾必须是持久态，见 PM §5.5）；<br>(iv) 底板规则收敛到共享类，save 类名不得另起一套色值 |
| A3 | `drops the cloud-only save wording from both dictionaries` | 六个 `assert.equal(zh/en[key], undefined)`（`cloud.action.save`、`cloud.action.saved`、`cloud.save.saved`） | 改名 `keeps the retired save keys dead and the card save keys live`；<br>**负向保留**：`cloud.action.save` / `cloud.action.saved` / `cloud.save.saved` 三条旧键在 zh 与 en 中**继续 `undefined`**（不得复活）；<br>**正向新增**（PM §5.1 定名）：`assert.equal(zh['card.saveToLocal'], '保存到本地')`、`assert.equal(en['card.saveToLocal'], 'Save to Library')`、`assert.equal(zh['card.savedToLocal'], '已保存')`、`assert.equal(en['card.savedToLocal'], 'Saved to Library')`、`assert.equal(typeof zh['error.saveFailed'], 'string')`、`assert.equal(typeof en['error.saveFailed'], 'string')` | 卡片渲染的每个标签都**经字典**解析且**双语齐备**（禁止硬编码字符串、禁止只做中文）；退役键不得被顺手复活（那会让「同义叠加」回归）；新增的两个卡片键必须在两本字典同时存在（`pnpm lint:i18n` 的键集 parity） |
| A4 | `re-points the surviving save notice at a modal-scoped key` | `assert.match(saveJs, /setNotice\(t\('modal\.save\.notice'\)\.replace\('\{name\}'/)`；保留 import 断言；`assert.equal(zh['modal.saveToLocal'], '收藏到本地')` | 改名 `points the shared save notice at a cloud-scoped key`；<br>通知键断言改为 `assert.match(saveJs, /setNotice\(t\('cloud\.save\.notice'\)\.replace\('\{name\}'/)`（**键名按 PM 定名锁定为 `cloud.save.notice`，但 `{name}` 插值结构保持不变**）；<br>保留 `assert.match(saveJs, /import \{ saveCloudAssetToLocal \} from '\.\/cloud-save\.js'/)`；<br>保留 zh/en 的 `cloud.save.notice` 含 `{name}`；<br>`zh['modal.saveToLocal']` 断言值改为 `'保存到本地'`（术语统一：弹窗中文由「收藏到本地」改为「保存到本地」，en 值不变）；<br>**新增失败出口断言**：`assert.match(saveJs, /setNotice\(t\('error\.saveFailed'\)\)/)`，且 `assert.doesNotMatch(saveJs, /setNotice\(String\(result\.error\)\)/)`、`assert.doesNotMatch(saveJs, /setNotice\(errText\(caught\)\)/)` | 成功通知**唯一一条**、带资产名插值、双语齐备；通知键不再是 modal 专属而是卡片与弹窗共用；**失败文案只有一个出口**，任何宿主原文/错误码都不得进 DOM（PM §5.6）。这条负向断言是「英文内部信息泄漏到中文界面」这一既有缺陷的回归锁 |
| A5 | `inverts the plate on hover, with no brand hue anywhere in the control` | 从 `.omnimux-assets-cloud-card .omnimux-assets-cloud-chat` 切到 `.omnimux-assets-cloud-desc {`，断言 `background: var(--dsw-alias-bg-elevated)`、`transition: opacity`、反色对、且**整段**无 `brand-primary`/hex/`rgba(` | 改名 `inverts both corner plates on hover, with no brand hue anywhere in the cluster`；<br>**锚点必须换**（否则切片为空 → 5 条断言全部退化成恒绿，比变红更危险）：`ASSETS_CSS.indexOf('.omnimux-assets-cloud-card .omnimux-assets-cloud-action')`；<br>原有 5 条断言**逐条保留**（`bg-elevated` / `transition: opacity` / 反色两值 / 无 `brand-primary` / 无 hex / 无 rgba）；<br>**新增**：`assert.match(plates, /\.omnimux-assets-cloud-card:hover \.omnimux-assets-cloud-action/)`、`assert.match(plates, /\.omnimux-assets-cloud-card:focus-within \.omnimux-assets-cloud-action/)`、以及「save 类不得单独复写底板色值」的负向断言（`assert.doesNotMatch(plates, /\.omnimux-assets-cloud-save[^{]*\{[^}]*background/)` 形态） | 两个控件共享同一块中性底板：同一 token、同一 opacity 过渡、同一反色、**零品牌色、零裸 hex、零 rgba**；且两键必须同源同触发（`hover` **与** `focus-within`，键盘可达性不退化）。收敛到共享类后，这条测试从「管一个控件」升级为「管整块底板只有一份声明」 |

**保持不变的既有断言（同文件）**：`positions the control absolutely in the corner, above the card body`（簇的 absolute/top:8px/right:8px/z-index:5 至今为真，且现在同时管辖两个按钮）；`mounts a card into the conversation through the shared attachment path`（气泡链路 DOM 与文案不动）。

#### 文件 B：`plugins/omnimux-assets/src/client/cloud-local-bridge.test.js`

| # | 测试名 | 处置 |
| --- | --- | --- |
| B1 | `keeps the cloud grid off the save path entirely` | **断言保持原样，不改一条。**`doesNotMatch(cloudFeedJs, /useCloudSave/)`、`/saveToLocal\|savedIds\|savingId/`、`/stageSave\|ownSave/` 在本契约下**恰好仍是正确的锁**——因为结论是「stage 经 props 注入」，`use-cloud-assets-feed.js` 依然不得持有控制器或保存状态。这三条正是防止后人把控制器塞进 feed 的守卫。**只改注释**：现注释写「Cards carry no save control any more — the single route out of a card is into the conversation」已与产品决策相悖，改写为「保存状态由 stage 经 props 注入；feed 不得自行持有控制器或保存状态」。<br>⚠️ 注意 `/savingId/` 仍会匹配 `savingIds` 的子串（`savingId` + `s`），语义上反而更严——无需调整。 |
| B2 | `keeps one save controller on the stage, serving the cloud preview modal` | 改名 `keeps one save controller on the stage, shared by the modal and the cards`。**改 3 条、保留 4 条、新增 1 条**：<br>① 保留 `assert.match(stageJsx, /const cloudSave = useCloudSave\(\{ t \}\)/)`——全 stage 唯一控制器。<br>② **改写**整标签正则（现 `/<CloudAssetsView t=\{t\} open=\{visible\} onPreview=\{onCloudPreview\}(?: query=\{feed\.query\})? \/>/` 以 `/>` 收尾，任何新 prop 都会让它失败）→ 三条独立断言，不耦合属性顺序：`assert.match(stageJsx, /<CloudAssetsView[\s\S]*?savedIds=\{cloudSave\.savedIds\}/)`、`…savingIds=\{cloudSave\.savingIds\}/`、`…onSave=\{cloudSave\.save\}/`。<br>③ **保留并收紧** `assert.doesNotMatch(stageJsx, /<CloudAssetsView[^>]*\bcloudSave=\{cloudSave\}/)`——把控制器**整体**塞进视图仍在禁止之列；加 `\b` 是因为原正则 `save=\{cloudSave\}` 对 `cloudSave={cloudSave}` 也会误命中（子串），锚点后它只禁止整包外传，允许传读面与回调。<br>④ 保留 `saved=\{previewCloudId !== '' && cloudSave\.savedIds\.has\(previewCloudId\)\}`。<br>⑤ **改写** `saving=\{previewCloudId !== '' && cloudSave\.savingId === previewCloudId\}` → `saving=\{previewCloudId !== '' && cloudSave\.savingIds\.has\(previewCloudId\)\}`。<br>⑥ 保留 `onSaveToLocal=\{previewCloudId !== '' \? savePreviewItem : undefined\}`。<br>⑦ **新增**（PM §9-7 复核结论，全插件唯一控制器实例的机械证明）：`assert.equal((stageJsx.match(/useCloudSave\(/g) ?? []).length, 1)`。 | 架构意图逐条保留并加强：**唯一**一个 `useCloudSave`——③ 与 ⑦ 从「不用整包」与「只有一个实例」两个方向同时封死「卡片自建控制器」；卡片与弹窗读到**同一份** `savedIds`/`savingIds`；视图只接收**读面 + 回调**（否则卡片会耦合 hook 的内部形状）。⑤ 把弹窗的进行中态从「单串相等」升为「集合成员」：语义由「这张卡在保存」升级为「这一行在保存（无论哪个入口发起）」——卡片发起的保存，弹窗也会正确显示进行中 |

#### 文件 C：`plugins/omnimux-assets/src/client/cloud-save.test.js`

| # | 测试名（现） | 旧断言 | 新断言 | 保留的意图 |
| --- | --- | --- | --- | --- |
| C1 | `posts the row id and the row name to the library` | `assert.deepEqual(calls, [{ id: 'audio-voice-bbb', options: { name: '林潇 2.0' } }])` | 改名 `posts the row id alone, so the Host can reuse an already-saved row`；`assert.deepEqual(calls, [{ id: 'audio-voice-bbb', options: {} }])`（实现改为 `request(id, {})`，保留二元调用形态） | 客户端**只**声明「保存哪一行」这一事实。行名由 Host 从 catalog 行读取；客户端转发行名会把「重命名」信号常真化、绕过 `cloud:<id>` 去重、造出重复条目并重复下载（§3.3 实测）。请求体形状仍被断言锁定 |

#### 文件 D：`plugins/omnimux-assets/tests/e2e/cloud-download-to-local.spec.js`

**无需修订。** 该 e2e 走 Host 工具路径（`assets_cloud_save`，不带 `name`），断言的是「双资源下载 → 入库 → 广播 → 本地列表联动」，与卡片 UI 无关，且在 §5.4 的改动下继续通过（mock fetch 成功返回）。它是本次改动的**回归护栏**，必须保持全绿。

#### 文件 E：`plugins/omnimux-assets/src/client/AssetPreviewModal.test.js`（PM §9-8 复核新增）

| # | 测试名 | 旧断言 | 新断言 | 保留的意图 |
| --- | --- | --- | --- | --- |
| E1 | 弹窗保存按钮的字典断言（`:121-124`） | `assert.equal(zh['modal.saveToLocal'], '收藏到本地')`；`zh['modal.savedToLocal'] === '已收藏'` | zh 两值改为 `'保存到本地'` / `'已保存'`；en 两值（`Save to Library` / `Saved to Library`）**原样保留**；**弹窗 DOM / 图标（保持 `PlusIcon`）/ `aria-pressed` / 行为的断言一条都不改** | 术语统一只动中文措辞，**零结构改动**。这三条「不动的断言」本身就是「本次只改文案」的机械证明——若它们需要改动，说明越界了 |

> **A2 与 E1 的冲突消解**：A2 要求 `viewJsx` 不含 `PlusIcon`（卡片不得复用弹窗的加号字形），E1 要求弹窗保持 `PlusIcon`。两者不矛盾——`PlusIcon` 在 `AssetPreviewModal.jsx:232`，不在 `CloudAssetsView.jsx`；A2 的断言面只覆盖 `CloudAssetsView.jsx`，正好把「卡片用下载字形、弹窗暂留加号」这一 PM 决策（弹窗图标改造是独立后续单）锁成事实。

### 6.2 新增测试清单

#### D 组 · 行为化（纯模块，可直接 `node --test`）

**新增文件** `plugins/omnimux-assets/src/client/cloud-save-flight.test.js`

| 测试名 | 断言 | 对应契约 |
| --- | --- | --- |
| `admits one save per asset id and drops the repeat` | `admit('a') === 'accept'`；再 `admit('a') === 'in-flight'` | **C1**：同一卡片重复点击不产生第二次请求 |
| `lets a second card start while the first is in flight` | `admit('a') === 'accept'`；`admit('b') === 'accept'`；`savingIds.size === 2` | **C2**：A 在途不阻塞 B（本次最核心的行为修正） |
| `reports a saved row instead of saving it twice` | `admit('a')`；`settle('a', true)`；`admit('a') === 'saved'` | **C4**：已保存短路 |
| `lets a failed save be retried` | `admit('a')`；`settle('a', false)`；`admit('a') === 'accept'`；`savedIds.has('a') === false` | **C9**：失败不得标记为已保存 |
| `refuses a row with no id` | `admit('') === 'invalid'` | 边界 |
| `never holds one id in both sets` | 全程（并发 set/delete 交错后）断言 `[...savingIds].every((id) => !savedIds.has(id))` | **C5 / I1** 不变量 |

**扩充** `plugins/omnimux-assets/src/client/cloud-save.test.js`

| 测试名 | 断言 |
| --- | --- |
| `omits the name so the Host's own dedupe can fire` | 见 C1 新断言 |
| `posts nothing when the row has no id` | 既有 `refuses a row with no id without calling the Host` 保持（零请求） |

**扩充** `plugins/omnimux-assets/src/cloud-catalog.test.js`（§5.4）

| 测试名 | 断言 |
| --- | --- |
| `fails a save whose declared remote media never landed` | 注入 `fetchImpl` 抛错 → `await assert.rejects(() => cloud.saveToLocal(id), (e) => e.code === 'remote-fetch-failed')`；且 `library.list().length === 0`（**不得留下空资产**） |
| `reports a non-2xx remote answer as a download failure` | `fetchImpl` 返回 `{ ok: false, status: 404 }` → 同上 reject，message 含 `404` |
| `still saves when only the cover download fails` | 封面 404、主媒体 200 → 正常返回，`files.length === 1` |
| `reports an oversize remote asset before staging anything` | `content-length` 超限 → reject `file-too-large`（既有行为不得回归） |
| `still saves a descriptor-only row with no files` | 既有 `saves a descriptor-only row as a library record with no files` 保持绿（证明新闸门不误伤） |
| `reuses the row already saved from the same cloud id` | 连续两次 `saveToLocal(id)`（**均不带 name**）→ 第二次返回同一 id，`library.list().length` 不变（把 §3.3 的实测固化为回归锁） |

**扩充** `plugins/omnimux-assets/src/http-routes.test.js`

| 测试名 | 断言 |
| --- | --- |
| `answers a failed remote download with 502` | `POST /omnimux/assets/cloud/save` + 抛错 fetch → `status === 502`、`body.error === 'remote-fetch-failed'`（客户端据此走 `error.saveFailed` 分支，而非静默成功） |

#### S 组 · 源码级（与既有客户端测试同风格）

**扩充** `plugins/omnimux-assets/src/client/CloudAssetsView.test.js`

| 测试名 | 断言 | 覆盖的必答项 |
| --- | --- | --- |
| `renders the save control to the left of the bubble in that corner` | 见 A1 | **控件簇内两个按钮的 DOM 顺序** |
| `routes the card control through the injected controller, never the transport` | `assert.match(viewJsx, /const handleSave = \(event\) => \{[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onSave\?\.\(asset\)/)`；`assert.doesNotMatch(viewJsx, /saveCloudAssetToLocal\|cloudSaveToLocal\|\bfetch\(/)` | **点击调用控制器而非直接 fetch**；并锁死 `stopPropagation`（否则点保存会顺带打开预览弹窗） |
| `exposes saving and saved as separate, observable states without a data-* channel` | 在簇切片内：`assert.match(cluster, /loading=\{saving\}/)`（忙态由 IconButton 原生转出 `aria-busy="true"` 与 spinner，见 §4.5）、`assert.match(cluster, /disabled=\{saved\}/)`、`assert.match(cluster, /aria-label=\{saveLabel\}/)`、`assert.match(cluster, /title=\{saveLabel\}/)`；配套负向：`assert.doesNotMatch(cluster, /data-state\|data-saved/)` | **saving / saved 两态必须可被辅助技术与 QA 分别观测**——且观测通道只有 PM 授权的那几个（`aria-label`/`title`/`disabled`/原生 `aria-busy`），**不得新增 `data-*` 状态属性**。两属性同值同源（纯图标按钮缺一即驳回） |
| `swaps the glyph and the label when the row is saved` | `assert.match(viewJsx, /saved \? t\('card\.savedToLocal'\) : t\('card\.saveToLocal'\)/)`；`assert.match(viewJsx, /saved \? <CheckIcon size=\{16\} \/> : <IconDownloadOutline16 size=\{16\} \/>/)`；`assert.match(viewJsx, /import \{ IconDownloadOutline16 \} from '@deepseek-ai\/dsh-client-ui-primitives'/)` | **两态的图标与标签切换**：saved 态复用既有 `CheckIcon` 先例（`added` 态与弹窗 saved 态同形）；idle 用 PM 锁定的 `IconDownloadOutline16` 并**从原生库具名导入**（禁止写入 `icons.jsx`——那会重复造轮子并绕过原生主题自适应） |
| `hands the save state to the card in both grid forms` | 网格形态：`assert.match(viewJsx, /saved=\{savedIds\.has\(asset\.id\)\}/)`、`/saving=\{savingIds\.has\(asset\.id\)\}/`；行形态：`assert.match(rowJsx, /saved=\{savedIds\.has\(asset\.id\)\}/)`、`/saving=\{savingIds\.has\(asset\.id\)\}/`；且 `assert.match(viewJsx, /<CloudCategoryRow[\s\S]*?savedIds=\{savedIds\}[\s\S]*?savingIds=\{savingIds\}[\s\S]*?onSave=\{onSave\}/)` | **两种网格形态都覆盖**（`CloudCategoryRow.jsx` 复用同一个 `CloudAssetCard`，故值传递是唯一第二个改动点） |
| `keeps the corner cluster bounded to the two product actions` | `assert.equal((cluster.match(/<IconButton/g) ?? []).length, 2)`（与 A1 同源，作为显式上限声明） | 控件簇白名单 |

**新增文件** `plugins/omnimux-assets/src/client/use-cloud-save.test.js`（源码级）

| 测试名 | 断言 | 覆盖的必答项 |
| --- | --- | --- |
| `short-circuits a repeat click before it reaches the Host` | `assert.match(saveJs, /createCloudSaveFlight\(\)/)`；`assert.match(saveJs, /flight\.admit\(id\) !== 'accept'/)` | **重复点击不产生第二次请求**（策略层由 D 组行为证明，此处锁接线） |
| `keeps the saving set, not a single id, in flight` | `assert.match(saveJs, /savingIds/)`；`assert.doesNotMatch(saveJs, /setSavingId\(/)`、`assert.doesNotMatch(saveJs, /\bsavingId\b(?!s)/)` | 并发模型改造到位（无残留全局单飞） |
| `reports every failure on the single sealed notice line and never marks the row saved` | `assert.match(saveJs, /if \(!result\.ok\) \{[\s\S]*?setNotice\(t\('error\.saveFailed'\)\)/)`；`assert.match(saveJs, /catch \(caught\) \{[\s\S]*?setNotice\(t\('error\.saveFailed'\)\)/)`；**封死宿主原文**：`assert.doesNotMatch(saveJs, /setNotice\(String\(result\.error\)\)/)`、`assert.doesNotMatch(saveJs, /errText/)`；`assert.match(saveJs, /let ok = false/)`、`assert.match(saveJs, /ok = true/)`、`assert.match(saveJs, /flight\.settle\(id, ok\)/)` | **失败路径的可见反馈**：可见性由「所有失败分支唯一出口 `error.saveFailed`」锁死（这同时是「英文内部信息泄漏进中文界面」的回归锁）；**状态正确性**由 D 组 `lets a failed save be retried` 行为证明——失败后 `admit` 仍返回 `'accept'` 且 `savedIds` 不含该 id |
| `drops the stale savedRef mirror` | `assert.doesNotMatch(saveJs, /savedRef/)` | 净简化落地（§4.3） |

**新增文件** `plugins/omnimux-assets/src/client/CloudCategoryRow.save.test.js`（或在既有 `CloudCategoryRow.test.js` 内追加）

| 测试名 | 断言 |
| --- | --- |
| `forwards the save trio down to the card` | `assert.match(rowJsx, /onSave=\{onSave\}/)`、`/saved=\{savedIds\.has\(asset\.id\)\}/`、`/saving=\{savingIds\.has\(asset\.id\)\}/`；`assert.match(rowJsx, /savedIds = NO_IDS/)`、`/savingIds = NO_IDS/`（缺省不炸） |

### 6.3 验收命令

```bash
cd plugins/omnimux-assets && node --test src/*.test.js src/client/*.test.js tests/e2e/*.spec.js
# 等价于该包的 `pnpm --filter omnimux-assets test`
```

仓库级门禁（改动涉及客户端页面与 i18n 字典，按 `AGENTS.md` 的验证矩阵）：

```bash
pnpm verify:stages          # Client / Stage / sidebar 改动
pnpm verify:product-baseline # 产品运行时路径（本次不触碰，作为护栏）
node --test scripts/verify-agent-note-format.mjs   # 若新增 Agent Note
```

真机浏览器验收按 `AGENTS.md`：Agent 侧门槛是**本工作树内的真实浏览器 Web 验证证据**（截图或结构化报告）；共享 Dev 45120 的真机验收归人工，Agent 不阻塞、不代签。

---

## 7. 任务分解与依赖拓扑

角色：**前端** = 前端开发工程师 裴像素；**后端** = 后端与系统工程师 寇豆码；**测试** = QA / 测试。

```
        ┌─ T01 (前端) 抽出 cloud-save-flight.js ─┐
        │                                        ├─→ T03 (前端) 注入 + 卡片/行改造 ─┐
        └─ T02 (后端) stageRemote 失败必须可见 ──┘                                    │
                                                                                      ├─→ T05 (测试) 断言改写 8 处
        T04 (前端) cloud-save.js 停发 name ──────────(独立，可并行)───────────────────┤
                                                                                      └─→ T06 (测试) 新增测试
        T09 (前端) 字典 6 键 + 共享底板类 + 通知条截断 ──(与 T03 并行，T05 前置)────────────┤
                                                                                             ↓
                                                                                    T07 (前端) 收口复核 → T08 (QA) 真机验收
```

### 任务表

| ID | 角色 | 任务 | 涉及文件 | 前置 | 验收标准 / 命令 |
| --- | --- | --- | --- | --- | --- |
| **T01** | 前端 | 新增纯策略模块 `createCloudSaveFlight()`；`useCloudSave` 改用它，`savingId` → `savingIds`，删除 `savedRef`/`inFlightRef`；通知键改 `cloud.save.notice`、失败唯一出口 `error.saveFailed`（不再 `errText`/宿主原文进 DOM） | `src/client/cloud-save-flight.js`(新)、`src/client/use-cloud-save.js` | — | `node --test src/client/cloud-save-flight.test.js`；`use-cloud-save.js` 内无 `inFlightRef`/`savedRef`/`errText`/`setNotice(String(` |
| **T02** | 后端 | `stageRemote` 三处静默 `return null`（:437 / :444 / :458-459）改为抛 `remote-fetch-failed`；两个调用点（:394 / :414）包 catch 捕获、`file-too-large` 立即上抛；`library.add`（:424）前补「声明了定位符却零文件」闸门；`STATUS_BY_CODE` 增 `remote-fetch-failed: 502` | `src/cloud-catalog.js`、`src/http-routes.js`(`STATUS_BY_CODE`, 17-55) | — | `node --test src/cloud-catalog.test.js src/http-routes.test.js`；`saves a descriptor-only row with no files` 仍绿 |
| **T03** | 前端 | 卡片控件簇加保存键（DOM 在气泡**之前**，类名 `omnimux-assets-cloud-action omnimux-assets-cloud-save`，idle `IconDownloadOutline16` / saved `CheckIcon`，`disabled={saved}` + `loading={saving}` + 双 `aria-label`/`title`，`handleSave` 带 `stopPropagation`，**不加任何 `data-*`**）；`CloudAssetsView` 与 `CloudCategoryRow` 接收并下传 `savedIds`/`savingIds`/`onSave`；`AssetsStage.jsx:287` 注入窄接口、`:580` 改 `savingIds.has()`、`:282-283` 注释改写 | `src/client/CloudAssetsView.jsx`、`src/client/CloudCategoryRow.jsx`、`src/client/AssetsStage.jsx` | T01, T09(键名) | `node --test src/client/*.test.js`；两个网格形态都拿到 `saved`/`saving` |
| **T04** | 前端 | `cloud-save.js:25` 改 `request(id, {})`，停发 `name`，恢复 Host 去重 | `src/client/cloud-save.js` | — | `node --test src/client/cloud-save.test.js`；手工验证二存复用同一条、库内条数不变 |
| **T05** | 测试 | 改写 §6.1 的 **8 条**既有断言（A1–A5 / B2 / C1 / E1）；**B1 仅改注释**；订正 `typeForCategory` 注释（`cloud-catalog.js:544-545`）；同步改写 `use-cloud-save.js` 文件头「grid cards themselves offer just 加入对话」过时注释 | `CloudAssetsView.test.js`、`cloud-local-bridge.test.js`、`cloud-save.test.js`、`AssetPreviewModal.test.js`、`src/cloud-catalog.js`(注释)、`src/client/use-cloud-save.js`(注释) | T01–T04, T09 | `node --test src/client/*.test.js`；确认无 `assert.ok(true)` 类放水；A5 锚点已换、切片非空 |
| **T06** | 测试 | 新增 §6.2 全部测试（D 组行为 + S 组源码） | `src/client/cloud-save-flight.test.js`(新)、`src/client/use-cloud-save.test.js`(新)、`CloudAssetsView.test.js`、`CloudCategoryRow.test.js`、`cloud-save.test.js`、`src/cloud-catalog.test.js`、`src/http-routes.test.js` | T05 | `node --test src/*.test.js src/client/*.test.js tests/e2e/*.spec.js` 全绿 |
| **T07** | 前端 | 收口复核：样式表 save 类名只出现一个、共享类不含独立色值、`locales.js` 六键 zh/en 齐备、`pnpm lint:i18n` 通过 | `src/client/styles.js`、`src/client/locales.js` | T03, T05, T06, T09 | `pnpm verify:stages`；`pnpm lint:i18n`；`node --test src/client/styles.test.js` |
| **T08** | QA | 本工作树内真实浏览器验证（按 PM §8.3 逐条勾选）：悬停出双按钮且次序正确、点击不误开弹窗、spinner→勾、2400ms 后勾仍在、切分类/滚动后勾仍在、本地库对应分类出现条目、重挂载后重点不产生副本、注入失败显示 `保存到本地失败。`、断网/404 场景同样可见失败、超长名通知条单行截断 | — | T07 | 截图或结构化报告；`pnpm --filter omnimux-assets test` 全绿 |
| **T09** | 前端 | 字典六键落地（PM §5.1：`card.saveToLocal` / `card.savedToLocal` / `cloud.save.notice` 改名 / `error.saveFailed` / `modal.saveToLocal` 与 `modal.savedToLocal` 改 zh 值）；底板选择器收敛为共享类 `.omnimux-assets-cloud-action`；通知条单行截断 | `src/client/locales.js`、`src/client/styles.js` | — | `pnpm lint:i18n`（zh/en 键集 parity）；`node --test src/client/styles.test.js` |
| **T10** | 架构/PM | **冲突升级裁决**（见 §8-R12）：确认 `cloud-save.js` / `cloud-catalog.js` / `http-routes.js` 获得改动授权 | — | — | 三方签字后 T02/T04 才能进实现；未授权则 PM §8.3 的两条验收项标注为已知不通过 |

**并行度**：T01 / T02 / T04 / T09 四条互不依赖，可同时起。T03 依赖 T01（`savingIds` 形状）与 T09（文案键名）。T05/T06 依赖全部生产改动落地。T10 是唯一的**阻塞性协调项**，但它只阻塞 T02/T04 的**合入**，不阻塞其余工作。

**关键路径**：T02 → T05/T06 的后端部分 → T08。T02 落在关键路径上且是唯一的非前端改动，应最早启动与最早协调。

**关键路径**：T02 →（T05/T06 的后端部分）→ T08。T02 落在关键路径上且是唯一非前端改动，应最早启动。

---

## 8. 风险登记

| ID | 风险 | 证据 | 处置 / 状态 |
| --- | --- | --- | --- |
| **R1** | **远端媒体取用失败静默成空资产** | §2.3 实测：404 / 网络故障 → 200 + `files=0`；新用户 `cloud-catalog/` 零媒体字节、`sourceRoot: ""`，远端是唯一路径 | **本 Issue 内修**（§5.4 / T02）。修后由 `remote-fetch-failed` (502) 显性化 |
| **R2** | **二次保存造出重复条目 + 重复下载** | §3.3 实测：带 `name` → `Bedroom (2)`、同 cloud id 两条记录；不带 → 复用 | **本 Issue 内修**（§3.3 / T04，一行）。跨会话 `savedIds` 不持久，故必须靠 Host 去重兜底，此修是幂等的前提 |
| **R3** | 无并发上限，极端连点可能叠加内存 | `MAX_REMOTE_SAVE_BYTES` = 512 MiB/文件；每次远端下载整份 `Buffer.from(await response.arrayBuffer())` | **接受并挂触发条件**：连续 ≥5 张并发导致内存/体验异常时，按「可见拒绝 + 卡片回 idle」加上限；**禁止**退回静默丢弃（C1/C2 是不可退回的契约） |
| **R4** | 通知条被快速覆盖 | `CLOUD_NOTICE_MS = 2400`，单条 last-writer-wins，且每次 `save()` 起始即清空 | **接受**（C7/C8）。信息不失真：成功由卡片持久 `saved` 态承载，失败由卡片回 idle 承载。若 PM 后续要求逐条回执，属独立议题 |
| **R5** | `savedIds` 跨会话不持久 | `useCloudSave` 的 `savedIds` 是内存态；页面刷新即空 | **接受**。刷新后卡片显示 idle，但二次点击由 Host `cloud:<id>` 去重幂等收口（R2 修后）。**不做**「从本地库反查 hydration」——那需要把 `source` 反查铺到客户端，收益仅为省一次 200 往返，不成比例 |
| **R6** | `savedIds` 在筛选/页签切换后的保持语义 | 控制器在 `AssetsStage`（`:399`），不随页签卸载；`CloudAssetsView` 才随页签卸载 | **已确认符合预期**：切换分类/搜索/页签后 `savedIds` 与 `savingIds` **均保持**，回到同一卡片仍显示 saved。这是 §1.1 选择 stage 作用域的直接收益，也是不做视图内控制器的原因之一。需在 T08 显式验一条 |
| **R7** | `material` / `audio` 落 `custom` 被误判为 Bug | §5.1(d)：1495 行 = 23.32% | **接受并前置说明**（§5.2 末段）。已给 PM/QA 明确预期。若产品要独立归处，属本地库类型词表扩容的独立议题 |
| **R8** | `typeForCategory` 注释遗漏 `material` | `cloud-catalog.js:544-545` | **本 Issue 内订正**（注释级，零行为变更，随 T05） |
| **R9** | 卡片根节点 `onClick={openPreview}` 与保存按钮冲突 | `CloudAssetsView.jsx:246`（卡片根 `onClick`）、`:266-273`（`handleAdd` 用 `stopPropagation` 隔离） | **本 Issue 内修**：`handleSave` 必须 `stopPropagation`，并由 S 组测试锁死（§6.2） |
| **R10** | `CloudCategoryRow.jsx` 与 `CloudAssetsView.jsx` 互相 import（既存循环） | `CloudCategoryRow.jsx:8` ← `CloudAssetsView.jsx:26` | **不在本次扩大**：新 prop 走值传递，不新增跨文件导出；默认值 `NO_IDS` 各自文件内声明（§4.1） |
| **R11** | Agent 工具 `assets_cloud_save` 仍可按显式 `name` 造重复副本 | `index.js:159` 的 tool schema 暴露 `name` | **接受**：那是 Agent 的显式意图（刻意另存一份），与 UI 的误用不同。Host 的重命名策略不动（§3.3） |
| **R12** | **与 PM Spec §8.1 改动边界冲突（本文件的唯一升级项）** | PM Spec §8.1「**禁止改动**：`icons.jsx`、`cloud-save.js`、`cloud-catalog.js`、`http-routes.js`（后端与桥接层本次零改动）」；而本文件判定 T02（后端）与 T04（`cloud-save.js`）必须改 | **裁决：T02 / T04 必须在本次落地，并需 PM 追认授权（T10）。**`icons.jsx` 归 PM，本文件同意零改动。<br>依据不是风格偏好，而是 **PM Spec 自己的验收项在该清单下必然不通过**：<br>① PM §8.3 验收项「重复保存同一行（重新挂载后再点）：本地库**不产生重复副本**（后端复用既有 `cloud:<id>` 行）」——PM §6 去重规则第 3 层与 §7.3 都押注在这条后端去重上，但客户端恒发 `name` 使其**永不触发**（§3.3 实测：`Bedroom (2)` + 同 cloud id 两条记录）。不修 T04 则此验收项必挂。<br>② PM §8.3 验收项「注入保存失败…通知条显示 `保存到本地失败。`」只覆盖了可注入的 `catalog-unavailable`；而真实世界最常见的失败（远端媒体 404/超时）今天返回 200 + 空资产，`error.saveFailed` **永远不会出现**（§2.3 实测）。不修 T02 则 PM §5.6 的失败文案契约在最需要它的场景下是死代码。<br>措辞澄清（消解对立）：PM 的「后端与桥接层本次零改动」在*UI 重设计*的意义上是对的——**渲染这枚按钮确实不需要后端配合**。T02/T04 是按本 Issue 放大后的暴露面（每张卡都有入口）与 PM 新建的失败文案契约所**连带必需**的两处既有缺陷修复，各自一行到数行，且不改变任何接口形状。<br>**兜底**：若 T10 未获授权，则 §7 的 T02/T04 顺延为独立 Issue，且 PM §8.3 上述两条验收项必须显式标注「已知不通过」——**不允许**以「后端零改动」为名让这两条空着通过 |
| **R13** | 原生图标库为宿主提供，本地无完整副本可核 | 已验证 `@deepseek-ai/dsh-client-ui-primitives` 在 `build-client.mjs:30-38` 的 `external` 列表中；该包 `lib/types/icons/index.d.ts:95` 确实导出 `IconDownloadOutline16`（在 `dsh-ui-kit` 的 node_modules 内找到）；但插件自身的 node_modules **不含**该包——它由宿主 `window.__ModuleLoader__` 提供 | **接受并前置验证**：T03 第一步是 `node scripts/build-client.mjs` 能解析该具名导入（PM §8.2 同列为前置检查）。若宿主版本不含该导出，构建期即报错，不会静默降级。**禁止**因构建失败而在 `icons.jsx` 自造 `DownloadIcon`——那违反 PM §4.3 红线且绕过原生主题自适应；正确处置是升级宿主 primitives 或改走 PM 授权的第二优先级 |
| **R14** | 卡片保存键**不带** `aria-pressed`，而弹窗同动作带 | `AssetPreviewModal.jsx:233` 有 `aria-pressed={saved ? 'true' : 'false'}`；卡片按 PM §3.1/§3.2 不加 | **接受为刻意不一致**：保存到本地是**一次性动作**（没有「取消保存」），`aria-pressed` 会向辅助技术宣称一个不存在的可切换状态。卡片用 `disabled` + `aria-label`（「已保存」）+ 勾表达终态，语义更准。弹窗那处不属本 Issue 边界（PM §5.2：不改弹窗 DOM/`aria-pressed`），登记为后续独立单 |
| **R15** | 底板选择器收敛导致 A5 切片锚点静默失效 | 既有 A5 用 `indexOf('.omnimux-assets-cloud-card .omnimux-assets-cloud-chat')` 定位切片；收敛为共享类后该字符串不复存在，`indexOf` 返回 `-1`，`slice(-1, …)` 得到近乎空串，5 条断言**全部退化为恒绿** | **本 Issue 内修**（T05 / §6.1 A5）：锚点换为 `.omnimux-assets-cloud-card .omnimux-assets-cloud-action`。这类「空切片恒绿」是比断言失败更危险的一类回归——验收时须确认切片长度非零 |

---

## 9. 新用户基线（依 `docs/contracts/product-baseline.md`）

该 contract 的判据是「一台全新用户机器在刚装完、刚登录那一刻」（§1），并规定产品运行时只判 `plugins/*/src`（§3 末段）。逐条作答：

### 9.1 全新用户点了这个按钮会发生什么

**(1) 目录元数据是可得的，因此卡片会正常出现。** 公共目录元数据有两条来源（`cloud-source.js` 文件头）：生产网关 `https://omnimux.ai/cloud-assets-catalog` 优先，本机 Host 代理 `/omnimux/assets/cloud` 兜底。**元数据不依赖任何开发机资产**，符合 contract §1「新用户机器上确定存在：安装壳与出厂插件包」。因此「卡片存在」这一前提成立，按钮可被点击。

**(2) 媒体字节不在安装包内，故保存走远端下载。** 实测：`plugins/omnimux-assets/cloud-catalog/` 下非 JSON 文件数为 **0**，`manifest.json` 的 `sourceRoot` 为 `""`。`resolveLocal` 在 `sourceRoot === ''` 时直接返回 `''`（`cloud-catalog.js:187`），故每个 `file:` 定位符都解析失败，`resolveResource` 必然回落到 `meta.source_*_url`——5040 / 5554 行是 `http`。**这条路径不依赖开发机、不读 `settings.yaml`、不用回环地址**，落在 contract §1 的「确定存在」集合内，且属于 §4 允许的本机用法（本地文件与媒体管线）。**不在 §3 禁止清单之列。**

**(3) 保存是一次 Host 写入，不是网关调用。** `cloud-source.js` 文件头明确：「Saving to the local library is likewise a Host write, never a gateway call.」写入目标是 `$DSH_HOME` 下由产品自己创建的存储目录（contract §1「确定存在」第 4 项）。**合规。**

**(4) 无云端目录挂载的情形。** 若本机既无目录副本、网关也不可达：`useCloudManifest` 报错 → 经 `use-cloud-assets-feed.js:451` 的 `error: manifestError || pageError` → 由 `CloudAssetsView.jsx:677` 渲染为 `<p className="omnimux-assets-error">`。**此时一张卡片都不会渲染，保存按钮无从点起**——这不是静默降级，而是「没有可保存的对象」这一事实的显式呈现，符合 contract §3 第 6 条。

### 9.2 错误如何呈现（contract §3 第 6 条「失败后不得静默」）

| 失败情形 | Host 应答 | 客户端呈现 | contract 判定 |
| --- | --- | --- | --- |
| 本地库不可用 | `catalog-unavailable` → 503 | 通知条 `保存到本地失败。`（`error.saveFailed`，宿主原文不进 DOM） | 合规 |
| 该行不存在 | `catalog-not-found` → 404 | 同上 | 合规 |
| 远端媒体过大 | `file-too-large` → 413 | 同上 | 合规 |
| **远端媒体取用失败** | **现状：200 + 空资产** | **现状：无任何反馈** | **违规**（§3 第 6 条）→ **由 §5.4 / T02 修为 502 + 通知条 `保存到本地失败。`** |
| 保存成功 | 200 `{ asset, lrev }` | 该卡 `saved` 态 + 通知条 `已保存「{name}」到本地资产库`；本地库该分类下出现条目；本地 feed 250 ms 内刷新 | 合规 |

> 每一行的用户可见文案都是 `t('error.saveFailed')`——**这正是 contract §3 第 6 条可机械核查的形态**：失败一定有一句用户读得懂的中文，且不含任何英文内部信息或错误码。该收敛由 PM Spec §5.6 裁定，本文件在 §2.2 / §6.1 A4 把它锁成断言。

### 9.3 基线结论

功能在**全新用户机器上可完整跑通**：元数据来自网关或本机代理，媒体从公开 CDN 取回，落盘在 `$DSH_HOME`，不依赖 `~/.omnimux-dev`、不读 `settings.yaml`、不假定本机模型服务。**唯一不合规项是 §9.2 中「远端取用失败静默成功」一行**，且本契约已将其列为本 Issue 的必改项（T02）。改完后本功能对 contract §1–§4 全部合规。

> 注：本次改动**不触碰**任何产品路径 / 模型路由 / 本机状态解析（`pnpm verify:product-baseline` 的扫描面），该门禁在本次作为纯护栏运行。

---

## 附录 A：证据索引（可复核）

| 结论 | 取证位置 |
| --- | --- |
| 本地类型词表 6 项 | `plugins/omnimux-assets/src/library.js:17` |
| 非法类型抛 `type-invalid` | `library.js:57-61`、`http-routes.js:38`（`'type-invalid': 400`，`STATUS_BY_CODE` 共 17-55 行） |
| 分类映射表与落点 | `cloud-catalog.js:543-548`；实测 `/tmp/saveprobe/probe.mjs` |
| 目录 6411 行的分类分布 | `plugins/omnimux-assets/cloud-catalog/index.json` |
| 六分类清单的独立旁证 | `src/client/CloudCategoryRow.test.js:52` |
| 安装包内零媒体字节 / `sourceRoot: ""` | `find cloud-catalog -type f -not -name "*.json" \| wc -l` = 0；`manifest.json` |
| `resolveLocal` 对空 `sourceRoot` 返回 `''` | `cloud-catalog.js:185-201` |
| `meta.source_*_url` 为 http | index.json 统计：5040 / 5554 行 |
| 去重分支的前置条件 | `cloud-catalog.js:366` |
| 客户端恒发 `name` | `cloud-save.js:25`；`cloud-preview.js:51`；`cloud-feed-helpers.js:162` |
| 重复条目实测 | `/tmp/saveprobe/probe.mjs` 段 B/C |
| `stageRemote` 三处静默 `return null` | `cloud-catalog.js:437`、`:444`、`:458-459` |
| 调用点 | `cloud-catalog.js:394`（封面）、`:414`（主媒体）、`:424`（`library.add`） |
| 远端失败静默实测 | `/tmp/saveprobe/probe2.mjs` |
| 路由与状态码表 | `http-routes.js:327-335`、`:17-55` |
| 现有全局单飞 | `use-cloud-save.js:29`、`:40` |
| `AssetsBody` 已持有 `cloudSave` | `AssetsStage.jsx:256`、`:559`；渲染点在 `:287` |
| 弹窗三态先例 | `AssetPreviewModal.jsx:227-238` |
| 控件簇样式 | `styles.js:1305-1335`、`:1593-1601` |
| 客户端无 React 渲染器 | `plugins/omnimux-assets/package.json`（devDeps 仅 esbuild）、`test` 脚本 |
| 纯策略抽出的既有先例 | `src/client/request-coalescer.js` + `request-coalescer.test.js` |
| 新用户基线 contract | `docs/contracts/product-baseline.md` §1/§3/§4 |
| 回归护栏 e2e | `tests/e2e/cloud-download-to-local.spec.js` |

## 附录 B：对 PM Spec 事实性依赖的独立复核

PM Spec（`specs/asset-card-save-to-local.spec.md`）对本文件提出了四项可证伪的技术主张。全部复核如下——**这是「架构师为下游实现契约做环境取证」的分内事**，不是对 PM 结论的重复：

| PM 主张 | 复核结论 | 取证 |
| --- | --- | --- |
| `@deepseek-ai/dsh-client-ui-primitives` 导出 `IconDownloadOutline16` | **成立** | 该包 `lib/types/icons/index.d.ts:95`：`export declare const IconDownloadOutline16: ({ size, className }: IconProps) => JSX.Element`。PM 引的 `:98` 略偏 3 行，导出本身确凿 |
| 本插件打包链路已 external 该包（零包体积） | **成立** | `plugins/omnimux-assets/scripts/build-client.mjs:30-38` 的 `external` 数组末项即 `'@deepseek-ai/dsh-client-ui-primitives'` |
| `IconButton` 的 `loading` 原生提供 spinner + `aria-busy` | **成立** | `dsh-ui-kit/src/button/Button.tsx`：`IconButtonProps extends Omit<ButtonProps, …>`（`:85`），`ButtonProps.loading?: boolean`（`:16`），`isDisabled = Boolean(disabled) \|\| loading`（`:111`），`aria-busy={loading \|\| undefined}`（`:127`），`loading ? <IconLoadingOutline16 size={size === "xs" ? 14 : 16} /> : children`（`:131`）。**推出两条实现约束**：卡片只需传 `loading={saving}`，`aria-busy` 不由卡片书写；且 `size="sm"` 下 spinner 为 16px，与 idle 字形同尺寸，无跳动 |
| 控制器维持全局单飞时「A 在途期间 B 必须一并置灰」；具体机制由架构师定 | **部分不采纳，已升级** | 本文件 §3.2 C1/C2 选择**按 id 单飞**（PM §6 括号里已明示允许「并发放行」）。理由：全局置灰会使**每一张卡片的按钮在任意一次保存期间集体失效**——那正是 PM 自己禁止的「静默吞点击」的集体版本，只是把静默换成了全局不可用。按 id 单飞既满足 PM 的唯一硬要求（任何点击 2400ms 内必有可观测反馈），又不让无辜的卡片替别人的保存买单 |

**一项无法在本地证实的差异（诚实记录）**：PM §4.2.3 主张「`lucide-react` 在本仓未安装、不可解析」。本工作树无从机械验证该包的全局可解析性（它属 PM 取证范围，且结论对本次实现无影响——原生库已是第一优先级且确有该图标），故未复核，也不依赖它。
