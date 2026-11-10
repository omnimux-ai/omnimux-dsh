# 修复输入框模型清单的 composer-sync 写入链路

## Objective

模型设置页已经能从 `/omnimux/model-catalog` 看到 `seed-evolving`，但对话输入框的模型按钮仍只显示静态的 `llm-pi-ai` provider 列表。排查发现输入框清单来自 `providers.omnimux.models`，当前 profile 里只有 `gemini-3.8-flash`；`composer-sync` 依赖 `settings.describe()` 暴露 `llm-pi-ai` 命名空间，若该命名空间不可编辑或同步事件没触发，就会一直停留在旧清单。

目标：

- `catalog` 文本桶包含新模型时，`composer-sync` 能稳定写入 `llm-pi-ai.providers.omnimux.models`；
- 手动“立即同步”、启动同步和设置变更都能触发 composer 清单更新；
- 当 `settings.describe()` 不暴露 `llm-pi-ai` 时，退回官方 `configEditor.edit()` 编辑 profile 配置；
- 保持失败闭门：中枢为空、命名空间缺失或写入失败时不清空、不猜字段。

## New-user baseline

新用户安装后，输入框模型列表必须先由网关目录驱动，而不是依赖开发机 profile 的旧静态行。目录中已上架且可执行的文本模型应出现在输入框；目录不可用时保持上一次清单，不显示空列表。

## Structure and contracts

- `plugins/omnimux/src/catalog/composer-sync.js`：新增可选 `configEditor` 依赖与 fallback 写入；保留 settings 写入作为首选路径。
- `plugins/omnimux/src/host/apply.js`：把 `configEditor` 传给同步器；在 `/omnimux/model-catalog/refresh` 和 catalog 变更后触发同步；监听设置文档变更作为兜底。
- `plugins/omnimux/src/catalog/composer-sync.test.js`：覆盖 settings 正常路径、namespace 缺失时的 configEditor fallback、失败闭门。
- 不改 `llm-pi-ai` 的字段、不猜模型能力、不把 `composerHiddenModels` 的减法变成加法。

## 假设

- `llm-pi-ai` 的 `providers` 是官方 `Config` 的 volatile 字段；当前桌面 profile 中 `settings.describe()` 可能不返回该命名空间的可编辑描述符，但 `configEditor` 能通过活动条目 `llm-pi-ai` 编辑完整配置。
- `configEditor.edit()` 是官方配置编辑器入口，会保留 provider 的 `apiKeyEnv`、`baseURL`、`api`、`compat` 等字段；同步只替换 `providers.omnimux.models`。
- 手动同步成功后，catalog 当前视图已更新；此时触发同步不会依赖下一次启动。

## 证伪方式

- 用 fake settings（不返回 `llm-pi-ai` descriptor）和 fake configEditor，运行 `composer-sync`：若目标 models 未包含 hub 的新文本模型，或清空/猜字段，则失败。
- 用 fake settings 正常 descriptor：若仍然走 configEditor 或漏写 `providers.omnimux.models`，则失败。
- 运行 `node --test` 的 composer-sync/list 测试及全量 omnimux 测试；若旧静态清单仍覆盖目录成员，则失败。

## Acceptance

- `composer-sync` 在 namespace-absent 时通过 `configEditor` 写入目标 provider models。
- 手动刷新触发一次 composer 同步；设置文档变更也能触发。
- 单元测试覆盖 fallback、幂等、失败保留旧清单；全量 omnimux 测试通过。
- 不修改网关源码、不发起模型请求。
