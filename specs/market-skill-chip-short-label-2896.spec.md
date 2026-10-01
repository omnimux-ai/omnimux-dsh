# fix(market): 技能胶囊 short 密度档恢复名称显示 (Issue #2896)

## 背景与问题

技能选择器（`.sh-picker`）选中技能后，`SkillPickerButton` 在 composer 工具栏渲染 `.sh-active-skill-chip`（图标 + `.sh-chip-label` 名称 + `.sh-chip-close` 移除钮）。CDP 实测（OmniMux Dev :9229）：选择链路本身完整 —— `install` 落盘、`tryAttach` 写 `<sessionId>.trial.json`、发送时 `renderAttachedTrialSection` 注入系统提示均正常。

缺陷在表现层：`css.js` 中 `html:is([data-omnimux-composer-density='short'],[density='icon'])` 规则把 chip 压成 28px 纯图标并 `display:none` 掉 label 与 close。分栏/窄窗常态下 composer 卡片宽约 549px → `composerDensityForWidth` 判为 `short` → 用户选中技能后看不到名称，误认为未选中、不可提交。

## 验收标准

1. `density='short'`（460–559px）：chip 显示「图标 + 截短名称 + 关闭钮」，名称 `max-width:88px` 截断（对齐 short 档 `triggerLabel` 截断宽度）。
2. `density='icon'`（<460px）：chip 仍为 28px 纯图标，hover 变红叉，点击移除（现状不变）。
3. `density='full'`（≥560px）：现状不变（图标 + 名称 max-width:130px + 关闭钮）。
4. 移除交互：short 与 icon 档点击 chip 本体或 close 钮均触发 `clearActiveSkill`（`skill-picker.js` 现有逻辑覆盖，无需改动）。
5. 发送链路不受影响：不改动 `applyItem` / `install` / `tryAttach` / `renderAttachedTrialSection`。

## 关键用户旅程

窄栏会话中：点「技能」→ 弹层选未安装技能 → 弹层关闭、工具栏出现带名称的技能胶囊（用户可确认身份）→ 输入内容发送 → 服务端按 trial.json 注入技能正文。

## 变更面

- `plugins/omnimux-market/src/client/css.js`：icon-only 规则收窄到 `icon` 档；`short` 档新增 label/close 保留 + 名称截短规则。
- `plugins/omnimux-market/tests/e2e/skill-chip-compact.spec.js`：断言从「short+icon 同规则」改为「icon 纯图标、short 保留截短名称」。

## 非目标

不改弹层列表、不改会话试用后端、不改 density 计算阈值。
