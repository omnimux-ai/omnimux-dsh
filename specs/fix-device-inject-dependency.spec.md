# 规格：修复 omnimux-device 声明 tools 依赖注入 (export const inject = ['tools'])

## 一、 问题背景与根因
在 DSH Desktop 启动插件服务时，Cordis 框架执行插件加载与装配。`omnimux-device` 插件在 `src/index.js` 中访问了 `ctx.tools`，但未在模块顶层导出 `export const inject = ['tools']` 声明依赖。
这导致 Cordis 依赖注入守护拦截抛出错误：`cannot get property "tools" without inject`，DSH Desktop 触发恢复模式保护。

## 二、 修复方案
在 `plugins/omnimux-device/src/index.js` 模块顶层声明并导出 `export const inject = ['tools']`，明确声明工具子系统依赖注入。

## 三、 验收标准
- [ ] `plugins/omnimux-device/src/index.js` 包含 `export const inject = ['tools']`；
- [ ] Profile preflight 预检通过，DSH Desktop 重启不再进入恢复模式。
