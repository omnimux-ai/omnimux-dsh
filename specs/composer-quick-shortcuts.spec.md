# 输入框下方四条快捷方式（Issue #2562）

## 目标

新对话输入框下方增加四条快捷方式。点任意一条，同时完成三件事：写好提示语、放入对应链接胶囊（会话附件/提示词槽）、选中一款**已内置**技能（底部紫色技能胶囊亮起）。

四条快捷方式本质是技能选择入口，因此必须先确认对应技能已存在；对应技能缺失时该快捷方式不渲染，而不是弹空选择器。

## 对应关系（唯一真源）

| 快捷方式 id | 显示名 | 默认技能 | 默认技能 slug | 默认链接槽 | 可追加链接槽 | 模型与参数 |
| --- | --- | --- | --- | --- | --- | --- |
| `clone` | 复刻爆款视频 | 复刻爆款视频 | `replicate-viral-video` | 视频 | 商品 | 显示 |
| `breakdown` | 拆解爆款视频 | 视频拆解 | `video-hook-analysis` | 视频 | 无 | 不显示 |
| `selling` | 一键创作带货视频 | 创作带货视频 | `create-selling-video` | 商品 | 视频 | 显示 |
| `reverse` | 反推视频提示词 | 反推视频提示词 | `reverse-video-prompt` | 视频 | 无 | 不显示 |

预填提示语（原文，不得改写）：

- `clone`：请用我的产品复刻这个爆款视频
- `breakdown`：请帮我分析拆解这个视频。
- `selling`：请帮我一键生成一条带货视频。
- `reverse`：请把这个视频反推成 Seedance 可用的 AI 提示词。

## 成功标准

1. **预填一致**：点任意一条，输入框文字与上表提示语逐字一致；对应链接胶囊出现；技能胶囊名称为上表显示名。
2. **模型与参数**：`clone`、`selling` 显示「模型」和「参数」两个按钮；`breakdown`、`reverse` 不显示这两个按钮，也不显示「生成方式」。两个按钮复用现有媒体配置面板，不新建面板。
3. **卡槽可点性**：链接胶囊被删掉后，上方对应卡槽恢复可点；再点卡槽，胶囊插回光标处。链接已在输入框内时，对应卡槽不可点。
4. **切换互斥**：从一条快捷方式切到另一条，只保留一颗技能胶囊，不叠加；提示语与链接整组替换。
5. **取消技能不伤内容**：点技能胶囊的叉，只取消技能；提示语与链接胶囊保留。
6. **技能缺失即不渲染**：对应技能在预设技能库中不存在时，该快捷方式不出现，且控制台无报错。

## 已确认的事实

- 四款技能均在 `presets/tiktok-agent/skills.json` 与 `presets/omni-agent/skills.json` 中，`installed: true`。
- 「复刻爆款视频」在 `session-guide/catalog.js` 中已有同源词条 `sk-omx-video-deconstruct`；其余三款按 slug 从预设技能库解析。
- 技能激活通道已存在：`window.__omnimuxActiveSkill` + `omnimux:skill:changed`（`composer-add/skill-event.ts`）。
- 链接胶囊与卡槽已存在：`attachments/PromptSlotChips.tsx`、`VideoLinkPopover.tsx`、`ProductUrlPopover.tsx`，当前由 `AttachmentTray.tsx` 的 `SHOW_MANUAL_LINK_BUTTON` 控制显隐。
- 媒体配置面板已存在：`media-viewer/MediaViewerComposer.jsx` 的模型级联与参数面板。

## 范围

只加这一排快捷方式及其联动。不改技能库数据、技能市场分类、侧栏入口，不改技能选择器自身的交互。

不新建「增强视频」「分析洞察」分类（当前无同名技能）。

## 新用户基线

本功能只依赖已随插件分发的预设技能数据与既有附件通道。新装机器登录后即可使用，不需要任何本机私有配置、本机服务或额外密钥。技能数据缺失时该条快捷方式不渲染，不报错。

## 命令

在任务工作区执行：

- `pnpm --filter omnimux test`
- `node --test plugins/omnimux/src/client/session-guide/*.test.js`
- `git diff --check`

浏览器验收在任务自己的隔离环境里做，保留截图。开发版真机由人工看，不作为本任务完成条件。

## 边界

始终只改本任务工作区。先演示、后合入；用户确认前不合入。不改官方宿主，不发布生产。

## 实现落地与事实修订（2026-09-22）

实施后与仓库事实对拍，以下三点按事实修订本规格：

1. **技能解析通道**：四条 slug 不在会话技能选择器消费的 `plugins/omnimux-market/catalog/preset-skills.json` 里（该文件按 `specs/market-creatify-cards.spec.md` 被刻意清理过：下架 423 个旧技能、改绑 112 套专业营销技能）。四条 slug 只在 `presets/tiktok-agent/skills.json`（出厂 Agent 预设真源）里且 `installed: true`。
   - 实现按契约「技能缺失即不渲染」落地：经 `window.__omnimuxSkillLibrary`（由 omnimux-market 的 `apply.js` 发布）解析，解析不到整条不渲染。
   - **当时数据下四条都会不渲染**（该阶段性结论已被下文「数据分叉的收敛」取代：13 款技能已随本轮改动并入货架），需维护者决定是补回 `preset-skills.json`、补进 market 目录、还是让宿主暴露 agent-presets 技能表。该分叉由 `plugins/omnimux-market/src/client/preset-skill-lookup.test.js` 显式钉住。
2. **链接胶囊**：胶囊落地为既有 prompt 变量槽位令牌 `[视频]` / `[商品]`（沿用输入框行内 `omx-prompt-slot` 高亮），**不是**带 URL 的 markdown 链接——四条快捷方式点击时没有真实 URL 可放。`VideoLinkPopover` / `ProductUrlPopover` 是 URL 输入弹窗，因此本版未接入；卡槽行并入素材导轨同一行（输入框内侧、文字上方），与「胶囊在输入框内、卡槽在其上方」的空间关系一致。
3. **模型与参数**：从 `media-viewer/MediaViewerComposer.jsx` 抽出共享控件 `media-viewer/MediaConfigControls.jsx`（状态机 `useMediaGenerationConfig` + 模型三列级联 + 参数面板，DOM/类名/数据源不变），媒体面板改为消费它、行为不变；输入框快捷方式消费同一套，选模型时按 `model-picker.js` 的同一载荷契约 POST `/omnimux/session-model`。快捷方式里不显示「生成方式」（这两条明确是视频）。
4. **再点同一条 = 撤回**：只剥掉**本快捷方式写入**的那部分草稿，绝不整篇清空——它写进去的提示语（仅当仍处于草稿开头时才剥）与它带来的链接令牌（`[视频]`，以及带 URL 的 markdown 形态 `[视频](url)` 整体剥离，不留 `(url)` 残骸）；用户在提示语之后手打的追加文字原样保留。剥离按「本快捷方式写入的尾块」定点进行，并以本条目写过的链接条数为出现次数上限，因此用户自己独立输入的同名令牌、以及追加文字里的同名令牌都不会被删掉。令牌的「是否已填」判据与剥离一律走链接种类（kind）这个稳定标识，不看当前语言的显示名：切换界面语言后，输入框里旧语言的令牌照样算「已填」、照样剥得掉。技能同步撤下。草稿写不进输入框（宿主桥缺失、`inputActions.setDraft` 缺失或抛错）时，整条不生效（store 与技能都不动）并给出轻提示「输入框未就绪，请重试」；规格未定义，为可预期性如此实现，由单测钉住。

## 验收状态

- 单元/回归：见 `.agent-reports/composer-quick-shortcuts/report.md` 第 5 节（第二轮数据）、第 9 节（第三轮）与第 10 节（第四轮修正后的实测）。第四轮实测：快捷方式 47/47（`catalog` 9 + `links` 23 + `session` 6 + `dom` 9）、货架解析 10/10、附件 122/122、会话引导 39/39、媒体面板 87 例中 86 通过 1 失败（失败项 `generation feedback: real browser transport-to-viewer journeys` 与主干同一红灯，改动前后同名同结果）。
- 真实浏览器逐条验收：**BLOCKED，未完成**，无截图证据（原因见「浏览器验收状态（第二轮）」）。

## 数据分叉的收敛（2026-09-22 用户拍板）

用户已就四条快捷方式的技能数据拍板：「把我截图的那些技能恢复，而不是 400 多个全部」「分创作视频和创作图片两个分类」「技能菜单货架 + 快捷方式都能选」。执行口径与落地结果（第三轮已按提交事实逐条校正）：

1. `plugins/omnimux-market/catalog/preset-skills.json` 的 `tiktok-agent` 与 `omni-agent` 各恢复 `创作视频` 7 款、`创作图片` 6 款，共 **13 款**；**只有这两个分类，没有第三个分类**。第 4 条快捷方式的 `reverse-video-prompt`（反推视频提示词）按产品口径并入 `创作视频`，未额外恢复它在预设真源里的原始分类 `搜索爆款视频`。文案逐字取自 `presets/tiktok-agent/skills.json`；其余 5 个 preset 条目与既有 112 款一字未动，不做全量回滚。数据文件实测 **+458 行 / -0 行**（提交 `eab455a73`，本分支可达）。
2. 13 款按既有条目的 **16 字段**形状落盘，含 `titleEn` 英文标题（英文界面经 `skillTitle` 的英文分支取它）；`preset-skill-lookup.test.js` 新增「字段集与既有条目完全一致 + `titleEn` 非空」断言，防止再漏字段。
3. 四条 slug 现在都能经 `findPresetSkill` 解析，`preset-skill-lookup.test.js` 的断言方向已从「解析不到」翻转为「必须解析到」。
4. 本节取代上文「实现落地与事实修订」第 1 条的阶段性结论——那条记录的是当轮「四条都会不渲染」的中间状态，不是最终事实。

## 浏览器验收状态（第二轮）

- 已在任务工作树内起 `ui` 模式的完整应用环境（动态端口、合成凭据、任务私有 profile），并用 ego-browser 完成同源登录、进入新会话、拿到输入框。
- 但宿主（OmniMux Dev.app）实际加载的插件客户端产物是**已合入 main 的旧构建**，不是本工作树的构建：实测服务端返回的 `omnimux-market` 客户端模块里 `resolvePresetSkill` 命中 0 次、`sk-tk-replicate-viral` 命中 0 次（本工作树构建分别为 1 次、13 次）。把未合入产物写入 Dev profile 或改动应用包都超出本任务授权，故**逐条点击四条的浏览器验收仍为 BLOCKED**。
- 证据：`.agent-reports/composer-quick-shortcuts/`（环境截图 + 本文件所在目录的 `report.md` 第 6 节）；复现脚本见该目录下 `tooling/`。

