---
status: active
issue: 3416
base: dd3587fd6d46c9f7819953de216f5d6b9d9559d5
---

# 3416：X已观测直接作品数组的消费配对

## 目标与授权

承接父3375及云端577/597；用户明确授权修复既有账号监控、两个原账号真实采集验收、相关检查和普通PR/MQ/Dev物化及任务清理。只修现有X作品容器消费，不新增平台/社媒运营/发布能力，不改UI、Hub、账号身份、预算、调度、凭据或权限。浏览器测试只Ego，不Chrome/Chromium/CFT/IAB；Dev45120 UI人工所有，Electron仅既有已认证同源业务API补充，不导出storage/凭据。

新用户沿标准安装与登录、官方既有云端已授权采集组；缺服务/组/凭据保持既有明确错误，不添加本地开发端口、共享profile、代理或其他账号作为默认回退。

## 已知事实与边界

路径纠正：父协调者原把0-based槽15误称timeline_v2，独立复核准确DAC与原JSON后确认槽15=P.timeline，槽16=P.timeline_v2为missing。只按本文当前直接timeline实施；错误假设未发布，原始回执不改。

准确云端DAC于2026-10-18T10:17:44Z正常蓝绿上线，单次X诊断10:25:08Z仍posts_unrecognized。固定schema2槽15实测解包P.timeline为非空Array，槽10为P.user非空Object；S未绑定，其row后代missing是派生状态，不能声称实际row缺字段。没有导出行值/ID/文本/URL，也没有观测row类型。TikTok资料10:24:48Z已受限真实成功，但它不是X结构依据或两个原账号完整验收。

云端将只给实际x-posts新增此直接数组候选，复用原行/ID规则，不添legacy/深结构或ID别名。插件须同一范围消费闭合；实际内容、发布时间与可用地址仍须最后真实采集独立核实，不能由容器或ID存在宣称已通过。

## 最小实现合同

- mapRivalPosts中仅ctx.platform=x、原probeArrays完全未识别、P为对象且P.timeline为Array时，使用既有rowsOf；不得加入全局容器表、P.data.timeline、对象形timeline、裸根数组或递归查找。
- 完全复用normalizeRivalPost及现有ID别名/父ID优先node/有效值规则。它们最低支持ID，不能宣传为已证明媒体或正文完整；不得推测新row字段。
- 原已识别的合法、空或坏列表优先级不变；坏旧列表不得借新fallback掩盖，业务envelope失败优先。新非空数组没有任何既有可消费行必须抛原unsupported/bad response错误，不能当空成功。
- 不改成功落盘时序：仅资料、作品两路有效并持久化后才增加成功次数和新成功时间；失败保留旧缓存/作品/成功时间，不产生伪新last_seen。
- 不更改其它平台、原TikTok五叶、头像保存、时区预算、manual/自动刷新、Hub模型与组绑定。

## 共同合成夹具与验证

共同P核心：{"timeline":[{"id":"fixture-parent","node":{"id":"fixture-child"}},{"node":{"tweet_id":"fixture-node"}},null,{}]}，期望2行且父ID优先。仅为复用已存在行合同的虚构测试，不是真实row证据；可添加既有title/text/时间字段用于完整落盘验证，不新增字段映射。负例timeline=[{},null,false,"text"]；旧items=[]或items=[{}]时不得改选timeline。覆盖对象/嵌套/裸数组/其它平台、envelope失败、未知row与旧路径兼容。

先红后绿的mapper/remote/service落盘回归，使用现有测试入口，只执行backend-only选择；不得运行历史包级测试，因为包含默认Chrome入口。按实际diff计算impact matrix并记录browser.required，联合plugin-qa最小命令选择；若确需浏览器，只在本WT用Ego动态隔离端口，不临时Chrome或DevUI。当前不得预写E2E冒充已真实验证。

文档影响仅内部固定数据容器与消费失败边界，记录此spec和必要的既有解析器注释；无新增用户入口/文案/模型宣传，不修改全局产品范围或外部技能。

## 交付

相关回归/边界/新用户基线、固定提交独审与准确head required/MQ通过后普通合入。只有真实MERGED才同步main、显式Dev物化和受控重启/实际文件hash及同源业务API核对，然后精确清理任务WT/branch。原生ship若仍强制DOM/截图则遵守用户更具体Electron API-only限制，使用现有命名物化/生命周期/收尾分项，不伪造通过或修改门禁。正式Prod桌面不写。父任务仍须四路有效、最小配置零漂移、两个原账号真实新成功/作品last_seen/聚合及原生额度验收；本子Issue单独完成不代表整个任务完成。
