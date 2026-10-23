# 规格 · 浏览器插件对话与文本生成模型独立配置（Issue #3629）

## 1. 目标 (Objective)

现状：插件设置面板只有一行「默认模型与推理等级」，它同时决定两件事——

1. **面板对话**：写入宿主 `agent-default-model`，并作为会话模型（`session.selectModel`）；
2. **页面 Copilot 正文生成**（回帖 / 发帖 / 引用）：background 新建临时会话生成正文，不指定模型，继承宿主默认；`bridge.modelMode` 默认 `auto` 时还会先被 Jev 路由改选。

结果：用户无法做到「日常对话走自动或 DeepSeek，而正文生成走 Claude Opus」，只能反复手动改同一个值。

目标：在插件设置面板把两类消费用途拆成两个**独立、可分别切换、互相隔离**的模型配置：

- **对话模型与推理等级**（现有字段改名，行为不变，保留自动 / 手动路由）；
- **文本生成模型与推理等级**（新增，专供插件内一次性正文生成；默认「跟随对话模型」）。

成功标准（可测）：

1. 两个选择器分别持久化，切换其一不改变另一个；
2. 文本生成模型已设置时，Copilot 生成临时会话使用该模型，且该会话不被 auto 路由改选；同时对话仍可 auto 路由；
3. 文本生成模型未设置时，行为与今天完全一致（继承宿主默认 + 允许 auto 路由）；
4. 显式配置的文本模型不可用时错误对用户可见，不静默改用对话模型；
5. 宿主与扩展单测通过，并提供扩展真实浏览器验收证据（两个选择器 + 生成请求携带所选模型）。

## 2. 命令 (Commands)

| 用途 | 命令（在任务工作树内） |
| --- | --- |
| 宿主单测 | `pnpm --filter omnimux-browser test` |
| 宿主构建 | `pnpm --filter omnimux-browser build:server` |
| 扩展单测 | `cd plugins/omnimux-browser/extension && pnpm test` |
| 扩展类型检查 | `cd plugins/omnimux-browser/extension && pnpm typecheck` |
| 扩展构建 | `cd plugins/omnimux-browser/extension && node scripts/build.mjs` |
| 影响矩阵 | `node scripts/impact-matrix.mjs --git-diff --base origin/main` |
| 扩展真实浏览器验收 | `node scripts/lib/extension-e2e.mjs` |

## 3. 项目结构 (Project Structure)

- 宿主桥（协议 / 路由 / 服务）：`plugins/omnimux-browser/src/{protocol.ts,server.ts,index.ts,auto-model.ts}`
- 宿主测试：`plugins/omnimux-browser/tests/`
- 扩展：`plugins/omnimux-browser/extension/src/{background/index.ts,panel/App.tsx,panel/components/ModelSelector.tsx,panel/strings.ts}`
- 扩展测试：`plugins/omnimux-browser/extension/tests/`
- 本规格：`specs/browser-text-model-isolation.spec.md`

## 4. 代码风格 (Code Style)

受控选择器：存储键与回调由调用方注入，组件不自行决定持久化位置。

```tsx
<ModelSelector
  locale={locale}
  activePort={targetPort}
  api={api}
  storageScope="text"
  selectedModel={settings.textModel}
  selectedEffort={settings.textEffort}
  onSelectModel={(modelId, effort, provider) => {
    setSettings((prev) => ({ ...prev, textModel: modelId, textEffort: effort ?? '', textProvider: provider ?? '' }))
  }}
/>
```

桥方法命名与校验沿用既有模式（`BRIDGE_*_METHOD` 常量 + payload 解析器 + `bad-request` 错误码）。

## 5. 测试策略 (Testing Strategy)

- **宿主单测（vitest）**：`bridge.textGeneration` 的入参校验与成功应答；已钉会话在 auto 模式下不被路由（`withAutoModelRouting` 直通）；`bridge.session.purge` 解除钉定；`bridge.completeText` 透传可选 `model`。
- **扩展单测（vitest）**：设置面板两个选择器分别写入 `textModel` / 对话模型键，互不覆盖；未设置时生成不调用钉定方法；已设置时生成先钉定再 prompt，且钉定失败时返回显式错误；兜底 `bridge.completeText` 携带 `model`。
- **真实浏览器验收（ego-browser / `scripts/lib/extension-e2e.mjs`）**：加载未打包扩展，打开设置面板断言两行选择器存在且可分别切换；在 X 页面触发一次 Copilot 生成（合成/桩宿主），断言生成请求携带所选文本模型。
- 不探测真实模型 API（遵守 [model API authority](../../docs/contracts/model-api-authority.md)）；单测使用桩宿主。

## 6. 边界 (Boundaries)

- **总是做**：改 `extension/src` 后执行 `node scripts/build.mjs`；单测与类型检查通过；中文汇报；遵守 Quality Loop（Spec → Code → Verify → Test → Green）。
- **先问**：改动中枢（hub）文本消费场景绑定或 `textComplete` 目录默认；改动面板对话自动 / 手动语义；新增第三方依赖。
- **绝不做**：修改官方 DSH 源码；提交密钥；在 `catch` 中静默吞掉文本生成失败；把未合入的工作树链接进 Dev。

## 7. 接口契约（冻结，双方实现依据）

### 7.1 宿主 `plugins/omnimux-browser/src`

1. `protocol.ts` 新增 `BRIDGE_TEXT_GENERATION_METHOD = 'bridge.textGeneration'`，并导出 payload 解析器。
2. 入参：`{ sessionId: string, model: string, provider: string, reasoningEffort?: string }`；`sessionId` / `model` / `provider` 非空且 ≤200 字符（`provider` ≤64），`reasoningEffort` ≤64；不合法 → `bad-request`。
   **`provider` 必填**：宿主 `session/selectModel` 的 strict codec 把 `provider` 列为 required，缺省必被拒绝，因此插件契约同样要求非空。
3. 成功应答：`{ pinned: true }`。
4. `server.ts` 依赖新增 `pinTextGeneration?: (request) => Promise<void>`；未注入 → `internal`（"Text generation pin unavailable"）。
5. `index.ts` 实现：**先把该会话 materialize**（`deferSessionCreate` 默认开启时 `session.create` 只铸 provisional id，宿主 `session.selectModel` 对未持久化会话返回 `session/not-found`），再 `session.selectModel`（含 provider / reasoningEffort），最后登记该会话为文本生成会话；登记**必须早于** prompt 转发。materialize 由 `session-deferral` 暴露的按需物化能力提供，禁用 deferral 时为 no-op。
6. `purgeSession` 同步注销该会话的钉定；注销失败不得影响 purge 结果。
7. `withAutoModelRouting` 新增依赖 `isPinned?: (sessionId: string) => boolean`；`isPinned(sessionId) === true` 时**跳过 Jev 路由**直接转发（不调用 `selectModel`）。
8. `bridge.completeText` payload 增加可选 `model`（≤200 字符），转发为 `completeText({ prompt, system, model, maxTokens, signal })`。

### 7.2 扩展 `extension/src`

9. `Settings` 新增：`textModel: string`（空串 = 跟随对话模型 / 宿主默认）、`textProvider: string`、`textEffort: string`；默认值为空串。
10. 设置面板：原字段文案改为「对话模型与推理等级」；新增「文本生成模型与推理等级」；两者各自独立读写设置对象，不共享存储键。
11. 文本生成选择器提供「跟随对话模型」空值选项；选择后 `textModel` 为空串。
12. 生成主路径 `completeTextWithSession`：创建临时会话后，若 `textModel` 非空 → **先解析 provider**（优先用已保存的 `textProvider`，为空时按 model id 回查实时目录 `session.modelCatalog` 的 group provider / id / 名称映射），再调用 `bridge.textGeneration` 钉定并选择模型；provider 解析不到或钉定失败都必须**显式抛错**（对用户可见），不得静默改用对话模型或继续用宿主默认。
13. 兜底 `bridge.completeText`：`textModel` 非空时携带 `model`。
14. 未设置 `textModel` 时，主路径与兜底均保持今天的行为（不调用钉定、不携带 model）。

## 8. 用户操作旅程

1. 打开插件设置面板 → 依次看到「对话模型与推理等级」「文本生成模型与推理等级」两行；
2. 对话行选择自动或 DeepSeek；文本生成行选择 Claude Opus 4.6；
3. 「保存并连接」后回到面板发消息 → 对话走所选对话模型 / auto 路由；
4. 在 X 页面回帖框点击 Copilot 生成 → 正文由所选文本生成模型产出，且不因 auto 模式被改选；
5. 期望界面反馈：两行各自显示当前所选模型与推理等级；生成失败时页面 toast 显示具体原因（例如模型不可用），不出现静默失败。

## 9. 验收用例

- **A1 隔离与持久化**：改对话模型 → `textModel` 不变；改文本模型 → 对话模型不变；重新打开设置面板两值保持。
- **A2 auto 隔离**：`bridge.modelMode = auto` 时，钉定的文本生成会话不被路由（宿主单测断言 `selectModel` 不被路由调用、prompt 仍转发）；对话会话仍被路由。
- **A3 未设置回退**：`textModel` 为空时不调用 `bridge.textGeneration`，`bridge.completeText` 不带 `model`。
- **A4 失败显式**：钉定失败（模型不可用）时生成返回显式错误信息，不产生正文。
- **A5 真实浏览器**：设置面板两个选择器可分别切换并持久化；未打包扩展 + 本机桩宿主（模拟宿主 strict codec：缺 provider 的 `session.selectModel` 一律拒绝）下触发一次 Copilot 生成，断言帧序 `session.create → bridge.textGeneration → session.prompt → bridge.session.purge` 且钉定 payload 精确等于所选 `{model, provider, reasoningEffort}`。
- **A6 deferral 物化**：`deferSessionCreate` 开启（`session.create` 只返回 provisional id，宿主对未持久化会话的 `session.selectModel` 返回 `session/not-found`）时，钉定必须先 materialize 再 `selectModel`，否则配置了文本模型的生成会 100% 失败。宿主单测用「拒绝未知会话的严格 gateway 桩」覆盖。

## 10. 新用户基线

全新安装、未配置任何文本生成模型的用户：设置面板显示「跟随对话模型」，生成行为与今天一致（继承宿主默认 + auto 路由）；不依赖 Dev 端口、本地模型别名或开发者 profile。文本生成模型仅在用户显式选择后才生效，缺失时回落到宿主默认而不是报错。

## 假设

1. 宿主新建会话（`session.create` 不带模型）使用 `agent-default-model` 设置值；因此「跟随对话模型」等价于今天的行为。
2. auto 路由由 `withAutoModelRouting` 包装 `session.prompt` 实现，是插件内唯一的隐式改选点；因此钉定集合足以隔离文本生成。
3. 扩展 background 与 panel 共享 `chrome.storage.local` 的 `dshSettings` 对象，文本模型可在两个上下文一致读取。
4. 宿主 `session/selectModel` 的 request schema（strict codec）要求 `sessionId` / `provider` / `model` 三者齐备，`provider` 缺省会被 codec 拒绝；`reasoningEffort` 可选。
5. `deferSessionCreate` 默认开启：`session.create` 只铸本地 provisional id（不落库），宿主 `session.selectModel` 对未 materialize 的会话返回 `session/not-found`；因此钉定前必须物化。

## 证伪方式

1. 若在 auto 模式下钉定会话仍被改选（宿主日志出现 `auto-routed session <临时会话>`，或单测中路由 `selectModel` 被调用），则假设 2 错误，需要把路由判定下沉到 host API 调用参数或改用独立桥方法承载文本生成。
2. 若 background 读取不到 panel 写入的文本模型（设置面板显示已选、生成仍用宿主默认），则假设 3 错误，需要改为经 `chrome.runtime.sendMessage` 显式同步设置。
3. 若 `session.create` 后的会话模型并非 `agent-default-model`（例如被实例配置覆盖），则「未设置文本模型时行为与现状一致」的验收 A3 需按实际继承来源重写。
4. 若钉定失败被证明不影响用户可见结果（例如用户仍得到正确模型的正文），则验收 A4 的前提不成立，应删除该断言而不是保留空断言。
5. 若 provisional 会话上的 `session.selectModel` 实际被宿主接受（宿主自行 resume/创建），则假设 5 与验收 A6 不成立，可删除物化步骤——但必须在真实宿主或严格桩上复现「未物化会话 + selectModel 成功」的证据，不能靠桩一律成功来推断。
6. 若宿主 strict codec 实际接受缺失 `provider` 的 `session/selectModel`，则假设 4 与 §7.1(2) 的必填要求应放宽回可选；反之若真实请求被拒绝，则必须保持必填并让扩展显式报错。

## 12. 文档影响

本规格即本次任务的文档真源；中枢（hub）文本消费场景与 `textComplete` 目录默认不变，`docs/contracts/hub.md`、`docs/contracts/model-list-ownership.md` 无需改动。宿主桥新增方法属插件内部协议，`plugins/omnimux-browser/AGENTS.md` 的硬边界与验证表不涉及桥方法清单，无强制改动；如实现中发现设置面板文案规范需登记，则更新 `docs/contracts/ui-copywriting-and-naming-standards.md` 的相应条目。
