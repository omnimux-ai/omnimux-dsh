# Spec · 首页 Skill 点击使用在输入框自动预填 /<skill-slug> 指令话术

## 1. 业务背景与用户明确指示
用户在截图上红框圈出 `"/ad-creative-strategist"`，并明确要求：“skill 点击使用 要在输入框预填 /skill”。
在当前实现中，用户在首页点击任意 Skill 卡片上的「使用」按钮或卡片时，输入框仅预填了无前缀的问答话术（`为我解释下这个技能的最佳使用方式。`），缺少了触发该技能的斜杠命令前缀（如 `/<slug> `），导致用户还需要手动敲入斜杠和技能英文标识才能真正唤起技能。

## 2. 解决方案
1. **指令前缀标准化自动装配**：
   - 在 `SessionGuide.jsx` 的 `handleExploreSkillApply(payload)` 中，智能提取技能的英文标识 slug：
     `slug = payload.skill || payload.slug || payload.item?.skill || payload.item?.slug || (typeof payload.id === 'string' ? payload.id.replace(/^sk-omx-/, '') : '') || ''`；
   - 对 slug 去除多余前缀斜杠并归一化；
   - 若存在有效 slug，则自动拼装标准斜杠命令前缀：`/${cleanSlug} `；
2. **完整预填话术**：
   - 中文环境：`/${cleanSlug} 为我解释下这个技能的最佳使用方式。`；
   - 英文环境：`/${cleanSlug} Please explain the best way to use this skill.`；
3. **输入框焦点与用户体验**：
   - 维持既有的输入框草稿填充与平滑聚焦，不代发，交由用户查看确认后随时发送。

## 3. 验收标准
- **AC-1 预填包含斜杠命令前缀**：点击任意技能卡片的使用按钮，输入框预填内容必须以 `/<slug> ` 开头；
- **AC-2 技能标识与数据源一致**：例如点击 `UGC 告白` 预填 `/ugc-confessional 为我解释下这个技能的最佳使用方式。`；点击 `ad-creative-strategist` 预填 `/ad-creative-strategist 为我解释下这个技能的最佳使用方式。`；
- **AC-3 单元测试与端到端测试 100% 绿灯**。
