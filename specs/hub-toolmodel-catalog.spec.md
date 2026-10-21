# 规范：toolModel 缺失 adapter 时用实时模型目录默认值重试（Issue #3488）

## 1. 问题

#3480 让 `omnimux.toolModel`（Dev 现值 `cpa:gpt-6.1-sol`）的 adapter 缺失时回退默认文本路由；但 Dev 探针返回 `Text completion timed out`，该路由 60s 无响应。实时 `session.modelCatalog.default` 为 `deepseek-official/deepseek-flash`，对话通道正常工作。

## 2. 方案

1. `mountTextComplete` 把 `ctx.get('modelCatalog').list()` 作为 `modelCatalog` 访问器传给 `executeOmnimuxText`。
2. toolModel adapter 缺失时：
   - 读取 catalog `default.provider` / `default.model`，用同一 `llm.stream` 重试；
   - 成功返回并标注 `model: 'provider:model'`；
   - catalog 缺失或该对也 adapter 缺失 → 继续既有默认文本路由；
   - 非 adapter 错误照旧抛出。
3. 不修改用户设置、provider adapter、扩展 UI。

## 3. 验收

- 单测：catalog 默认成功（calls = cpa → deepseek-official）；catalog 缺失仍走默认路由；非 adapter 错误不回退。
- `pnpm --filter omnimux test`、`pnpm check:boundaries`。
- 合入物化 Dev 后，bridge 探针 `bridge.completeText` 返回 `ok:true` 正文（Issue 评论补充）。

## 4. 边界

R1；只改 hub 文本补全回退，不改对话路由、凭据与配置。
