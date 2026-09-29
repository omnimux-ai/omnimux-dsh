# 直连媒体生成路由与官方多模态渠道自适应修复规格说明书

> 关联问题：dev 环境下图像生成直连请求报 500（“本机助手只承接文字，图片、视频和音频需要配置媒体生成提供商或改用官方”），且前端存在空图片裂图残留。
> 架构原则：开源 BYOK 与多渠道中枢、正交消费场景独立选型与解耦（AGENTS.md 铁律）。

---

## 1. 核心问题根因分析

1. **直连生成 HTTP 路由丢弃渠道参数 (`direct-http.js`)**：
   前端在 `MediaViewerTab.jsx` 中发起的直连生成请求携带了 `channel` 与 `group` 参数，但在 `/omnimux/api/media/generate` 处理函数中，组装给 `executor` 的 `executePayload` 对象**完全漏传了 `group` 字段**。
2. **场景解耦与无排他模式违约 (`execute.js`)**：
   在 `executeOmnimuxMedia` 执行中，由于 `group` 缺失，系统默认将渠道判定为非官方渠道（`!isOfficialChannel`）。当宿主主对话配置了本地 Agent CLI（`runtime.mode === 'agent'`）且未配置第三方媒体 BYOK 时，系统直接将整个多模态能力掐死，抛出错误：`"本机助手只承接文字，图片、视频和音频需要配置媒体生成提供商或改用官方"`。
   这直接违反了系统“绝对不存在全局排他运行模式、主对话绑定 CLI 时多模态能力仍可正常消费官方或自备渠道”的核心契约。
3. **前端空 URL 脏数据导致缩略图裂开 (`MediaViewerTab.jsx`)**：
   当生成失败或条目缺少有效 `url` 时，前端直接渲染 `<img src={item.url}>` 导致在缩略图栏出现类似 `1dog` 的空裂图。

---

## 2. 修复方案与验收标准 (Acceptance Criteria)

- **AC-1 (`direct-http.js` 参数透传)**：
  `/omnimux/api/media/generate` 路由接收请求时，必须正确提取 `body.group || body.channel` 并注入到执行负载 `executePayload.group` 中。
- **AC-2 (`execute.js` 官方模型自适应放行)**：
  当请求的模型属于官方在售在管的媒体模型（或请求意图为官方专线）时，系统自动识别为官方渠道，无论主对话运行在 `agent` 还是 `key` 模式，一律自适应通过官方专线进行媒体生成，严禁报错“本机助手只承接文字”。
- **AC-3 (缩略图与大图渲染保护)**：
  在 `MediaViewerTab.jsx` 中，对没有有效图片地址（非 `url` 或 `attachment`）的非执行态条目增加渲染保护，避免渲染裂图。
- **AC-4 (单元与端到端测试覆盖)**：
  在单测中覆盖 `agent` 模式下直接调用官方生图模型时的自适应放行契约，确保零回归。
