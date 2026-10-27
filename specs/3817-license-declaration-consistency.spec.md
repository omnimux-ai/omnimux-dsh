# 3817 许可声明一致性（fork 协议不变）

Issue: #3817
Track: D（增量热修） · Risk: R1 · Base: origin/main

## 目标

一个包的许可声明只有一处真源，且消费者从 npm 安装时能读到适用许可原文。

## 分类原则（本任务的核心裁定）

MIT 允许在保留上游声明的前提下叠加自有代码，但不允许把上游 MIT 代码改标为更受限的许可。
因此按「包内是否含上游代码」而不是按「包属于谁」分类：

| 分类 | 包 | 处置 |
| --- | --- | --- |
| A 整包 fork（上游代码占主体） | `omnimux-market`、`omnimux-viewer`、`omnimux-browser` | `license` 保持 `MIT`，包内 LICENSE 保留上游原文 |
| B 部分 vendor（上游代码是子目录） | `omnimux-clip`、`omnimux-workflow` | 复合 LICENSE：列出上游路径范围与原文，其余为根许可 |
| C 原创 | 其余 17 个插件 | `license: SEE LICENSE IN LICENSE` + 根许可原文 |

## 范围

- 22 个 `plugins/*/package.json` 的 `license` 与 `files`
- 22 个包内 `LICENSE` 文件（新建 19 个，改写 2 个，保留 3 个）
- `scripts/license-registry.json`（新真源）
- `scripts/verify-license-consistency.mjs` + 单测（新门禁）
- `CONTRIBUTING.md` §4、`README.md`、`ACKNOWLEDGEMENTS.md`、`plugins/omnimux/THIRD-PARTY-NOTICES.md`

## 非目标

- 不改已发布 npm 版本的许可效力，不重新发布既有版本
- 不改上游 fork 的第三方许可原文（一个字节都不动）
- 不改 `packages/dsh-ui-kit` 的 MIT（独立共享包，非插件，不在 Issue 范围）

## 假设

上游 fork 的 MIT 授权要求派生分发保留原版权声明与许可原文，但不要求把派生包的 `license` 字段改成 MIT —— 保持 MIT 是最保守且必然合法的选择；把 vendor 目录的许可范围在包内 LICENSE 里逐路径写明，可同时满足上游 MIT 与自有商业边界。

## 证伪方式

若 `scripts/verify-license-consistency.mjs` 报出某个包的 `license` 与 `scripts/license-registry.json` 不一致、包内 LICENSE 缺失、`files` 未覆盖 LICENSE，或 A/B 类包的上游原文文件哈希与登记值不符，则本实现失败。另以 `npm pack --dry-run` 在单个原创包与单个 vendor 包上验证 tarball 内实际包含 LICENSE。

## 验收

- [ ] 22 包 `license` 字段与 registry 一致，无「原创包残留 MIT」
- [ ] 22 包 `files` 均含 `LICENSE`，包内 LICENSE 均存在
- [ ] A 类三包上游原文文件逐字节未变（与 base commit 比对）
- [ ] 门禁脚本可执行并给出计数；跳过项显式记录
- [ ] `pnpm check:package-files` 与新增门禁同绿
