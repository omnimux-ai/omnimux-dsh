# 画布导出产物损坏：实机预演证据（修复前）

任务：`clip-export-mp4-finalize`（Issue #3139）
环境：OmniMux Dev 桌面应用（CDP `127.0.0.1:9229`，页面 `http://127.0.0.1:45120`）
采集时间：2026-10-05 18:07
方法：在真实应用中走完整 UI 导出路径（画布 →「视频合成」节点 → 剪辑器 → 时间轴放入真实 mp4 → 点真实导出按钮）。

## 1. 导出确实发生了（排除"没导出成功"）

| 项 | 实测 |
| --- | --- |
| 导出触发 | 真实点击导出按钮（元素矩形中心 `1551.6, 69.5`） |
| 事件 | `omnimux-clip-save` 触发，`nodeId=node_video_composition_1791191510717`，`projectId=clip_node_1791191510718_d5b43d` |
| 进度 | 764 次 `omnimux-clip-progress`，最终 `renderProgress: 100` |
| 上传 | `POST /omnimux-clip/api/projects/clip_node_1791191510718_d5b43d/save-export` → HTTP 200 |
| 落盘 | `~/.omnimux-dev/omnimux/clip/exports/clip_node_1791191510718_d5b43d.mp4`，47,101,039 字节，mtime 18:07:59 |

## 2. 产物结构损坏（本次要修的现象）

文件头十六进制：

```
00000000: 0000 001c 6674 7970 6973 6f6d 0000 0200  ....ftypisom....
00000010: 6973 6f6d 6176 6331 6d70 3431 0000 0001  isomavc1mp41....
00000020: 6d64 6174 0000 0000 0000 0010 2100 0340  mdat........!..@
```

- `ftyp` 正常（28 字节）。
- 紧随其后的 `mdat` 其长度字段为 `0x00000000`（占位值，未回填），解析器据此认为 `mdat` 延伸到文件尾。
- `moov` 实际位于 offset 47,085,890（长度 15,149，正好以 EOF 结束），因此永远不可达。

`ffprobe` 输出：

```
[mov,mp4,m4a,3gp,3g2,mj2] moov atom not found
...: Invalid data found when processing input
```

画布内该节点的 `<video>`：`readyState 0`、`networkState 3`、`duration null`、`error.code 4`、`PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN`。

## 3. 与传输/落盘无关（定位到编码产物本身）

- 同一端点上传统媒体地址取回的字节 SHA-256 与磁盘文件完全一致（无截断、无编码损坏）。
- 单独上传一个格式正确的 mp4 走同一条通道，`ffprobe` 可正常解析（对照样本 `clip_node_live_probe.mp4`）。
- 因此损坏产生在「编码/封装产物」这一环。

## 4. 根因（代码级）

`plugins/omnimux-clip/src/client/openreel/web/services/export-runner.ts` 的 `createCapturingWritable`：

```ts
async write(data: unknown) {
  await target.write(data);
  ...chunks.push(...)        // 无条件追加，忽略写入位置
}
async seek(position: number) { ...target.seek(position) }   // 捕获游标不跟随
```

mp4 封装的收尾是「顺序写出 `mdat`（长度留占位）→ 回到文件头定点回填真实长度 → 追加 `moov`」。
`FileSystemWritableFileStream` 的定点回填形态是 `write({ type: 'write', position, data })` 或先 `seek(position)` 再 `write`。
捕获层忽略位置 → 回填字节被追加到文件尾、头部长度字段停在 0 → 解析器在 `mdat` 处失去同步。

## 5. 判定修复成功的依据（逐条对照）

1. 单元：定点回填后产物长度不增长，且 offset 处的字节被替换为新值。
2. 单元：`seek` 后的顺序写入从该位置开始；`truncate` 截断长度。
3. 端到端：按真实收尾序列驱动捕获层，产物与目标文件逐字节一致。
4. 真机：Dev 应用内完成一次真实导出，产物 `ffprobe` 能读出时长与视频流，画布下游节点可直接播放。
5. 回归：`pnpm --filter omnimux-clip test` 全绿。
