# Spec: strip `{{cwd}}` from persona prompt templates

## 目标
DSH 内核的 prompt 插值只注册 `provider` 和 `model` 两个变量。persona `prefix`/`suffix` 模板里出现 `{{cwd}}` 会在组装阶段直接抛 `unknown prompt variable "{{cwd}}" in section "deployment:persona-prefix"`，整轮会话失败。当前工作目录由 working-directory 上下文（`interpolate:false`）注入，不走模板变量。

本任务把所有产品分发的 persona 模板里的 `{{cwd}}` 引用清掉，使所有 preset/market 专家 agent 不再触发该异常。

## 背景
2026-11-02 曾对已安装副本做过一次热补丁（memory #52），但仓库源文件从未修，Dev app 重装/重materialize后变量复活，问题复发。本次从源头修。

## 假设
根因假设：DSH 内核只注册 `provider`/`model` 两个 prompt 变量，凡在 persona `prefix`/`suffix` 字面量里写 `{{cwd}}` 都会在组装期抛错；当前 cwd 应改由 working-directory 上下文（`interpolate:false`）注入。假设成立时，删掉字面量中的 `{{cwd}}` 引用即可根治；若上游后续新增 `cwd` 变量则本改动依旧安全（只是少了一段冗余文本）。

## 用户旅程
用户在 OmniMux 里选任意社媒/营销/短剧等专家 preset 发起会话 → prompt 正常组装 → 不再出现 `处理失败 / unknown prompt variable "{{cwd}}"`。

## 改动范围
- `presets/*/agent.cordis.yml`（14 个活 preset，三种句式：`，工作目录 {{cwd}}。` / `。工作目录 {{cwd}}。` / `Your working directory is {{cwd}}.`）
- `presets/*/agent.cordis.yml` 同文件注释行：把「`{{model}}` and `{{cwd}}` resolve from ...」改为「`{{model}}` resolves from ...; the working directory arrives via the working-directory context」
- `scripts/build-agent-presets.mjs`：5 处生成 preset 的 persona 字符串
- `plugins/omnimux-market/src/expert-market.ts`：`resolveExpertPersonaText` 三条 return（amazon / tiktok-ecommerce / 兜底模板）
- `plugins/omnimux-market/lib/expert-market.js`：由 tsc 构建产出，跟随 src
- `scripts/verify-agent-presets.test.mjs`：L380 断言里期望的 persona 文本同步去掉 `，工作目录 {{cwd}}。`

## 不做
- `.retired/` 目录不改（已退役，不进入分发）。
- app bundle (`*.app`) / `~/.omnimux*` 已安装副本不在本 PR 改；合入后由 `worktree.sh ship` materialize 到 Dev，正式版随下次发版带出新 preset。

## 证伪方式
若删掉字面量里的 `{{cwd}}` 后，重开社媒会话仍报 `unknown prompt variable "{{cwd}}"`，说明污染源不止 persona 模板（可能还有 suffix、cordis.patch、或上游另有插值点）——假设被证伪。可执行验证：
- `rg '{{cwd}}' presets scripts plugins/omnimux-market/src plugins/omnimux-market/lib`（应只剩 `.retired`）
- `rg '{{cwd}}' ~/.omnimux/profiles/omnimux/agent-presets-shipped/`（materialize 后应为空）
- 手工重开一个社媒会话，看是否还出现 `处理失败 / unknown prompt variable` 横幅。

## 验收
- `rg '{{cwd}}' presets scripts plugins/omnimux-market/src` 无残留（`.retired` 除外）。
- `node --test scripts/verify-agent-presets.test.mjs` 通过。
- `pnpm --filter omnimux-market build`（tsc）通过，lib 输出无 `{{cwd}}`。
- 重开社媒会话不再报 `unknown prompt variable`。

## 边界
- 绝不动 official DSH 源；不改插值机制本身（cwd 走上下文是上游既定行为）。
- 只改字符串字面量，不改函数签名与插件结构。
