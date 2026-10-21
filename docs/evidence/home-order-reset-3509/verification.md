# Issue #3509 验收证据：homeCustomOrder 写路径收口

- Issue：#3509（remix：服务端 3 项；客户端失败留痕拆分到 #3528）
- Worktree：`.worktrees/market-home-order-3509`（分支 `agent/market-home-order-3509-issue-3509`）
- base：`origin/main` = `9fa8a4c5c`（提交时 HEAD 未含本次改动，以 PR head 为准）
- Spec：`specs/home-custom-order-reset-3509.spec.md`
- 影响面（`node scripts/impact-matrix.mjs --git-diff --base origin/main`）：**isUiChange=false，browser.required=false**（无 client/UI 文件改动，浏览器 Web 验证 not-applicable）

## 改动

| 文件 | 改动 |
|---|---|
| `plugins/omnimux-market/src/local-api.ts` | POST 增加同源校验（trustedRestartRequest）与 `order` 数组校验；`order: []` 落盘清空；错误文案改为固定描述 + 错误码，不含路径 |
| `plugins/omnimux-market/lib/local-api.js` | 上述 TS 的构建产物 |
| `plugins/omnimux-market/src/tests/home-order-write.test.ts` | 7 个真实 HTTP 用例：正常写 / 重置清空 + GET 读回 / 非法 order 400 / 损坏 JSON 500 / 只读目录 500 / 缺文件 500 / 非同源 403 |

## 可观察行为（临时目录 + 真实 port:0 HTTP）

| 场景 | 结果 |
|---|---|
| POST `{order:['b','a']}`（同源） | 200 `{ok:true,order:['b','a']}`，catalog 落盘且保留其他字段 |
| POST `{order:[]}`（重置） | 200；catalog `homeRecommendations=[]`；GET 读回 `{order:[]}` |
| POST 缺失 / 字符串 / 对象 / null order | 400 `order must be an array`，catalog 不变 |
| 损坏 JSON | 500 `home custom order not saved: recommendations catalog is not valid JSON`，错误体无绝对路径，坏文件不被覆盖 |
| 只读目录（chmod 0500，finally 恢复） | 500 `... recommendations catalog not writable (EACCES)`，错误体无绝对路径，原文件保持 |
| 缺 catalog 文件 | 500 `... recommendations catalog missing`，不创建文件 |
| POST `sec-fetch-site: cross-site` / Origin 不匹配 / 缺 Origin | 403 `... limited to same-origin requests`，catalog 不变 |
| GET 读路径 | 200，不受同源限制 |

错误体断言显式检查不含：临时目录、config 绝对路径、`skill-recommendations.json`、`tmpdir()`。

## 命令与结果（实际执行）

| 命令 | 结果 |
|---|---|
| `pnpm --filter omnimux-market build` | exit 0（tsc strict 通过，lib/local-api.js 与 src 一致） |
| `node --test lib/tests/home-order-write.test.js` | **7 pass / 0 fail** |
| `pnpm --filter omnimux-market test` | exit 0；**990 pass / 0 fail**（含 build 与全部 e2e spec） |
| `node scripts/impact-matrix.mjs --git-diff --base origin/main` | browser.required=false（无 UI 改动） |
| `node scripts/verify-silent-catch.mjs --json` | 目标文件 SC1/SC2=0；改动文件 delta `hits=[]`（无新增 SC1/SC2） |
| `node --test scripts/verify-silent-catch.test.mjs` | 通过 |
| `pnpm verify:product-baseline` | exit 0 |
| `git diff --check` | exit 0 |

## 安全/行为变化说明

- 同源校验复用其它 mutating 方法的 `trustedRestartRequest`：浏览器同源 POST 携带 Origin 正常通过；缺少 Origin 的非浏览器调用（如裸 curl）会被 403，属预期收紧。
- 重置现在会真实改写 `catalog/skill-recommendations.json` 的 `homeRecommendations`（此前是 200 假成功）；只读安装目录下重置会如实返回 5xx。
- 错误体不再包含安装路径（只保留固定描述 + `err.code`），仍可据此诊断。

## 残留

- 客户端 `plaza/plazaUtils.js` 仍以 `.catch(() => {})` 吞掉写失败：拆到 **#3528**（需可绑定 worktree 源码的真实浏览器验收路径；market 为 `shell.overlay`，`worktree-web-qa` Stage 清单不含它）。
