# 修复 omnimux-social-harvest 顶层 inject 声明规格

- Issue: #2454
- 日期: 2026-09-20
- 目标: 修复 `omnimux-social-harvest` 顶层缺少 `webServer` 依赖注入声明导致的宿主加载报错，确保 Dev 开发版正常启动并完成主界面渲染。

## 1. 根因分析

Dev App 启动日志捕获到的真实报错：
`cannot get property "webServer" without inject at new apply (omnimux-social-harvest/src/index.js:58:25)`。
Cordis 服务网关在未声明 `inject: ['webServer']` 时，禁止在 `apply(ctx)` 中直接读取 `ctx.webServer`。

## 2. 修复方案

在 `plugins/omnimux-social-harvest/src/index.js` 中将：
```javascript
export const inject = ['tools']
```
更新为：
```javascript
export const inject = ['tools', 'webServer']
```

## 3. 验收标准

1. `plugins/omnimux-social-harvest` 单元测试通过，导出 `inject` 包含 `tools` 和 `webServer`。
2. 门禁全绿：`test:agent-tools`、`verify:product-baseline`。
3. 合入后物化到 Dev App，实机验证宿主正常启动（脱离 Recovery 页面），主界面成功渲染且侧边栏「社媒采集」按钮可见可用。
