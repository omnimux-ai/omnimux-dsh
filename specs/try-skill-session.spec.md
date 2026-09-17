# 技能页「去对话中试试」临时加载到当前会话

Issue: #2166
日期: 2026-09-17

## 目标

技能/专家页卡片点「去对话中试试」后，当前会话输入框立刻切换为该技能，技能指令临时进入本会话（点了就能用），全程不安装、不进「我的 Skill」。

## 用户旅程

1. 用户打开技能/专家页，悬停官方精选卡片，点「去对话中试试」。
2. 当前这场对话（页面底部输入框所属会话）输入框底部出现该技能标识，文案为卡片技能名。
3. 用户直接发消息，智能体按该技能指令干活。
4. 「我的 Skill」不新增该技能；安装目录不新增文件夹。
5. 用户点标识上的关闭，技能从本会话撤下。

## 成功标准

| ID | 操作 | 期望 |
| --- | --- | --- |
| AC-1 | 点「去对话中试试」 | 当前会话输入框底部出现该技能标识，文案=卡片名；不新建会话 |
| AC-2 | 点完后查安装目录与「我的 Skill」 | 不调用安装接口；`$DSH_HOME/skills/<slug>` 不新增；「我的 Skill」不出现该技能 |
| AC-3 | 本会话后续一步系统提示 | 含该技能指令正文；其他会话不含 |
| AC-4 | 已安装技能同样点试试 | 仍走临时挂载，不重复安装 |
| AC-5 | 点击后 | 有可见反馈（技能标识出现），不再无响应 |
| AC-6 | Hypit 等 `installFlow=session-guide` 的安装按钮 | 仍走原引导安装+预填路径，本 Issue 不改安装语义 |

## 产品基线

新用户机器：仅依赖本机 `$DSH_HOME` 会话临时文件与市场已打包/远程可读的技能正文。无开发机目录、无静默回退。取不到正文时仍点亮标识，系统提示写明「临时技能已选定但正文不可用」。

## 命令

- 单测：`pnpm --filter omnimux-market test`
- 相关：`plugins/omnimux-market/src/client/skill-workshop-ui.test.js`、`plugins/omnimux-market/src/tests/session-attach.test.ts`

## 结构

- `plugins/omnimux-market/src/client/session-create.js` — 试试走当前会话
- `plugins/omnimux-market/src/client/plaza/plazaUtils.js` — 点击可达
- `plugins/omnimux-market/src/session-attach.ts` — 会话临时技能落盘与提示段
- `plugins/omnimux-market/src/local-api.ts` — `tryAttach` 不写安装目录
- `plugins/omnimux-market/src/host.ts` — 系统提示注入临时技能

## 边界

- 总是：不安装、不新建会话（无当前会话时才创建空白会话）、不自动发送。
- 先问：无。
- 绝不：改专家召唤；改「查看详情」/安装按钮；把临时技能写成长期安装。
