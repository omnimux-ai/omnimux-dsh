# Issue #2591 首页 AI 应用点击修复

## 目标与成功标准
点击首页「巨型商品撞屏与荒诞追逐」的「打开应用」或卡片正文，复用既有工作台导航显示 app-creatify-chasing-product 的 AI 应用页面。修复仅限点击导航，不生成媒体、不支付。

验收旅程：
1. 完整应用、已选择工作区且有会话：首页目标按钮可点击；点击后 AI 应用标题与配置表单可见，真实 DOM 宽高均大于零，右侧工作台展开，无虚假的 omnimux-apps Product Stage。
2. 重复打开目标应用、从另一个应用切换、关闭后重开，仍指向正确 appId；既有 manifest/meta 与应用草稿不丢失，不重复低层打开或广播。
3. 无有效会话或服务未就绪时，不宣称打开成功，不产生幽灵页面；复用既有提示或在首页给可理解失败提示。
4. 原生 surface 与注册映射必须由源码/运行证据确认；不能把静态 HTML 或 Stage 夹具当成完整应用验收。

## 新用户基线
依赖正式安装的 hub/workflow 与宿主侧栏服务、有效工作区会话，不依赖开发机私有服务、Dev 配置或真实模型凭据。导航不自动创建会话或发起生成；缺会话沿用工作台提示。浏览器使用任务工作树私有 ui 合成配置及动态端口，验证加载本树产物。

## 命令
- `git diff --check`
- `node --test plugins/omnimux-workflow/src/client/projects/projectCanvas.test.mjs plugins/omnimux-workflow/src/client/projects/appTab.test.mjs`
- `node --test plugins/omnimux/tests/e2e/fix-card-open-app-tab.e2e.test.mjs plugins/omnimux/tests/e2e/card-open-app-linkage.e2e.test.mjs`
- `pnpm verify:stages`
- 构建遵循各插件 package.json 既有 build 命令；完整应用调用 `scripts/test-env-bootstrap.mjs` 的 startTestEnvironment，最终 cleanup；ego-browser 验证真实点击。

## 项目结构
- hub 首页：plugins/omnimux/src/client/session-guide/templates/ExploreTemplatesSection.jsx
- hub 统一导航：plugins/omnimux/src/client/workbench/sidebar-controller.js
- workflow 应用入口与注册：plugins/omnimux-workflow/src/client/projects/projectCanvas.js、plugins/omnimux-workflow/src/client/index.js
- 应用呈现：plugins/omnimux-workflow/src/client/projects/AppTab.jsx
- 本任务证据：.agent-reports/home-app-click/implementation.md 与同目录截图/结构化运行证据。

## 代码风格与方案
沿用各文件既有 JavaScript/JSX 格式；跨插件只使用公开 window seam，不 import 私有模块。既有调用样式为 `window.__omnimuxWorkbench.open({ tabId, title, path })`，必要时最小扩展 payload 以保留应用身份。先确认根因，再决定最少文件改动；不新建路由或覆盖宿主 surface。无视觉重设计，复用 design.md 与 UI 指南的现有组件和令牌。

## 测试策略与阶段
Spec → Code → Verify → Test → Green。先提交本规格再改业务代码；先真实浏览器观测与截图，再按已观察 DOM 加固需要的测试。既有静态字符串测试仅作为回归，不当 E2E。自检记录接口/导入/重复实现一致性；独立 CLI 审查与 QA 由主理人安排。

## 边界
总是：只写本任务工作树，保留实际错误和未覆盖项，核对产物身份、动态端口与清理回执，跑最小回归与 verify:stages。
先问：越过点击修复范围、凭据/付费、共享环境或仓库边界。
绝不：修改官方/其他仓库/主检出、推送合入、操作共享 Dev、复制共享凭据、静态伪 E2E、生成媒体。

## 调查依据与开放问题
主仓 source-investigation.md 确认首页重复 open 与错误 Stage；dev-reproduction.md 证实 app 落 bottomSplits 且 panelOpen=false。当前固定基线 index.js 的 APP_TAB_ID 注册为 hidden:false，与需调查的运行映射并不能直接等同。需确认实际原生 surface 分派条件与完整应用测试装配，再实施，不猜修。

## 第二轮差异验证与最小范围
- 使用已有 tooling/private-app-env.mjs 安装本树插件及未改字节的发行 sidebar；干净启动正常不是修复通过依据。
- 在私有完整应用使用宿主真实插件卸载/重载生命周期（不替换 openTab 或 surface 实现）验证旧服务引用、注册注销与重绑；记录与故障现场的同异。
- 首页直接复用 hub 统一工作台导航，最小透传 id/meta/extra 保留应用身份，检查注册与打开结果；不扩大修改项目库/发布流程的同步打开契约。
- 若生命周期缺口确证，服务绑定和标签注册的清理应属于注入作用域，旧作用域清理不得清除更新的实例。
- 真实按钮回归覆盖缺会话提示、首次打开、切换/重复/关闭重开、服务卸载期间失败反馈和重装后恢复；不点生成，核对草稿。

## 第一轮正式退修（QA44 完成后）
- M1：缓存 JSON 损坏但可写时用当前 manifest 恢复；storage getter/getItem/setItem 失败必须显示失败且不调用导航或成功广播，不建立未经证明的无缓存降级。
- M4/M6：捕获发起时会话；provider、会话、注册检查与打开成功确认前不关闭旧 details/stage/seed。异步打开期间 provider 或会话变化不得清理新界面或提交焦点；仅清理本次捕获的旧空 Files，不误关用户文件或新 seed。
- M7：按本次正规化安装值清理原 window，保留 owner 门禁与外部覆盖保护。
- M2/M3/M5 按当前 Cordis/string id 契约保留详细反证，不恢复根 ctx.effect，不扩展数字 id。
- 原 108 定向测试与新增边界测试、两插件构建、diff 检查；旧 QA 七组只作现场基准。业务改后最终独立浏览器 QA 仍待执行，已有 tests/e2e/home-app-click.* 不删除、不改动。
- 仅本工作树本任务文件；不真实生成、不改共享 Dev/Prod/官方包、不提交推送合入。报告 fix-review-round1.md 后停写等待第二轮 CLI。

## 第二次且最后一次实际退修
- 以 review-round2-triage.md 接受范围为准，QA78 已清理解除冻结。保留全部既有失败证据与原 M2/M3 契约冲突。
- R2-H1：仓库 worktree-web-qa 模拟注入须拥有独立 effect 集合；依赖退出、重复退出、整体清理均正确释放，不借根 effect，不改生产 inner.effect。
- R2-M1：正式 wrapper 只借用任务空间；可复用 task-owned harness 必须以准备成功作硬门禁，任何前置失败不启动正式旅程，最终 finally 由所有者 finish/cleanup。
- R2-M3：05-resize 保存/恢复拥有者传入的真实原 metrics 或明确无 override；成功与失败路径都恢复，恢复失败阻止后续独立生命周期结论，不猜 scale 或尺寸。
- R2-M4：保留 session/provider 导航安全门禁，补充 session 短暂落后后追上及等待超时测试，禁止为兼容旧 mock 放松。
- 先最小调查 fullscreen left280 + viewport width 及 Close 后货架不回；仅本插件违背公开布局契约时最小修复。官方责任保留已知，不改官方源码/包，不使用 CSS 强制覆盖或新路由。mounted A-B-A 不得以 Close/reload 或 force 替代。
- Verify 使用恢复辅助 private-launch，仅私有 Host 参数 --max-http-header-size=65536，不重做默认对照、不改共享 Cookie。最终正式 prepared wrapper 七组实跑，保留新 bundle Debugger 身份、截图与最终清理证据。
- 检查原134定向测试及新增契约、必要构建和阶段门禁；报告 fix-review-round2.md 后冻结。无推送、合入、Dev/Prod、付费生成权限。

## 文档影响
本修复不改变产品功能与视觉合同；本规格与 implementation 报告记录导航修复和验证边界。如统一导航参数新增身份透传，将同步最小接口注释。
