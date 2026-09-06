# 工作区页内目录选择

Issue：[产品 #629](https://github.com/omnimux-ai/omnimux-dsh/issues/629)；[桌面 #47](https://github.com/laozhong86/omnimux-desktop-fork/issues/47)。

用户确认 OmniMux 的 L2 与 Dev 工作区选择必须能由 Agent 在页内完成。官方自动选择器根据 Host 的 loopback、平台和 SSH 环境判断 native；本地 macOS Host 会启动系统目录窗口，即使使用者是内置浏览器中的 Agent。输入区附件选择与这个工作区入口是两个独立流程。

## 装配与边界

- 产品 L2 的正式 `start`、`restart-host` 通过同一 CLI overlay，禁用 `directory-picker-auto`，同时装配官方 browse backend 和 client surface。既有任务重新启动 Host 后使用该装配，端口和数据不变。
- shipping Desktop 在 profile 装配层使用同一组官方能力；Windows 既有可选 native 按钮及 volume admission 校验保持。桌面壳与 CLI L2 各有启动真源，不能假定一方的配置会自动应用到另一方。
- 工作区选择继续使用官方 hero/sidebar directoryFlow、目录浏览/路径输入和 workspace adoption，不新建目录浏览器或文件服务。原目录不复制或移动，目录校验与错误处理保持在原有层。
- 冻结的116文件跨域改动、Composer 附件流程、生产发布和真实付款不在范围内。

## 实施与验证顺序

1. 独立 worktree 中实现 L2 overlay 与启动/重启回归，配套桌面 profile 修改独立 PR。
2. 在新建专用 L2 中，从没有工作区的首页开始，验证目录选择、路径编辑、空目录、取消和可见错误；再验证侧栏添加工作区、创建会话及共享 `verify:live`。
3. 在既有专用 L2 应用修复，核验数据/端口保持、只装配一个目录选择流程。与 #621 协调后通过同一正式入口更新其 L2，恢复该任务的真实会话和探针前置。
4. 独立复核实际 diff、相关测试与运行身份，满足必需检查后合并两个 PR。从合并源码构建/物化 Dev 45120，执行对应 IAB 和适用 Electron 验收。
5. 保存成功及失败尝试的证据，更新 Issue，清理本任务临时资源；不得清除其他任务工作区、进程或数据。

用户已于2026-09-06明确授权本目标所需的 Issue、实现、验证、push、PR、按正常门禁合并、Dev 重启/物化/复验与安全收尾；授权不涉及生产。

## 验收记录要求

每个环境记录源码 SHA、profile、端口、Host PID/启动时间、实际加载的目录选择 surface、操作前后 workspace/session 与目录事实。真实 IAB 流程不能调用 native picker；无效、不存在和不可访问路径应有可见反馈且可恢复。取消不创建工作区/会话。共享探针必须完成并包含 runtimeProof，单测或 HTTP 200 不代替运行验收。桌面平台装配另外核验真实 Electron renderer，Windows 行为保留适用回归。
