# Spec: 产品基线硬门禁（开发机不是基线）

**Issue:** #2129 ｜ **模块:** 全局（`AGENTS.md` / `docs/contracts` / `scripts`）｜ **优先级:** P0

## 1. 问题与目标

### 1.1 现象

Agent 在开发本仓插件时反复把**开发机本地已有的模型、本机兼容代理（CPA 一类）、本机配置文件**当作产品能力来设计与验证。已发生的实例：

- `plugins/omnimux/src/text/chat.js` 曾按 `$DSH_HOME` → `~/.omnimux-dev` → `~/.dsh` 的候选路径扫描 `settings.yaml` / `.credentials.yaml` 来发现 provider（已由 #2127 改为中枢单通道）。
- `specs/products-text-channel-priority.spec.md` 把「本地 chat 桥」列为商品链接智能解析的第一顺位主力通道，并读取 `~/.omnimux-dev/settings.yaml`。
- `plugins/omnimux-browser/extension/src/panel/components/DshInstanceSelector.tsx` 把开发版实例 `omnimux-dev` 标为 `isRecommended`。

### 1.2 根因

上下文从未定义「参考环境」。`docs/contracts/hub.md` 只规定了**结构**（谁是唯一路由、谁持有密钥），没有任何一处规定**以谁的机器为准**。Agent 只能以「在本机能否看到效果」为正确性判据，而开发机上恰好配好了本机模型与代理，于是开发机私有状态被逐层写成产品路径。

现有机械门禁（`.dsh/hooks.json` 三道 hook、`scripts/auto-qa-scan.mjs`、`scripts/verify-plugin-boundaries.mjs`、CI `quality-gate.yml`）检测面为语法/密钥/裸色/JSX/扩展 connect-src/import 边界，**无法识别环境依赖型改动**。

### 1.3 目标

让「产品路径只依赖新用户装完就有的东西」成为**可机械判定**的不变量，同时其判定依据有单一真源、且不产生噪音。

## 2. 交付物

| 层 | 产物 | 作用 |
| --- | --- | --- |
| L1 | `AGENTS.md` 新增「产品基线」原则（≤3 行 + 指针） | 总是生效的软约束，指向合同 |
| L2 | `docs/contracts/product-baseline.md` | 单一真源：参考环境、默认 vs 显式开启、禁止清单、允许的本机用法、验收口径 |
| L3 | `scripts/verify-product-baseline.mjs` + `scripts/product-baseline-allowlist.json` + `scripts/verify-product-baseline.test.mjs` | 机械硬门禁（类目 1–4 红灯）+ 差量自检清单（提示） |
| L3 | `package.json` / `.github/workflows/quality-gate.yml` / `.dsh/hooks.json` 接线 | 提交时、CI、编辑期三处生效 |
| L4 | `.agents/skills/omnimux-repo-workflow/SKILL.md` 一行要求 | 任务级：规格必须写「新用户基线」 |
| L5 | `specs/products-text-channel-priority.spec.md` 降级为历史记录 | 灭毒：不再被后来者当权威先例读 |

**本 Spec 不含**（第二步，另开 PR）：商品链接智能解析通道顺序回调、浏览器插件撤下开发版推荐位。

## 3. 门禁规则

| # | 规则 | 级别 | 判定 |
| --- | --- | --- | --- |
| R1 | `dev-identity` | 红灯 | 产品运行时代码出现开发版身份（`.omnimux-dev` / `omnimux-dev`） |
| R2 | `local-channel-discovery` | 红灯 | 同一运行时代码文件既读 `settings.yaml` / `.credentials.yaml`，又出现 provider 选择标记（`providers` / `baseURL` / `apiKeyEnv` / `llm-pi-ai`） |
| R3 | `loopback-provider-endpoint` | 红灯 | 运行时代码把回环地址的 `/v1` 形态当作模型端点 |
| R4 | `plugin-provider-key` | 红灯 | `plugins/omnimux` 之外的业务插件读取 provider 密钥环境变量 |
| R5 | `dev-machine-path` | 红灯 | 运行时代码出现开发机绝对路径（`/Users/<某人>/Desktop/…`、`~/Desktop/Project/…`） |
| R6 | `new-user-checklist` | 提示 | 本次改动触及 provider / 中枢席位代码时，打印「新用户基线」自检清单 |

**豁免**：只能写入 `scripts/product-baseline-allowlist.json`，每条必须带 `reason`；无理由的条目报错；匹配不到任何位置的「僵尸豁免」同样报错。

**扫描范围**：`plugins/*/src/**`、`plugins/*/extension/src/**`、`plugins/*/lib/**`、`packages/*/src/**`；排除测试（`*.test.*` / `*.spec.*` / `tests/` / `fixtures/`）。

## 4. 验收用例

| # | 场景 | 预期 |
| --- | --- | --- |
| 1 | 全仓扫描当前主干 | 退出码 0；允许清单每条都命中且带理由 |
| 2 | fixture：运行时代码写入 `~/.omnimux-dev/settings.yaml` | R1 红灯 |
| 3 | fixture：运行时代码同时读 `settings.yaml` 并含 `providers` | R2 红灯 |
| 4 | fixture：运行时代码把 `http://127.0.0.1:8317/v1` 当端点 | R3 红灯 |
| 5 | fixture：业务插件读 `CPA_API_KEY` | R4 红灯 |
| 6 | 正例：`assertLocalWrite` 回环写保护、浏览器桥的本地实例发现 | 不报（避免误报） |
| 7 | 测试与夹具目录中的同样代码 | 不报（范围外） |
| 8 | 允许清单条目缺 `reason` | 报错退出非 0 |
| 9 | 允许清单条目匹配不到位置 | 报错退出非 0 |
| 10 | `--diff` 模式只报本次改动引入的违规 | 未改动的存量违规不阻断 |

## 5. 验证命令

```bash
node scripts/verify-product-baseline.mjs
node --test scripts/verify-product-baseline.test.mjs
pnpm --config.verify-deps-before-run=false verify:gates
```

## 6. 边界

- **总是**：新增/修改规则必须同时补正例与反例断言；豁免必须带理由。
- **绝不**：为了让存量通过而放宽规则或把规则改成提示；不得把本门禁做成需要人工追加参数的旁路脚本。
