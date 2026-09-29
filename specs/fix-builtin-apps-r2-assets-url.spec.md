# 规格：修正内置 AI 应用与预设工作流真实 R2 存储桶直链与防伪域名门禁

## 一、背景与问题陈述
用户在独立 AI 应用（如「手机与网页交互实机演示」）中点击「编辑应用」创建副本工作流时，画布中商品主图槽位（Product Image）节点呈现图片不可见（破损图标与 alt 文本兜底）。

### 根因分析
1. **未分配 DNS 的虚假域名硬编码**：
   在 Issue #2722 历史提交（commit `7d68b93cd2fb`）中，为了满足防外联门禁，使用了维护脚本 `scripts/migrate-builtin-assets-to-r2.mjs`。该脚本错误定义了未经 DNS 注册的虚假域名常量 `https://cdn.omnimux.ai/presets/builtin`，并通过文本正则批量替换了内置应用目录与工作流拓扑中的素材直链。
2. **权威 DNS 查询确认**：
   执行 `dig @8.8.8.8 cdn.omnimux.ai A` 返回 `NXDOMAIN`，导致浏览器网络请求直接中断。
3. **真实 R2 素材客观存在**：
   这批 14 个素材文件（7 张 poster webp + 7 个 preview mp4）早已全量上传至官方 Cloudflare R2 存储桶，其对外托管的真实持久化直链为基于 SHA-256 内容寻址的 `https://files.omnimux.ai/templates/explore-v1/sha256/${prefix}/${sha256}${ext}`，经实机 HTTP HEAD 测试 14/14 全量返回 `200 OK`。

## 二、架构设计与解决规范
1. **单真源内容寻址映射 (SHA-256 Content-Addressed R2)**：
   - 将 `assets/builtin-presets/manifest.json` 与迁移脚本 `scripts/migrate-builtin-assets-to-r2.mjs` 统一重构为基于文件实际哈希的 SHA-256 内容寻址机制；
   - 目标基础 CDN 地址收敛为 `https://files.omnimux.ai/templates/explore-v1/sha256`；
   - 映射字典自动识别并清洗历史 `cdn.omnimux.ai` 假域名。
2. **全仓内置工程文件无损修正**：
   - `plugins/omnimux-apps/catalog/builtin-apps.json`
   - `plugins/omnimux-apps/src/shared/builtinCatalogData.ts`
   - `plugins/omnimux-workflow/src/client/projects/presetWorkflows.js`
   - `plugins/omnimux-workflow/src/client/projects/AppTab.jsx`
   - 7 款 `plugins/omnimux-apps/catalog/presets/app-creatify-*.workflow.json`
3. **双重防复发门禁 (Fail-Closed Gate)**：
   - 在 `scripts/verify-no-external-builtin-assets.mjs` 的 `FORBIDDEN_CDN_PATTERNS` 中新增 `cdn.omnimux.ai` 规则；
   - 任何再次引入该虚假域名的提交将被 CI 与本地 hook 彻底阻断。

## 三、验收标准
1. **门禁通过**：`node scripts/verify-no-external-builtin-assets.mjs` 扫描 0 违规，全部通过；
2. **素材连通**：内置 7 款应用的所有 14 个商品图与视频直链在远程 HTTP 网络访问中均返回 `HTTP 200 OK`；
3. **测试覆盖**：端到端测试 `tests/e2e/builtin-apps-r2-assets.e2e.test.mjs` 完整验证应用目录、工作流拓扑与前端数据的一致性与合法性。
