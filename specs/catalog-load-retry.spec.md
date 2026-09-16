# 云端目录读取失败可自愈规格 (Issue #2005)

## 1. 现象
资产中心「公共」页签整页报错：

```
cloud assets catalog is not built; run the build:cloud-catalog script
```

同时页签文案已是「公共」，说明新客户端已生效——问题在**主机侧读不到目录**。

## 2. 根因
`plugins/omnimux-assets/src/cloud-catalog.js` 的加载函数是**一次性上锁**：

```js
function load() {
  if (loaded) return
  loaded = true                       // ← 先置位
  const parsedManifest = readJsonFile(join(catalogDir, 'manifest.json'))
  const parsedIndex = readJsonFile(join(catalogDir, 'index.json'))
  if (!parsedManifest || !Array.isArray(parsedIndex)) return   // ← 失败时 loaded 已经是 true
  ...
}
```

失败分支只 `return`，但 `loaded` 早已置为 `true`。于是**第一次读失败之后，`ready()` 永远短路返回 false**，
插件再也不会重试，只能靠重启应用恢复。

触发条件很常见：`sync-to-app.sh` 物化时会先删掉再整份拷回插件目录，
应用若在这个拷贝窗口内首次触发加载，就会永久卡在「目录未构建」。

## 3. 目标
目录缺失或正在重建时保持「未加载」，**下一次请求自动重试**；读到有效目录后才上锁。
插件因此可以自愈，不需要人工重启。

## 4. 验收标准
- **AC-1** 首次读取失败（目录不存在）后，`getManifest()` 抛 `catalog-unavailable`。
- **AC-2** 目录随后出现（模拟物化完成），**不重启、不显式 reload**，下一次 `getManifest()` 必须成功返回清单。
- **AC-3** 读取成功后仍然上锁：后续请求不再重复读盘（用读盘计数断言，成功路径只读一次）。
- **AC-4** `reload()` 语义不变：强制丢弃已加载内容并重新读取。
- **AC-5** 既有目录相关测试全绿。
