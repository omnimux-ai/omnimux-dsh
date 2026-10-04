---
title: "浏览器图片入库 · 票内协作协议"
id: "wire-plan-browser-image-assets"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# V1 跨角色协作接口冻结

父规格：#3051；实施票：#3052（V1）。基线 d95764912e36da01d879ab65d6340469b48a4625。这份票外接口计划可含路径，不替代技术规格或产品字典。

## 共享消息

- content → worker 新消息：DSH_MEDIA_TO_ASSETS，payload沿用 HoveredMedia 但第一动作必须确定为 image；未知/视频不能发送。
- worker → 当前已认证本机 bridge RPC：omnimux.saveImageAsset。
- RPC输入：{ requestId: string, url: string, pageUrl: string, title?: string }，限制requestId128/url8192/pageUrl8192/title200；不接受本地路径/请求头/凭据。后台以src作为url、pageUrl保留来源，title由alt/pageTitle或PM defaultName生成。
- 宿主hello capability：imageAssetSave?: true。旧宿主缺失时图片动作不可用；实际服务缺失返回unavailable。
- RPC业务成功：{ status: 'saved' | 'duplicate', assetId: string, fileId: string, lrev: number }。只有合法非空ID、有限revision及明确成功status算保存成功；outer ok、空result、asset元信息不够。
- RPC业务失败：{ status: 'unavailable' | 'invalid-url' | 'unsupported-image' | 'mime-mismatch' | 'too-large' | 'timeout' | 'http-error' | 'storage-failed' | 'cancelled', statusCode?: number }。不得回传本机路径、字节、原始url/异常堆栈。
- worker响应：{ ok: true, result: <合法业务outcome> }；无认证连接/能力或传输明确未发送则 { ok: false, error: { code: 'host-unavailable' } }；已发送但最终回执未知则error code='save-unconfirmed'。明确业务失败仍可outer true，动作桥必须识别。
- UI映射：unavailable→saveFailed（已握手但服务缺失），invalid-url/unsupported-image/mime-mismatch/too-large→unavailable，http-error/timeout→downloadFailed，storage-failed/cancelled→saveFailed；传输无连接→hostUnavailable，回执未知→unconfirmed。所有逐字文案来自UI-Spec。

## 状态与所有权

- 后端仅修改 plugins/omnimux-browser/src/（含protocol与声明）及 plugins/omnimux-assets/src/；前端仅修改 extension/src/ 与新增extension/tests/。互不改对方目录或共同配置，不新增依赖。若必须变共享字段先报告给主理人，不单方面变协议。
- 后端assets服务持有同一活跃library实例，安全下载和宿主解码校验由browser Host使用现成能力。服务名建议assetLibrary，其方法仅内部ingestDownloadedImage；精确可用API须官方文档和运行时验证，不能mock成功。
- V1不修改media-trigger.ts；V2阻塞V1。V1不得关闭票/合入/部署。
- 前端不得改复制/对话载荷语义；视频保留旧链路。第一动作可独立派生save intent，不强改全payload.type来修视频封面。
- 最小预算沿用8MiB/9秒/5跳；仅JPEG/PNG/WebP/GIF与宿主可验证交集，未知MIME不猜后缀。一个单张图片默认custom；规范URL去fragment保留query，sha256来源幂等，跨签名内容去重不承诺。

## TDD与提交协调

开发前各自加载tdd/implement原文、检查规格和票；仅预约定接缝上先单个失败行为测试跑红再最小实现跑绿。新增测试精确路径先报备并使用用户本会话授权的登记机制，不改既有断言/不关闭门禁/不绕行写法。报告日志与真实退出码。两个角色不要并发Git暂存/commit；主理人统一提交当前分支，用户明确演示批准前不得合入。