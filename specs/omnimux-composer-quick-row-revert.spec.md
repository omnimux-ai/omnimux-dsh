# 回滚快捷方式排宽度改动（复审反馈）

Issue: #4028（follow-up）

## 背景

#4029 为修复「新会话输入框左右留白对齐原生 16px」，顺带把 `composer-quick-shortcuts/styles.js`
里快捷方式排的宽度公式从
`min(var(--dsh-composer-card-max-width, 952px), calc(100% - 2 * var(--dsh-composer-side-clearance, 16px)))`
改成了 `min(680px, 100%)`。

独立评审指出：快捷方式排挂在「卡片之外、座位之内的输入区 dock」，其宽度契约由该文件自身注释与
`specs/composer-quick-shortcuts-icon-style.spec.md` 明确锁定为「卡片最大宽令牌 + 让出两侧 clearance」，
且有 `layout-geometry-after.json` 证明旧公式在 45 个宽度（含 inline-density cardWidth=318 场景）下与卡片同宽。
改成硬编码 680 会忽略卡片动态宽度令牌，在非分栏窄列 / inline 密度场景下让这一排与卡片不再同宽。该改动超出本次任务范围。

## 目标

- 把 `plugins/omnimux/src/client/composer-quick-shortcuts/styles.js` 恢复为 #4029 之前的原始宽度公式与注释；
- 不改动 #4029 已验证的输入框卡片/工作区行留白修复（16px、680 上限）。

## 假设

- 快捷方式排的宽度契约以「卡片最大宽令牌 + 2×clearance」为准（原公式），本次改宽属超范围，回滚即恢复既有契约。

## 证伪方式

- 若回滚后 `plugins/omnimux/src/client/composer-quick-shortcuts/styles.test.js` 失败，或文件与原公式不一致，即证伪。

## 验收用例

1. `composer-quick-shortcuts/styles.js` 与 #4029 之前的原始公式逐字一致。
2. `node --test plugins/omnimux/src/client/composer-quick-shortcuts/styles.test.js` 通过。
3. `node scripts/composer-side-margin-qa.mjs` 仍通过（卡片/行 16px、宽屏 680 不受影响）。

## 非目标

- 不重新设计快捷方式排宽度；不改卡片/工作区行留白。
