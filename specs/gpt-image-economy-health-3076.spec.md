# #3076 GPT Image 2.5 经济线路更新核对与中枢健康

## 1 目标与验收
用户要求检查刚更新的经济线路，有变化则更新并做中枢健康测试。基线43dbfdc8685bb63f42cf83082372a65cef7909a6，上轮#3071经济一次524无任务ID。
AC1 当前官方pricing/主模型合同/更新逐字段与旧记录比较，来源与取时保留；上游只读本地实现不当部署凭证。经济仍主模型+分组，不新建公开模型ID。
AC2 正式guard/mapper/route健康，显式group economy与allowedGroups economy仅一候选；离线正负与严格模型合同、中枢回归绿，mock不作live。
AC3 当前用户明确测试可用覆盖最小一次n1、1K、1:1无参考图真实提交，正式executeOmnimuxMedia；出站创建POST硬上限1，锁分组、不收费fallback/retry。已有CLI令牌40仅进程注入，cross_group_retry=false，不改账户/凭据。
AC4 mode live并下载完整可解码图且display目检才标本次单图可用；HTTP200或task受理不足。全部异常保真实状态/taskID。有task只收原任务GET，没有ID不重提；不凭样本证明高分/多图/参考上限。
AC5 实际差异才最小修改、consumer闭合，无差异给无需更新结论不造代码。源码改需独审/回归/PR/MQ→Dev静默安装清理，无源码不重复安装。
AC6 当前单次task_K6Q75DXrvjzteEEHwtNxycZJyBX1zyaC返回终态failed但图片浅查询error=null、content删后详情404；官方GET /v1/tasks/同原ID明确fail_reason为速率限制。仅官方图片失败详情补正确通用任务查询，保持taskId、group和原omnimux-failed终态，不新POST、不把限速归账户额度/登录。custom/BYOK及video旧路径不改；详情失败仍保原错误。正式原终态只读复验必须显示已记录的原因。
新用户需官方可用生成凭据/额度，缺失明确needs-omnimux；不依本机私有服务。

## 2 命令
corepack pnpm install --ignore-scripts --frozen-lockfile
node scripts/verify-model-contracts.mjs --strict
node scripts/verify-plugin-boundaries.mjs
node scripts/verify-product-baseline.mjs
corepack pnpm --filter omnimux test
omnimux --no-auto-update tokens exec 40 --yes --timeout=700 -- env OMNIMUX_API_KEY=__OMNIMUX_TOKEN_40__ node .tmp/3076/live-economy.mjs
先读脚本确认单POST硬门，无密钥输出落盘。

## 3 结构
catalog/media中枢真源，consumer经公开seam。specs本文件；docs/evidence/gpt-image-economy-health-3076核验记录；报告.agent-reports/gpt-image-economy-health-3076；临时脚本/home只本树.tmp/3076，不复制Dev/profile。

## 4 风格
保持既有JS/TS与中文错误。输入示例{model:'gpt-image-2.5',group:'economy',allowedGroups:['economy'],n:1,resolution:'1K',aspectRatio:'1:1'}。协议/vendor独占HTTP、路由，不造第二客户端；key只env不记完整headers。

## 5 验证策略
官方只读与hub审读并行→静态精确健康/既有路由回归→授权单次真实闭环→保存异常/产物→实际差异才实现Verify/Test/Green。UI若变先真实功能浏览器再E2E；无UI不增界面。
健康覆盖目录严格、单候选、合法映射/非法本地拒绝、submit/原task收取/下载。参数范围按official文档，不按400或实图推定、不额外400试探。

## 6 边界
总是保旧失败与当前结果、真实exit/fail、report落盘、预算单submit，按真源。
先问额外生成、高分/多图/参考收费样本、只能人提供输入或越界成本。
绝不Prod、上游仓库写、桌面重启、凭据创建/切组/打印、付款、重复提交、静态目录/受理冒出图成功、自动扩线路。Dev只已合并main，无重启。
