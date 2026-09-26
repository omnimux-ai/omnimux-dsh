# 修复 omnimux-video 缺少 slots inject 声明引发渲染器崩溃规格说明书 (Spec)

## 1. 缺陷背景
在 PR #2708 (Commit 7f25fe573) 中，`omnimux-video` 客户端入口引入了 `ctx.slots.inject('shell.overlay', ...)`，但未在模块头部 `export const inject` 数组中声明 `'slots'`。
在 DSH Cordis 体系中，未声明依赖而直接访问 `ctx.slots` 会触发属性守卫拦截并抛出：
`failed to apply loader entry acfaf204 (omnimux-video): cannot get property "slots" without inject`
导致整个 Electron 渲染进程在启动时崩溃并退入 Recovery 故障页面。

## 2. 修复方案
在 `plugins/omnimux-video/src/client/index.js` 中：
将 `export const inject = ['locale']` 补齐为 `export const inject = ['locale', 'slots']`。

## 3. 验收断言
- `export const inject` 必须包含 `'slots'`；
- 自动化测试与打包构建正常通过。
