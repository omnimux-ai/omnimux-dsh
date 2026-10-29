# 规范：PR 泄露门禁（家目录路径、部署敏感字面量、密钥）

Issue: [#3851](https://github.com/omnimux-ai/omnimux-dsh/issues/3851) · 风险 R1（`.github/`、`scripts/`、`docs/contracts/` 变更）

## 1. 目标

本仓公开并依赖 Merge Queue，但此前没有任何检查阻止 PR 新增维护者家目录绝对路径、源站地址或内部主机别名。`auto-qa-scan` 的 `SECRET_PATTERNS` 跳过 `scripts/`、测试与夹具，没有家目录/地址/主机名单，`full-scan` 只在 `merge_group` 跑。

成功标准：

- `quality-gate.yml` 新增 `leak-gate` job，在 `pull_request` 与 `merge_group` 上只扫本次变更的提交（`BASE..HEAD`），存量债务不阻塞。
- gitleaks 8.30.1（官方 release、sha256 校验）+ 根目录 `.gitleaks.toml`：默认规则 + `absolute-home-path` 规则（合成示例名放行）+ 8 个本地脚本里公开 Supabase 本地开发 demo JWT 的路径级放行。
- 新增行对仓库 secret `LEAK_DENYLIST_REGEX` 做匹配：secret 缺失时 PR 告警、merge_group 失败；只打印提交与文件，绝不打印命中值。
- `leak-gate` 进入 `static-and-tests.needs` 与「Require upstream jobs」结果检查，不改分支保护。
- 已分发插件集里 6 个带维护者家目录绝对路径的文件清理干净；`plugin-git-pr` 合同登记该门禁与 secret。

## 2. 新用户基线

不涉及运行时：改动只在 CI、文档、夹具注释与一条生成记录的 provenance 字段。新用户机器上没有新增依赖，也没有新的报错路径。

## 3. 范围

- `.github/workflows/quality-gate.yml`：`leak-gate` job + 聚合 job 接线。
- `.gitleaks.toml`（新增）。
- 清理：`packages/dsh-ui-kit/README.md`、`packages/dsh-ui-kit/src/icons/fixtures/rc3-icon-exports.txt`（仅头部注释；`icon-compat-rc3-fixture.test.js` 只数 `Icon*` 行，不受影响）、`plugins/omnimux-assets/README.md`、`plugins/omnimux-products/README.md`、`plugins/omnimux-workflow/README.md`、`plugins/omnimux-market/catalog/covers/home/bggg-data-amazon.generation.json`（`response.sourcePath` 只是 provenance，运行时无人读取，改为 `~/.dsh/...`）。
- `scripts/product-baseline-allowlist.json`：上面那条 provenance 的 R6 豁免随之失效，删除，否则门禁报僵尸豁免。
- `docs/contracts/plugin-git-pr.md`：一行登记。

非目标：不改写历史，不迁移内部 docs/evidence，不改插件行为。

## 假设

- gitleaks 默认全局 allowlist 含 `^/(?:bin|etc|home|opt|tmp|usr|var)/...`，若规则把带前导斜杠的整段当 secret，`/home/<name>/` 会被静默放行；因此规则用 `secretGroup = 1` 只取不带前导斜杠的 `Users|home/<name>/`，两种家目录都能命中。
- 公开配置里不能出现源站地址与内部主机别名本身，否则配置即泄露；只能放在 secret 里，fork PR 拿不到 secret 时只能告警，Merge Queue 运行一定带 secret，因此在那里 fail closed。
- `git log -p` 输出里只有 hunk 内以 `+` 开头的行才是新增内容；提交说明、`+++ b/<file>` 文件头和删除行都不能算命中。

## 证伪方式

- 一次性仓库：提交新增「/Users/ 或 /home/ + 非合成用户名 + /」形式的路径（如用户名 alicedev），`gitleaks git . --config .gitleaks.toml --log-opts=<range> --exit-code 1` 应退出 1；只新增合成用户名（me、runner 等）的同形路径应退出 0。任何一项相反即证伪规则设计。
- 本分支：`gitleaks git . --config .gitleaks.toml --log-opts="origin/main..HEAD" --redact --no-banner --exit-code 1` 必须退出 0。
- 从工作流抽出 denylist 步骤脚本，在一次性仓库用虚构值（文档保留段 IP、虚构主机名）跑：secret 缺失 + `pull_request` 退出 0 并告警；缺失 + `merge_group` 退出 1；新增行命中退出 1 且只打印提交与文件；只在删除行或提交说明里出现退出 0；非法正则退出 1。
- `node scripts/verify-product-baseline.mjs` 与 `node --test plugins/omnimux/src/client/icon-compat-rc3-fixture.test.js` 保持通过；对 6 个文件 grep 维护者家目录前缀 0 命中。
