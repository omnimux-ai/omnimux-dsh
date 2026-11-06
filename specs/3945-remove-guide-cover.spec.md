# 移除首跑引导右侧装饰封面（Issue #3945）

## 背景

#3931 给首跑引导选择步骤的右侧补了「深海水母」装饰封面。用户看到后明确表示不要这个背景。

## 目标

- 删除 `.omnimux-runtime-guide-art` 装饰面板及其所有图层（照片、水母、光晕、暗角）与对应 CSS。
- choose 步骤改用 `omnimux-runtime-guide-sheet--single` 单列布局，与 agent/key 步骤一致。
- 更新 QA：删除封面相关断言与离线/窄视口场景，新增「单列 + 无 art 节点」断言。

## 非目标

- 不改登录窗海报。
- 不改 agent/key 步骤的字段与行为。
- 不保留替代背景或占位块。

## 假设

- 用户不需要选择步骤的右侧装饰画面；单列卡片能完整承载「运行方式」三选一与跳过入口，不损失信息。
- 删除 art 面板不会影响 `omnimux-runtime-guide-sheet--single` 在其他步骤的既有布局。

## 证伪方式

- 运行 `node scripts/runtime-guide-web-qa.mjs`：若 choose 步骤的 sheet 不含 `--single` 类、或 DOM 中仍存在 `.omnimux-runtime-guide-art`，则移除不成立。
- 截图 `empty-guide.png` 若仍出现右侧紫色/照片区域，则仍残留封面。

## 验收

- 选择步骤单列，无 `.omnimux-runtime-guide-art` 节点与相关 CSS。
- 三选一、跳过、BYOK 保存、已配置不显示等行为不变。

## 旧标准变更

- `plugins/omnimux/src/client/runtime-guide-cover.test.js` :: `first-run runtime guide cover`
- `plugins/omnimux/src/client/runtime-guide-cover.test.js` :: `keeps the jellyfish as its own masked layer above the photo`
- `plugins/omnimux/src/client/runtime-guide-cover.test.js` :: `keeps the poster tint and vignette overlay`
- `plugins/omnimux/src/client/runtime-guide-cover.test.js` :: `paints the locked deep-sea poster instead of a flat gradient placeholder`

说明：该测试文件随 #3931 的封面功能新增，现封面整体移除，测试对象已不存在，故整文件删除；替代覆盖由 `scripts/runtime-guide-web-qa.mjs` 的 `choose-single-column` / `choose-no-cover` 断言承担（单列布局 + DOM 无 art 节点），视觉证据为 `empty-guide.png`。

## 证据

- `scripts/runtime-guide-web-qa.mjs` 全绿与 `empty-guide.png` 截图。
- 静态测试与边界检查。
