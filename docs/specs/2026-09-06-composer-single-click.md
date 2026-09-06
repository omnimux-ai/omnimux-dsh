---
title: "原生加号菜单单击添加"
id: "spec-composer-single-click"
type: "spec"
status: "living"
authority: "L2"
date: "2026-09-06"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# 原生加号菜单单击添加

[Issue #676](https://github.com/omnimux-ai/omnimux-dsh/issues/676) 与[桌面配套 #61](https://github.com/laozhong86/omnimux-desktop-fork/issues/61) 跟踪用户确认的两入口方案。原生菜单中的“添加文件”直接打开系统多选文件框，“从资产库添加”直接打开既有 AssetPicker。本入口不添加文件夹；其他页面和底层目录能力保留。

## 入口和宿主能力

Host 注册无 input 的 add-file、add-from-library 普通命令。菜单说明为中英双语，handler 只返回成功回执，不调用模型。Client 只监听本机 command/executed 成功事件，不再贡献同名 popupSelect，也不根据持久会话记录重放选择操作。官方命令卡片保留，卡片成功表示入口命令完成，附件结果由业务界面显示。

桌面 DesktopRuntime.pickFiles 使用 Electron 当前窗口的 openFile + multiSelections；取消返回空数组，异常上抛，并发调用返回 native-picker-busy。Hub 通过可选运行时能力调用，不导入桌面私有实现。

| 接口 | 行为 |
|---|---|
| POST /omnimux/composer/attachments/pick-files | 接收 sessionId；认证、精确同源、会话校验通过后返回 paths |
| 501 native-picker-unavailable | 唯一允许 Client 回退到既有 macOS /omnimux/assets/pick 文件模式的结果 |
| POST /omnimux/composer/attachments/materialize | 本入口传 filesOnly: true，在复制前拒绝目录；省略时保留既有兼容行为 |

取消、403、忙碌和系统错误不回退，不再次弹框。旧非 macOS 独立 Host 缺少桌面能力时明确报告不支持；三平台新增能力由 OmniMux 桌面运行时提供。

## 会话与附件

命令事件中的 sessionId 是写入归属；官方 sessions.list.current 决定当前展示归属。选择阶段切换会话会废弃旧操作，晚到路径不得触发复制。已经提交的复制完成后只能更新原会话 Store，不能关闭新弹窗或抢占新会话焦点。插件卸载后移除订阅，不处理过期 UI 回调，也不删除用户原文件。

单个客户端只保留一个可见选择流程。复制前按稳定 sourcePath 去重并按当前剩余配额裁剪，保留每会话八项上限。资产选择复用现有组件、实例化接口和附件提交引用。取消不新增附件；全部资产失败保留选择供重试；部分成功显示成功和失败数量。打开入口不清空草稿、不发送模型请求。

## 验收与交付

单测覆盖文件多选、取消、唯一回退条件、忙碌、鉴权、同源、失效会话、目录拒绝、去重、配额、A/B 切换、晚响应、失败重试和重载清理。实际验收从原生菜单进入，确认真实文件副本、资产及提交引用；L2 IAB 与共享探针、真实 Electron、合并后 Dev 分别保存证据。macOS/Windows/Linux 的实机结果逐平台记录，未执行不得写为通过。

隔离及交付遵循 [dev-pipeline](../contracts/dev-pipeline.md)、[plugin-qa](../contracts/plugin-qa.md) 和 [plugin-git-pr](../contracts/plugin-git-pr.md)。真实桌面启动若无法保持任务 home/userData 隔离，应保留候选并处理明确阻塞，不在公共 Dev 运行未合并产物。公共 Dev 壳更换及重启须确认目标和窗口，生产发布不属于本任务。
