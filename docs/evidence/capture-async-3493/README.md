# #3493 作品直传改为 202 受理 + 后台下载：证据

- 任务：Issue #3493（worktree `cross-capture-async`，分支 `agent/cross-capture-async-issue-3493`）
- 时间：2026-10-21
- 动机：#3485 实测发现 host 同步下载会撞扩展保存请求 30s 超时（抖音 236MB、Instagram 25.9MB@119KB/s），扩展误判失败回退旧链路。

## 验收标准与实测

| # | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC1 | capture 受理立即返回 202 + importing 占位 | ✅ 4 平台受理耗时 1–5ms | `host-async-e2e.log` |
| AC2 | 大媒体/慢 CDN 不阻塞受理，后台下载收敛 | ✅ 抖音 236,377,548B / 28.0s；Instagram 25,879,252B / 8.0s；小红书 / X 各 2.0s → 全部 `ready` | 同上 |
| AC3 | 轮询 `GET /local/:id` 可见 importing→ready | ✅ 轮询 2s 间隔，状态收敛 | 同上 |
| AC4 | 下载中重复 POST 幂等；ready 后 200 existing | ✅ 单元测试 | `capture-handler.test.js` |
| AC5 | 全部失败 → failed + import_error（无 422）；部分失败 → degraded | ✅ 单元测试 | 同上 |
| AC6 | 运行期 stale sweep 不误杀；超期残留行会被标 failed | ✅ 单元测试（activeJobs 保护 + 超期 seed） | 同上 |

## 测试计数

```bash
# 异步契约单测（node:test + 离线 fetcher，deny-network 0 outbound）
cd plugins/omnimux-inspiration
node --import ./scripts/deny-network.mjs --test src/capture-handler.test.js
# tests 14 / pass 14 / fail 0（连跑 5 次稳定）

# 宿主插件全量
node --import ./scripts/deny-network.mjs --test src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js
# tests 1732 / suites 348 / pass 1732 / fail 0 / 0 outbound
```

## 真实 host 端到端（隔离 DSH_HOME，真实 CDN）

```bash
node /tmp/omnimux-capture-async-test/verify.mjs   # 输出 host-async-e2e.log
```

| 作品 | 受理状态/耗时 | 受理后状态 | 收敛结果 | 收敛耗时 | 落盘 |
| --- | --- | --- | --- | --- | --- |
| 小红书图片 | 202 / 5ms | importing | ready | 2.0s | 93,382B |
| X 媒体 | 202 / 1ms | importing | ready | 2.0s | 126,287B |
| 抖音视频 | 202 / 1ms | importing | ready | 28.0s | 236,377,548B |
| Instagram 视频 | 202 / 2ms | importing | ready | 8.0s | 25,879,252B |

`ASYNC_RESULT PASS`。

## 接口变化

- `POST /omnimux/inspiration/local/capture`：校验/去重/占位后立即 `202 {data: placeholder, accepted:true}`；下载中重复请求 `202 existing`；已 ready `200 existing`；失败/降级通过行状态表达，不再用 422 表达「全部失败」。
- 后台任务：`activeJobs` 持有 id（stale sweep 不误杀）、单文件下载预算 300s、结束写 ready/degraded/failed；导出 `captureJobs` / `captureJobsSettled()` 供测试等待。
- 扩展侧无需改动：`res.ok` 对 202 视为成功，灵感库卡片按 `import_status/import_stage` 自动收敛。

## 证据边界

- 真实 CDN 下载在本机隔离 `DSH_HOME` 内完成，未写入 Dev/Prod 数据；下载的网络来源为公开直链（#3485 真实页面采集结果）。
- 本次无前端/Stage 源码变更；未以 Dev 45120 真机验收作为卡点（人工职责）。
