# #3178 本机 CLI 登录态 / 版本更新 — 真实浏览器验收证据

- **日期**：2026-10-05
- **工作树**：`.worktrees/omnimux-cli-auth-update-issue-3178`
- **被验组件**：`plugins/omnimux/src/client/RuntimeModeSection.jsx` → `RuntimeModeSection` / `AgentPanel`（设置面板「本机 CLI」页签）
- **规格**：`specs/cli-auth-update.spec.md` §4（客户端契约）
- **浏览器**：ego-browser（ego-lite Chromium，本仓指定浏览器）
- **结论**：**PASS** — 三条功能路径断言全部实测通过，渲染期零 console error。唯一瑕疵是**验收装置自身的**页签标签配色（见「已知限制」），不在被测路径上。

---

## 1. 装置（harness）说明

按仓库规则，单测 / jsdom / HTTP 200 均不算浏览器验收，因此本证据使用**真实浏览器内核 + 真实组件源码**：

| 环节 | 做法 |
| --- | --- |
| 被测代码 | 直接 `import { RuntimeModeSection } from '../../../../plugins/omnimux/src/client/RuntimeModeSection.jsx'` —— **未复制、未改写、未 mock 组件**；`AgentPanel` 由它渲染（默认即「本机 CLI」页签） |
| 构建 | 工作树自带 esbuild 0.28.2，`--jsx=automatic`，`bundle: true`，`loader.css=local-css`（`dsh-ui-kit` 与官方 primitives 的 CSS Modules） |
| 样式 | 真实 `HUB_CSS`（`src/client/styles.js`）注入；官方设计令牌由 `extract-tokens.py` 从已安装应用的 `@deepseek-ai/dsh-client-ui-theme/lib/client.js` 逐字提取 |
| 接口 | `AgentPanel` 内部的 `api()` 用全局 `fetch`，因此四个契约路由由装置 HTTP 服务**真实应答**（真网络往返，非 fetch mock） |
| 文案 | 真实 `zh` 词典（`src/client/locales.js`）+ 真实 `{param}` 插值；`t` 由宿主提供，故属装置职责 |
| 端口 | `port: 0`（临时端口），自清理 |

装置通过 `http://localhost:<port>` 访问：本机 macOS 代理例外列表只有 `localhost`，不含字面量 `127.0.0.1`，用 `127.0.0.1` 会被代理拦截并报 `net::ERR_HTTP_RESPONSE_CODE_FAILURE`。

### 桩响应（与任务给定契约一致）

- `GET /omnimux/agents` → claude（`signed-out` / `loginSupported:true`）、codex（`signed-in`）、qwen（`signed-out` / `loginSupported:false`）
- `GET /omnimux/agents/updates` → claude `available`（latest `2.1.289`，`supported:true`）、codex `current`、qwen `unknown`（`supported:false`）
- `POST /omnimux/agents/login` → `{ok:true,launched:true,mode:'terminal'}`，并把 claude 翻为 `signed-in`，使下一次 `GET /omnimux/agents` 收敛
- `POST /omnimux/agents/update` → `{ok:true,version:'2.1.289 (Claude Code)'}`
- `GET /omnimux/auth/status` → `{logged_in:false}`（面板同时挂载云端登录 hook，保持静默）

---

## 2. 断言实测（actual vs expected）

### 2.1 截图存在且非空白

`node harness/png-stats.mjs` 实测（像素方差 / 唯一色 / 非白像素占比）：

| 截图 | 字节 | 尺寸 | 唯一色 | 亮度标准差 | 非白像素 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| `01-cli-panel-signed-out.png` | 17,800 | 1008×167 | 458 | 22.62 | 2.77% | 非空白 ✅ |
| `02-cli-panel-update-available.png` | 59,215 | 1008×563 | 730 | 45.78 | 22.31% | 非空白 ✅ |
| `03-cli-panel-after-login-click.png` | 61,787 | 1008×587 | 779 | 44.90 | 22.27% | 非空白 ✅ |

（01 为两行卡片窄裁切，非白占比低属预期；三者亮度标准差均远大于 0，非纯色空白页。）

### 2.2 `未登录` 只在 claude 与 qwen 出现；`登录` 按钮只在 claude 出现

实际 DOM（场景 01/02，同一渲染）：

| 行 | 标签（`.omx-cli-tag`） | 按钮 | 说明文案 |
| --- | --- | --- | --- |
| Claude Code | `已安装`、**`未登录`**、**`有新版本`** | `测试`、**`登录`**、**`更新到 2.1.289`** | `2.1.223 (Claude Code)` |
| Codex CLI | `已安装` | `测试` | `codex-cli 0.159.3` |
| Qwen Code | `已安装`、**`未登录`** | `测试`（**无**`登录`） | `0.19.6`、**`该 CLI 已不再提供账号登录入口`** |

- `未登录` 出现次数：**2**（claude、qwen）— 期望 2 ✅
- `登录` 按钮数：claude 行 **1**、codex 行 **0**、qwen 行 **0** — 期望一致 ✅
- qwen 未登录但 `loginSupported:false` → **有提示文案、无按钮** ✅（spec §4）

### 2.3 `有新版本` 只在 claude；`更新到 2.1.289` 存在；`已是最新` 全文不存在

- `有新版本`：仅 claude 行 ✅
- `更新到 2.1.289`：claude 行存在 ✅
- `document.body.innerText.includes('已是最新')` = **false** ✅（全文任意位置均无）
- codex（`state:'current'`）与 qwen（`state:'unknown'`）均**无**任何版本状态标记 ✅（spec §1：检查不可用不得渲染成「已是最新」）

### 2.4 点击 `登录` 只发一次 POST，随后开始轮询 GET

服务端请求日志（`request-log.json`，权威计数在服务端而非客户端埋点）：

```
[0] GET   /?v=2
[1] GET   /tokens.css
[2] GET   /bundle.css
[3] GET   /bundle.js
[4] GET   /omnimux/agents
[5] GET   /omnimux/auth/status
[6] GET   /omnimux/agents/updates
[7] POST  /omnimux/agents/login   {"id":"claude"}   ← 点击后，恰好 1 次
[8] GET   /omnimux/agents                            ← 轮询启动
```

- 点击后 `POST /omnimux/agents/login` = **1** 次，请求体 `{"id":"claude"}` ✅
- 随后 `GET /omnimux/agents` = **1** 次（3 秒轮询首跳）✅
- 轮询只跳一次即停：桩在 POST 时把 claude 翻为 `signed-in`，首次轮询即命中 `auth.state === 'signed-in'` → `stopLoginPoll()`。**这正是 spec §4 要求的「一旦 signed-in 立即停止」**，非轮询失败。

点击后状态变化：

| 项 | 点击前 | 点击后 |
| --- | --- | --- |
| claude 标签 | `已安装`、`未登录`、`有新版本` | `已安装`、`有新版本`（**`未登录` 消失**） |
| claude 按钮 | `测试`、`登录`、`更新到 2.1.289` | `测试`、`更新到 2.1.289`（**`登录` 消失**） |
| 通知区（`role="status"`） | 无 | **`已打开终端，请在终端里完成登录`** |

### 2.5 渲染期 console error

`window.__consoleErrors`（装置内捕获 `console.error` + `window.onerror` + `unhandledrejection`）在三个场景中均为 **`[]`** ✅

---

## 3. 已知限制（未能验证 / 非被测路径瑕疵）

1. **页签标签在装置里不可读（装置环境问题，非产品缺陷）**
   分段页签的活动项（`本机 CLI`）为深色药丸 + `color: var(--dsw-alias-bg-base)`。装置内 `--dsw-alias-bg-base` 解析为空串，导致文字与背景同为 `rgb(15,17,21)`。原因：随 primitives 打包进来的重置样式在根/`body` 上把一批 `--dsw-*` 令牌置为 `unset`（自定义属性的 `unset` = 继承），而独立装置没有真实宿主外壳提供该令牌；已尝试把浅色令牌同时锚定到 `:root` 仍未生效。
   **影响范围**：仅该页签标签的配色；`AgentPanel`（本次改动路径）的行、标签、按钮、提示文案全部正常可读。**未**在产品代码里做任何规避，也未据此判定产品问题。

2. **`更新到 2.1.289` 按钮的点击路径未取证**
   任务要求的三张截图与断言未包含点击「更新」。`updateAgent()` 的代码路径（POST `/omnimux/agents/update` → 重新扫描 → 提示 `已更新完成`）本次**未**在浏览器里点击验证。

3. **登录轮询的「超时 2 分钟」分支未取证**
   桩在首次轮询即收敛为 `signed-in`，因此 120 秒上限与「未收敛则停止」分支未被触发。

4. **`t` 与 `scope` 由装置提供**
   宿主注入的翻译器与设置席位 scope 无法在独立装置中复现，装置以真实 `zh` 词典 + 稳定的 `getSnapshot` 桩替代（后者必须引用稳定，否则 `useSyncExternalStore` 会触发 React #185 无限更新——此坑已在装置内修正并注明）。

5. **仅 Chromium 内核**
   本证据为 ego-lite（Chromium）。Electron 外壳内的表现不在本次取证范围。

---

## 4. 复现方式

```bash
WT=<repo>/.worktrees/omnimux-cli-auth-update-issue-3178
H="$WT/docs/evidence/cli-auth-update/harness"

cd "$H"
python3 extract-tokens.py          # 官方设计令牌（需已安装 DSH 应用）
node build.mjs                     # esbuild 打包真实组件 → dist/
node server.mjs                    # port:0，写出 URL 到 /tmp/omnimux-3178-harness.json
# 用 ego-browser 打开 http://localhost:<port>，截图 + 读取 /__requests
node png-stats.mjs ../0*.png       # 截图非空白统计
```

装置控制路由：`GET /__requests`（请求日志）、`GET /__reset`（清日志并复位登录态）。

---

## 5. 文件清单

| 文件 | 说明 |
| --- | --- |
| `report.md` | 本报告 |
| `01-cli-panel-signed-out.png` | claude 未登录 + 登录按钮；codex 两者皆无 |
| `02-cli-panel-update-available.png` | 整卡：claude 有新版本 + 更新到 2.1.289；qwen 未登录 + 提示无按钮；全文无「已是最新」 |
| `03-cli-panel-after-login-click.png` | 点击登录后：标签/按钮消失 + 通知文案 |
| `request-log.json` | 服务端请求日志原文（POST 计数权威来源） |
| `harness/entry.jsx` | 挂载真实 `RuntimeModeSection`，注入 `HUB_CSS`、`t`、scope 桩、console 捕获 |
| `harness/index.html` | 装置页面 |
| `harness/server.mjs` | 静态服务 + 四契约路由 + 请求日志（port 0） |
| `harness/build.mjs` | esbuild 打包脚本 |
| `harness/extract-tokens.py` | 从官方主题提取并合并设计令牌 |
| `harness/tokens.css` | 提取产物（浅色/深色各 77 static + 93 alias） |
| `harness/png-stats.mjs` | 截图非空白统计 |
| `harness/dist/` | 打包产物（`entry.js` 4.3MB、`entry.css` 82KB） |

> 本次未改动任何产品代码；写入仅限 `docs/evidence/cli-auth-update/`。
