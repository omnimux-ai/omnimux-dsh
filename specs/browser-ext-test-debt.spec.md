# 浏览器扩展测试积压清零（Issue #3021 / #3022 / #3023 / #3024）

## 背景

`plugins/omnimux-browser/extension` 的 vitest 全量套件在本机 Node 25 下有 47 项失败（分布在 13 个文件），在 CI 所用的 Node 24 下有 10 项失败。这个套件没有接进任何 CI 步骤，失败因此长期积压。本规格覆盖四张票，按编号顺序合入。

## 用户旅程

开发者在主干检出上运行扩展测试，Node 24 和 Node 25 下都全部通过，没有未处理的错误。之后任何 PR 让扩展测试变红，CI 都会拦下。

## #3021 测试环境（37 项 + 6 条未处理错误）

- 根因：Node 25 默认开启 Web Storage，Node 自带的全局 `localStorage` 盖掉了 jsdom 的那一份。没有 `--localstorage-file` 参数时，这份存储的方法不可用。
- 做法：测试初始化时检测到 jsdom 环境，就把 `localStorage` / `sessionStorage` 重新指向 jsdom 自己的实现。
- `chrome is not defined` 来自 `background-panel-window-ownership.spec.ts`：后台的异步启动还没结束，afterEach 就把 chrome 桩撤掉了。做法：撤桩之前先等启动链跑完。
- 验收：这 37 项在 Node 24 和 Node 25 下都通过；不再出现未处理的错误；产品源码零改动。

## #3022 过时断言（8 项）

下面这些功能早已按规格落地，只是测试没跟上，所以只改测试：

- extension-network-policy「本机补全通道」：#1991 已把补全改走本机桥方法 `bridge.completeText`。
- media-post-classifier「白名单社媒平台」、qa-media-hover-round2「tiktok 120×120」：按 #2011 / #2154（browser-surfaces 规格），TikTok 用场景按钮和卡片触发按钮，悬停胶囊不在 TikTok 上出现。
- qa-media-hover-gate F 组 4 项：按 specs/media-hover-instant-reveal.spec.md（#2963），展开态宽 128px、左右内边距 24、按钮 24 / 图形 14、品牌 24 / 图形 18、宽度过渡 250ms。
- qa-media-side-panel-lit「自动点亮并随消息发送」：按 #2134，素材点亮后直接进输入框缩略图，外部素材条不再显示已收进的素材。
- 验收：8 项通过；其余断言不削弱。

## #3023 紫色门禁与证据检查（2 项，用户已拍板）

- 卡片触发按钮 `content/surfaces/media-trigger.ts` 的图标色沿用品牌淡紫 `#b8b7ff`（browser-surfaces 规格，视觉不变）。把这一个文件、这一个值加进紫色门禁的放行名单，T1b 同步锁定新的放行范围。
- tool-activity-card「修复前基线已留存」：读取的是被忽略目录 `.agent-reports/` 下的文件，任何机器上都没有，删除这一条；同文件里卡片行为的测试全部保留。
- 验收：界面零变化；两项通过。

## #3024 接入 CI

- quality-gate 新增一步，运行扩展 vitest，失败即阻断。这一步依赖前三票合入、主干全绿。
- 验收：PR 的 CI 里出现这一步，并且是绿的。

## 不在范围内

产品行为、界面、文案一律不改。
