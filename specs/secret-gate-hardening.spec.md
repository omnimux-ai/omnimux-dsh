# 规格：插件源码凭据硬门禁加固（base64 变形凭据 + 扩展出站白名单）

- Issue: #1675
- 事故前身: `ae774033f`（引入）→ `b9a3bc2e5` / PR #1662（移除）
- 变更面: `scripts/auto-qa-scan.mjs`、`scripts/auto-qa-gate.mjs`、`scripts/auto-qa-scan.test.mjs`（新增）、`.github/workflows/quality-gate.yml`、`package.json`
- 性质: 纯门禁/脚本变更，无界面、无运行时行为改变（不改写任何扩展配置语义）

## 1. 问题

`ae774033f` 把模型凭据写进 `plugins/omnimux-browser/extension/src/background/index.ts`，形式为 `atob('Bearer sk-…')`（base64 承载），并把扩展页 `connect-src` 放行到 `api.deepseek.com`、`api.apikey.fun`。

现有 L0 门禁对这次事故完全无感，三条缺口均已实证：

1. `SECRET_PATTERNS` 的 4 条规则都是明文匹配，对 base64 承载的凭据 0 命中；
2. `SOURCE_EXTENSIONS` 只含 JS/TS 扩展名，`manifest.json` 根本不进扫描列表；
3. 事后唯一可静态发现的信号（`connect-src` 外部主机）没有任何规则检查。

## 2. 目标与非目标

目标：用确定性硬规则补齐上述三条缺口，使同一形态的改动一旦重演就在门禁处变红。

非目标：
- 不做历史密钥清除与凭据轮换（凭据作废由持有人另行处理）；
- 不改写扩展配置语义，只读校验；
- 不把 JSON 全面纳入扫描（会引入大量无关误报），只纳入扩展清单；
- 不改动 `--diff` 语义与 `ci-verdict.mjs` 的 `--report` / `--files-from-git` / `--base` 契约。

## 3. 规则定义

### R1 变形凭据（`SECURITY_RULES` 新增，保留现有 4 条明文规则不变）

对源码中如下字面量做解码，解码文本再跑现有 `SECRET_PATTERNS`，命中即报错：

- `atob('<base64>')`
- `Buffer.from('<base64>', 'base64')`
- `Buffer.from('<base64>', 'base64url')`

报错文案（中文）：`检测到 base64 承载的硬编码凭据（解码后命中密钥特征）。`
报错文案**不得**包含被解码出来的凭据内容（报告文件会被上传为 CI 工件）。

### R2 扩展出站白名单（`SECURITY_RULES` 新增，仅作用于扩展清单）

作用路径：`plugins/<name>/extension/manifest.json`、`plugins/<name>/extension/manifest.<variant>.json`。

读取 `content_security_policy`（`extension_pages` 的字符串形式，以及 `connect-src` 的对象/数组形式，含嵌套）与 `host_permissions` / `permissions` 中出现的 `connect-src` 声明，抽出其中的主机并逐一校验：

允许：`127.0.0.1`、`localhost`（含 `ws://` / `wss://` 与任意端口、端口通配 `:*`），以及白名单常量中显式列出的 `raw.githubusercontent.com`。
禁止：其它任何主机（如 `api.deepseek.com`、`api.apikey.fun`），以及 `*` 这类通配所有主机的写法。

报错文案：`扩展联网出口只允许本机服务与本仓库白名单主机，禁止 …`。

白名单必须在该文件内以**带注释的常量**集中声明，便于审查。

## 4. 可测验收标准

| # | 判据 | 判定方式 |
| --- | --- | --- |
| A1 | 反证：`ae774033f` 的 `extension/src/background/index.ts` + 当时的 `extension/manifest.json` 必须报错 | 落到临时目录跑新规则，security 维度 `pass=false`，且分别命中 R1、R2 |
| A2 | 现有仓库不产生新误报：全部插件源码 + 全部扩展清单 security 维度 0 命中 | 全仓模式扫描，错误数 = 0 |
| A3 | 门禁语义不变：`--diff --base` 与 `ci-verdict.mjs --report/--files-from-git/--base` 行为不变 | 现有测试 `auto-pipeline.test.mjs`、`ci-verdict.test.mjs`、`impact-matrix.test.mjs` 全绿；`--all` 不写 `--output` 报告（不覆盖 verdict 输入） |
| A4 | 全仓模式存在且不受 git diff 限制 | `node scripts/auto-qa-gate.mjs . --all` 扫描数与全量一致并包含扩展清单 |
| A5 | 新测试进入 CI 清单并实跑通过 | workflow 的 `node --check` / `node --test` 清单含新文件；本地 `pnpm test:gates` + 新测试全绿 |

## 5. 用例清单（`scripts/auto-qa-scan.test.mjs`）

| 用例 | 期望 |
| --- | --- |
| ① 明文 `sk-…` 字面量 | 命中（沿用现有规则） |
| ② `atob('Bearer sk-…')` / `Buffer.from(…,'base64'/'base64url')` | 命中 R1 |
| ③ 清单含 `api.deepseek.com` / `api.apikey.fun`（字符串与对象两种 connect-src 形态） | 命中 R2 |
| ④ 清单只含 `127.0.0.1` / `localhost`（含 `ws://`、端口通配）+ `raw.githubusercontent.com` | 不命中 |
| ⑤ base64 承载的非凭据内容（图片 data、普通文案） | 不命中（不误报） |
| ⑥ 仓库真实插件源码 + 真实扩展清单回归 | 0 命中 |

用例中的密钥一律为自造假值，禁止写入任何真实凭据。

## 6. 风险与回滚

- 风险：R2 对新增扩展清单产生误报。缓解：白名单集中常量 + 只认 `connect-src` 声明（`host_permissions` 里的 `http://*/*` 作用域声明不参与校验，避免对现有清单误报）。
- 风险：R1 对合法 base64 数据（图片、公钥）误报。缓解：只解码 `atob` / `Buffer.from(…,base64[url])` 字面量，且解码文本必须命中既有 `SECRET_PATTERNS`。
- 回滚：单 PR 内恢复 `SECURITY_RULES` 与 workflow 步骤即可，无迁移、无数据变更。
