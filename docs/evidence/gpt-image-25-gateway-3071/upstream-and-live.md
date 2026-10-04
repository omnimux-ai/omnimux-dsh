# GPT Image 2.5 渠道对齐与真实执行证据

核对日期：2026-10-04；任务 #3071；初始基线 64e2f35615efec8302ca8e6b571ab533244b6394。

## 官方契约
- 网关创建：https://docs.omnimux.ai/en/api-reference/image-series/gpt-image/generate.md；POST /v1/images/generations，同步data或异步任务分开。
- 当前网关目录：https://omnimux.ai/api/pricing，基价0.013072 USD/张，分组default/economy/pro倍率1/.112455/.281248；标准分组实际名称为default，不是economy。
- 当前模型能力：https://omnimux.ai/api/model_contract/gpt-image-2.5，版本4b4e2aff3500ec80；参考16、prompt32000、png/jpeg/webp。文档旧价格、hd与变体未开放的叙述存在矛盾，不以旧叙述改价或新建ID。
- 当前标准线路供应商官方文档：https://evolink.ai/docs/en/api-manual/image-series/gpt-image-2/gpt-image-2-beta-image-generation.md，size=auto或比例+resolution=1K；2K/4K及像素尺寸不接受；n固定1，quality不开放。
- 标准线路beta身份由本次原任务响应properties.upstream_model_name=gpt-image-2-beta、group=default确认；不把此内部名字暴露为新产品ID。该样本仅证明当前此条路径，不证明未来网关不会换供应商。

## 当前真实执行
只用CLI已有凭据在进程内注入，未写或打印密钥，未创建凭据。
2026-10-04T06:39:06Z并行向三条明确分组各提交一次n=1，无size/quality、合法中文橘猫提示词。
- default：submit200，原task_mD3OnqVkzRhCAukx50iRFkeTSkoG6ADF，服务记录SUCCESS、group default、upstream gpt-image-2-beta，约49秒完成。实际PNG2185451字节，1312×1199，pngjs完整CRC解码。实际quota6536（0.013072USD）；不依据该图宽高反推所有支持分辨率。
- economy：HTTP524约126秒；没有可用任务ID，本次未验证出图；未重投、不推断失败退款。
- pro：HTTP524约126秒；没有可用任务ID，本次未验证出图；未重投、不推断失败退款。
第一版临时检查仅识别浅层包络，34次原任务GET未识别data.data.results；留存原失败而不回写为成功。额外一次GET确认终态与供应商实际输出后，只下载原图完成解码。

## 中枢同原任务收取
修改vendor响应解析后，正式executeOmnimuxImage以原taskId调用：mode=live，落盘同字节PNG，GET网关一次+GET供应商产物一次，POST=0。缺省guard/映射不得凭此称新提交已实拍验证；离线实际发包另行覆盖。

## 证据保留
原记录在任务.agent-reports/gpt-image-25-gateway-20261004/live/summary.json、original-task-status.json、verified-default.json、hub-collect-proof.json及default.png。父级独立调查报告位于主仓.agent-reports/gpt-image-25-gateway-20261004/upstream.md与current-hub.md。未修改上游工作区或生产、未重启桌面；共享Dev人工验收未执行。
