# 规格说明书 · 修复 omnimux-device 插件 tools 服务注入防崩溃门禁

## 一、背景与问题
用户在启动 DSH Desktop 时触发崩溃进入恢复模式，报错信息为：
`dsh-plugin-desktop: plugin tree failed to load: failed to apply loader entry include (cordis:include): failed to apply loader entry omnimux-device (omnimux-device): cannot get property "tools" without inject`
`Error: cannot get property "tools" without inject`

根因分析：
在 Cordis 框架中，Context 采用 Proxy 拦截属性访问。当插件宿主端入口直接通过 `ctx.tools?.register` 读取 `ctx.tools` 时，若当前 Context 未声明或未激活 `tools` 强依赖（或在 loader 预包含阶段处于孤立上下文），Proxy getter 会立即抛出 `cannot get property "tools" without inject` 异常，阻止后续加载导致应用崩溃。

## 二、需求目标与验收标准
1. **服务读取安全性**：
   - 严禁在 `apply` 顶层直接访问 `ctx.tools`。
   - 采用 `ctx.get('tools')` 或 `ctx.inject(['tools'], callback)` 安全获取，在任何无 `tools` 上下文环境中执行 `apply(ctx)` 绝不抛错。
2. **渐进式能力注入**：
   - 将 `inject` 改为 `{ optional: ['tools'] }`，使插件在无 tools 服务时依然能正常完成提供通道（`ctx.provide('device')`）与基础生命周期加载。
3. **回归测试守卫**：
   - 新增单元测试：模拟 Proxy 拦截 Context（访问未注入属性直接抛错），断言 `apply(ctx)` 在未注入 tools 时零异常顺利完成。

## 三、测试用例
- 用例 1：在无 `tools` 的 Context 上调用 `apply(ctx)`，不抛出异常。
- 用例 2：在有 `tools` 注入的 Context 上调用 `apply(ctx)`，成功调用 `tools.register` 注册设备工具。
