---
title: "hmr — Hub WebSocket 热更新"
id: "contract-hmr"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-06"
updated: "2026-09-06"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# Hub WebSocket 热更新

OmniMux 使用现有 Hub 事件 WebSocket 传输客户端热更新。插件的 `cordis.patch.yml` 禁用官方 `client-hmr` 行，仅改变该行的启用状态，不替换用户的 Hub 配置。按安装合同，`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 排在 `omnimux` 之前。

## 装配与生命周期

Host 在 Web 服务就绪后通过公开 `loader.import()` 调用官方 HMR `apply`，复用其文件变化检测和 500 ms 轮询。官方 watcher 仍注册 `/plugins/events` 路由，但浏览器模块图不加载原生 HMR 客户端，因此不会建立该 SSE 长连接。无 Web 服务时不安装此注入。

`clientModules.onRebuilt` 经 Hub 事件总线广播 `omnimux:hmr:rebuilt`。浏览器使用官方 Loader/modules 服务串行失效缓存、预取模块、卸载旧 fiber 并重新挂载；样式按插件 ID 清理。队列与 revision 状态跨 Hub client 自身重载保留。

连接恢复时，客户端通过受现有鉴权和本地 Origin 约束的 `/omnimux/hmr/revisions` 查询版本，补齐超过事件缓存期限的变化。查询期间收到的新通知优先于过时查询结果。Host HMR 实例重新挂载会改变 epoch，客户端整页刷新以重新加载启动模块图；同 epoch 的普通 rebuild 和断线补齐不刷新整页。

`__OMNIMUX_BRAND__.hmrTransport` 是派生运行标记，不是用户设置。无需额外 CLI overlay 或覆盖现有配置。用户在更高层手动重新启用原生 `client-hmr` 不受支持；Host 挂载时检查双重启用并报错。

## 维护与验证

上游兼容点是官方 watcher 的公开 apply、clientModules 的 graph/artifactBaseline/onGraphChanged/onRebuilt、Loader 的 import 与客户端 fiber 卸载顺序。客户端替换顺序由 Hub 维护，因为官方客户端 reload 没有独立导出。升级底座时按 [RC 升级流程](../../.agents/skills/omnimux-rc-upgrade/SKILL.md) 复核这些接口。

行为检查使用隔离 L2 和合并后 Dev，不修改官方源码或生产 profile。依据 [插件 QA](plugin-qa.md) 执行共享 Stage 探针，并核对：

- 两个独立 Codex 会话各四个同源页面，普通请求、工作区及资产库交互正常。
- 一次真实 client rebuild 到达每页，每页应用一次且 timeOrigin 不变。
- 超过事件缓存期限的断线恢复可补齐版本；Host 重启后页面恢复新 epoch。
- 默认插件装配禁用原生客户端，保留非默认 Hub 配置；无需原型 overlay。

#643 的跨会话对照在本机显示：WebSocket 两轮八页请求均成功；原生 SSE 下只有六页载入，普通请求超时；恢复 WebSocket 后八页恢复。该结果支持同源连接资源耗尽的判断，不等同于对所有浏览器内部实现的证明。
