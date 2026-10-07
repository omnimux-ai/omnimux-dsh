# 静默吞错存量扫描门禁（#3233）

## 背景与问题

`docs/contracts/hub.md:326` 与 `docs/contracts/anti-agent-fake-completion-guard.md:90` 早已写明「不许吞错」，但 `scripts/` 下没有任何存量扫描器，CI 也不检查。

现有 `scripts/guard-anti-cheat.mjs:76` 的规则只拦「吞错并返回含 `ok`/`status`/`success` 键的对象」，且 catch 必须带括号。实测本仓带括号空 catch **0 处**、无括号空 catch **279 处**（`plugins/*/src`，单行口径），两者完全不相交。它又是 `edit|write` 的写时钩子（`.dsh/hooks.json:48-55`），对磁盘存量无感知。

这就是「规矩写在文档里、存量却没人管」的确切原因。本任务把检查补上，并按「先测量、后阻断」收敛。

## 用户关键操作旅程

1. 开发者本地跑门禁（或 CI 跑 quality-gate）时，看到存量吞错点的清单与按插件统计。
2. 开发者新写一处吞错时，能在本地立刻看到提示，而不是等评审才发现。
3. 治理推进过程中，基线数字只能下降：修好的地方必须同步删掉白名单条目，否则门禁报错。

## 可测验收标准

- A1 新增 `scripts/verify-silent-catch.mjs`，扫描 `plugins/*/src/**` 的 `.js/.mjs/.cjs/.ts/.tsx/.jsx`。
- A2 排除 `node_modules`、`lib`、随包第三方编辑器目录（`plugins/omnimux-clip/src/client/openreel/**`）与测试文件。
- A3 只扫源码：Markdown、YAML 等文档与配置不在扫描范围内（现有钩子曾误拦 Markdown 报告）。
- A4 输出 `{rule, path, line}` 清单 + 按插件统计，并打印总数。
- A5 告警档恒以成功状态退出，不阻塞交付。
- A6 扫描器对真实代码库跑出清单（不接受只靠单测绿）。
- A7 接入 `package.json` 的 `verify:gates` 与 `.github/workflows/quality-gate.yml` 的 "Repo gate scripts" 步骤。
- A8 白名单条目结构 `{rule, path, line, reason}`，`reason` 必填且不少于 8 字。
- A9 实现僵尸豁免检测：条目对应代码已修好或已不存在时，扫描器报错要求删除，使条目只能减少。
- A10 数据源是静态分析结果，不是界面黑名单，不违反根 `AGENTS.md` 的「禁止用黑名单掩盖问题」禁令（其门禁为 `scripts/verify-anti-slop.test.mjs`）。

## 非目标

- 不在本批清理存量吞错代码（只测量与拦截新增）。
- 不改写时钩子 `guard-anti-cheat.mjs` 的现有规则。
- 不把扫描范围扩到文档、配置或随包第三方目录。
- 不做全局 logger 重构。

## 新用户基线

- 本任务只影响仓库开发与 CI，不进入产品运行时，不产生用户机器上的新状态。
- 扫描器在缺少 `plugins/` 目录时以成功状态退出并说明未扫描（不谎报 PASS）。

## 已知口径问题

存量计数存在 279 / 374 两个口径（差异来自跨行与文件范围）。本任务阶段 0 以扫描器自报数为唯一基线，并在报告中记录实际数字与口径定义。
