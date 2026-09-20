# Spec: 修复 omnimux-device 插件 inject 声明语法导致的 optional 服务挂起崩溃

## 一、问题背景与根因定位
在 DSH Desktop 启动时报错进入恢复模式：
`dsh-plugin-desktop: plugin tree failed to load: dsh-plugin-desktop: 1 entry did not activate`
`omnimux-device: pending (waiting for service: optional)`

### 根因分析：
1. 错误写法：`export const inject = { optional: ['tools'] }`。
2. 在 Cordis / cordis-plugin-loader 插件树解析器中，顶级 `inject` 导出必须是服务名称的字符串数组（`string[]`）。如果传了一个对象，loader 的依赖解析器会遍历对象的键，将键名 `"optional"` 当作必需的依赖服务进行注册并等待激活。
3. 宿主 Cordis 容器中不存在名为 `"optional"` 的服务，导致 `omnimux-device` 陷入永久挂起（pending）状态，直到激活超时并被宿主判定为崩溃进入恢复模式。

## 二、修复方案与规范约束
1. **顶层依赖收敛**：
   - 将顶层 `export const inject` 改为标准空数组 `export const inject = []`。
2. **渐进式动态注入**：
   - 保持在 `apply(ctx)` 内部通过 `ctx.inject(['tools'], (inner) => { ... })` 安全注入与订阅 tools 服务。
   - 这样插件自身零服务依赖，可立即激活（0 阻塞、0 挂起）；当 tools 服务可用时自动完成 `device_list` 工具注册。
3. **测试覆盖**：
   - 更新 `src/index.test.js`，断言 `inject` 必须是数组，绝不包含 `"optional"`。
   - 保证单元测试通过。
