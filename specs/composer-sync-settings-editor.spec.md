# composer-sync 第二修复：从 settings 内置 configEditor 读取并将错误暴露

## Objective

第一次修复加入了 `configEditor` 兜底，但用户重启后输入框仍没有 `seed-evolving`。需要确认 `composer-sync` 拿到的 `configEditor` 是否为空，并兼容 `settings` 服务只通过 `settings.ownerContext.configEditor` 暴露编辑器的情况；同时把同步结果写入 host 日志，避免下次静默失败。

## 假设

- 当前桌面 profile 的 `settings` 服务存在，但 `ctx.get('configEditor')` 在 Omnimux 插件上下文里返回 `undefined`；`settings.ownerContext.configEditor` 仍指向官方配置编辑器。
- 首次 composer sync 在 `settings` 注册后运行，但 `configEditor` 缺失时只返回 `namespace-absent`，不会尝试 `settings.ownerContext` 的编辑器。
- 从 `settings.documentPath`/`configEditor.edit()` 写入 `llm-pi-ai.providers.omnimux.models` 能保留 provider 的其它字段。

## 证伪方式

- 用 fake settings 对象模拟 `ownerContext.configEditor` 存在、`ctx.get('configEditor')` 不存在，运行 composer sync 时目标 models 必须包含目录新增模型；否则失败。
- 检查新增 host 日志 `composer-list-*` 在同步成功/失败时出现；若仍然没有任何日志，说明同步函数未执行或 service 未注册，需继续查启动注入。
- 全量 omnimux 测试必须通过。

## Acceptance

- `composer-sync` 可从 `settings.ownerContext.configEditor` 兜底；手动同步、catalog 变化、设置变更均触发。
- 同步失败有日志可定位，不静默吞错。
- 全量 omnimux 测试通过；不修改网关源码、不发起模型请求。
