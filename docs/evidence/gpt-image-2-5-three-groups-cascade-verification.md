# Issue #2832 · GPT Image 2.5 三分组级联菜单验收

## 结论
`gpt-image-2.5` 已补齐 `pro` / `standard` / `economy` 三个官方渠道；因渠道数 = 3 > 1，第三列「渠道 / 版本」菜单自动展示，含「旗舰版」「标准版」「经济版」。

## 验收证据
- 演示页：`docs/evidence/gpt-image-2-5-three-groups-cascade-demo.html`
- 截图：`docs/evidence/gpt-image-2-5-three-groups-cascade-verified.png`
- 结构化报告：`docs/evidence/gpt-image-2-5-three-groups-cascade-verified.json`

## 关键断言
| AC | 结果 |
|---|---|
| AC-1 hub/canvas 三分组 | PASS |
| AC-2 命名门禁 | PASS |
| AC-3 MediaViewer fallback 三分组 | PASS |
| AC-4 第三列渠道菜单可见 | PASS（截图） |
| AC-5 X-Omnimux-Group 路由契约 | PASS（e2e + openai-media） |
| 上游零成本探针 default/economy/pro=400；fake=403 | PASS |

## 路由契约
- pro → `X-Omnimux-Group: gpt-image-2.5-pro`
- standard → `X-Omnimux-Group: default`
- economy → `X-Omnimux-Group: gpt-image-2.5-economy`
