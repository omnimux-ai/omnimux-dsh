# 规格：Dev 开发版更新验收分级与一键解锁基础设施 (Issue #2812)

## 一、背景与目标（Objective）
在 OmniMux 桌面端开发与模型上新过程中，由于架构设计上的三重机制（Node 宿主模块级静态单例驻留、浏览器 localStorage 10 分钟强缓存、创作画布输入兼容性过滤），导致代码物化后开发者在界面上无法直观看到新能力生效。
本功能旨在：
1. 建立标准的《Dev 更新验收三级分级规范》，并在 Agent 对话中强制显式声明验收层级；
2. 构建经过严格安全核验的「一键解锁与平滑重启工具」（`scripts/dev-app-unlock.mjs`），在获得用户明确批准后一键击穿缓存锁并重载宿主。

## 二、Dev 更新验收三级分级规范
- **Tier 1 (纯前端轻量刷新)**：纯 CSS 样式、React 页面布局、局部按钮或文案改动。操作：按 `Cmd + R` 即刻生效。
- **Tier 2 (深度契约与宿主重载)**：涉及模型契约（YAML）、Node 宿主路由、全局 Seam 扩展。操作：必须重启 Node 宿主 + 清除前端 `localStorage`。**必须由 Agent 向用户明确请求批准**，获得授权后一键执行。
- **Tier 3 (业务输入兼容性自检)**：多模态输入槽位过滤（Hide, Don't Grey 规则）。操作：提示用户在符合输入规格的节点类型下验证（如纯文案节点）。

## 三、一键解锁工具实现规范（`scripts/dev-app-unlock.mjs`）
- **安全第一**：仅允许针对 `/Applications/OmniMux Dev.app`，禁止强杀进程，采用 AppleScript 发送优雅退出信号。
- **缓存清除**：支持连接 CDP 并在页面上下文中移除 `omnimux.canvas.catalog.cache`。
- **平滑重启**：安全退出后重新拉起 Dev App，轮询直到 API 端点或 CDP 就绪。
- **支持仅探测模式（--probe）**：不执行任何副作用，只输出当前运行进程 PID、端口、启动时间与缓存状态。

## 四、测试与验收
- 编写 `scripts/dev-app-unlock.test.mjs`，通过 mock 进程环境验证安全拦截与参数分流。
