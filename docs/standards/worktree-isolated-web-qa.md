---
title: "worktree-isolated-web-qa — 工作树隔离环境 Web 自动化验收标准"
id: "standard-worktree-isolated-web-qa"
type: "standard"
status: "living"
authority: "L1"
date: "2026-09-13"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# worktree-isolated-web-qa — 工作树隔离环境 Web 自动化验收标准

本标准规范智能体在独立任务工作树（Git Worktree）开发过程中，如何不依赖桌面客户端外壳应用、不污染统一公共环境，自主启动轻量后台进程并完成真实网页端界面验收。

## 1. 核心架构原则

1. **零桌面外壳依赖（No Desktop App Required）**：
   - 官方 DeepSeek Harness 核心为基于进程的网页数据服务。桌面版仅为外层包裹壳。
   - 验收直接驱动核心网页进程服务，禁止启动完整桌面应用。
2. **零公共环境污染（No Profile Contamination）**：
   - 严禁将未合并的开发分支代码物化至 `~/.omnimux-dev` 或生产环境。
   - 测试运行于工作树本地代码与内存沙箱中，保证各任务之间完全隔离。
3. **系统动态端口（Dynamic Ephemeral Ports）**：
   - 彻底废弃旧版固定端口池模式（44201–44299）。
   - 网络 HTTP 服务与无头浏览器调试端口统一使用 `port: 0`，由操作系统动态分配当前可用端口，从根源杜绝端口争抢与冲突。
4. **随测随启、测完即焚（Ephemeral & Self-Cleaning）**：
   - 服务仅在验收执行期间启动，用例执行完毕后立即主动关闭所有子进程与网络监听。
   - 严禁留存常驻后台守护进程或僵尸进程。
5. **真实渲染留证（Real Rendering & Visual Evidence）**：
   - 在真实无头浏览器中完成 DOM 树布局计算、样式注入与按钮交互。
   - 输出完整的 PNG 图像证据与格式化 JSON 报告，归档于 `.workbuddy/evidence/worktree-qa/`。

## 2. 标准命令与使用方式

在任意任务工作树下直接运行：

```bash
# 执行指定业务板块验收
node scripts/worktree-web-qa.mjs accounts
node scripts/worktree-web-qa.mjs inspiration
node scripts/worktree-web-qa.mjs assets
node scripts/worktree-web-qa.mjs workflow
node scripts/worktree-web-qa.mjs publish
node scripts/worktree-web-qa.mjs analytics

# 全量板块一键闭环验收
pnpm test:worktree-web
# 或
node scripts/worktree-web-qa.mjs all

# 自动化单元测试
pnpm test:worktree-web:unit
```

## 3. 验收断言基线

单次运行必须逐项满足以下硬性断言方可判定合格：
1. `bundle-client-code`：客户端入口文件编译成功，无语法与依赖缺失；
2. `ephemeral-server-listen`：动态 HTTP 端口成功绑定；
3. `ephemeral-cdp-listen`：无头浏览器调试端口成功分配并接入；
4. `runner-page-ready`：页面运行沙箱与工作台 API 成功初始化；
5. `sidebar-entry-clicked`：侧边栏按钮存在且成功触发点击事件；
6. `stage-content-rendered`：目标 Stage 容器元素成功挂载到 DOM，且几何尺寸 `width > 0` 且 `height > 0`；
7. `screenshot-png-verified`：捕获有效的 PNG 图像，字节数 > 0 且图像头校验合法。
