---
title: "DSH 插件开发工程实践（蒸馏自官方 deepseek-harness）"
id: "dsh-plugin-engineering-practices"
type: "contract"
status: "living"
authority: "L1"
date: "2026-10-24"
subsystem: "global"
---

# DSH 插件开发工程实践

> 蒸馏自官方 `deepseek-ai/deepseek-harness` 仓库的 `AGENTS.md`、`docs/architecture.md`、`docs/testing.md`、`docs/development.md`（0.2.0-rc.2）。只收录**写插件时会遇到、且不会随版本过期**的规则；框架内部实现（Host/Client tsconfig 拆分、Typert 代码生成、benchmark 门、vendor 同步）不在此列。

## 一、插件即组成，不是补丁

- **没有特权核心**：模型适配器、工具注册表、会话日志、Agent 主循环都是插件。插件开发 = 把新能力挂到已有的扩展点上，而不是改别人代码。
- **三角色才是一个完整 seam**：Service Definition（接口）/ Service Provider（实现）/ Consumer（消费方，通常是一个模型工具）。加能力时先把三个角色都设计出来，只写一个不算 seam。
- **新行为挂在文档化的扩展点上**：模型 provider 挂 `ctx.llm`、模型工具挂 `ctx.tools`、shell 后端挂 `ctx.shell`、命令挂 `ctx.commands`、后台任务挂 `ctx.jobs`、文件策略挂 `ctx.fs`、拦截挂 `agent/*`/`tools/*` 事件、UI 挂 `ConversationNodeDefinition` + 渲染器。改 agent-loop 本身要先更新架构文档，不走这条路。

## 二、注册与清理

- **注册是 effect**：所有贡献走 `ctx.effect()` / `ctx.on()`，registry 的 `register()` 返回 disposer。插件被卸载时 effect 必须能完整回滚，不留全局状态。
- **每个 registry 都要有 HMR-safety 测试**：dispose 掉贡献 fiber，断言清理干净。这是硬门槛，不是建议。

## 三、会话日志是唯一事实源

- **模型可见 ⇄ 必须落日志**：发给模型的每条消息、每次工具调用、每个注入的上下文，都必须先成为 session event。新增「模型可见」输入 = 新增 session event，不能走私有状态。
- **事件分域**：durable 的用 `turn/*`、`step/*`、`system/message`、`user/message`、`assistant/*`、`tool/*`；live 的用 `agent/*`；能力策略用 `fs/*`、`tools/*`、`telemetry/*`。选错域 = 崩溃后状态不一致。
- **waterfall 监听器必须调 `next()`**：`agent/pre-step`、`agent/request`、`llm/stream`、`tools/pre-execute`、`tools/execute`、`tools/post-execute` 是 waterfall；返回了但不调 `next()` 会短路整条链。
- **SessionEventMap 只增不改**：格式成员默认 required-on-read，加字段是兼容的，改字段才需要升 `SESSION_FORMAT_VERSION`。

## 四、配置与默认值

- **部署差异走 `Config` 字段**，在 cordis.yml / profile patch 里改；`DEFAULT_*` 常量不算可配置性。协议常量、安全不变量可以硬编码。
- **显式 > 隐式**：包边界的默认值要显式走一个 `resolve(request): Spec` 步骤，不允许在 `run()` 内部用 `?? default` 偷偷兜底。
- **配错要响**：自洽的错误在加载时失败；依赖外部引用的，在最早能判定的地方失败。缺失引用静默跳过是 bug。

## 五、类型与边界

- **`strict` + `noImplicitAny`**；残留的 `any` 必须注释说明为什么不能窄化。
- **跨边界 id 用 branded type**（`Branded<B>`），不用裸 `string`，防止把 sessionId 当 toolCallId 传。
- **信任 TypeScript 的进程内边界**：不要在类型已经保证的调用处加防御性运行时校验；运行时校验只放在真正会过界的点——parser、队列、模型/工具 JSON、落盘文件、worker、进程间、网络。
- **禁止 `as unknown` / `<unknown>`**；要么用类型，要么用校验。
- **discriminated union 用 `assertNever` 收尾**；可扩展 union 走文档化的 default 分支。

## 六、测试分层（够用即可，别全量）

| 层 | 什么时候要 | 规则 |
| --- | --- | --- |
| 单测 | 非平凡逻辑、错误路径、并发 | 每个 registry 必须有 HMR-safety 测试 |
| 覆盖率 | 逐文件 100% | 覆盖不到的行当死代码删，不补废测试 |
| 真实组合测试 | 产品可见插件必须有 | 手搭 `ctx.plugin(...)` 不算；要走 Loader 启真实 cordis.yml，只 mock 外部服务/不确定输入，断言模型可见请求或用户可见输出 |
| 快照 | 模型输入/输出/协议/用户可见变化必须带 | keyless 录制回放，改模型行为同 PR 更新快照 |
| 真 API e2e | provider/模型行为 | 有 key 才跑，无 key 自跳过不拦 CI；能真跑就不 mock |
| Web 快照 | UI/渲染 | Chromium 比对，UI-only 和会话驱动分开 |

三条元规则：

1. **验证世界，不验证自报**：e2e 断言重新跑命令、重新读文件，不能靠 agent 输出里的关键字。
2. **mock 只 mock 贵或不确定的边界**（LLM、网络、时钟）；下游全用真实现，手写替身证明不了真实现的行为。
3. **测试描述行为，不描述正确性**；改行为时连测试一起改，在 PR 里说为什么。

## 七、代码卫生（写成机械规则，不靠 review）

- 文件末尾恰好一个换行，`git diff --cached --check` 守门。
- 空 `catch` 必须注释说明吞的是什么错、为什么；`try` 里只放一条语句。
- TODO 分级：`FIXME`/`TODO`/`XXX` 按紧急度。
- 注释写契约（前置/后置/不变量/调用方依赖），不复述代码、不解释控制流、不保留 review 历史；一个事实一个家，远处理由用链接。
- UI 文案走 i18n 字典，不许硬编码；本仓对应 `locales.js` + copy standards。
- 偏好维护中的依赖而不是手搓——前提是它真的删掉了自己的代码和测试。

## 八、交付纪律

- **改多少，验多少**：选最小充分检查，不要默认全量。CI 拥有全量矩阵和平台矩阵，本地不重复已经绿的东西。
- **PR 历史要刻意**：独立的改动拆 PR；在引入它的 PR 里修问题，不要等下游再补。
- **文档跟代码一起改**：受影响 README/JSDoc 同 PR 更新；文档只写现在时，一个事实一个家。
- **破坏性/外部可感知变更立刻登记**（官方对应 upgrade-guide；本仓对应 release notes / RC 验收记录）。

## 九、从官方剔除、不适用的部分

官方 AGENTS.md 里以下内容是「框架内部」或「阶段性」，插件侧不需要：

- Host/Client 双 tsconfig、tsdown 构建面、Typert RPC 生成、Node 版本矩阵、Windows/WSL 开发环境、vendor/Cordis 上游同步策略——框架自己的事。
- `pnpm` 命令全集、覆盖率门槛的 CI 拓扑、benchmark 性能门、Python SDK 发布流程——CI/发布管线的事。
- `verify-application-entrypoints`、`verify-export-jsdoc`、`verify-doc-budgets` 等仓库级 gate 脚本——官方仓库自己的守门员，本仓对应自己的 `scripts/verify-*.mjs`。

## 参考

- `deepseek-ai/deepseek-harness` 仓库：`AGENTS.md`、`docs/architecture.md`、`docs/testing.md`、`docs/development.md`、`docs/cordis-primer.md`、`docs/capability-seams.md`。
- 本仓契约：`docs/contracts/plugin-qa.md`（验收）、`docs/contracts/plugin-git-pr.md`（Git/PR）、`docs/contracts/hub.md`（hub 边界）、`docs/contracts/product-baseline.md`（基线）。
