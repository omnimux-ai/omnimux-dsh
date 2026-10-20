# 扩展 loopback 请求凭据收敛（Issue #3440）

## 1. 目标与背景 (Objective)

浏览器侧边栏「保存到灵感库」在 ego/Chromium 中持续失败并提示「保存失败，请检查 OmniMux 运行状态」，而「连接实例」绿点正常、Dev 进程在运行。

实测根因：浏览器对 host `127.0.0.1` 累积了 196 个历史 `dsh-auth-*` cookie（每个本地实例启动新增一个，cookie 不分端口且从不回收）。扩展所有 loopback HTTP 调用沿用默认 fetch 凭据，请求携带 `Cookie: 34,449 B`，总请求头 35,098 B，超过宿主 Node HTTP 默认 `maxHeaderSize`（16,384 B），宿主在路由前返回 **431**：保存、`/ext/bridge-config` 发现、配对全部受影响。WS 桥握手不受影响，因此绿点仍绿，文案把 431 误报成「宿主未运行」。

目标：让扩展的 loopback 调用与浏览器 cookie 罐彻底解耦；431 时显示真实原因；用测试固定该约定，避免复发。

## 2. 关键用户旅程 (User Journey)

1. 用户在任意 Chromium（含累积了大量 `dsh-auth-*` cookie 的 profile）打开 OmniMux 侧边栏；
2. 点击「保存到灵感库」；
3. 扩展经后台保存（或面板兜底直连）向 `127.0.0.1:<port>` 发请求，**不携带任何 cookie**；
4. 宿主正常路由并返回 2xx，面板提示「已保存到 OmniMux 灵感素材库！」，即使浏览器 cookie 罐已远超 16 KB；
5. 若宿主仍返回 431（例如其它客户端造成），面板提示「127.0.0.1 残留 cookie 过多（请求头超限），请清理该站点数据后重试」，而不是「请检查 OmniMux 运行状态」。

## 3. 验收标准与契约断言 (Acceptance Criteria)

1. 扩展内所有 `127.0.0.1` HTTP 调用经 `src/shared/loopback-fetch.ts`（或对注入 transport 显式 `credentials: 'omit'`），源码中不存在裸 `fetch('http://127.0.0.1…')`；
2. `loopbackFetch` 强制 `credentials: 'omit'`，且不改变调用方传入的其它 init 字段；
3. 后台保存 handler 记录最后一次 HTTP 状态，431 时返回结构化 `{ ok: false, code: 'local-header-overflow' }`；其它失败返回 `save-failed`；
4. 面板把 431（后台 code 或直连兜底看到的状态）映射为中英文真实提示，原有「请检查 OmniMux 运行状态」只用于真正不可达；
5. 单测覆盖：loopback 约定扫描、helper 行为、431 → 文案映射；扩展 typecheck 与 build 通过；
6. 真实浏览器证据：在 cookie 头 >16 KB 的 profile 中，修复后的 loopback 请求不带 Cookie 头并返回 2xx（修复前命中 431）。

## 4. 非目标 (Non-goals)

- 不修改官方 DSH 的 `dsh-auth-*` cookie 命名/清理策略，不修改宿主 `maxHeaderSize`（官方源码只读）；
- 不清除用户浏览器中的历史 cookie（那是一次性环境处置，不是产品行为）；
- 不把灵感保存改走 bridge RPC（更大改造，另行评估）；
- 不改变任何宿主路由、接口形状、保存数据或 UI 布局。

## 5. Product baseline

全新用户机器的浏览器没有 127.0.0.1 cookie 累积，行为与今天一致；该修复只让请求更少依赖环境状态，不新增默认值、端口或本地服务假设。缺失宿主时仍走既有不可达提示。

## 6. 影响范围 (Affected Files)

- `plugins/omnimux-browser/extension/src/shared/loopback-fetch.ts`（新增）
- `plugins/omnimux-browser/extension/src/background/index.ts`
- `plugins/omnimux-browser/extension/src/background/media-export.ts`
- `plugins/omnimux-browser/extension/src/panel/App.tsx`
- `plugins/omnimux-browser/extension/src/panel/components/AutoModelPicker.tsx`
- `plugins/omnimux-browser/extension/src/panel/components/ModelSelector.tsx`
- `plugins/omnimux-browser/extension/src/shared/instance-discovery.ts`
- `plugins/omnimux-browser/extension/tests/save-inspiration-rpc.spec.ts`、`tests/loopback-fetch.spec.ts`（新增）
- `plugins/omnimux-browser/AGENTS.md`（子域硬约束一条）

## 7. 验证方案 (Verification)

- `cd plugins/omnimux-browser/extension && pnpm typecheck`
- `cd plugins/omnimux-browser/extension && npx vitest run tests/save-inspiration-rpc.spec.ts tests/loopback-fetch.spec.ts`
- `cd plugins/omnimux-browser/extension && node scripts/build.mjs`
- `node --test scripts/verify-agents-md.test.mjs`
- 真实浏览器：Chrome for Testing 加载本 worktree `dist`，通过 CDP `Network.setCookie` 在 profile 预置足量 127.0.0.1 cookie（>16 KB 请求头），本地日志服务确认修复后的 loopback 请求无 Cookie 头且宿主 2xx；报告与截图存 `docs/evidence/browser-loopback-credentials-3440/`。
