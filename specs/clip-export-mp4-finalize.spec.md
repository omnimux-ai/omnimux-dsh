# 画布视频合成导出产物损坏（mp4 封装收尾丢失）

任务：`clip-export-mp4-finalize`（Issue #3139）
上游：Issue #3129 / PR #3131 已修复「下游节点指向非本次合成的文件」，本次只处理「导出产物不可播放」。

## 现象（真机实测）

画布「视频合成」节点导出成功后，落盘文件结构损坏：`ffprobe` 报 `moov atom not found`，画布内 `<video>` 报 `DEMUXER_ERROR_COULD_NOT_OPEN`。
文件头实测：`ftyp` 之后是 `mdat`，其后 4 字节长度为 `0x00000000`（占位值），`moov` 位于文件尾部。
真实样本：`~/.omnimux-dev/omnimux/clip/exports/clip_node_1791191510718_d5b43d.mp4`（47,101,039 字节）。

## 根因

`plugins/omnimux-clip/src/client/openreel/web/services/export-runner.ts` 的 `createCapturingWritable` 把每次写入**无条件追加**到捕获列表：

```ts
async write(data: unknown) {
  await target.write(data);
  ...chunks.push(...)      // 忽略写入位置
}
async seek(position: number) { ...target.seek(position) }   // 捕获游标不跟随
```

而 mp4 muxer 的标准收尾方式是：先顺序写出 `mdat`（长度字段留占位），最后**回到文件头定点回填真实长度**，再追加 `moov`。
`FileSystemWritableFileStream` 的定点回填写入形态是 `write({ type: 'write', position, data })` 或先 `seek(position)` 再 `write`。
两种形态都被捕获层忽略位置 → 回填字节被追加到文件尾、头部长度字段永远停在占位值 → 解析器在 `mdat` 处失去同步，读不到 `moov`。

## 目标与可测验收标准

1. 捕获层必须按 `position` 定点写入：先写 A(0..n)、再定点回填 offset 24 的 8 字节，最终字节序列中 offset 24 处为新值，且**总长度不增加**。
2. `seek(position)` 之后的顺序写入必须从该位置开始。
3. `truncate(size)` 必须把捕获长度截断到 `size`。
4. 顺序写入（无 position）行为与修复前一致：字节顺序拼接、长度等于累计写入量。
5. `{type:'write'|'seek'|'truncate'}` 三种 WriteParams 形态都要被正确解释，同时原样转发给底层流。
6. 真机：Dev 应用内完成一次真实画布导出，产物 `ffprobe` 可解析（能读出 duration 与视频流），画布下游节点可直接播放。

## 用户关键操作旅程

画布 →「视频合成」节点 → 打开剪辑器 → 时间轴放入片段 → 点导出 → 下游「成片」节点出现并可播放。

## 方案

把位置语义从 `createCapturingWritable` 中抽成无依赖模块 `export-write-buffer.ts`：

- `createSequentialWriteBuffer()`：内部维护 `cursor`（顺序写入游标）与 `end`（已写入的最大字节边界），写入时按需扩容。
- `write(position, bytes)`：`position == null` 时写 `cursor` 并推进 `cursor`；否则定点写入并只抬高 `end`。
- `seek(position)` / `truncate(size)` / `length` / `toUint8Array()`。
- `createCapturingWritable` 用它实现捕获，并继续把原始 `data` 转发给底层 `target.write`（保持真实落盘行为）。

## 验收证据

- 单元：`plugins/omnimux-clip/src/client/export-write-buffer.test.js`（定点回填不增长长度、seek、truncate、顺序写、WriteParams 三形态）。
- 真机：Dev 应用真实导出后 `ffprobe` 输出与画布播放状态截图。
- 回归：`pnpm --filter omnimux-clip test` 全绿。

## 边界

- 不改动 vendored OpenReel 编辑器源码，只改本仓桥接层。
- 不改动导出通道（#3131 已定的原始字节上传）。
- 不处理「导出时长与源素材时长不一致」等其它候选因素（本次不作为验收项）。
