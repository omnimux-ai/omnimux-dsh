# 规格说明：扩展的模型调用出口唯一为本机服务

工单 #1660。落点：`plugins/omnimux-browser/extension/manifest.json`（扩展页网络策略）、`plugins/omnimux-browser/extension/src/background/index.ts`（推特就地助手文案补全通道）、`plugins/omnimux-browser/extension/tests/extension-network-policy.spec.ts`（新增静态守卫）。

本规格取代两份描述已移除行为的旧规格：`specs/extension-csp-and-dual-fallback.spec.md` 与 `specs/twitter-copilot-deepseek-priority.spec.md`。

## 1. 背景

一次改动把调用外部模型所需的授权凭据直接写进扩展后台源码（`atob` 编码伪装，等同明文），并新增两条在本机服务不可用时改走外部供应商的直连分支，同时把扩展页 `connect-src` 放行到对应域名。该改动同时违反仓库产品边界（不得提交密钥）与本项目已确立的决策（插件端不直连外部模型、不存凭据，统一复用桌面端模型配置与调度通道）；它自带的规格在验收标准中写着「无明文硬编码密钥」，实现与该条自相矛盾。

## 2. 目标与非目标

### 目标

- 扩展源码与构建产物中不存在任何外部模型端点、授权头常量或供应商密钥。
- 扩展页网络策略只放行本机环回与既有无害来源。
- 推特就地助手的文案补全保持原有可用性，但出口唯一：本机补全接口 → 桥接 RPC 兜底 → 明确未就绪提示。
- 用确定性用例锁住上述约束，使该行为无法被再次实现而不被发现。

### 非目标

- 不改动本机补全接口与桥接 RPC 的业务语义、超时与参数。
- 不改动推特助手的提示词、场景矩阵、注入与回填交互。
- 不引入任何新的运行时依赖或配置项。
- 不处理凭据作废与重发（由持有人在模型平台执行，Agent 不接触密钥）。

## 3. 方案

### 3.1 移除外部直连（`background/index.ts`）

删除 `DSH_TWITTER_COPILOT_GENERATE` 处理链中的两条外部供应商分支（含其授权头常量与供应商模型名），仅保留：

1. 本机补全接口：按「桥接地址推导的 HTTP 基址 → 45120 → 43120 → 3080」候选集依次尝试 `POST /omnimux/text/complete`；
2. 桥接 RPC 兜底：已连接时经 `session.create` + `session.prompt` 取回文案；
3. 两者均不可用时返回未就绪提示。

### 3.2 回退网络策略（`manifest.json`）

扩展页 `connect-src` 回退为 `ws://127.0.0.1:*`、`http://127.0.0.1:*` 与既有的 `https://raw.githubusercontent.com`，移除两个外部模型域名。

### 3.3 规格取代

删除两份描述已移除行为的规格，以本规格作为该约束的唯一真源。

### 3.4 静态守卫（新增用例）

新增 `tests/extension-network-policy.spec.ts`，直接读取 `manifest.json` 与 `src/background/index.ts`：

- 断言扩展页网络策略不含 `api.` 形态的外部模型域名；
- 断言后台源码不含 `api.deepseek.com`、`api.apikey.fun` 等外部模型端点与 `atob(` 承载的 bearer 常量；
- 断言本机补全接口路径仍被引用（防止守卫通过「一并删除功能」而变绿）。

## 4. 验收标准

| 编号 | 场景 | 可观察结果 |
| --- | --- | --- |
| A1 | 检查扩展页网络策略 | 不含任何外部大模型域名，仅本机环回与既有来源 |
| A2 | 检查扩展后台源码 | 搜索外部模型端点与授权头常量，命中数为 0 |
| A3 | 本机服务可用 | 推特就地助手文案经本机补全接口取回（行为与改动前一致） |
| A4 | 本机服务不可达、桥接可用 | 经桥接 RPC 兜底取回文案 |
| A5 | 两者均不可用 | 返回未就绪提示，不产生任何外部请求 |
| A6 | 守卫用例 | 人为改回任一被禁内容时用例失败 |
| A7 | 扩展套件 | 全量通过 |

## 5. 测试策略

- `tests/extension-network-policy.spec.ts`（A1、A2、A4 的源码层约束）。
- 扩展既有套件（A3、A5、A7）与 L0 静态门禁。
- A6 以「临时改回 → 用例转红 → 复原」的一次人工反向验证记录在 PR 中。
