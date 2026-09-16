# 实现证据：云端作品分享携带内容拆解，同款提示词不再退化为原文案（Issue #2088）

## 一、用户看到的缺陷

分享链接 `https://omnimux.ai/s/insp_cb9ded84189149da` 的存盘数据（取自网关 `GET /api/inspiration/v1/share/<id>`）：

```
category: 'x'                ← 归到来源平台，而非目标模型
modelKey: 'Universal'
prompt  : 'カメラロールの画像生成して、… https://t.co/VSNSvH1IiM'
description: 与 prompt 完全相同
```

即：**提示词就是原帖文案**，没有生成任何同款提示词。

## 二、两个原因

### 原因一（部署，非本任务代码）

该分享创建于 `2026-09-16T22:03:34+08:00`，而当时服务该页面（端口 45120）的主进程 `pid 60935`
启动于 `2026-09-16 19:25:56`，早于「同款提示词 + 分类收敛」改动的物化时间。
宿主侧逻辑在进程启动时载入，因此该进程仍按老行为发文案、按 `source_platform` 归类。
已核对落盘产物 `~/.omnimux-dev/profiles/omnimux/node_modules/omnimux-inspiration/src/http-handlers.js`
确为新版（含 `buildDirectGenerationPrompt`，`shareMetaOf` 取值链已无 `source_platform`）——
**盘上是新的，跑的是旧的**，重启开发版即生效。本任务不重启用户进程。

### 原因二（真实产品缺口，本任务修复）

云端社区作品自带完整拆解，字段在 `analysis` 下（`visual_breakdown` 画面描述、`hook_highlight` 开场钩子），
但页面交给发布端的载荷 `shareRequestPayload` 只带 `caption`，
于是发布端 `buildDirectGenerationPrompt` 拿不到任何拆解，只能退回用原文案充当画面描述。

## 三、改动

| 文件 | 改动 |
| --- | --- |
| `plugins/omnimux-inspiration/src/client/api.js` | 新增导出 `shareDeconstructionOf(rec)`：从云端行的 `analysis`（或已存在的 `deconstruction`）取出 `visual_breakdown` 与 `hook_highlight`，**只取驱动画面提示词的两路，刻意不带 `target_goal` / `narrative_strategy` / `replication_action` 这类营销字段**；`shareRequestPayload` 在存在拆解时把 `deconstruction` 一并交给发布端（无拆解时不带该键，保持载荷干净） |
| `plugins/omnimux-inspiration/src/prompt-generator.js` | 画面描述优先序改为「拆解摘要 → 画面拆解 → 条目正文 → 条目文案」；并保证同一段文本不会因同时充当画面与细节而在提示词里重复出现 |

发布端 `cloudShareRequest` 无需改动：它本来就把载荷整体交给合成器。

## 四、逐条对照验收标准

| AC | 要点 | 证据 |
| --- | --- | --- |
| AC-1 云端拆解上送 | `shareRequestPayload` 带出 `deconstruction` | 单测「hands the catalogue's own breakdown over with the publish request」 |
| AC-2 画面描述优先序 + 不重复 | 无 `summary` 时以 `visual_breakdown` 为画面；同一段只出现一次 | 单测「takes the visual breakdown as the scene…」「never repeats the same text…」 |
| AC-3 本机零回归 | `summary` 仍优先于画面拆解 | 单测「keeps the entry summary ahead of the visual breakdown when both exist」；全量套件无新增失败 |
| AC-4 不阻断 | 无拆解无文案仍返回空串 | 单测「refuses a bare title…」保持通过 |
| AC-5 端到端 | 目录形态行 → 载荷 → 发布路由 → 中枢 → 实际发出提示词基于画面拆解 | E2E「发布的同款提示词来自目录拆解，而不是原文案」 |
| AC-6 真实浏览器 | 工作树内 ego-browser 14/14 断言通过 | `docs/evidence/inspiration-prompt-source-verified.json` + `.png` |

## 五、验证命令与真实结果

| 命令 | 结果 |
| --- | --- |
| `node --test plugins/omnimux-inspiration/src/client/api.test.js plugins/omnimux-inspiration/src/prompt-generator.test.js` | **43 passed / 0 failed** |
| `corepack pnpm --filter omnimux-inspiration test` | **849 tests, 847 pass, 0 fail, 2 skipped** |
| `node --test tests/e2e/inspiration-cloud-share.e2e.test.mjs` | **8 passed / 0 failed** |
| 灵感相关 E2E 全部套件 | **25 passed / 0 failed** |
| `corepack pnpm check:boundaries` | ✅ 3328 源文件边界校验通过 |
| `node tmp/verify-prompt-source.mjs`（工作树内真实 Chromium） | **14/14 断言通过**，任务空间已关闭 |
| `git diff --check` | 无空白问题 |

### 真实浏览器实测到的派生提示词

以目录形态行（数字 id、`cover_key`/`media_keys`、`analysis`）驱动真实弹窗与真实合成器，发布端实际派生：

```
竖屏手持自拍特写，室内冷白光，面部占据画面三分之二，情绪由平静转为失控。电影级运镜与流畅主体动作演进，真实自然光影氛围，画质清晰细腻，4K超清质感
```

即画面拆解成为提示词主体，原文案与营销字段均未进入。

## 六、遗留与不确定项

1. **原因一需要用户重启开发版应用**才会在实机生效；本 Agent 不重启用户进程。
2. 云端目录若某些行没有 `analysis.visual_breakdown`，会退回「条目正文 → 条目文案」的既有行为
   （不会产生空提示词，但提示词质量等同改前）。这类行需要目录侧补全拆解数据，不在本任务范围。
3. 已经把链接发出去的旧分享，其存盘 `prompt` 属于云端既有数据，本改动不回溯改写。
