---
status: active
issue: 3408
base: f16fd7ccc1f97ae3944cadbebcd517bcec0ff4fa
---

# 3408：既有账号监控的TikTok资料结构消费闭合

## 目标、范围与用户旅程

承接父3375与云端laozhong86/OmniMux#597，用户已明确授权修复原账号监控、两个原账号真实采集、相关检查/普通PR-MQ/Dev物化和任务收尾。此Issue只补已证TikTok资料包装消费，不增平台/经营分析/发布功能、不改UI、不更改凭据或权限。原监控自动更新/成功判定/错误重试修复已由PR3380合入，此新子修复不重复ship旧任务。

用户已有TikTok参考账号正常刷新时，Hub仍走官方既有四能力与已授权云端专组，领域消费得到有效资料后才继续作品；两路有效并落盘后才增加成功次数/更新成功时间。业务失败或未知/坏资料保留旧数据并显示既有错误/重试反馈，不把HTTP200或受理202当完成。新用户使用标准安装/登录及云端已授权渠道；缺组/凭据/服务继续既有明确错误，不默认本地dev端口、共享profile、代理或其它账号。

## 当前实证

2026-10-18T09:03:22的默认关闭、私有管理单次类型观测证明：R.data=P对象；P.userInfo、P.userInfo.user、P.userInfo.stats均为非空对象；user.nickname/signature/avatarLarger为string；stats.followerCount/videoCount为number。真实原值/身份/URL没有导出，也不放入本仓测试。类型不证明值有效或业务成功。

现有Hub social-data只解外层R.data，不负责平台归一化。rival-parsers只解固定user/channel/author/result/data/items，不能消费已证userInfo.user或其独立stats；avatarLarger和videoCount新命名未支持。有界业务失败检查亦需覆盖新增固定容器。

## 最小合同

- 仅TikTok平台新增P.userInfo.user+同wrapper.stats五叶映射：nickname→nickname，signature→bio，avatarLarger→avatar，stats.followerCount→followers，stats.videoCount→posts_count。不得全平台开启userInfo或任意递归寻找资料，不增未观察字段/UID/链接。
- userInfo须非空对象，user与stats必须对象；缺任一/错型不作新形状，旧合法形状仍按原规则识别。只看到object存在不能recognized。仍至少一个五叶有效；字符串需非空，头像需HTTP(S)合法，计数需有限非负，零合法，非法/缺失不伪造零。
- 使用既有固定业务失败规则，有界检查新增userInfo/user/stats容器；其中任一明确业务失败都拒绝fallback，避免其它可用叶掩盖失败。仅这三个新容器补齐与云端对应的有限数值及严格十进制数字串业务码：只允许0或[200,300)，status=false拒绝，code/status_code布尔值忽略；空值保持原语义。外层/原有业务失败语义不改，不声称任意未知标量与云端全面相等。
- 原X与其它平台、原已知列表/ID/父node、裸数组拒绝、预算/时区/取消与调度规则不改变；不顺带处理只读发现但未证相关的负数候选排序或YouTube差异。
- 静态消费闭合发现runCycle尚未保存store已有avatar_url字段；只补这一叶更新，采用与现有partial profile一致的有效新头像或保留旧头像规则，覆盖完整落盘及无效/缺失不覆盖。其余服务行为不改。
- 维持runCycle完全落盘后才onSuccess；坏profile不执行作品请求、不覆盖已有profile/作品、成功时间/次数不前进。成功时独立stats正确保存且作品last_seen更新。

## 合成夹具与验收

两仓共同虚构P：{"userInfo":{"user":{"nickname":"Fixture Creator","signature":"Fixture biography","avatarLarger":"https://example.com/avatar.jpg"},"stats":{"followerCount":0,"videoCount":2}}}；外层可为既有code200/data包装。云端只实际model=tiktok-user+policy识别该P，model-less/X拒绝新增形状；插件只platform=tiktok使用。

有意义回归先红后绿，覆盖五字段+零计数、缺user/stats/错型、空白/坏头像/负与非有限值、只有合法头像或计数、各新增固定容器内业务失败、原形状/其它平台不变。相同夹具贯穿Hub解包合同、领域归一化、完整两路刷新落盘/统计和成功时间；失败不能推进成功，不能用只测纯mapper代替消费闭合。

## 检查、文档与交付

先计算影响矩阵，按plugin-qa最小命令集选相关包回归、值/失败/落盘闭环与边界检查、必要product-baseline和静态检查，不默认test:all。浏览器如需要只Ego、在此任务WT动态隔离端口验证，绝不Chrome/Chromium/CFT/IAB；Dev45120真机UI验收仍人工所有，不能当agent前置。当前没有E2E实证，不预先写E2E测试。

文档影响：内部固定数据形状与失败消费边界；记录到本spec及相关既有归属文档/必要解析器注释，不创建第二操作路径或描述为平台新增。Agent implementation+检查+固定提交独审通过后普通PR/required checks/MQ，确认MERGED再原生ship仅Dev，并实读物化文件/宿主加载与任务清理证据。父3375与云端577/597的两个原账号真实采集/新渠道专组/额度/聚合验收仍另行完成，本子Issue不能冒充整任务通过。
