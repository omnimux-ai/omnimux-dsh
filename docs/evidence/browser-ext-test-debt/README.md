# 浏览器扩展测试积压（#3021–#3024）证据

本目录收的是测试运行证据。这几张票只改测试和 CI，不改产品界面，所以没有浏览器截图。

- `red-node25-full.txt`：修复前，Node 25.8.0 跑扩展全量 vitest，47 项失败。
- `red-node24-full.txt`：修复前，Node 24.18.1（CI 版本）跑同一套件，10 项失败，另有 6 条未处理错误。
- `red-ownership-unhandled.txt`：修复前单独跑 background-panel-window-ownership，8 项用例全部通过，但有 6 条 `chrome is not defined` 未处理错误。
- 修复后的绿灯记录按票追加（`green-*.txt`）。
