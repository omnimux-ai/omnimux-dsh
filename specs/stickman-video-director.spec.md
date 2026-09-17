---
title: 火柴人视频导演（stickman-video-director）
issue: 2251
date: 2026-09-17
status: approved-for-implementation
---

# 规格：火柴人视频导演技能

## 一、问题与目标

**问题**：技能工坊货架上没有面向「纯线条火柴人 / 白板线条动画」片型的导演技能。用户手里只有一段文案，既缺把文案切成六幕的导演方法，也缺让六段独立生成的视频保持一致画风、一致声线、连续配乐的约束契约。

**目标**：上架一个 bundled 技能，让用户从一段文案出发，得到一份经确认的六幕导演提案，再得到六条自包含的视频生成提示词，最终经 Clip 工作台拼成约 1 分钟成片。

**可观察的成功标准**：技能出现在技能工坊货架；按技能指引走完两阶段流程，能产出六条互不引用外部上下文、但共享同一套锁定条件的提示词。

## 二、关键设计决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 形态 | 独立 bundled 技能，非并入 `viral-video-replication` | 后者需参考样片驱动复刻，本技能是纯文案驱动；两者输入形态不同，合并会污染中枢 |
| 模型绑定 | 不绑定具体模型 | 仓库产品基线要求不得写死开发机私有路径或单一渠道；提示词契约按能力描述（首尾帧、参考图、音画同步）表达 |
| 语言 | 中文正文 + 英文提示词 | 与 `clip-craft`、`viral-video-replication` 一致；提示词必须英文以适配视频模型 |
| 精选位 | `recommended: false` | 进精选位会改动首页可见界面，前端变更需先演示后合入；本 Issue 只上架货架 |
| 正文来源 | 本仓自研中文改编 | 不复制上游正文；仅标注灵感来源与许可 |

## 三、交付物

```
plugins/omnimux-market/catalog/skills/stickman-video-director/
├── SKILL.md                       # 调度层：设卡、工作流、输出规则、改稿规则
├── meta.yaml                      # 货架元数据（中英双语）
└── references/
    ├── director-proposal.md       # 六幕导演提案模板（Phase A 产物）
    ├── prompt-contract.md         # 提示词契约骨架（Phase B 产物）
    └── style-catalog.md           # 画风目录与角色锚定
plugins/omnimux-market/catalog/index.json   # 追加 1 条 bundled 条目
```

## 四、验收标准（可观察）

| # | 标准 | 验证方式 |
| --- | --- | --- |
| A1 | `SKILL.md` 存在，frontmatter 含 `name` 与 `description` | 读文件 |
| A2 | `SKILL.md` 含强制设卡：画幅与画风未给齐时**停止并一次性追问**，且明示不得静默选择 | 读文件 + 关键词断言 |
| A3 | `SKILL.md` 含两阶段门禁：Phase A 未获**当轮**明确确认前不得产出 Phase B 提示词 | 读文件 + 关键词断言 |
| A4 | `index.json` 中 `id = sk-omx-stickman-video-director` 恰好出现 1 次，总数 +1，其余条目逐字段未变 | 脚本比对 |
| A5 | `meta.yaml` 含 `display-name-zh`/`version`/`tag-en`/`tag-cn`/`summary-en`/`summary-cn`/`desc-en`/`desc-cn`/`source` | 解析断言 |
| A6 | 目录条目四个双语字段齐备且 ≤ 80/80/200/200 字符 | 解析断言 |
| A7 | `node scripts/verify-skill-bilingual.mjs` 退出码 0 | 命令 |
| A8 | `node scripts/generate-featured-skills.mjs --check` 退出码 0 | 命令 |
| A9 | `corepack pnpm --filter omnimux-market test` 全绿 | 命令 |
| A10 | `git diff --check` 无输出 | 命令 |

## 五、非目标

- 不做实时视频生成验证（消耗积分，属独立授权事项）。
- 不修改 `viral-video-replication` 正文。
- 不生成封面图，不进精选位，不做 App 物化与浏览器验收。

## 六、新用户基线

技能正文只描述**能力**（视频生成、语音合成、文生音乐、剪辑导出），不写任何本机绝对路径、开发端口或私有模型别名。用户在任意干净安装上按指引即可使用；若某项能力缺失，技能要求**明确报出缺哪一项**，而不是静默回退到某个本机私有服务。

## 七、验证证据

- 上述 A1–A10 的实际命令输出。
- 独立评审结论（含未能执行的项目及原因）。
