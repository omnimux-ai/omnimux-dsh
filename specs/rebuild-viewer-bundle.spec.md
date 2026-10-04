# 规格：重编译并更新 omnimux-viewer 客户端构建产物，接入最新铺满的点阵动效

## 目标
- 重新构建 `plugins/omnimux-viewer/lib/client.js`，使产物包含来自 `dsh-ui-kit` 最新的 `cardFull`、`fieldFull` 与 `spacingX/spacingY` 铺满动效代码；
- 解决客户端在直接运行构建产物时残留旧版 10px/23px padding 导致四周出现 40px 空闲黑边的问题。

## 验收标准
- `plugins/omnimux-viewer/lib/client.js` 包含 `cardFull` 与 `spacingX`；
- 所有单测与契约测试通过。
