---
title: "产品基线：新用户环境是唯一参考"
id: "contract-product-baseline"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-17"
updated: "2026-09-17"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
tags: ["product-baseline", "new-user", "no-dev-dependency", "hard-gate"]
related:
  - "docs/contracts/hub.md"
  - "docs/contracts/model-list-ownership.md"
  - "docs/contracts/plugin-qa.md"
---

# 产品基线：新用户环境是唯一参考

## 1. 唯一的判据

产品基线 = 一台全新用户机器在「刚装完、刚登录」那一刻的状态。**开发机不是基线**，CI runner 不是基线，任何个人机器上的既有配置都不是基线。

新用户机器上**确定存在**：

- 安装壳与出厂插件包
- 执行中枢 `plugins/omnimux`
- 产品内登录后由中枢签发的凭据（`OMNIMUX_API_KEY` / `OMNIMUX_ACCESS_TOKEN`）
- `$DSH_HOME` 下由产品自己创建的存储目录

新用户机器上**确定不存在**：

- 本机模型服务、本机兼容代理（CPA 一类）
- `~/.dsh/settings.yaml` 里手工配置的 provider
- `~/.omnimux-dev/` 开发版目录、开发版专用端口与模型别名
- 任何需要用户先行手工搬运、安装或改配置才能出现的文件

一条功能只有在上述「确定存在」的集合内可完整跑通，才算交付。只在开发机上跑通的，**没有交付**。

## 2. 默认 vs 显式开启

| 可以成为默认路径 | 只能显式开启 |
| --- | --- |
| 经执行中枢席位与工具（`ctx.get('videoGenerate')` 一类、`omnimux_*`） | 任何本机模型服务或本地兼容端点 |
| 中枢持有的模型与密钥 | 用户自己填写的 provider 配置 |
| 产品自己创建的存储目录 | 开发版专用目录与开发版端口 |
| 未配置时抛出明确错误（`needs-omnimux` / `needs-provider`） | 静默降级为模板或启发式答案 |

显式开启的三个条件同时成立才算合规：由用户可感知的开关打开；失败时报明确错误；**不得**成为默认、首选或任何自动回退的下一跳。

## 3. 禁止清单

1. 产品运行时代码出现开发版身份（`~/.omnimux-dev`、`omnimux-dev` 实例标识）。
2. 产品运行时代码读本机 `settings.yaml` / `.credentials.yaml` 来决定模型通道或 provider。
3. 产品运行时代码把回环地址（`127.0.0.1` / `localhost` 的 `/v1` 形态）当作默认或回退的模型端点。
4. 业务插件（`plugins/omnimux` 之外）读取 provider 密钥环境变量或自行持有 provider 凭据。
5. 产品运行时代码出现开发机绝对路径（`/Users/<某人>/Desktop/…`、`~/Desktop/Project/…`）。
6. 失败后静默返回模板或启发式结果而不告知用户。

1–5 由 `node scripts/verify-product-baseline.mjs` 机械强制。豁免只能写进 `scripts/product-baseline-allowlist.json`，每条必须给出理由；无理由或已失效的豁免本身报错（僵尸豁免）。第 6 条无法可靠静态判定，靠评审与新用户验收把关，不在门禁中假装覆盖。

范围：只判产品运行时代码（`plugins/*/src`、`plugins/*/extension/src`、`packages/*/src`），测试、夹具、构建产物与 vendor 不判。

## 4. 允许的本机用法

本机回环并不等于违规。以下不受本门禁限制：

- 浏览器插件/扩展与本机宿主之间的桥接、实例发现与配对
- `assertLocalWrite` 一类的同源写保护
- 本地文件、媒体、剪辑与产物管线
- 测试夹具、离线开发脚本（不在运行时代码扫描范围内）

判据只有一句：**这段代码是否在为产品选择模型或凭据**。是 → 走中枢；否 → 可以是本机的。

## 5. 与其他合同的边界

| 合同 | 管什么 |
| --- | --- |
| `hub.md` | **结构**：谁是唯一路由、谁持有密钥、业务插件不得自带 provider 客户端 |
| 本合同 | **环境**：以谁的机器为准、什么能当默认、什么必须显式 |
| `model-list-ownership.md` | **清单归属**：模型列表的唯一所有者与变更流程 |

三者不重复定义同一件事。

## 6. 新用户可跑通（验收口径）

- 不安装任何本机模型、不修改任何配置文件、只在产品内完成登录，主要功能可完整跑通。
- 未登录或未配置时给出可理解的中文提示，不得静默给出模板结果。
- 每个任务规格必须写明「新用户基线」一节：该功能在新用户机器上依赖什么、缺什么时报什么错。

## 7. 执行方式

| 时机 | 命令 / 位置 | 效果 |
| --- | --- | --- |
| 每次提交与 CI | `node scripts/verify-product-baseline.mjs` | 禁止清单 1–4 红灯 |
| 编辑期 | `.dsh/hooks.json` PreToolUse 钩子 | 直接写入违规文件时拦截 |
| 任务级 | 任务规格的「新用户基线」一节 | 缺失不得进入实现 |
