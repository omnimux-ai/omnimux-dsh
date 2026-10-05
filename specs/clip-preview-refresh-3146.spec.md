# 规格：成片节点重复导出后预览不自动刷新（Issue #3146）

## 问题陈述

同一 `video_composition` 画布节点二次导出时，导出文件名不变
（`<DSH_HOME>/omnimux/clip/exports/<projectId>.mp4` 被原地覆盖），下游 成片 节点的
`<video>` 元素**不重新加载**：实测停留在 `readyState=0` / `error.code=4`
（陈旧坏文件态）；只有显式调用 `video.load()` 之后才变为可播放
（`readyState=4`、`duration=32.618667`）。

根因是**数据层缺少版本**，不是渲染层：下游节点的 `mediaUrl` 由
`videoCompositionDownstream.ts` 的 `clipExportMediaUrl(videoPath)` 生成，只含
`?path=<绝对路径>`。路径在重复导出时不变 → React 复用同一个 DOM 元素、不重设
`src` → 浏览器不发新请求 → 元素留在首次加载的失败态。导出完成后，
`reuseRefresh()` 的 `changedFields()` 也因 `mediaUrl` 与 `duration/size` 完全一致
而产出空 patch（`planClipExportDownstream` 直接返回 `null`），画布状态确实没变。

## 关键用户旅程

**J1 — 同一成片节点的二次导出（主旅程）**

1. 侧栏「项目」→ 打开项目卡片 → 进入画布。
2. 打开 `video_composition` 节点的剪辑工作台，把媒体放到时间线，点击真实「导出」。
3. 导出成功后画布上出现/刷新 成片 节点，其 `<video>` 可播放（首次导出）。
4. 再次打开同一节点、再次点击「导出」，**不做任何其它操作**。
5. 期望：成片 节点的 `<video>` 元素自动加载新文件 —— 无需用户操作、无需
   `load()`、无需刷新页面；`readyState` 达到可播放（≥1，实测目标 4），
   `error` 为空，`duration` 等于新导出的时长。

**J2 — 首次导出不回归**

首次导出仍生成 成片 节点、连线正确、可播放，`mediaUrl` 仍指向同一个
`/omnimux-workflow/api/local-file?path=…` 资源。

**J3 — 既有身份与去重不回归**

重复导出不得新增重复的 成片 节点；`origin=clip_export` +
`sourceCompositionNodeId` 的复用身份、坏连线修复、`realPath` 被
`persistSanitize` 剥离后的重载路径都保持原语义。

**J4 — 非画布导出路径不回归**

未携带版本信息的历史/外部 `output`（无 `revision`）仍产出与修复前逐字节一致的
`mediaUrl`。

## 验收标准

- **AC1（数据源）**：导出落盘后，服务端把该文件的内容身份（`mtimeMs` + `size`）
  作为 `revision` 随 `save-export` 响应返回；`revision` 在两次导出之间必然不同
  （除非文件内容身份完全相同）。
- **AC2（数据源）**：画布侧把 `revision` 写进下游 成片 节点的 `mediaUrl`
  （`…?path=<enc>&rev=<token>`），即**状态本身变化**；不得通过 DOM 操作、
  `load()` 调用、CSS 或客户端黑名单来掩盖陈旧元素。
- **AC3（复用）**：带 `rev` 的新 URL 仍能命中既有 成片 节点（按
  `origin` + `sourceCompositionNodeId`，并兼容 `?path=` 解析），不新增重复节点。
- **AC4（幂等）**：同一 `revision` 重复应用产出空 patch（`planClipExportDownstream`
  返回 `null`）；两个 effect（保存事件 / 节点数据回填）不得互相剥离 `rev`
  造成 URL 抖动。
- **AC5（真实浏览器断言，唯一通过判据）**：在隔离工作树的真实浏览器中执行 J1，
  在**不调用 `load()`** 的前提下读取下游 `<video>` 元素：
  `readyState >= 1`（实测目标 4）、`error === null`、`duration > 0` 且等于新导出
  时长。修复前该断言必须为 FAIL（`readyState=0` / `error.code=4`）。
- **AC6（回归）**：`videoCompositionDownstream.test.mjs` 既有用例全绿；无 `revision`
  时 URL 与修复前完全一致。

## 验收用例

| 用例 | 层 | 断言 |
| --- | --- | --- |
| U1 无 revision | 单测 | `clipExportMediaUrl(p)` 与修复前逐字符一致 |
| U2 有 revision | 单测 | 追加 `&rev=<token>`；`?path=` 仍可被 `URL.searchParams` 还原 |
| U3 二次导出 patch | 单测 | 同一节点第二次 plan 产出含新 `mediaUrl` 的 patch，且不新增节点 |
| U4 同 revision 幂等 | 单测 | 第二次相同 revision → `plan === null` |
| U5 身份匹配 | 单测 | 带 `rev` 的 mediaUrl 节点仍按 origin 命中，不产生重复节点 |
| U6 回填 effect 不剥 rev | 单测 | 从节点数据重建 plan 时 `rev` 保持 |
| E1 服务端 revision | 集成 | `POST …/save-export` 响应含 `revision`，且两次写入不同 |
| J1 真实浏览器 | 工作树 journey | AC5 |

## 非目标

- 不改 `omnimux-clip` 的编码/渲染管线，不改导出文件命名规则。
- 不改 `persistSanitize` 对 `mediaUrl` 的既有处理（`?path=` 形式继续原样保留）。
- 不给 `<video>` 加 `key`、不在渲染层调用 `load()`、不引入客户端 URL 黑/白名单
  （违反「fix data at its source」硬约束）。
- 不改动官方 DSH 源码，不新增产品能力，不改模型契约。
