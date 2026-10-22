---
title: "3D 导演台入口卡与截图独立节点规格"
id: "spec-3616-director-entry-card-and-screenshot-nodes"
type: "spec"
status: "active"
authority: "L2"
date: "2026-10-22"
authors: ["x", "agent"]
subsystem: "omnimux-workflow"
---

# 3D 导演台入口卡与截图独立节点规格

## 1. 目标

Issue #3616（#3289 / PR #3566 迁移后的产品收敛）。当前 3D 导演台节点把「封面截图 + 描述输入 + 打开按钮」放在同一张卡片里，关闭导演台时还会自动把当前画面写回当前节点的 `coverUrl`。用户要求：

1. 导演台节点只做入口：按参考图 2 改成「图标 + 标题 + 一句说明 + 打开导演台按钮」的空态引导卡；移除封面大图与描述输入框。
2. 导演台内每次点「截图」生成一个**新的**图片节点（material/image，带导演来源元信息），自动连线到导演台节点；连续截图产生多个独立节点。
3. 关闭导演台不再自动截图写回当前节点，当前节点不再承载任何图片。

用户旅程：画布添加「3D 导演台」→ 双击/按钮打开导演台 → 摆场并按「截图」→ 关闭后画布右侧出现该机位的新图片节点且与导演台有连线 → 再次进入截图得到第二个节点；节点卡始终只有入口信息。

## 2. 命令

- 单测：`node --test plugins/omnimux-workflow/src/canvas/bridge/directorOutputPlan.test.mjs`
- 包测试：`pnpm --filter omnimux-workflow test`
- 类型：`pnpm typecheck`
- 静态：`node --test scripts/verify-anti-slop.test.mjs`、`pnpm verify:stages`
- e2e 契约：`node --test tests/e2e/director-node-entry-card-3616.e2e.test.mjs`
- 浏览器证据：工作树内 `scripts/test-env-bootstrap.mjs` 起隔离服务 + ego-browser 截图（证据落 `docs/evidence/2026-10-22-director-node-card-3616/`）。

## 3. 结构与写入边界

| 文件 | 责任 |
|---|---|
| `plugins/omnimux-workflow/src/canvas/nodes/definitions/director.tsx` | 入口引导卡渲染；不再读取 cover/description；增加 out 端口与右侧连接桩 |
| `plugins/omnimux-workflow/src/canvas/theme/director.css` | 入口卡视觉（只消费 `--dsw-alias-*` / `--wb-*` Token） |
| `plugins/omnimux-workflow/src/canvas/components/director-panel/DirectorPanel.tsx` | 删除封面/描述接线；新增「截图 → 独立图片节点」适配器（新节点 + edge + 失败回滚） |
| `plugins/omnimux-workflow/src/director/contract.ts` | 删除 `captureCover`/`shouldCaptureCover`；新增 `addScreenshotNode` |
| `plugins/omnimux-workflow/src/director/index.tsx` | 透传新适配器，移除封面适配器 |
| `plugins/omnimux-workflow/src/director/vendor/components/canvas-director-workbench.tsx` | 关闭路径不再截图；截图成功后请求画布出口 |
| `plugins/omnimux-workflow/src/canvas/bridge/directorOutputPlan.ts` | 新增 fresh 节点参数（新 id/标题/位置），默认路径（历史构图复用）保持不变 |

## 4. 代码风格与约束

- 节点卡只用 lucide 图标与既有 Token；不写裸色值、不新增全局样式。
- 画布写入必须经纯函数 planner，先校验来源身份/修订/素材账本身份，再一次性写 nodes+edges；失败回滚到写前快照。
- 既有 `planDirectorOutput` 默认行为（同镜头复用节点、保留用户布局）不得放宽；fresh 模式只对显式传入 `freshNodeId` 生效。
- 关闭路径不再有任何截图/上传；`captureCover`/`shouldCaptureCover` 从契约删除。

## 5. 测试策略

- 单测：在既有 `directorOutputPlan.test.mjs` 追加 fresh 模式用例（新 id、新标题、新位置、禁止覆盖已有节点、拒绝 fresh+video）。
- e2e 静态契约：断言节点卡不含 cover/textarea、保留打开入口与 out 端口；workbench 关闭路径无 `onCaptureCover`；截图路径调用 `addScreenshotNode`；DirectorPanel 写入 edge。
- 浏览器：工作树隔离环境真实操作截图，保留 PNG 与结构化报告。

## 6. 边界

- 总是：先规格后代码；改 UI 必留工作树浏览器证据；保留既有保护测试。
- 先问：修改 Director 场景 schema、删除 Agent `workflow_director` 公共参数、改变历史构图复用语义。
- 绝不：在视图层遮盖数据问题；把截图写回当前节点；复用既有 `captureCover` 适配器伪装成新节点。

## 假设

关闭导演台自动回写封面是「当前节点承载图片」的唯一来源；用户要的「保存的图片进新节点」指显式截图动作，而不是每次关闭都补一张图。截图成功后新节点应带 `directorSourceNodeId/SceneId/ShotId/Revision` 与截图捕获来源字段，供后续生成/剪辑识别来源。默认「用此构图」的历史复用语义不在本次改动内。

## 证伪方式

若关闭导演台后当前 director 节点 data 仍出现 `coverUrl/coverStorageKey/coverRevision`，或节点卡仍渲染 `<img>`/`<textarea>`，或连续两次截图只得到一个图片节点、或新节点与导演台之间没有 edge，则本假设与实现被证伪。可执行检查：`node --test plugins/omnimux-workflow/src/canvas/bridge/directorOutputPlan.test.mjs`、`node --test tests/e2e/director-node-entry-card-3616.e2e.test.mjs`，并在工作树浏览器中截图核对画布节点与连线。
