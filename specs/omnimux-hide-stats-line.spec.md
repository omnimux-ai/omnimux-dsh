# 稳健隐藏官方 StatsLine / ContextMeter

Issue: #4034

## 背景

Dev 版新会话输入框下方重新出现官方统计行「1 轮 1 步 · 0%」。实机 CDP 核对（宿主 OmniMuxDev 2.0.21 / Chrome 152）：

- StatsLine 真实根类名已是 `K-8v-a_anchor / _pill / _label`（位于 `[data-slot="conversation.composer.dock"]` 内），
  现有隐藏选择器 `[class*="StatsLine_root"]` 与 `.FJxK0a_root` 全部匹配不到；
- ContextMeter 类名仍是 `.JdJrwG_root`，隐藏规则存在于样式表，但被更高/更后的规则覆盖（实测把同规则改到末尾即生效）。

问题与输入框留白改动无关（那两次提交只改了留白与快捷方式排）。

## 目标

- 官方 StatsLine 与 ContextMeter 在 composer 内稳定隐藏，不依赖会随宿主构建漂移的哈希前缀；
- 不误隐藏 composer 内其它合法控件（发送、模型、工具等）。

## 假设

- StatsLine 占位在 `[data-slot="conversation.composer.dock"]` 内，其可见根元素类名后缀含 `_anchor`，可按 slot + `[class*="_anchor"]` 结构匹配；
- ContextMeter 元素类名含 `JdJrwG_root` / `ContextMeter_root`，提高选择器特异性（`html body`）即可压过覆盖它的规则。

## 证伪方式

- 在真实 Dev 页面通过 CDP 注入候选选择器：若 StatsLine 锚点或 ContextMeter 的 `getComputedStyle().display` 不为 `none`，
  或隐藏后 composer 的发送/模型/工具按钮消失，即证伪。
- 提交后 `node --test` 相关样式测试失败即证伪。

## 验收用例

1. 注入候选规则后：`[data-slot="conversation.composer.dock"] [class*="_anchor"]` 与 `[class*="JdJrwG_root"]` 的 display 均为 none；
2. 截图确认 composer 其余控件（＋、发送、模型）仍在；
3. 落地后刷新 Dev，统计行与 0% 不再出现。

## 非目标

- 不改宿主官方源码；不改输入框留白/快捷方式排；不动 Dock 680 令牌。
