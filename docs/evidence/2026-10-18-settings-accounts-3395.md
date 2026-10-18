---
title: "设置账号配置入口验收 #3395"
id: "evidence-settings-accounts-3395"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-18"
authors: ["agent"]
subsystem: "omnimux"
---

# 设置账号配置入口验收 #3395

任务 [#3395](https://github.com/omnimux-ai/omnimux-dsh/issues/3395)。基线 `e3f802f36e17a88a8362fbdf81cd780ec8d9f7c3`，任务工作树 `omnimux-settings-accounts-issue-3395` 的未提交候选；本报告记录已结束运行，不表示共享开发版已加载。

## 实际运行与结果

任务在私有运行目录正式安装本工作树的 OmniMux 与技能库插件，复用已安装开发应用的官方运行包 `0.1.5-rc.3`，拒绝共享开发版/正式版配置读取。仅使用合成凭据与本机模拟服务，没有真实登录、凭据提交或模型请求。

真实应用地址为动态端口 `http://127.0.0.1:60072`，主进程 `40437`，唯一浏览器空间 `189`。运行期间同源读取已加载模块，核对包含完整任务客户端字节，摘要 `4c026b73ab850205f3b9f073f4595e5ef64a50bbf5a4958321c702aa3f97fabc`；官方设置模块仅加载一次。

真实回归运行 1 项用例、9 项内部断言通过，0 失败、0 跳过：

- 官方模型页仅显示 DeepSeek 与 OmniMux，两个编辑入口均能打开。
- 两个密钥字段在合成启动环境下可见且只读；没有读取字段值，不据此证明真实密钥保存。
- 个人资料与登录按钮仍可达。
- 插件页保留正常官方配置，额外的运行方式、模型服务与画布默认模型配置均不出现，旧卡片数为零。

同轮原件：[保留的两家配置](2026-10-18-settings-accounts-3395/retained-providers.png)、[插件配置结果](2026-10-18-settings-accounts-3395/plugin-configuration.png)、[完整断言和关闭回执](2026-10-18-settings-accounts-3395/browser.json)。原件按字节和时间复制入库，未重绘截图、未修改运行结果。回归入口为 [设置路径检查](../../plugins/omnimux/tests/e2e/settings-accounts.e2e.test.mjs)，要求显式准备的任务私有应用与已属本任务的浏览器空间，缺失时失败。

## 清理与证明边界

当轮脚本尾部关闭空间并确认其消失；随后等待私有环境清理，主进程、模拟服务、运行目录均完成清理。完整失败尝试、实际安装与加载核对、环境清理原件另存本机 `.workbuddy/tasks/settings-accounts/reports/browser-evidence/`。

底层准备器原始摘要仍标为 `core-only / taskPluginsInstalled:false`，没有改写；正式额外安装的摘要与浏览器已加载字节另行核对。标准化显式 task/fresh 通道仍受阻，此独立实际设置路径不替代该封套、不证明完整新用户安装、真实账号认证、密钥有效性、共享开发版人工验收或生产版本。
