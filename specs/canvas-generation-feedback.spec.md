# #1759 画布生成即时反馈

## Objective
用户明确要求生成/编辑图片视频时，已提交请求立刻显示「等待生成工具启动」卡；只有真实生成工具启动才显示生成中。成功原位显示真实媒体，多图保留同任务归属；失败、取消、无工具调用结束均为可见终态。激活画布不等于请求生成。

## Acceptance criteria
1. 画布模式明确生成/编辑文字经原生提交创建 pendingSubmissions 后，同步绘制 pending；仅按钮点击且未提交、busy、附件未就绪或普通问题不创建任务。
2. 使用真实 session/request RPC ID 匹配 admission，绑定 turn/tool identity，重复事件幂等；切换会话隔离，无串单。
3. 真实生成 tool/start 后 running；成功 tool/end 携带媒体结果时替换同任务卡，不伪造进度、时间或启动；失败/停止/取消可见。回合结束未调用工具标记未生成。
4. 模型优先调用复用画布上下文或模式提示，条件限定明确生成意图；保留正常问答、不增加模型路由、不探测模型API。
5. 同任务工作树真实浏览器点击原生/生产提交桥、观察状态，确认 DOM 正尺寸及截图；记录模拟Host事件与真实模型执行的区别。

## 联合验收补充（#1756 + #1759）
- 仅评论正文明确生成且附件ready后可原生提交；冻结文件引用按session/attachmentId/name/bytes匹配，标题不参与意图识别。
- pending先于ready时等精确快照通知重新判断，重复通知仅一卡；首次提交时非画布的请求不因后续打开画布被补收，首次为画布的不因切换tab丢失归属。
- 保存视频仅从真实成功工具结果的精确绝对MP4路径读取；复用公开workspaceFiles.readAll，完整RpcResult校验与32MiB上限，卸载取消并释放Blob，失败可见且不得重发生成。
- 联合实现仅整合至1759工作树，1756源树不变。原生composer装配验证、模拟传输组件验证、真实文件读取和真实生成服务证据分别标注；不合入主干或部署。

## 原生侧栏准入修正（2026-09-14）
- 已有原生失败记录表明新版 betterSidebar 快照不承载主侧栏 panelOpen/splits；准入请求时优先读取公开 sidebarRight.active()/isExpanded()。
- active.kind 判断业务类型，active.id 保留为 surface.instanceId；关闭、无 mounted/无 active、其他 kind 不得被旧版残留 true 覆盖。仅公开 API 不存在时使用原 legacy 快照。
- sidebarRight 使用独立可选注入及生命周期释放，不改变布局、geometry、导航参数或冻结的 generation-feedback/intents/index。
- 先最小生产修正，再以已存失败 snapshot 重放确认，随后限定 workbench-context 回归覆盖打开/关闭/无 mounted/其他 kind/陈旧 legacy/会话切换/纯 legacy。原生浏览器复验仍由独占负责人执行，本次 Node 重放不替代原生验收。

## 原生文件读取依赖修正（2026-09-14）
- index媒体注册区域仅嵌套可选 `remote`/`remote.workspaceFiles` 注入，在声明子服务的作用域取得reader；无子服务时图片tab照常注册，视频readFile明确拒绝。
- reader闭包保持session/path/signal及RpcResult原样转发；scope释放按身份清空，旧清理不撤销新能力；tab注册归所属inner生命周期。
- 先验证生产注册回调的声明/缺席/就绪/释放，再固化限定Node回归；不运行构建、浏览器、全套或收费模型。原生Remote字节hash另由父协调。

## Commands
- `node --test plugins/omnimux/src/client/media-viewer/*.test.js`
- `pnpm --filter omnimux test`
- `pnpm verify:stages`
- `git diff --check`
- 浏览器验证使用 ego-browser 或仓库 worktree-web-qa 导出能力，动态端口、自清理，禁止共享 Dev。

## Project Structure
`plugins/omnimux/src/client/media-viewer/`：现有状态与卡片；`composer-add/AttachmentSubmitBridge.jsx`：现有提交捕获与输入有效性；`client/index.js`：生产安装；`workbench/contract.js`：现有上下文投影；测试同目录；证据父 `.agent-reports/canvas-generation-feedback/`。

## Code Style
复用 ES module、React hooks、纯函数与 store subscription：`const state = useSyncExternalStore(store.subscribe, store.getSnapshot)`。关键请求对象用 JSDoc 标注，既有官方 token，不引入依赖、平行路由、计时假进度。

## Testing Strategy
先 Code 再 Verify，再固化 Test。真实浏览器挂载生产组件与提交桥，fixture仅代替外部宿主传输；测试覆盖正向、拒绝/普通问题、session隔离、RPC去重、out-of-order终态、失败取消、多个媒体与无工具回合。报告区分UI模拟事件验收与真实供应商生成，未执行项目不标通过。

## Boundaries
始终仅改本任务工作树；遵守现有生成事件/原生提交契约；展示等待与运行区别；先演示后用户确认。
先问：超出既定业务范围、增加付费或外部权限。
绝不：合入、Dev/Prod部署、官方源码/安装包修改、其他树写入、工具guard拒绝后改写命令绕过。Spec允许未提交；与1756重叠文件交父协调，不改其树。

## Plan
调查真实 event seam → 最小状态/生产连接/展示 → 隔离浏览器验证 → 单测与静态检查 → 独立评审并出可演示证据，保留未合入状态。

## Documentation impact
本规格承载用户可见状态语义与测试边界；不修改公共模型协议或仓库长期合同。
