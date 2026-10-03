# #3043 隔离测试诊断

基线：d95764912。未修改官方宿主或运行中的桌面应用。诊断通过任务私有 Web profile、动态端口与 ego-browser 实际执行。

## 评论测试

- 原始聚合客户端脚本响应 HTTP 431，响应体为空；页面显示 Failed to load plugins。请求路径长 2505 字符。
- 仅向私有宿主 Node 进程增加 `--max-http-header-size=65536` 后，同一路径 HTTP 200，响应约 11.97MB；首启真实页面可显示。因此安装日期不构成“宿主过旧”的证据。
- 工作树必须先构建 Hub 的 lib/client.js；否则被安装的包没有当前客户端产物。
- 配置私有测试运行选择，不使用用户凭据，避免 Runtime 首启弹窗遮蔽宿主 Continue 按钮。
- Hub/viewer 已拆分：私有 profile 须正式安装当前工作树 omnimux-viewer，不能只装 Hub。
- 安装当前 viewer 后进入图像生成全屏，对话媒体入口与原生发送框不在可见区域。使用页面实际提供的 Exit fullscreen 按钮恢复分栏，再点击当前入口，完整原生评论保存/空正文发送/全文注入/移除流程在探针通过：1 test，1 pass，0 fail，0 skipped，约 27s。
- 入口仍有历史命名漂移（点击进入画布），正式测试应采用观察到的媒体卡 class 操作，不通过改回旧文案恢复测试；该命名漂移不在环境修复中悄悄更改。

## 生成反馈测试

- 它不是桌面包宿主测试：startFixture 使用 esbuild 构建真实页面并启动内存 HTTP 服务。
- 当前首先失败于 fixture 导入已迁走的 Hub MediaViewerTab.jsx：Could not resolve。生产查看器现位于 omnimux-viewer/src/media-viewer。
- 旧浏览器测试混合状态语义与已退役顶部任务卡展示要求。状态归属、真实图/视频读取、取消保留部分结果、会话隔离等须保留；不得恢复旧 UI 只为通过断言。
- PM 只读核定报告：主检出 .agent-reports/issue-3043/pm-contract-audit.md。后续修复状态与测试覆盖需按同次浏览器证据更新。

## 状态

正式评论用例 1/1、生成反馈 4/4 已运行通过，无新增 skip。完整 Hub runner 一次运行 3057/3057，0 fail、0 skipped，且日志确认两个目标 E2E 真执行。独立 QA 首轮指出有效断言与隔离缺口后继续修订：readComplete 拒绝信号、sessionId+requestId 联合身份及跨会话同 ID 传输；私有构建与异常清理正在收紧。产品合规另有 FAIL：当前真实查看器仍出现越权恢复/复制原请求 UI，不将传输 PASS 宣称为 PM_SIGN_OFF。未开 PR，复验与审查后才能宣布交付。
