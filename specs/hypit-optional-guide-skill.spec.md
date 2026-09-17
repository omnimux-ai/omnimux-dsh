# Spec · Hypit 可选技能（市场可发现 + 会话引导安装）

- Issue: #2160
- Date: 2026-09-17
- Owner: agent
- Baseline: brand-new user machine after install/sign-in（开发机私有路径不得作为默认）

## 1. Objective

在技能市场提供「Hypit 官方能力接入」可选技能卡片。用户点安装时：

1. **不**把 Hypit 引擎/官方完整技能包打进产品分发；
2. 仅安装 OmniMux 自有的薄「安装引导」技能（方法说明）；
3. 打开会话，把该技能挂到共享工具（输入框底部技能药丸）；
4. 预填完整安装指引提示词，**不自动发送**；
5. 用户手动提交后，由 Agent 按官方途径安装 Hypit。

成功标准：新用户能在市场发现卡片；点安装后看到预填提示与技能药丸；本机技能目录只有引导技能，没有 Hypit 二进制/官方全文镜像。

## 2. User journeys

### UJ-1 发现

1. 打开技能市场 / 技能 Tab  
2. 搜索「Hypit」或浏览「视觉与视频」  
3. 看到卡片「Hypit 官方能力接入」（标明第三方 / 版权归 Hypit.AI）

### UJ-2 点安装 → 会话引导

1. 打开卡片详情，点「安装」  
2. 系统安装 `hypit-setup` 引导技能（bundled，OmniMux 自有文案）  
3. 新建或切到会话；输入框预填 `/hypit-setup` + 安装任务说明  
4. 底部共享工具出现该技能药丸  
5. **不会**自动发送消息  
6. 用户点发送后，Agent 按技能说明执行官方安装（`npx skills add hypit-ai/hypit -g` 等），保留 Hypit 品牌信息  

### UJ-3 已安装再试

1. 已装引导技能时点「试用」  
2. 同样预填提示 + 激活药丸，不自动发送，不二次拉取 Hypit 引擎  

## 3. Acceptance criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| AC-1 | `catalog/index.json` 含 `sk-omx-hypit-setup`，`kind=skill`，`tab=skills`，可被搜索「hypit」命中 | 单测 / 目录断言 |
| AC-2 | 条目 `source.type=bundled`，path 指向 `catalog/skills/hypit-setup`，正文为 OmniMux 引导文，**不含** Hypit 引擎二进制或 66 本 handbook 镜像 | 文件树 + 内容抽查 |
| AC-3 | 双语四字段齐全（若 `recommended=true`） | `verify:skill-bilingual` |
| AC-4 | 点安装走 `installFlow=session-guide`：安装引导技能 + `createSkillSession` 预填 `sessionPrefill` + 激活共享工具技能；**无 auto-send** | 单测源码/行为断言 |
| AC-5 | 普通技能安装路径不变（回归：仍 `api("install")`，试用仍 `/${slug} `） | 既有 workshop UI 测试 |
| AC-6 | 产品基线：无开发机绝对路径、无静默依赖本机已装 Hypit | `verify:product-baseline` + 文案 |
| AC-7 | 文案声明第三方官方能力、版权归 Hypit.AI；安装指引指向官方命令/文档 | SKILL.md + prefill |

## 4. Product baseline

- **依赖**：仅 OmniMux 已分发的市场与会话能力；网络仅在用户提交后由 Agent 按官方源拉取。  
- **缺失时**：未点安装则无 Hypit；点安装但用户未发送则仅停留在预填；官方安装失败时 Agent 报告错误，不回落拷贝内置包。  

## 5. Commands

```bash
cd .worktrees/market-hypit-guide-skill-issue-2160
pnpm --filter omnimux-market test
node --test plugins/omnimux-market/src/client/skill-workshop-ui.test.js
corepack pnpm verify:skill-bilingual
node scripts/verify-product-baseline.mjs
```

## 6. Structure

- `plugins/omnimux-market/catalog/skills/hypit-setup/SKILL.md` — 引导技能  
- `plugins/omnimux-market/catalog/index.json` — 货架条目  
- `plugins/omnimux-market/src/client/session-create.js` — session-guide 预填 + 激活技能  
- `plugins/omnimux-market/src/client/skills-ui.js` — 安装按钮分流  
- `plugins/omnimux-market/src/client/*test*` — 断言  

## 7. Boundaries

- **Always**：不自动发送；不捆绑 Hypit 引擎；保留第三方署名。  
- **Ask first**：把 Hypit 设为默认复刻引擎、商业授权谈判文案。  
- **Never**：把 Hypit 源码/二进制打进安装包；多租户云托管 Hypit；去掉 Hypit 品牌后转售。  

## 8. Assumptions

1. 「共享工具」= 输入框底部技能药丸（`__omnimuxActiveSkill` / `publishActiveSkill`）。  
2. 允许安装 OmniMux 自有薄引导技能（非 Hypit 再分发）。  
3. 官方安装命令以 Hypit 公开文档为准：`npx skills add hypit-ai/hypit -g`，可执行包 `@hypit/hypit`。  
