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

## 文档影响
本修复不改变产品功能与视觉合同；本规格与 implementation 报告记录导航修复和验证边界。如统一导航参数新增身份透传，将同步最小接口注释。
