# 创作画布视频合成导出：下游成片节点内容与当前合成不一致

## 现象（用户可复现）

创作画布中，`video_composition`（视频合成）节点进入编辑态后执行一次导出：

- 下游确实新增/保留了一个视频素材节点；
- 但该节点播放的不是本次合成结果。

## 目标与可测验收标准

一次画布导出后必须同时满足：

1. `POST /omnimux-clip/api/projects/:id/save-export` 返回 2xx，响应 `path` 指向本次导出的文件；
2. 下游素材节点 `realPath` 等于该 `path`，`mediaUrl` 是可被宿主解析的媒体 URL（`/omnimux-workflow/api/local-file?path=…`），浏览器请求返回 200 且 `Content-Type` 为视频；
3. 同一合成节点重复导出复用同一个下游节点（不新增重复节点），并刷新其封面/时长/分辨率；
4. 画布保存并重新载入后再次导出，仍复用同一节点；
5. 导出字节无法落盘时必须显式失败，不得创建指向其它文件的节点。

## 用户关键操作旅程

画布 → 双击「视频合成」节点 → 编辑器编辑时间轴 → 导出 → 关闭编辑器 → 下游「视频合成_成片」节点可直接播放且内容为本次编辑结果 → 再次导出 → 下游节点被复用且内容更新。

## 根因

1. 画布导出把整段视频以 base64 塞进 JSON body；宿主 `readJsonBody` 默认上限 8 MiB，真实合成必然超过 → 400 → 客户端 `persistExportBlobToHost` 返回 `{}`。
2. `export-runner.ts` 在持久化失败时回退到进程级全局 `window.__openreelExportPath`（上一次手动导出的任意路径）或一个解析不了的相对 URL，节点因此指向非本次合成的文件。
3. `planClipExportDownstream` 把宿主绝对路径直接写进 `mediaUrl`，浏览器按同源路径请求该绝对路径 → 404。
4. 复用分支只连边不更新节点数据；且 `persistSanitize` 会剥掉 `realPath`，使复用判据在重载后永久失效 → 每次导出都新增重复节点。

## 方案

- 传输层：画布导出改走 `application/octet-stream` 原始字节上传，宿主流式落盘到 clip 临时目录后原子改名到 `<DSH_HOME>/omnimux/clip/exports/<projectId>.mp4`；JSON/base64 通道保留兼容。
- 客户端：画布模式不再读取 `window.__openreelExportPath`；落盘失败即抛错，不创建节点。
- 画布：新建节点 `mediaUrl` 使用宿主媒体 URL；复用判据加入 `origin=clip_export` + `sourceCompositionNodeId` 稳定标识；复用分支输出 `nodePatches` 刷新封面/时长/分辨率（无变化时不产生 patch，避免脏文档）。

## 验收证据

- `pnpm --filter omnimux-clip test`（含新增导出上传路由测试）
- `pnpm --filter omnimux-workflow test`（含下游 planner 测试）
- 开发版真机：画布导出后下游节点可播放本次结果（截图 + 网络/文件证据）

## 边界

不改动官方 DSH；不改动 Motion/Aurora 导出链路；不重构 `persistSanitize` 的既有可移植性规则。
