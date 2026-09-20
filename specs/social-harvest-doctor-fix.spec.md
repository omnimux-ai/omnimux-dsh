# 修复 opencli doctor 传参错误导致桥接状态误判规格

- Issue: #2462
- 日期: 2026-09-20
- 目标: 移除 `detectEnvironment` 中调用 `doctor` 时携带的不支持参数 `-f json`，确保真实环境下准确识别浏览器桥接就绪。

## 1. 根因分析

OpenCLI 的 `doctor` 命令用于诊断浏览器桥接连接状态，不属于数据采集类命令，官方 CLI 未提供 `-f`（`--format`）参数。
当 `detectEnvironment` 执行 `deps.run(['doctor', '-f', 'json'])` 时，OpenCLI 直接报错：
`error: unknown option '-f'`
并且进程退出码非 0，导致 `detectEnvironment` 始终判定 `bridgeOk: false`，使得前端工作台和 Agent 工具误报「浏览器桥接未就绪」。

## 2. 修复方案

在 `plugins/omnimux-social-harvest/src/collect/doctor.js` 中：
将：
```javascript
const doc = await deps.run(['doctor', '-f', 'json'], { timeoutMs: HARVEST_TIMEOUT_MS })
```
修改为：
```javascript
const doc = await deps.run(['doctor'], { timeoutMs: HARVEST_TIMEOUT_MS })
```
判定逻辑保留：当 `doc.code === 0` 时 `report.bridgeOk = true`，否则提取 stderr/stdout 作为诊断详情。

## 3. 验收标准

1. 单元测试 100% 通过（断言 `argv` 为 `['doctor']`）。
2. 真实执行 `opencli doctor` 退出码为 0，`report.bridgeOk` 为 `true`。
3. 门禁全绿：`test:agent-tools`、`verify:product-baseline`。
4. 合入并物化到 Dev App 后，实机工作台状态胶囊显示「已就绪」（绿色高亮）。
