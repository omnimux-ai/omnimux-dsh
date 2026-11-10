# 本地 Agent 模型探测测试隔离（Issue #4022）

## 背景

`plugins/omnimux/src/agents/local.test.js` 有两个用例直接调用 `probeAgentModels('codex')` / `probeAgentModels('kimi')`，未注入缓存路径或模型探测函数。在装有 Codex 的开发机上，它们会读取真实的 `~/.codex/models_cache.json`，或执行真实的 `codex debug models`，导致静态期望 `gpt-6-astra` 不成立，目标文件出现 2 项失败；干净 HOME/PATH 下则 16/16 通过，CI 也通过。

## 目标

- 只修测试隔离：两个失败用例注入固定的 codex / kimi fixture，不再读取真实 HOME 或执行真实 CLI。
- 在装有 Codex 的开发机上 `node --test plugins/omnimux/src/agents/local.test.js` 稳定 16/16 通过，干净 HOME/PATH 环境同样 16/16 通过。
- 保留既有断言，仅追加 fixture-only 模型断言，证明读取的是注入 fixture 而不是静态回退。
- 不修改 `plugins/omnimux/src/agents/local.js` 的生产逻辑、探测顺序或默认路径。

## 非目标

- 不新增模型探测能力，不调整模型清单，不改产品行为。
- 不新增浏览器验收或 Dev 物化；本次仅测试文件与任务规格。
- 不新增依赖、构建配置或环境变量。

## 假设

- 本机 Codex 安装和 `~/.codex/models_cache.json` 是两个失败的完整环境因素；干净 HOME/PATH 下 16/16 通过支持这一点。
- `probeAgentModels` 的 `codexPath` / `kimiPath` 注入入口稳定，`scanLocalAgents` 已把 options 透传给模型探测与路径解析，因此不改生产代码即可完成隔离。
- 将既有断言原样保留、仅追加新断言，不会触发测试标准变更门禁的削弱判定。

## 证伪方式

- 修复后在本机执行目标测试仍失败，或仍执行真实 `codex debug models`、读取真实 `~/.codex` / `~/.kimi-code`，则隔离无效。
- 隔离 HOME/PATH 下目标测试无法 16/16 通过，说明修复引入了新的环境依赖。
- 完整 hub 套件仍出现这两个失败，或出现无法在 `origin/main` 基线复现的新失败，则修复未达成或引入回归。

## 验收

- `node --test plugins/omnimux/src/agents/local.test.js`：16/16 通过（本机装有 Codex）。
- 同一命令在隔离 HOME/PATH 下：16/16 通过。
- `pnpm --filter omnimux test`：3771/3771 通过，0 失败、0 skip。
- `git diff --check`、`pnpm check:boundaries`、测试标准声明检查通过；影响矩阵确认无浏览器与 Dev 物化要求。
