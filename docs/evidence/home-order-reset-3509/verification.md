# Issue #3509 验收证据：homeCustomOrder 写路径收口

- Issue：#3509（服务端 3 项；客户端失败留痕拆分到 #3528）
- Worktree：`.worktrees/market-home-order-3509`（分支 `agent/market-home-order-3509-issue-3509`）
- base：`origin/main` = `c737c9abd`（提交时以 PR head 为准）
- Spec：`specs/home-custom-order-reset-3509.spec.md`
- 影响面（`node scripts/impact-matrix.mjs --git-diff --base origin/main`）：**isUiChange=false，browser.required=false**（无 client/UI 文件改动，浏览器 Web 验证 not-applicable）

## 语义决策（评审后修订）

初版把 `order: []` 直接写回 `catalog/skill-recommendations.json` 的 `homeRecommendations: []`。评审确认该字段是**打包进客户端 bundle 的默认推荐**（11 条 curated 子集），清空会破坏默认推荐。改为：

- 自定义排序 → 写用户可写覆盖文件 `$DSH_HOME/omnimux-market-home-order.json`；
- 重置（`order: []`）→ 删除覆盖文件，GET 回退打包默认；
- catalog 默认**运行时只读**，字节不变。

## 改动

| 文件 | 改动 |
|---|---|
| `plugins/omnimux-market/src/local-api.ts` | 新增 `homeOrderStatePath` / `writeHomeOrderState` / `clearHomeOrderState` / `setHomeOrderPathsForTests`；POST 校验 order 数组 + 同源；GET 返回生效排序与 `source`；错误文案固定描述 + 错误码 |
| `plugins/omnimux-market/lib/local-api.js` | 构建产物 |
| `plugins/omnimux-market/dsh.manifest.json` | `storageDomains` 登记 `$DSH_HOME/omnimux-market-home-order.json` |
| `plugins/omnimux-market/src/tests/home-order-write.test.ts` | 9 个真实 HTTP 用例 + 1 个默认路径单测（见下） |

## 可观察行为（临时 catalog + 临时 state 路径 + 真实 port:0 HTTP）

| 场景 | 结果 |
|---|---|
| POST 自定义 `['b','a']`（同源） | 200 `{ok:true,order:['b','a']}`；覆盖文件写入；**catalog 字节不变** |
| GET（有覆盖） | 200 `{ok:true,order:['b','a'],source:'custom'}` |
| POST `{order:[]}`（重置） | 200；覆盖文件被删除；GET 返回打包默认 `['default-a','default-b']` 且 `source:'default'`；catalog 不变 |
| POST 缺失 / 字符串 / 对象 / null order | 400 `order must be an array`；不写覆盖文件 |
| 覆盖文件损坏 | GET 200 回退默认 `source:'default'`；下次写入可恢复 |
| 写失败（只读目录） | 500 `home custom order not saved: home order state not writable (EACCES)`；错误体不含路径；catalog 不变 |
| 清除失败（只读目录） | 500 同上；错误体不含路径 |
| POST `sec-fetch-site: cross-site` / Origin 不匹配 / 缺 Origin | 403 `... limited to same-origin requests`；不写覆盖文件 |
| catalog 缺失 | GET 200 `{ok:true,order:[],source:'default'}`；自定义仍可写入（互不依赖） |

错误体断言显式检查不含：临时目录、state 路径、catalog 路径、`home-order.json`、`tmpdir()`。

## 命令与结果（实际执行）

| 命令 | 结果 |
|---|---|
| `pnpm --filter omnimux-market build` | exit 0（tsc strict 通过；lib/local-api.js 与 src 一致） |
| `node --test lib/tests/home-order-write.test.js` | **10 pass / 0 fail** |
| `pnpm --filter omnimux-market test` | exit 0；**993 pass / 0 fail**（含 build 与全部 spec） |
| `node scripts/impact-matrix.mjs --git-diff --base origin/main` | browser.required=false（无 UI 改动） |
| `node scripts/verify-silent-catch.mjs --json` + delta | 目标文件 SC1/SC2=0；改动文件新增 SC1/SC2=0 |
| `node --test scripts/verify-silent-catch.test.mjs` | 通过 |
| `pnpm verify:product-baseline` | exit 0 |
| `git diff --check` | exit 0 |

## 安全/行为变化说明

- 同源校验复用其它 mutating 方法的 `trustedRestartRequest`：浏览器同源 POST 携带 Origin 正常通过；缺少 Origin 的非浏览器调用（如裸 curl）会被 403，属预期收紧。
- 用户状态从包内 catalog 迁到 `$DSH_HOME`：只读安装目录不再导致「排序成功但实际丢失」；重置会真实删除覆盖并恢复默认。写入前会 `mkdirSync(dirname, {recursive:true})`，DSH_HOME 不存在时自动创建父目录。
- 旧版本曾写进 catalog 的自定义排序不会被自动迁移（无法区分旧自定义与打包默认），打包默认以仓库文件为准；GET 无客户端消费者，无用户可见影响。
- 错误体不再包含安装路径（固定描述 + `err.code`）。

## 残留

- 客户端 `plaza/plazaUtils.js` 仍以 `.catch(() => {})` 吞掉写失败：拆到 **#3528**（需可绑定 worktree 源码的真实浏览器验收路径；market 为 `shell.overlay`，`worktree-web-qa` Stage 清单不含它）。
- 旧 catalog 中的历史自定义值不迁移，见上。
