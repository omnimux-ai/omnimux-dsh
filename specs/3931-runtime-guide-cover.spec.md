# 首跑引导右侧封面（Issue #3931）

## 背景

「运行方式」首跑引导全屏化（#2594）后，选择步骤右侧装饰区只有一块纯 CSS 渐变。OmniMux 单色主题把 `--dsw-alias-brand-primary` 统一替换为 `--dsw-alias-label-primary`（文字白），渐变里的紫色被冲成灰白，最终呈现为一片灰雾，用户误以为封面图丢失。

## 目标

复用登录窗（LoginGate）锁定的「深海水母」海报图层，让引导右侧成为真正的封面：深海照片 + 水母 + 光晕 + 暗角，全部由 CSS 实现，不新增图片资源文件。

## 实现要点

- `.omnimux-runtime-guide-art`：`background-image` 依次为月光径向光斑、unsplash 深海照片、离线 `LOGIN_GATE_SEA_URI` SVG 兜底；`background-size: cover`，照片居中偏上。
- `.omnimux-runtime-guide-art::before`：`LOGIN_GATE_JELLY_URI` 水母图层，顶部居中、带径向遮罩柔化边缘。
- `.omnimux-runtime-guide-art::after`：紫色海报色调 + 上下暗角，保证与左侧卡片衔接。
- 海报使用固定锁扣配色，按既有 UI03 约定逐行标注 `exempt-ui03` 豁免理由。

## 假设

- 单色主题把 `--dsw-alias-brand-primary` 统一替换为文字白，才使原来的紫色渐变退化成灰雾；登录窗的水母海报图层使用固定锁扣配色，与主题无关，可直接复用。
- 深海照片在用户网络下可加载；即使照片不可达，`LOGIN_GATE_SEA_URI` 矢量海报 + 水母兜底也能让封面成立，不会出现空白。

## 证伪方式

- 把 `--dsw-alias-brand-primary` 临时改回品牌紫后若右栏仍是灰雾，说明「渐变被单色主题冲淡」的根因假设不成立。
- 运行 `node scripts/runtime-guide-web-qa.mjs`：若 `cover-photo-loaded` 在照片不可达时不红、或 `cover-offline-photo-blocked` 未观察到照片确实被阻断、或 `cover-offline-request-blocked` 在屏蔽窗口内为 0，则照片/离线兜底假设不成立。

## 非目标

- 不改引导布局、文案、三选一行为与显隐判定。
- 不动登录窗海报本身。
- 不新增二进制素材。

## 验收用例

- S1：选择步骤右侧渲染深海照片 + 水母封面；照片必须真实解码成功（`cover-photo-loaded` 失败即红），`getComputedStyle` 的 `background-image` 精确包含登录窗同款 `LOGIN_GATE_SEA_URI`，`::before` 精确包含 `LOGIN_GATE_JELLY_URI`。
- S1b：1024x760 窄视口下封面随卡片等比收缩，封面盒宽 ≥300、高 ≥400，不塌陷、不变形。
- S2：`agent` / `key` 两步仍是单列布局，右侧不渲染封面。
- S3：引导三选一、跳过、保存绑定、已配置不显示等既有行为全部不变。
- S4：屏蔽 `images.unsplash.com` 后仍由深海 SVG + 水母兜底，封面盒尺寸有效，不出现空白。

## 证据

- `scripts/runtime-guide-web-qa.mjs` 全绿（含 `cover-poster-layers` 断言与 `.workbuddy/evidence/worktree-qa/` 截图）。
- `plugins/omnimux/src/client/runtime-guide-cover.test.js` 静态锁定封面图层与图层归属。
