# 作品直传改为 202 受理 + 后台下载（Issue #3493）

## 1. 背景（#3485 实测）

host 的 `POST /local/capture` 之前同步下载后才应答：抖音 236MB、Instagram 25.9MB@119KB/s 都超过扩展保存请求的 30s 超时，扩展会误判失败回退旧链路（用户看到失败/降级）。灵感库已有「占位行 + import_status/import_stage + GET /local/:id 轮询 + stale sweep」机制（`import-url` 后台导入在用），capture 复用同一套即可。

## 2. 目标与用户旅程

| # | 场景 | 期望 |
| --- | --- | --- |
| J1 | 保存抖音 236MB / IG 25.9MB 作品 | 保存请求 <2s 返回 202；面板 toast「已保存」；灵感库出现「导入中」卡片并自动收敛为可播放 |
| J2 | 同一作品重复保存（下载中） | 202 + 既有行，不启动第二个任务 |
| J3 | 同一作品已是 ready | 200 `{existing:true}` |
| J4 | 媒体全部下载失败 | 行收敛为 `failed` + 可读 `import_error`（不再返回 422，因为受理已完成）；不制造假成功 |
| J5 | 部分媒体失败 | 行 `degraded` + 已成功文件保留 + `import_error` 第一条原因 |
| J6 | host 进程在下载中重启 | 行停在 `importing` 超过 stale 预算后被 sweep 标 `failed`（可重试） |

## 3. 契约

`POST /omnimux/inspiration/local/capture`

- 校验：同现状（source_url/media/cover 必须公开 http(s)、media ≤20、header 白名单 referer/user-agent/cookie）。
- 去重（事务内同步完成）：
  - 已存在且 `media_items.length>0` 或 `type!=='video' && import_status==='ready'` → `200 {data: existing, existing:true}`。
  - 已存在且 `import_status==='importing'` → `202 {data: existing, existing:true, accepted:true}`（幂等）。
  - 其它已存在行（failed / degraded 无媒体 / legacy）→ 原地升级：同一 id 写占位、启动任务。
- 新建 / 升级后立即返回 `202 {data: placeholder, accepted:true}`；占位行字段：
  `title, content, type:'video'(临时), source_platform, source_url, cover_url, media_items:[], media_urls:[], local_paths:{}, content_shape, tags, author, stats, posted_at, auto_analyze:false, import_status:'importing', import_stage:'downloading', import_started_at:ISO, import_error:null`
- 轮询：复用 `GET /omnimux/inspiration/local/:id`（`handleGetItem`），返回行随 `import_status/import_stage` 收敛（前端 import poller 已覆盖）。
- 后台任务：
  - `activeJobs.add(id)`（复用 http-handlers 的集合），运行期间 stale sweep 不误杀；
  - 顺序下载，单条 timeout 300s、总预算由任务自身控制；目录/命名/记录结构与现有 capture 一致（videos/images/covers）；
  - 完成：`store.replace(id, record)`（失败兜底 `store.add(record,{allowDuplicate:true})`），`import_status=ready|degraded`；
  - 全部媒体失败且无封面 → 行 `failed`、`import_error` 第一条原因、清理已落盘文件；
  - 异常 → 行 `failed` + 描述原因；后台任务不向 HTTP 响应抛错。
  - 任务结束（成功/失败）后从 `activeJobs` 移除；导出 `captureJobs` / `captureJobsSettled()` 供测试等待。

## 4. 扩展侧

`saveCapturedPostOnHost` 以 `res.ok` 判定成功，202 已算成功，无需改动；`via:'capture'` 保持不变。toast 仍为「已保存到 OmniMux 灵感素材库！」，卡片在灵感库侧收敛。若后续需要「已受理，后台下载中」文案，另行评估（非本单）。

## 5. 测试

- `capture-handler.test.js` 改为异步契约：
  - POST 立即 202 + importing 占位；`await captureJobsSettled()` 后 ready/degraded；
  - 下载中重复 POST → 202 existing 且仅一个任务；
  - ready 重复 → 200 existing；
  - 全部失败 → failed + import_error；
  - 部分失败 → degraded + 成功文件保留；
  - 运行中 stale sweep（传入空 activeIds 的 sweep 或直接 findStaleImports 手动）不误杀；任务结束后超期行被 sweep 标 failed；
  - header 白名单/CRLF/去重/canonical 等既有断言保留。
- 真实 host 端到端（隔离 DSH_HOME，真实 CDN）：用 #3485 保存的真实页面 capture 重新 POST，记录「202 响应耗时」与「受理→ready 耗时」，IG/抖音必须收敛 ready。

## 6. 非目标

- TikTok/抖音页面内字节回传（下一单，协议见 #3485 spec §5）。
- YouTube 直链；移除旧 import-url 链路。
- 前端文案变更。

## 7. 全新用户基线

- 只依赖本机 host 与扩展；capture 200/202/400 语义明确；后台下载失败在卡片上可见并可重试。
- 不使用任何外部 API；下载目标仍是公开 http(s) 直链。
