# 创作画布多执行并发（Issue #2255）验收证据

## 这份证据证明了什么

在**真实无头 Chrome** 中加载本工作树构建的创作画布 bundle（`plugins/omnimux-workflow` 的 dev 夹具），
点击夹具的运行场景后，**3 个节点同时处于「生成中…」**，证明画布不再把「同时只能跑一个任务」
施加到节点上；同时证明画布在浏览器中正常挂载（节点有正几何）。

| 断言 | 结果 |
| --- | --- |
| `harness-serving` | 通过（夹具静态服务就绪） |
| `canvas-mounted` | 通过（3 个节点，均有正几何） |
| `scenario-triggered` | 通过（真实点击夹具按钮） |
| `multiple-nodes-generating-at-once` | 通过（同时 3 个节点显示「生成中…」） |

## 产物

- `canvas-idle.png` — 触发前
- `canvas-multi-generating.png` — 触发后（3 个节点同时生成中）
- `report.json` — 结构化断言与截图清单（仓库相对路径）

## 复现方式

夹具本身由插件提供（`plugins/omnimux-workflow/scripts/canvas-harness.mjs`，随机端口、自清理）。
驱动脚本为任务自有脚本，执行时落盘于工作树 `.agent-reports/canvas-concurrency/verify.mjs`
（该目录被 git 忽略，不随 PR 提交）。它的行为：

1. 以随机端口启动画布夹具；
2. 启动真实无头 Chrome，经 CDP 打开夹具页面；
3. 断言 `.react-flow__node` 数量与正几何；
4. 点击夹具的 `mock running→completed` 按钮；
5. 统计 `innerText` 含「生成中」的节点数量并要求 ≥ 2；
6. 前后各截一张 PNG，写 `report.json`；
7. 结束时杀掉 Chrome 与夹具进程。

## 未覆盖

- 未对真实模型通道跑多执行并发 SSE 端到端（需真实凭据与计费）。
- 多执行控制器路径（多 SSE 订阅、按执行归属的终态收敛、重载恢复全部存活执行）
  由单元测试与跨文件契约测试覆盖，不在此浏览器证据范围内。
