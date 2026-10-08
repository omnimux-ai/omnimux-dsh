---
title: "角色落地页文档同步来源记录"
id: "evidence-landing-positioning-sources-2026-10-08"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-08"
authors: ["x"]
subsystem: "global"
---

# 角色落地页文档同步来源记录

## 身份与范围

任务：[文档同步 #3258](https://github.com/omnimux-ai/omnimux-dsh/issues/3258)。核验日：2026-10-08。插件仓 base 为 `094535c247a7f4722f9b74ed9680b5ae45c14d07`，初始 main 干净；任务修改在隔离工作树 `cross-landing-docs-issue-3258` 内。本文为修改前来源记录，不是新功能运行验收。

官网仓只读来源位于 `/Users/x/Desktop/Project/OmniMux`，读取时 HEAD 为 `b6d4ed39dce2db768d6d41ced54f627ddc2376d2`；已跟踪文件无未提交改动，存在未跟踪报告与素材。本次没有改动官网仓，也没有复制其代码或素材进入插件仓。

## 已读取的来源

| 来源 | 实读内容 | 可证明的范围 |
| --- | --- | --- |
| [公开落地页](https://omnimux.ai/) | 浏览器与网页抓取均显示标题 `OmniMux \| Own Your AI UGC Team` | 页面标题，不能证明完整页面交互与生成 |
| 官网 `web/src/features/omnimux-landing/index.tsx` | 角色首屏、作品、多角度、创建器、定价、问答、结尾入口 | 本地源码页面组成 |
| 同目录 `components/influencer/hero.tsx` | 角色图片、参考视频、角色视频并列；主入口 `/influencer` | 首屏表达与源码入口 |
| 同目录 `components/influencer/creator.tsx` | 描述角色或导入照片；保存草稿后进入工作台；照片导向视频面，描述导向生图面 | 草稿交接，不是生成成功 |
| 同目录 `components/influencer/sections.tsx` 与 `web/src/i18n/locales/zh.json` | 建立角色、多角度调整、参考动作、生成与导出展示 | 产品旅程；示意按钮不是矩阵发布证据 |
| 同目录 `components/influencer/pricing-faq-final.tsx` | 按调用入口与套餐/月付年付展示；调用定价来源 | 旧“无订阅”宣传不适合作为全产品事实，不固定金额 |
| 同目录 `components/landing-header.tsx`、`landing-footer.tsx` | 作品/定价入口、登录、角色工作台与页脚说明 | 现行源码导航，非本仓桌面入口 |
| 用户已确认的 2026-10-07、2026-10-08 决定 | 创作收敛为生图与生视频；隐藏模型 ID；用户不选组；内部明确组、上游对齐、同组多渠道低价优先 | 产品要求，不自动改变代码现状 |

官网中文源中“永久保持一致”“完全复刻”“即刻发布”的绝对宣传与本仓可验证能力不是同一回事。本仓不照抄为技术保证。

## 实际检查与限制

浏览器执行公开页导航与完整页面语义读取，退出码为 0；只返回工作台外壳，未得到落地页完整正文。该浏览器任务空间已在同次执行结束时关闭，回执 `SPACE_CLOSED`。网页抓取返回 HTTP 200 及标题，同样未获得正文。

源码使用文件读取工具逐项核对；版本与 dirty 状态通过 Git 只读命令取得。上述源码核查不替代线上浏览器验收。本任务没有运行收费生成、登录、发布、结算或生产部署，不更改前端。

## 使用方式

现行产品方向见[产品定位](../contracts/product-positioning.md)。历史研究中的旧全链路社媒 API、营销矩阵、无订阅和成本优势均不再作为现行定位或运行证明。插件已实现与未证明能力仍需逐项核对[能力记录](../capabilities.md)及当前版本证据，不由本次文档同步提升状态。
