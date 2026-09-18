# 规格：修复独立应用生成假成功与状态注释泄漏并打通工作流真实调度

## 1. 任务背景与核心目标
- **关联 Issue**: #2357
- **背景现状**:
  1. 用户在「手机与网页交互实机演示」（`app-creatify-app-demo`）等独立应用中点击「立即生成」按钮后，并未触发后台真实模型计算；前端由于未连接真实服务端调度桥，降级触发了伪造逻辑，直接将模板自带的 15 秒官方演示样片当成生成产物塞入历史任务列表；
  2. 任务卡片状态栏漏排开发注释，在前端 DOM 渲染了 `// exempt-ui04: 历史存量待迁移为矢量SVG`；
  3. 服务端缺少 `/omnimux-apps/api/apps/:appId/executions` 路由挂载，且 `prepareAndInjectWorkflowSnapshot` 在 `manifest.workflowBinding.snapshot` 为空时未从 `catalog/presets/${appId}.workflow.json` 读取真源快照。

- **核心诉求与预期成果**:
  1. 修复 `AppTab.jsx` 界面状态标签与错误文本中泄漏的代码注释，规范化状态指示与徽标；
  2. 在 `prepareAndInjectWorkflowSnapshot` / `executeAppWorkflow` 中增加对预设工作流快照文件（`plugins/omnimux-apps/catalog/presets/${appId}.workflow.json`）的自动读入与容错装配；
  3. 服务端挂载真实的应用执行与轮询 HTTP API 路由：
     - `POST /omnimux-apps/api/apps/:appId/executions`：启动无头执行；
     - `GET /omnimux-apps/api/apps/:appId/executions/:executionId`：轮询任务执行状态；
  4. 改造 `AppTab.jsx` 前端生成链路：移除无条件回退到演示样片的假逻辑；发起真实异步任务并执行真实轮询对账，当状态变更为 `completed` 时回显真实视频/媒体产物，失败时提示真实报错；
  5. 补齐端到端与单元测试，确保质量环全绿。

## 2. 关键设计契约与架构分层

### 2.1 界面修复 (UI & Presentation)
- 清除 `AppTab.jsx` 中所有行内非 JSX 注释：
  - 任务卡片状态：`task.status === 'completed' ? '✓ 生成成功' : task.status === 'failed' ? '✕ 生成失败' : '⏳ 正在生成...'` 后方泄漏的注释文本；
  - 表单错误文字：`{error}` 区域后方泄漏的注释文本。
- 确保 UI 符合 `design.md` 规范，杜绝文本泄漏。

### 2.2 预设工作流快照装配 (Snapshot Hydration)
- 当应用清单中的 `manifest.workflowBinding.snapshot` 为空时，从 `catalog/presets/${appId}.workflow.json` 读取该预设应用的 DAG 结构；
- 对节点与连线进行参数注入：
  - `product_image` -> 注入 `node-slot-product-image`
  - `copywriting` -> 注入 `node-slot-copywriting`
  - `voice` -> 注入 `node-slot-voice-tts`
  - `aspect_ratio` -> 注入视频生成节点参数及画面比例设置。

### 2.3 执行桥与 HTTP 路由 (Execution Bridge & Routes)
- 暴露标准的 WebServer 路由或通过 `ctx.inject(['webServer'])` 挂载：
  - `POST /omnimux-apps/api/apps/:appId/executions`：
    - 入参：`{ version, inputs }`
    - 响应：`{ executionId, jobId, status, createdAt, ... }`
  - `GET /omnimux-apps/api/apps/:appId/executions/:executionId`：
    - 响应：`{ executionId, status, progress, artifacts, error }`

### 2.4 前端异步轮询状态机 (AppTab Polling Machine)
- 点击生成 -> 创建本地任务记录（`running`） -> 发送 `POST /executions` -> 获取 `executionId`；
- 启动轮询定时器（每 1000ms 一次，上限 120 次）：
  - 遇到 `COMPLETED` -> 提取成片 URL 并更新为 `completed`；
  - 遇到 `FAILED` -> 提取 `error` 并更新为 `failed`；
  - 若超时仍未收敛 -> 标记为超时失败；
- 绝不使用写死的官方样片掩盖真实的执行结果。

## 3. 验收标准与质量门禁 (Acceptance Criteria)
- **AC-1**: `AppTab.jsx` 源码与渲染 DOM 中彻底清除 `// exempt-ui04` 文本；
- **AC-2**: 预设应用在缺少内联 snapshot 时能够自动从 catalog/presets 补齐并成功注入用户输入参数；
- **AC-3**: `/omnimux-apps/api/apps/:appId/executions` 路由在启动生成后返回合法的 200 响应与 executionId；
- **AC-4**: 轮询路由能够如实反馈任务状态，前端任务面板根据真实状态响应流转；
- **AC-5**: 所有自动化单测、集成测试与质量门禁校验 100% 通过。
