# RC 验收报告：0.2.1-rc.3（Issue #3688 收尾项）

生成时间：2026-10-26。按 [omnimux-rc-upgrade 技能](../../.agents/skills/omnimux-rc-upgrade/SKILL.md) 的报告模板填写；**只写实测到的**，未取到的格子标 `missing` 并写明原因。

```text
pin: 0.2.1-rc.3 (1f81c047fc48fa190a683e469daa699857e9afe8)
product: 3c9c15aab（origin/main；#3688 声明面 = PR #3725 74d5ff08a，代码面 = PR #3742 ebcb93647，pin 表 = PR #3780 fdbd2db21）
host: /Applications/OmniMux Dev.app（CFBundleShortVersionString 2.0.10）；profile 底座随 pin 0.2.1-rc.3
profile: /Users/x/.omnimux-dev/profiles/omnimux
install-tree: pass（见下）
brand-checks: node scripts/verify-stage-contracts.mjs → PASS: 14 Stage components; 8 registered sidebar targets and their runtime contracts.
screens:
  empty-session: missing
  sidebar-brand: missing
  tool-call: missing
  desktop-no-open: missing（按仓库契约归人工：共享 Dev 应用验收不由 agent 代签）
evidence: 见下「证据与出处」
residual: 三屏浏览器证据待 Dev 应用启动后补；desktop-no-open 需人工
```

## install-tree（实测）

| 检查 | 结果 |
| --- | --- |
| profile 内插件数 | 22 个 `omnimux*` 包已物化 |
| `@deepseek-ai/schemastery` | 顶层 3.18.5；另有 3 个插件目录各自持有 3.18.5（`omnimux` / `omnimux-viewer` / `omnimux-browser`），**版本一致，无版本漂移** |
| `@deepseek-ai/cosmokit` | 1.8.6（与 lock 一致） |
| 插件各自安装 `@deepseek-ai/cordis` | **0 处** → 宿主单例未被复制 |
| 插件 peer 声明 | 已按双代容纳 rc.3（`>=0.1.x <… || >=0.2.1-rc.3 <0.3.0-0`），由 `scripts/verify-dsh-declaration-range.mjs` 在 CI 常驻校验（peer 44 / inject 19） |

## 品牌与 Stage 契约（实测）

`node scripts/verify-stage-contracts.mjs` → `PASS: 14 Stage components; 8 registered sidebar targets and their runtime contracts.`

> 前置：该脚本需要 `node_modules`，在**已 bootstrap 的主检出**里跑（`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`）。在未 bootstrap 的任务工作树里直接跑会报 `Cannot find module 'lucide-react'`，属环境前提，不是契约失败。
（同时打印若干 `dsh-ui-kit` 图标缺失提示——属运行中宿主未提供该图标的既有告警，不影响契约结论。）

## 四屏证据（未取到，原因如实记录）

| 屏 | 状态 | 原因 / 复现方式 |
| --- | --- | --- |
| 空会话品牌 | missing | 取证时（17:53）Dev 应用未运行：`127.0.0.1:45120` 无监听、进程不存在（ego-browser 报 `ERR_CONNECTION_REFUSED`）。**17:53:40 后 Dev 已启动**（45120 有监听），但新起的独立浏览器会话没有登录态（页面返回 `dsh web authentication required`），而共享 Dev 的已登录窗口只能通过它的 CDP 9229 访问——**仓内 hook 明令禁止 agent 直连共享 Dev 的 9229**。因此本屏须由人工在已登录的 Dev 窗口里截 |
| 侧栏品牌（展开/收起） | missing | 同上（同一登录态限制） |
| 工具调用（一次无害读取） | missing | 同上；且需在会话内实际触发一次工具调用 |
| 桌面冷启动（单窗口、不起外部浏览器） | missing | 按仓库契约**归人工**：共享 Dev 应用验收不由 agent 代签 |

## 证据与出处

- 声明面统一：PR #3725 = `74d5ff08a`（17 个 package.json peer 双代、15 个 inject 重映射、14 个 build-client externals、门禁 `verify-dsh-declaration-range.mjs`）
- 代码面迁移：PR #3742 = `ebcb93647`（viewer 设置/客户端、browser 消息来源与端口、依赖与锁）
- pin 表：PR #3780 = `fdbd2db21`（`docs/harness-pin.md` → `dsh@0.2.1-rc.3` + SHA + 日期）
- 门禁：`test:gates` 489/0 + 18/0；`verify:plugin-load` 22/22；`test:plugin-load` 8/8；`test:worktree-web` 6/6
- Dev 物化与冒烟：`sync-to-app.sh` 物化 22 个插件；`dev-smoke` 曾 `status=pass（6/6 断言：cdp-targets / page-health / screenshot / dev-process / plugin:omnimux:materialized / version-freshness）`

## 复现四屏的步骤（Dev 启动后）

1. 启动 OmniMux Dev（共享实例，端口 45120）。
2. 用 ego-browser 新建独立 TaskSpace，打开 `http://127.0.0.1:45120/`。
3. 依次截：空会话（品牌贴合、输入区无 OmniMux 标记）、侧栏展开/收起（标记与名称正确、入口可用）、会话内触发一次无害读取（无 `prepare` / `turn/end` 报错）。
   - **必须在已登录的 Dev 窗口里做**：新开的独立浏览器没有登录态（`dsh web authentication required`），而共享 Dev 的 CDP（9229）按仓库 hook 不允许 agent 直连。
4. 桌面冷启动单窗口、不拉起外部系统浏览器 —— 人工确认。

## 结论

自动化可核的部分（pin、声明面、锁、install-tree、插件装载、Stage 品牌契约、Dev 物化与冒烟）全部 pass。**四屏证据缺失，因此本报告不能宣称升级验收完成**，也不构成发布授权。
