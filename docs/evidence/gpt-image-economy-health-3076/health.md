# #3076 经济线路更新与中枢健康结算

## 官方变化
2026-10-04T08:36:25Z起匿名公开pricing仍a42d372ccf0b5dd13ecf71203521f9d2，model_contract仍4b4e2aff3500ec80；单一model gpt-image-2.5 + economy分组，基价USD0.013072、经济倍率.112455/公开¥.01标签未变。官方updates新增10月4日图片选路更新，自述已部署但未公布economy供应商映射；不据本地上游源码当生产身份。供应商旧GoEasy文档与上游历史记录冲突保留，不改模型能力、价格、档位。

## 中枢离线健康
基线43dbfdc8685bb63f42cf83082372a65cef7909a6。当前正式路由双锁group economy+allowedGroups economy仅候选gpt-image-2.5@gpt-image-2.5-economy，guard映射1:1/1K→size1024x1024 qualitystandard n1；没有混线回落。
初中枢3125/0/0；补修后3128/0/0真实exit0。严格模型合同、边界与产品基线通过。中枢正式client构建后装配1/1通过，两个既有client stub警告保留，不称真实桌面验收。初全插件装配因新树未构建20个bundle失败如实保留；后只验受影响中枢，不跳missingclient，不宣称整仓已验。

## 唯一真实创建与结果
2026-10-04T08:41:36.005Z正式executeOmnimuxMedia向官方创建POST仅1次，X-Omnimux-Group明确经济，令牌40 cross_group_retry=false。n1/no reference、1K、1:1、橘猫提示词；POST200约1.9s得task_K6Q75DXrvjzteEEHwtNxycZJyBX1zyaC。
原任务依次queued→processing→failed。图片兼容poll返回error=null、format=mp4及非产物content URL，不采此format推图片内容；content去尾详情404。真实无可解码图，verified=false，不作在线可用。前次#3071经济524无ID与本次可受理但失败是不同事实，初临时module路径加载失败零请求不算API重试。
只读同原任务官方/v1/tasks/id GET200返回platform62/statusFAILURE/100%及fail_reason“无法生成这张图片，因为当前图像生成请求触发了速率限制。请稍后再试。”。创建到服务finish约39s；限速可能在网关或供给层，未据platform编号猜供应商，不查后台绑定，不推断退款/零计费。

## 必要中枢补修及真实复验
仅官方image且base origin为api.omnimux.ai或omnimux.ai、path/v1，失败详情定位到同base/v1/tasks/编码taskId，保video及custom/BYOK旧定位。现有opt-in、来源约束、timeout与原因提取复用；原失败详情无法读仍保omnimux-failed，不造成功、不重提。
补修后正式中枢只收同原task：GET图片poll一次+GET genericdetail一次，POST0；仍omnimux-failed，错误包含原速率限制原因。仅证明原任务诊断修复，未称经济线恢复。新增3项锁原reason/GETonly、详情401/404/500保原失败、official-origin/version scope与video/custom不变；旧image无详情期望按已确认真源更新，不删断言不skip。

## 消费闭合与授权
无前端源码、布局或选项变更，价格/模型合同内容不变，查看器/画布/应用仍消费中枢同错误seam，不重复修改消费端或使用旧截图作新证据。用户本轮要求检查变化、必要更新、健康和可用测试，覆盖必要诊断缺口与PR/MQ/Dev；没有生产、上游workspace写、凭据创建、桌面重启、支付或第二次生成授权。
所有公开源原文取时及上游/hub独立审读主仓.agent-reports/gpt-image-economy-health-20261004/；本票live-result/原task详情/修复收取、静态log和最终独审保.agent-reports/gpt-image-economy-health-3076/清理前迁主仓。密钥只进程env，headers不留secret。旧失败文件不改写。

## 当前可用性
目录与提交受理健康；中枢本地及原任务收取诊断健康；此次经济生成产物失败（速率限制）。后续真实可用性需限速窗口解除后经明确预算单次复测；不自动收费重试、不批量推健康绿。
