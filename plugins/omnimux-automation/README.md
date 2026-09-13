# omnimux-automation（自动化）

OmniMux 官方一级应用。在**独立 Session** 里按计划执行任务：Agent 无人值守跑，用户在工作台看执行记录与任务总览。

## 座位

唯一入口是社区 `dsh-better-sidebar` 的右侧工作台 Tab：

| 项 | 值 |
| --- | --- |
| Tab id | `omnimux-automation:workbench` |
| 标题 | 自动化 |
| order | `21`（studio 15 / products 16 / accounts 17 / forms 19 / analytics 20 之后） |
| single | `true` |

左侧任务树零侵入：本插件不注册任何 slot、不写 `data-dsh-product-stage`、不查询 DOM、不做任何更新检查。
缺少 `betterSidebar` 时不注册 Tab，只打一条诊断日志，不降级到 overlay / 详情页。

## 界面

顶部常驻胶囊分段开关，内容区在两个视图之间切换（切换不重挂载容器与弹窗宿主）：

- **执行记录**：按任务分组的执行会话。每行给出状态指示点、执行时间（按该任务时区）、触发类型（定时 / 手动），点击直达打开会话；有未读结果时可标记已处理。
- **任务总览**：任务卡片显示名称、周期与下次执行时间；右上角开关直接暂停 / 恢复；卡片底部可立即运行、编辑（带出当前配置）与删除（二次确认后才真正删除）。

面板收起或 Tab 未激活时，工作台把运行时切到停表状态，不空转轮询。

## 存储与兼容

- 存储域固定为 `dsh_automation` v1，表 `definitions` / `runs`，字段与老版本逐字一致，升级后历史任务与执行记录原样可读。
- 运行会话 id 沿用 `dsh-automation-session-` 前缀；RPC 通道沿用 `/dsh-automation`。
- **互斥声明**：旧的 `@michengai/dsh-automation` 与本插件共用同一个存储域。两者同时加载会出现双时钟跑同一批任务。升级路径是**先卸载旧的、再装新的**。

## Agent 工具

`automation_create`、`automation_list`、`automation_update`、`automation_runs`、`automation_run_now`、`automation_delete`。
名称与参数与旧版逐字一致，模型已经形成的调用习惯不受影响。审批门保留：受管 root Agent 在 `ask` 策略下创建 / 修改 / 立即运行 / 删除会弹确认；纯暂停不弹。

## 配置

```yaml
runTimeoutMinutes: 60      # 单次运行超时
misfireGraceMinutes: 15    # 漏跑宽限
historyLimit: 200          # 每个任务保留的终态历史条数
```

## 开发

```bash
npm test        # node --test，101 项
npm run build   # esbuild → lib/client.js
```

`npm test` 用 `--test-force-exit`：渲染级用例在 jsdom + 真实 React 里跑，React 调度器的长生命周期通道不会自己退出，需要运行器强制收尾。

离线单测通过 `scripts/register-dsh-stubs.mjs` 把官方 Host 运行时包替换成最小替身，`luxon` / `zod` 走真实实现。
