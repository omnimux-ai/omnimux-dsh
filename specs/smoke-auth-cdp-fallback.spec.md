# 冒烟探针 401 回退 CDP（smoke-auth-cdp-fallback）

## 目标

修复 `scripts/verify-dev-smoke.mjs` 在 Dev 应用启用认证后恒失败的问题：`GET http://127.0.0.1:45120/` 现在返回 401（`dsh web authentication required; reopen the URL printed by dsh web.`），而该脚本只做 HTTP 探针，拿不到 `dsh web` 打印的 token。

方案：HTTP 探针遇到 401 时，回退到桌面窗口的 **CDP 只读健康检查**（端口 9229，与 ship 内置 `scripts/dev-smoke.mjs` 同机制），检查 `#root`、boot hanging、recovery overlay、正文长度与 readyState；CDP 也不可用时才判定失败。这样既不在日志里伪造 200，也不因认证把健康应用误判为坏。

## 命令

```bash
node --test scripts/verify-dev-smoke.test.mjs
node --test scripts/dev-smoke.test.mjs
```

## 项目结构

- `scripts/verify-dev-smoke.mjs`：新增 `probeDevCdpHealth()` 与 401 回退分支；`runSmokeCheck` 支持注入 `cdpProbe`（测试用）。
- `scripts/verify-dev-smoke.test.mjs`：mock server 增加 `/auth` 401 路由，在既有 e2e 用例内追加断言（不新增用例）。
- `specs/smoke-auth-cdp-fallback.spec.md`：本规格。

## 代码风格

- 纯函数 + 依赖注入：`runSmokeCheck(url, { probeHttpEndpoint?, cdpProbe?, cdpPort? })`。
- CDP 只读：只发 `Runtime.evaluate` 读取 DOM 状态，不写 localStorage、不点击、不提交。

```js
if (res.status === 401) {
  const cdp = await cdpProbe({ url, cdpPort: opts.cdpPort })
  if (cdp.ok) return { skipped: false, success: true, via: 'cdp', detail: cdp.detail }
  return { skipped: false, success: false, error: `HTTP 401; CDP: ${cdp.error}` }
}
```

## 测试策略

- 框架：`node --test`（既有套件）。
- 复用既有 e2e mock server 用例，追加：
  1. `/auth` 返回 401 + `cdpProbe` 返回健康 → `success=true`、`via='cdp'`；
  2. `/auth` 返回 401 + `cdpProbe` 返回失败 → `success=false`；
  3. 既有 200/500/unreachable 断言不回归。
- 真实环境验证：对运行中的 Dev 应用执行 `pnpm verify:smoke`，应通过 CDP 回退返回 PASS；若 Dev 未运行则保持 skip 语义。

## 边界

- 总是：401 只作为「需要认证」信号触发回退，不把 401 当成功；不删除任何既有断言。
- 先问：给探针注入 Dev token/cookie（本次不做，优先 CDP 只读回退）。
- 绝不：伪造 HTTP 200、跳过页面健康检查、在页面内写状态。

## 成功标准

1. `node --test scripts/verify-dev-smoke.test.mjs` 全绿，含新增 401 回退断言；
2. `node --test scripts/dev-smoke.test.mjs` 不回归；
3. 真实 `pnpm verify:smoke` 对运行中的 Dev 应用返回 PASS（via CDP）。

## 假设

1. Dev 应用桌面窗口的 CDP 9229 与 `scripts/dev-smoke.mjs` 使用的是同一个只读调试端口，且页面已处于登录态，能反映真实渲染健康。
2. 401 是「HTTP 探针缺 token」而不是应用故障；页面健康应通过 CDP 判定。
3. `Runtime.evaluate` 的 DOM 判定（`#root`、boot hanging、recovery overlay、正文长度）足以替代 HTTP HTML 骨架检查。

## 证伪方式

1. 在修复前的脚本上请求 401 端点，应直接 FAIL；修复后同一端点在有健康 CDP 时应 PASS。若修复前已 PASS，说明假设 2 不成立。
2. 让 `cdpProbe` 返回失败，应仍然 FAIL（不能因为 401 就静默成功）；若 PASS，说明回退把失败吞掉了。
3. 对未运行 Dev 应用执行 `pnpm verify:smoke`，应保持 skip/不可达语义，而不是报 401 或超时误判。
4. 真实 Dev 应用中页面若 boot hanging，CDP 判定应 FAIL；若仍 PASS，说明 DOM 判定条件太宽。

## 文档影响

仅冒烟脚本与测试；不改产品行为、用户可见文案与 Dev 应用认证机制。无需更新产品文档。
