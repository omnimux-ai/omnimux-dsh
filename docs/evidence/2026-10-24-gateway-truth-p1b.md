# 网关真源切换（P1b）离线对账证据

- 日期：2026-10-24
- 任务：Issue #3734 P1b「成员 / 线路 / 价格切换为网关快照」
- 命令：`node plugins/omnimux/scripts/catalog-diff.mjs --gateway plugins/omnimux/src/catalog/cloud/bundled/pricing.json`
- 快照：随包 `plugins/omnimux/src/catalog/cloud/bundled/pricing.json`（离线，无网络、无真实模型调用）
- 说明：本文件记录切换**之后**的只读对账结果；对账只读，不改任何数据。

## 切换前后对照

| 指标 | 切换前 | 切换后 |
| --- | --- | --- |
| 网关在售模型 | 11 | 11 |
| 中枢上架模型（目录内共 44） | 9 | 5 |
| 中枢上架但网关不可达 | 4 | 0 |
| 网关在售但中枢未上架（缺调用契约） | 6 | 6 |
| 中枢分组在网关缺失 | 0 | 0 |
| 网关分组中枢未登记 | 3 | 0 |
| 积分估算与网关口径不一致 | 1（seedance-2-0 @ default：中枢 4.9 vs 网关 4.86） | 0（可比对 6 项） |
| 因 billing_expr 无法比对 | 3（gemini-3.8-flash；gpt-image-2.5 @ default / @ economy） | 0 |

切换前 4 项「中枢上架但网关不可达」为 seedance-2-0-fast / seedance-2-0-mini / seedream-5-0-pro / whisper-1：
它们有 listed 调用契约但网关不售，现在被成员资格求交挡在四个列表之外，因此不可达项归零。

切换后只剩「网关在售但中枢未上架」6 项，即**缺调用契约**计数（与 `catalog.gateway.missingContract` 逐项相等，
由 `gateway-truth-p1b.test.js` 用例⑤ 交叉校验）。

「无法比对」项从 3 降到 0：中枢不再为表达式计费的线路编造数字，改为在该线路的
`pricing.pointsNote` 上标注「网关按计费表达式计价，无法逐项比对」，因此对账里不再出现可比对却对不上的项。

## 原始输出

```text
# 网关目录 vs 中枢目录 差异报告
- 网关快照：plugins/omnimux/src/catalog/cloud/bundled/pricing.json
- 快照来源：pricing（2026-10-24T12:23:12.114Z）
- 快照摘要：b84ec130d9a9d11a
- 中枢目录：current checkout projection

## 概览

- 网关在售模型：11
- 中枢上架模型：5（目录内共 44）
- 中枢上架但网关不可达：0
- 网关在售但中枢未上架：6
- 中枢分组在网关缺失：0
- 网关分组中枢未登记：0
- 积分估算与网关口径不一致：0（可比对 6 项）
- 因网关按 billing_expr 计费而无法比对：0

## 网关在售但中枢未上架

- gemini-3.1-flash-lite-image（网关分组: default, nanobanana-economy）
- gemini-4-argon（网关分组: gemini-4-argon-multimodal）
- indextts-2（网关分组: auto, default）
- minimax-h3-video（网关分组: auto, default, minimax-h3-video-fast, minimax-h3-video-pro）
- suno-sounds（网关分组: default）
- wan-3.0（网关分组: wan-3.0-1080p, wan-3.0-720p）
```


## 已知缺口（用户已确认接受）

画布（`omnimux-workflow`）的渠道菜单仍读它自己的本地镜像 `channelGroups.ts`，因此在本步合入后仍显示旧口径的价格，直到镜像清理那一步：

| 型号 | 画布菜单显示 | 中枢快照口径 |
| --- | --- | --- |
| seedance-2-0 | standard = 4.9 | 4.86 |
| seedance-2-5 | 480p / 720p 两条 | 四条（另含 20.96 / 28.82） |
| gpt-image-2.5 | standard = 0.13、economy = 0.01 | 均为「按计费表达式计价，无法逐项比对」 |
| gemini-3.8-flash | standard = 100 | 无逐项可比数值 |
| seedance-2-0-fast / -mini / seedream-5-0-pro | 仍列价 | 网关不售（模型列表里已不出现） |

影响范围：只有渠道菜单里的**展示价**；实际计费由网关决定，提交路由与模型可见性都已按快照执行。画布模型列表已与中枢目录求交，已下架型号不会出现在选择列表里（已保存的旧节点仍保留型号，提交时被明确拒绝）。

用户于 2026-10-25 选择「先合中枢，画布留到下一步镜像清理」，本缺口记录在案。
