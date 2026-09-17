# Spec: 随产品分发的数据文件不得带开发机路径（R6）

**Issue:** #2141 ｜ **模块:** 门禁脚本 / `omnimux*` 资产与构建配置 ｜ **优先级:** P1

## 1. 问题

产品基线门禁（Issue #2129）的 5 条规则只扫 JS/TS 运行时代码。2026-09-17 的延伸体检发现同一类问题残留在**随产品分发的 JSON**里：

- `plugins/omnimux/assets/minimax-showcase/creation-cards.json`（及其 `omnimux-workflow` 逐字节副本）：8/192 张卡片的 `skillLocalBinding.localPath` 指向 `/Users/x/Desktop/Project/OPC/资产库/skills/…`；该文件由中枢 HTTP 原样下发客户端，本仓无消费者读 `localPath`。
- `plugins/omnimux-assets/cloud-catalog/manifest.json`：`sourceRoot` 指向开发机资产库；源码无消费者。
- `plugins/omnimux-apps/tsconfig.json`：`typeRoots` 两条绝对路径指向本机 pnpm store。
- `plugins/omnimux-market/catalog/covers/home/bggg-data-amazon.generation.json`：生成记录里的历史来源路径（provenance）。

## 2. 范围

1. 清除前 3 处的机器路径；构建配置改为可移植写法。
2. 新增 **R6：随产品分发的 JSON 不得包含开发机路径**，扫描 `plugins/**` 下非测试/夹具/文档的 `.json`。
3. 历史生成记录按「带理由豁免」处理（历史证据原样保留，但必须显式声明）。

## 3. 验收用例

| # | 场景 | 预期 |
|---|---|---|
| 1 | 全仓扫描 | 绿；R6 命中为 0（除 1 条带理由的历史记录豁免） |
| 2 | 两张 creation-cards | 合法 JSON；卡片数不变（192）；`skillLocalBinding` 保留 `slug`/`dirName`；全文无 `/Users/` |
| 3 | `manifest.json` | `sourceRoot` 为空串；其余字段不变 |
| 4 | apps tsconfig | 无绝对路径；`tsc --noEmit` 仍可解析 @types（工作树依赖齐备时） |
| 5 | R6 正例/反例 | 合成 JSON 含 `/Users/x/…` → 红灯；含 `~/Desktop/a.jpg` 一类用户示例 → 不报 |
| 6 | 豁免语义 | 无理由 / 僵尸豁免仍报错 |

## 4. 验证命令

```bash
node scripts/verify-product-baseline.mjs
node --test scripts/verify-product-baseline.test.mjs
```

## 5. 边界

- **总是**：只删除机器专有路径，不改卡片内容与字段语义；历史记录保留。
- **绝不**：为过门禁而放宽规则、或把命中项整段删除以掩盖历史。
- 不在本任务：`extension/src/background/index.ts` 的兜底端口（属界面源码，需实机证据 + 端到端测试的完整工序，另开单）。
