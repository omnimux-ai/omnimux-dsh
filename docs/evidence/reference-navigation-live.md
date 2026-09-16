# 统一引用隐形导航 · 实机注入证据

命令（在任务工作树内执行，完全复刻事故会话 session-63f46629 首轮的附带上下文）：

```sh
node --input-type=module -e "<挂载 mountWorkbenchContextInjector，喂入事故会话的 attachedContextText>"
```

## 实测输出

```
注入消息条数: 2 (改动前同为 2)
用户气泡原文未改动: true
--- 模型实际收到的附加上下文 ---
### 会话关联上下文 (Attached Context):
- [视频] She really woke up and chose GTA-style chaos.
Created with Seedance 2.5 on @itsPolloAI
(`MP4`): @inspiration/insp_ad704927.mp4

<reference_navigation>
本次会话附带以下统一虚拟引用：
- @inspiration/insp_ad704927.mp4
请直接把这些引用原样作为工具入参使用（推荐先调 video_breakdown_analyze 的 url 参数完成视听拆解），中枢会自动解析并读取对应素材。
不要用 glob / find / bash 在本地磁盘查找它们的对应文件：它们不是磁盘上的普通文件，全盘搜索只会超时失败。
</reference_navigation>
```

## 结论

1. **消息条数不变（2 条）**：导航追加在既有伴随上下文消息内，未新增气泡，用户界面零变化。
2. **用户气泡 100% 保持原文**：`/video-deconstruct 复刻这条爆款视频` 原样未改。
3. **推荐动作随素材同行**：模型在首轮即可看到「把引用直接传给 `video_breakdown_analyze`」与「禁止全盘查找」两条指引，对应事故中第 1–10 步的无效摸索。

## 自动化测试

- `plugins/omnimux/src/workbench/reference-navigation.test.js`：8/8 通过。
- `plugins/omnimux/src/workbench/context-injector.test.js`：7/7 通过（含新增两例：带引用时导航落在同一条消息内、无引用时上下文逐字节不变）。
- `node --test plugins/omnimux/src/workbench/*.test.js`：53/53 通过。
