---
title: "Alpha 内测与正式发布"
id: "contract-alpha-release"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-06"
subsystem: "global"
---

# Alpha 内测与正式发布

开发优先完善非 Alpha 功能。Alpha 表示功能处于内测，不代表禁用，也不改变既有 MVP 范围和授权边界。

插件阶段及工具归属唯一名单为 [plugin-lifecycle.json](../../plugins/omnimux/src/plugin-lifecycle.json)。Alpha 包括账号、发布、数据分析；项目（工作流／画布）不属于 Alpha，开发版和正式版均保留；未列为 Alpha 的插件不显示此标记。中枢侧栏消费同一名单，在已有入口旁显示 Alpha，说明内测状态、开发优先级及正式版不包含该功能。原有点击、登录、选中和关闭行为保持不变。

开发源码与 Dev 保留 Alpha 插件和已有能力，不能因标记而隐藏或停用。正式发布排除 Alpha 插件的加载名单、依赖及随包产物，并关闭中枢暴露的对应工具；不能仅隐藏 UI。正式渠道由发布入口确定，不能通过单项工具开关重新启用 Alpha。正式策略的自动化验证使用合成文件系统 fixture，不部署独立运行环境、不写实际生产 profile。

发布入口将中枢的 `src/release-channel.json` 写为 `production`；源码与开发目标使用 `development`。`sync-to-app.sh --prod` 和桌面 `stage:preset` 均消费同一名单；混合同步按各目标分别应用策略，命名插件同步不得扩大开发目标的写入范围。桌面打包清单与启动校验必须一致，防止已排除的 Alpha 插件仍被当作必需依赖。

部署目标隔离、发布授权和物化路径遵循 [dev pipeline](dev-pipeline.md) 与 [Git/PR policy](plugin-git-pr.md)。合并本规则不授权正式发布或修改真实生产。Alpha 转正需独立评估与更新名单，并验证侧栏和发布产物一致；不得仅删除界面标记。
