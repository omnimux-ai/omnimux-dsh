# 规范：海报观点生成回退与模型列表实时读取（Issue #3480）

## 1. 问题（日志实证）

- `~/.omnimux-dev/logs/host/dsh-2026-10-21.log` 显示 Grok 订阅发现 403、回退内置目录；Dev `settings.yaml` 有 `omnimux.toolModel: cpa:gpt-6.1-sol`。
- 对 Dev bridge 的只读探针调用 `bridge.completeText` 返回：`{"code":"completion-failed","message":"no adapter registered for provider \"cpa\""}`。因此海报「生成观点」步骤失败、正文为空。
- `ModelSelector` 打开设置时只 fetch 一次 `/ext/bridge-config`；失败时保留 `REAL_LOCAL_SUBSCRIPTION_GROUPS` 硬编码快照，未使用 `session.modelCatalog` 的实时目录。

## 2. 目标

1. Hub 文本补全：`omnimux.toolModel` 指向的 provider 没有 adapter 时，记录告警并回退到既有默认文本路由，而不是让整次补全失败；其他错误照旧抛出。
2. 插件：观点生成失败时把**具体原因**传到模态步骤（不再只显示「失败」）；成功行为不变。
3. 设置页模型列表：按 `session.modelCatalog` → `/ext/bridge-config` → 硬编码快照 的优先级读取，并在设置页打开 / 端口变化时刷新。

## 3. 命令与验证

- `pnpm --filter omnimux test`（hub 文本执行单测 + 新增回退用例）
- `cd plugins/omnimux-browser/extension && pnpm exec vitest run tests/twitter-poster tests/auto-model-picker`
- `node scripts/build.mjs`
- 真实 Chromium：加载构建产物 + 注入 Dev bridge 设置，跑一次完整海报流程；证据放 `docs/evidence/issue-3480/`。

## 4. 结构

- `plugins/omnimux/src/text/execute.js`：toolModel 分支 adapter 错误 → fallback。
- `plugins/omnimux-browser/extension/src/content/twitter-poster/opinion.ts`：新增 `generateOpinionResult(): { text, error }`，保留 `generateOpinion()` 兼容包装。
- `.../twitter-poster/modal.ts`：`setStep(step, state, detail?)` 显示原因。
- `.../twitter-poster/index.ts`：使用 Result，步骤展示 error。
- `.../panel/components/ModelSelector.tsx`：新增 `api` 入参 + live 目录加载 + `catalogToModelGroups` 导出。
- `.../panel/App.tsx`：传入 `api`。

## 5. 代码风格示例

```ts
// 只回退 adapter 不可用，其他错误保持原样。
function isProviderAdapterUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /no adapter registered for provider|unknown provider/i.test(message)
}
```

## 6. 测试策略

- hub：`executeOmnimuxText` 在 toolModel 触发 adapter 错误时走默认路由（单测，注入 llm 桩）。
- 扩展：`catalogToModelGroups` 纯函数（分组/名称/reasoning 透传、异常输入空数组）；`generateOpinionResult` 失败原因透传（mock chrome.runtime）。
- 不新增 E2E 测试剧场；真实浏览器证据作为主验收。

## 7. 边界

- 总是：保持失败可见、保留 toolModel 的显式优先级、只在 adapter 缺失时回退。
- 先问：改供应商 adapter、改 Dev/Prod 配置、改凭据。
- 绝不：吞掉非 adapter 错误、写死模型列表作为唯一来源、打印/提交 token。

## 假设

观点失败源于 toolModel provider 无 adapter，而非 textComplete 链路本身不可用；因此 adapter 错误后回退默认文本路由即可恢复生成。若默认路由也超时，则假设被证伪。

## 证伪方式

物化 Dev 后运行 bridge 探针：若 `bridge.completeText` 仍返回 `completion-failed` 或超时而不是 `ok:true`，即证伪。命令：`node /tmp/bridge-probe2.mjs`（等价 WebSocket 探针），并对照 `docs/evidence/issue-3480/report.json`。
