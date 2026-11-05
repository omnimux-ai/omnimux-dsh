# dsh-workflow 架构

> M1 脚手架 + 画布壳阶段。承接 `research/canvas-spike/SPIKE-REPORT.md`（可抽取性验证：高）与架构师方案 v2。

## 1. 三层架构 + 四区地图

```
┌────────────────────────────────────────────────────────────┐
│ ① CLIENT 区（src/client/，宿主 React 18 树，lib/client.js） │
│   sidebar-entry.js     侧边栏「工作流」条目（32/14/14 规格） │
│   WorkflowStage.jsx    一级页面 chrome（shell.overlay slot） │
│   CanvasBridge.jsx     ★ island 桥：DOM 容器 + plain props  │
├──────────────── React 版本边界（硬规则见 §2）───────────────┤
│ ② CANVAS ISLAND 区（src/canvas/，自带 React 19.2.8，        │
│    lib/canvas.js 懒加载，IIFE global __omnimuxWorkflowCanvas）│
│   hooks/useCanvasBoot  工作区水合 + catalog（App 只做 chrome）│
│   editor/              ReactFlow 壳；剪贴板/右键在 hooks     │
│     └ utils/           连接校验链（Gxgen 逐行移植）          │
│   store/canvasStore.ts 文档态（Graph+History）；执行态另店   │
│   nodes/registry.ts    ★ 扩展点① 节点类型注册表              │
│   theme/               --wb-* 主题变量层（映射 --dsw-*）      │
│   bridge/apiClient.ts  同源 fetch → /omnimux-workflow/api/*  │
├──────────────── HTTP /dsh-workflow/*（同源）────────────────┤
│ ③ HOST 区（src/workflow/ + src/projects/ + src/http/ +       │
│    src/index.ts，dist/index.js，零运行时三方：zod 打进 bundle）│
│   http/helpers         sendJson / 1MB body / loopback 写校验 │
│   workspace/           WorkspaceStore + ProjectAssetsStore（assets.json 独立 rev） │
│   routes/              组装器 canvasRoutes + 静态/工作区/项目资产/执行/媒体 │
│   projects/            本地项目库（委托进同一 prefix）        │
│   executors/registry   ★ 扩展点② 执行器注册表                │
│   seam/gateway         ★ 扩展点③ GenerationGateway（mock）   │
└────────────────────────────────────────────────────────────┘
磁盘：$DSH_HOME/omnimux/workflow/{workspaces,executions,media}/（唯一可写区）
共享：src/shared/（纯类型 + 路由常量 + SSE 协议，host/canvas 双向 type-only）
```

## 2. React 版本边界硬规则（方案 α：React 19 island）

**两棵 React 树永不交换 React 元素、ref、context、组件类型。**
桥接只允许：DOM 节点 + plain object props + 普通回调函数。

- island 的 react/react-dom 19.2.8 打进 lib/canvas.js（esbuild 不 external）
- 宿主 chrome 维持 React 18 external（ModuleLoader 解析）
- 双 React 同 document 共存是 micro-frontend 成熟实践：hooks/fiber/dispatcher
  状态为各 React 模块实例私有，互不可见
- antd Modal/Drawer 的 portal 目标 document.body 由 island 自己的 React 19 渲染，无碍
- `--dsw-*` CSS 变量是 DOM 层继承，跨 React 版本正常工作（暗色跟随）
- React DevTools 显示两个 root 属预期

**α 验证状态**（M1，双 React 验证页实测：React 18.2 宿主树 + React 19 island 同 document）：
1. ✅ 双 React 同 document 挂载：宿主 React 18 计数器/受控输入与 island 同时工作，事件系统互不干扰，全程零 console 错误
2. ✅ xyflow 交互：节点尺寸正确（325px）、有效拖线成边、环检测拒绝并 toast、框选/缩放可用
3. ✅ antd（Input/Select/Button）在 island React 19 内正常渲染与受控输入（dnd-kit 未引入，M2 拖拽面板再验）
4. ✅ `body[data-ds-dark-theme]` 切换 island CSS 变量跟随（--wb-bg #F7F8FA→#141416、画布底色、文本色实测变化）
5. ✅ island 生命周期：unmount 干净、remount 后工作区从 host 快照恢复（2 节点 + 1 连边）
6. ✅ 保存闭环：island → PUT（乐观锁）→ host version 0→1 → 状态栏「已保存」
7. ⏳ React DevTools 双 root 检查与 200 节点性能基线 —— 需真实 dsh 宿主环境（M2 前置项）

## 3. 状态分层规则

1. **UI 态**（组件内部 useState）：纯交互偏好，永不落盘
2. **画布文档态**（canvasStore）：用户创作唯一事实源（client 侧），保存到 Host；乐观锁冲突（409）提示用户
3. **执行态**（M3 executionStore）：Host 侧 Scheduler 是唯一事实源；client 只做 SSE 回填的只读镜像
4. Host 侧 store 不 import 任何 client/canvas 代码；反向亦然——唯一通信面是 HTTP 契约（src/shared/）

## 4. 构建流水线

| 脚本 | 输入 | 输出 | 要点 |
|---|---|---|---|
| build-host.mjs | src/index.ts | dist/index.js | platform node，esm，zod 打包（运行时零依赖） |
| build-client.mjs | src/client/index.js | lib/client.js | cjs + ModuleLoader 包装，react external |
| build-canvas.mjs | src/canvas/index.tsx | lib/canvas.js | iife + global，react 19 打包，minify，css text loader |

**生成物不入库。** `dist/` 与 `lib/client.js` / `lib/canvas.js` 由 `npm run build` / `prepare` / `sync-to-app` 写出，gitignore。Git 真相是 `src/`。禁止把 minify bundle 当第二套产品源。

类型检查独立于构建：`tsc -b --noEmit`（tsconfig.canvas + tsconfig.host 双 project references）。

懒加载机制：首次打开画布 → `GET /omnimux-workflow/api/manifest`（canvas.js sha256 前 16 位）→ 注入 `<script src="/omnimux-workflow/canvas.js?v=<hash>">`（hash 变化则替换旧 script，禁止复用过期 IIFE）→ 全局 `__omnimuxWorkflowCanvas` 可用 → CanvasBridge 调 `mountCanvas(el, props)`。Host 对该 JS 响应 `Cache-Control: no-cache`。Dev App 仍见旧胶囊时先硬刷新。

打开画布的会话导航：官方 DSH `0.1.7` 起 `sessions.open` 已移除，主区会话切换归 `uiWorkspace.openSession(id)`（旧宿主才回退 `sessions.open`）。画布 tab 只能落在右栏已挂载的会话上：`sidebarRight: no session surface is mounted` 是宿主拒绝、不是排队，所以 `activateProjectCanvas` 先切会话，再等 `sidebarRight.mounted` 变成目标会话后 openTab（失败时不静默，调用方给可见错误）。接缝实现见 `src/client/projects/projectCanvas.js` 的 `resolveSessionNavigation` / `focusSessionForCanvas` / `waitForMountedSession`。

## 5. Gxgen 移植溯源（M1 口径）

| 模块 | 来源 | 口径 |
|---|---|---|
| canvasConnectionUtils / canvasConnectionStructure / connectionConfig / connectionValidator / canvasInputMutationGateway | Gxgen pages/CanvasEditor/utils/ | 逐行/窄化移植（spike 验证） |
| canvasStore Graph slice | Gxgen store/canvasStore.ts | 同构（含 onEdgesChange 删除走 gateway） |
| MaterialNode / CanvasNodeHandle / AnimatedEdge / Toolbar / CanvasEditor | Gxgen components/ | 骨架移植，服务耦合 stub 化 |
| @gxg/shared/canvas materialTypes | packages/shared/src/canvas/ | 内联（376 行零依赖模块） |
| 未搬 | Timeline/Overlay/Playback、fabric、i18n、Supabase、云存储、AI 面板 | V1 裁剪清单 |

## 6. 红线遵守

- 插件源码只在 `plugins/dsh-workflow/` 内；Gxgen 源码只读；不进官方 harness packages/
- 不 import hub（omnimux）、不自带 HTTP client、不存 provider keys
- 运行时 I/O 只写 `$DSH_HOME/omnimux/workflow/`；写路由 assertLocalWrite（loopback only）
- host 运行时零三方依赖（Node builtins + 打包进 bundle 的 zod）
