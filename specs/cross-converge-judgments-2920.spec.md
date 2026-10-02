# Spec · #2920 收口关键判断（父 #2890 第 2 步）

## 背景与目标
审计（.agent-reports/arch-churn-audit-20261001/）四份报告共同定位 D1「一个决定多个真源」。本步把五类关键判断收敛到唯一拥有者并删除绕行入口；不新增产品功能，不动官方 DSH 源码，产品保持可用。

## 范围（In）
1. **放行判断单源**：`resolveExecutionPlan`（text/media 共用，产出 RouteDecision）是唯一的渠道/放行判定。mount 只做能力门禁 + 调用它，execute 只消费它。直连 HTTP `/omnimux/api/media/generate` 改成同一条决策链。
2. **删客户端第二路由**：`MediaViewerTab.jsx:165-243` 的渠道候选循环 + 错误文本正则删除，客户端只发起请求与展示结果（服务端 execute 的分组容灾保留——它是决策的一部分）。
3. **下载重试收敛**：`media/job.js` `isDownloadRetryable` + 默认 30 次重试收窄：终态 404/明确 4xx 不重试，只保留 `pending|processing|queued` 暂态且与外层轮询共享预算。
4. **宽度单源**：680px 只出现在一份 token 文件；其余处读取。
5. **吸底单 reducer**：`useComposerDocking` 是唯一状态机；删 `TrendingReplicateSection` 的重复控制器与 `omnimux:composer:dock-intent` 死监听（无发送方）。

## 非目标（Out）
- 不改任何用户可见行为（生成路径、错误文案、外观宽度数值不变）。
- 不动 media-viewer/explore/assets 的搬家（第 4 步）。
- 不删 `!important`/哈希类匹配的 UI 层（第 3 步）。

## 新用户基线
无凭据/无渠道的裸装用户：请求在 resolveExecutionPlan 判定后仍走原有错误路径，文案与现状一致，不因收敛而吞错。

## 验收（AC）
- AC1 `resolveExecutionPlan` 单源：`plugins/omnimux/src/media/` 与 `src/text/` 中除该函数与 RouteDecision 类型外，不再有第二次「isOfficial/isBypass/isListed」级判定；`resolveMediaRoute` 与 `resolveTextRoute` 均从它出决策。
- AC2 `direct-http.js` 删（或改为薄转发到统一入口），`host/apply.js` 不再挂载该绕行路由；`requireListed:false` 不再存在于代码。
- AC3 `MediaViewerTab.jsx` 不含 `standard→economy→pro` 候选表与 `分组|渠道|403` 正则；一次提交最多一次请求。
- AC4 `job.js` `isDownloadRetryable` 不再接受 404 与任意 400；`maxRetries` 默认 ≤ 4。
- AC5 680px 只在一个 token 文件出现；其余宽度引用该 token。
- AC6 `useComposerDocking` 之外不存在第二个 dock 状态写入点；`omnimux:composer:dock-intent` 无监听者；`force:true` 空载吸底语义不变（由合法入口触发）。
- AC7 `run-workspace-tests` 22/22 绿；`verify-plugin-load` 21/21；`test:gates` 绿；`verify:product-baseline` 绿。
- AC8 受影响包 `pnpm --filter omnimux test` 绿；浏览器工作树证据对「新会话页输入框宽度、探索页吸底点击」两条关键旅程留存截图/报告。

## 关键用户旅程
1. 已有官方渠道的用户发起媒体生成——路由决策与现状一致，错误仍原样上报。
2. BYOK 用户发起生成——仍走自备凭据路径，不被官方判定误拦。
3. 新会话页输入框在宽屏与窄分栏下都 680px 居中；探索页点卡片后输入框正常吸底。

## 风险与回滚
- 风险：删容灾循环后，原本靠客户端兜底成功的极少数失败场景暴露为报错——这是设计意图（让服务端 RouteDecision 与错误分类真相显现），回滚 = revert 本 PR。
- 依赖：#2891 已合入的 run-workspace-tests / verify-plugin-load 门禁。
