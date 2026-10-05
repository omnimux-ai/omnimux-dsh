# 创作画布视频合成导出：实机预演证据（修复前）

任务：`canvas-clip-export-stale`
环境：OmniMux Dev 桌面应用（Electron renderer，CDP `127.0.0.1:9229`，页面 `http://127.0.0.1:45120`）
采集时间：2026-10-05 17:1x
方法：在真实应用页面内同源发起真实请求 / 真实点击；未修改任何仓库源码。

## 证据 1｜真实导出尺寸必然撞上 JSON body 上限（根因主链）

在运行中的应用页面内，取两个真实素材拼成一段 30 秒成片量级的字节，按**当时产品实际使用的传输方式**（base64 + JSON）POST 到真实端点：

| 项 | 实测值 |
| --- | --- |
| 原始字节 | 9,027,685（≈9.0 MB） |
| base64 长度 | 12,036,916 |
| JSON body 长度 | 12,036,994 |
| 端点 | `POST /omnimux-clip/api/projects/clip_node_live_probe/save-export` |
| **响应** | **HTTP 400 `{"error":"invalid-json","message":"invalid json"}`** |

对照：同一端点在 3,583,610 字节（3.4 MB）时返回 200 并写出文件。
→ 结论：真实合成必然超过宿主 `readJsonBody` 的 8 MiB 默认上限，`persistExportBlobToHost` 拿到 `{}`（无 `path`）。

## 证据 2｜失败后节点会指向非本次合成的文件

`export-runner.ts` 在 `persistRes.path` 缺失时回退到进程级全局 `window.__openreelExportPath`
（上一次手动导出的任意路径），其次回退到解析不了的相对 URL
`/omnimux-workflow/api/local-file?path=clip%2Fexports%2F<projectId>.mp4`。
`videoComposition.tsx` 对任何非空 `output.videoPath` 都会建节点 → 节点存在但内容不是本次合成。

## 证据 3｜裸绝对路径写进 mediaUrl 后浏览器取不到（第二处独立缺陷）

| 请求 | 结果 |
| --- | --- |
| `GET /Users/x/.omnimux-dev/browser-sessions/jk_video.mp4` | **404**（浏览器把 `/Users/...` 当同源路径解析） |
| `GET /omnimux-workflow/api/local-file?path=<encoded>` | 200，`video/mp2`/`video/mp4`，3,583,610 字节 |

原 `planClipExportDownstream` 把宿主绝对路径同时写进 `realPath` 与 `mediaUrl`，
而素材节点只用 `mediaUrl` 作为 `<video src>`（`resolveMediaPreviewUrl` 原样返回）。

## 证据 4｜真实编辑器路径与导出前置门禁（用于判定验收可复现性）

- 画布可达路径（实测）：侧栏「项目」→ 项目卡 → 双击创作页卡片 → 画布 → 工具栏 `+` → `视频合成`。
- 画布内 `video_composition` 节点已通过真实调色板新增成功，`打开视频剪辑` 可打开真实 OpenReel 编辑器，素材库成功导入真实 mp4。
- 编辑器导出硬门禁：时间轴为空时点击导出 → `toast.warning("时间轴无素材…")` 并 `return`（`Toolbar.tsx:205` / `:289`），**不派发任何事件、不发起任何请求**。因此"素材库有素材"不等于"可导出"，验收必须先向时间轴放入片段。

## 判定导出结果与当前合成一致的具体依据（验收标准）

1. `POST /omnimux-clip/api/projects/<projectId>/save-export` 返回 2xx，`body.path` = `<DSH_HOME>/omnimux/clip/exports/<projectId>.mp4`，`body.bytes` = 本次编码字节数；
2. 该文件 mtime 晚于本次点击导出，且大小 = `body.bytes`；
3. 下游素材节点 `realPath` = 该 path，`mediaUrl` = `/omnimux-workflow/api/local-file?path=<encoded 同一 path>`；
4. 浏览器请求该 `mediaUrl` 返回 200 且 `Content-Type` 为 `video/*`；
5. 同一合成节点重复导出复用同一节点（节点数不增），其 `duration`/`size`/封面随本次导出刷新；
6. 画布保存并重新载入后再导出，仍复用同一节点。

本文件即"验证先于端到端测试"的实机预演证据。
