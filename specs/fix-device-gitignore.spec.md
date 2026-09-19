# 规格：为 omnimux-device 配置 .gitignore 忽略编译衍生文件 lib/

## 一、 背景
`plugins/omnimux-device/lib/client.js` 是由 `scripts/build-client.mjs` 编译生成的衍生构建产物。按仓库规范，衍生构建产物不应直接作为源码跟踪，应在 `.gitignore` 中声明。

## 二、 修复方案
在 `plugins/omnimux-device/.gitignore` 写入 `lib/`。

## 三、 验收标准
- [ ] `plugins/omnimux-device/.gitignore` 忽略 `lib/`；
- [ ] `sync-to-app.sh` 顺利物化通过。
