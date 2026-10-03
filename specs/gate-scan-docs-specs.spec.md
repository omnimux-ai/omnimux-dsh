# 全仓扫描跳过 docs/specs/ 示例源码（Issue #3037）

## 背景

主干每次 push 都跑 `node scripts/auto-qa-gate.mjs . --all` 全仓扫描。它把 `docs/specs/omnimux-device/` 规格文档附带的示例插件源码当产品源码扫，连续两次让主干 push 报 8 项阻断（7 处裸颜色 + 1 处 Stage 保活）。

## 用户旅程

开发者向主干推任何变更，push 门禁不再因为规格目录里的示例代码而红；`plugins/` 下名为 `specs` 的真实源码目录（如 `plugins/omnimux-workflow/src/shared/specs/`）不受影响，仍被正常扫描。

## 验收

- 全仓扫描 `--all` 与 diff 模式都不把 `docs/specs/` 下任何文件计入扫描集合
- `docs/specs/omnimux-device/` 下出现的 7 处颜色 + 1 处保活不再上报
- `plugins/*/src/**/specs/` 里的真实源码仍被扫描（不误伤同名目录）
- 新增一条单测锁住「docs/specs 被物理忽略」
