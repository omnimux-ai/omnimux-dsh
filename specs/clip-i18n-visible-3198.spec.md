# Spec: omnimux-clip 高可见度界面中文化（第一批）

Issue: #3198 | 工作树: `.worktrees/clip-i18n-visible-issue-3198` | 基底: `origin/main` (`90c59f15c`)

## 1. 背景与问题

调查报告 `.agent-reports/clip-i18n-audit/`（direction-a/b/c 三份）证实：vendored OpenReel 编辑器（`plugins/omnimux-clip/src/client/openreel/`，~200 个界面文件）零 i18n 机制，zh 宿主语言下界面几乎全英文；仅 `Toolbar.tsx` 一处经 `useHostLocale` 桥切换「退出编辑」。插件外壳 `omnimux.clip` 字典 22 个 key 只覆盖宿主 Tab 外框。

## 2. 用户关键旅程与期望反馈

| 旅程 | 现状（zh 环境） | 期望（zh 环境） |
|---|---|---|
| 打开「视频剪辑」页签 | 欢迎页全英文（Templates / Create Project / My Awesome Video…） | 全部中文 |
| 进入编辑器 | 工具栏 Export / Saved!、左侧工具条标签（Undo/Audio mixer…）、顶栏 Video Editor / Motion Design 全英文 | 全部中文 |
| 时间轴操作 | 轨道头部、右键菜单（Split at Playhead / Ripple Delete…）英文 | 全部中文 |
| 预览区 | Player / Playback quality / Aspect ratio 等英文 | 全部中文 |
| 属性面板（选中素材） | 8 个标签名 Transform/Color/Effects/Audio/Speed/Animate/AI/Style 英文 | 全部中文 |
| en 环境 | 英文 | 保持英文不变 |

## 3. 验收标准（可测）

1. zh 环境下：欢迎页、工具栏、左侧工具条、WorkspaceModeTabs、时间轴右键菜单与轨道操作、预览区控件、inspector 8 个标签名均显示中文；en 环境下对应位置仍为英文。
2. 未翻译词条回退为原文（不空白、不报错）；`t()` 在非 React 上下文（数据文件、配置表）也可用。
3. `pnpm --filter omnimux-clip test` 全绿；新增 i18n 桥单测覆盖：zh 命中 / en 回退 / 缺词回退 / 变量占位。
4. 工作树真机证据：欢迎页、编辑器主界面（含时间轴右键菜单）、属性面板标签页三处 zh 截图。
5. 文案遵循 `docs/contracts/ui-copywriting-and-naming-standards.md`（简体中文、动词短语、无 AI 腔）。

## 4. 技术方案

- 新增 `plugins/omnimux-clip/src/client/i18n/`：
  - `zh-CN.js` — 英文字面量 → 中文 字典（按英文原文作 key，便于逐文件增量接入）。
  - `index.js` — `useClipT()`：基于 `useHostLocale` 单例；`active === 'en'` 或非 zh 前缀时回退原文；`t(src)` 查字典返回中文，缺词回退原文。
- vendored 文件按「同 Toolbar.tsx 先例」以相对路径导入 `useClipT`（如 `../../../../i18n/index.js`），字符串原位替换为 `{t('...')}` / `label={t('...')}`；不 import 任何 `@deepseek-ai/*`，符合 vendor contract 单向适配。
- 数据文件（`clip-tabs.config.ts`、`tour-steps.ts` 等）直接导出函数或接受 t 参数，不做运行时上下文读取。

## 5. 范围边界

- **本批（~300 条）**：`web/components/welcome/`（全量）、`WorkspaceModeTabs.tsx`、`editor/Toolbar.tsx`、`EditorActionRail.tsx`、`editor/AssetsPanel.tsx` 表层、`editor/Timeline.tsx` + `editor/timeline/ClipContextMenu.tsx`/`TrackHeader.tsx`、`editor/Preview.tsx` 表层、`inspector/clip-tabs.config.ts`。
- **不翻**：inspector/ 内 75 个区块、motion/ 工作区、chat/ai-panel/kieai、settings、tour 步骤、SharePage、MobileBlocker、特效/转场/模板/模型名称（专有名词保留英文）、数据内容（工程名、素材名）。
- **新用户基线**：无需任何外部服务；语言完全由宿主 `ctx.locale` 决定，缺省快照即 zh，en 回退英文原文。

## 6. 验收证据

- 单测：`clip-i18n.test.js`（zh 命中/en 回退/缺词回退/变量占位/字典键与源码字面量一致性抽查）。
- 真机：工作树 Web QA 或 ego 截图 ≥3 张（欢迎页、编辑器主界面、属性面板标签）。
