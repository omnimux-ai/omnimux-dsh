# products 默认模型去硬编码 + 模板模型漂移门禁

## Objective

`omnimux-products` 的落地页分析把 `gemini-3.8-flash` 写死为默认模型，`http-routes` 的 chat bridge 也写死同一个 ID。products 界面没有模型选择器，所以这两处字面量就是实际执行值：网关换默认模型后，products 仍会调用旧 ID。

同时，内置工作流模板与内置应用快照里引用了 `seedance-2.0`。它确实是 `seedance-2-0` 的文档化别名（`plugins/omnimux/src/catalog/specs/video-models.yaml:904`），但没有任何门禁保证它仍能解析到在册模型；网关退役时会在运行时静默断链。

目标：

- products 分析/聊天默认模型改由中枢解析，记录里写回中枢实际使用的模型；
- 新增门禁：模板与内置应用快照引用的模型 id 经别名解析后必须命中在册模型，否则构建期失败并点名文件与 id；
- 在契约里记录「文档化别名与元数据标签不是漂移」，防止后来者误改。

## New-user baseline

新用户不配置任何模型时，products 的「链接导入」仍能跑通：模型由中枢目录/设置决定；网关换默认后 products 自动跟随。目录不可用时沿用现有 degraded 分支，不抛 500。内置应用首次创建时引用的模板模型仍是有效别名，不会因为一条历史别名被误判为写错。

## Structure and contracts

- `plugins/omnimux-products/src/ai-analysis.js`：删除 `DEFAULT_TEXT_MODEL`；`analyzeLandingPage` 缺省时不传 `model`，返回的 `model` 用中枢 `answer.model` → 请求 id → `null`。
- `plugins/omnimux-products/src/http-routes.js`：删除 `DEFAULT_CHAT_MODEL`；`textCompleteViaChat` 只在调用方显式给出 `model` 时走 chat bridge，否则跳过该通道，让 `textComplete` seat / 工具按中枢默认解析。
- `scripts/verify-cross-plugin-model-alignment.mjs`：新增「模板模型 id 可解析且在册」检查，扫描 `presetWorkflows.js` 与 `builtinCatalogData.ts` 的 `"model": "<id>"`，用 hub `resolveModelId` 做别名感知解析。
- `scripts/verify-cross-plugin-model-alignment.test.mjs`：覆盖「模板用文档化别名通过」与「模板引用下架 id 失败并点名」。
- `docs/contracts/model-list-ownership.md`：新增「文档化别名与元数据标签不是漂移」小节。
- 不改 `generationPolicy` 的 seed 默认（目录优先，仅兜底），不改 `executionBridge` 静态参数表，不改 `text-key-providers`（第三方渠道自带清单）。

## 假设

- 中枢 `textComplete` 在 `model` 缺省时按目录/设置解析默认；若它拒绝缺省，则 products 的 seat 路径会暴露真实错误并走既有 degraded 分支，而不会回退到旧常量。
- `modelCatalog` 的 `defaults.analysis` 是分析场景的推荐默认；没有该字段时，`textComplete` 自身仍会按 `defaults.text` 解析。
- 模板里的 `seedance-2.0` 是文档化别名，`resolveModelId` 能解析到在售的 `seedance-2-0`；`gemini-3.8-flash` 直接在册。

## 证伪方式

- 删除常量后跑 `omnimux-products` 测试：若 `analyzeLandingPage` 在无 `model` 时抛参数错误或仍使用旧 ID，则失败。
- 用 `resolveModelId` 对模板 id 做解析：若 `seedance-2.0` 无法解析到在售 `seedance-2-0`，则门禁应失败；若门禁误报在册的 `gemini-3.8-flash`，则失败。
- 全量 `omnimux-products` / `omnimux-workflow` 测试、`verify:cross-plugin-models` 和测试标准声明校验必须通过。

## Acceptance

- products 不再出现 `DEFAULT_TEXT_MODEL` / `DEFAULT_CHAT_MODEL` 硬编码默认。
- 分析结果 `model` 是中枢实际使用的模型；无中枢时仍返回 degraded。
- 模板模型门禁在别名有效时通过、在下架 id 时失败并点名。
- 契约补充别名/元数据标签边界；不修改网关源码。

## 旧标准变更

- `plugins/omnimux-products/src/ai-analysis.test.js` :: `reads a digital page with the v2 playbook and the default model`
  - 原断言：无显式 `model` 时 `calls[0].model === 'gemini-3.8-flash'`、`result.model === DEFAULT_TEXT_MODEL`。
  - 必须改：products 不再把 `gemini-3.8-flash` 写死为默认；请求缺省时不传 model，结果记录中枢回报的模型。
  - 新证据：fake hub 回报 `hub-default-model`，断言 `calls[0].model === undefined`、`result.model === 'hub-default-model'`；`node --test plugins/omnimux-products/src/ai-analysis.test.js` 通过。
- `plugins/omnimux-products/src/link-importer.test.js` :: `reads a brand site into a full six-module strategy, end to end`
  - 原断言：`draft.analysis.model === 'gemini-3.8-flash'`、`calls.textComplete[0].model === 'gemini-3.8-flash'`。
  - 必须改：同上，默认模型由中枢决定，products 请求不携带常量。
  - 新证据：fake hub 回报 `hub-default-model`，断言 `draft.analysis.model === 'hub-default-model'`、请求 model 为 undefined；`node --test plugins/omnimux-products/src/link-importer.test.js` 通过。
- `plugins/omnimux-products/src/http-routes.test.js` :: `bridges after a seat that throws, with the default model and cap`
  - 原断言：chat bridge 的 `calls[0].model === 'gemini-3.8-flash'`。
  - 必须改：bridge 缺省模型改读中枢 `modelCatalog` 的 `defaults.analysis`/`defaults.text`，不再回退到硬编码。
  - 新证据：fixture 的 `modelCatalog` 提供 `catalog-analysis`，断言 bridge 收到该 id；`node --test plugins/omnimux-products/src/http-routes.test.js` 通过。
