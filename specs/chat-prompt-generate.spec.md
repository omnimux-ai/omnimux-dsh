# 规格：聊天提示词块一键填入生成页

Issue #2540。只改 OmniMux 插件，不改官方聊天渲染。

## 目标（Objective）

用户在对话里看到一段可直接拿去生成的提示词时，点代码块底部右侧的按钮，右侧打开图像生成页，提示词已经填好，并切到图片或视频。中文界面按钮写「使用提示词生成」，英文界面写 “Generate with prompt”。用户自己再点发送才真正生成，不自动扣次数。

谁用：在对话里让模型写生图、生视频提示词，然后想直接拿去生成的人。

## 技术栈（Tech Stack）

既有 OmniMux 插件前端：原生页面脚本观察对话里的代码块，图像生成页沿用现有输入面板。不新增依赖，不改官方代码块组件。

## 命令（Commands）

- 插件测试：`pnpm --filter omnimux test`
- 本功能单测：`node --test plugins/omnimux/src/client/attachments/promptFenceGenerate.test.ts plugins/omnimux/src/client/media-viewer/composer-prefill.test.js plugins/omnimux/src/workbench/tools.test.js`

## 项目结构（Project Structure）

- `plugins/omnimux/src/client/attachments/promptFenceGenerate.ts`：识别标记、加按钮、打开页面并填入。
- `plugins/omnimux/src/client/media-viewer/composer-prefill.js`：生成页读取一次填入请求。
- `plugins/omnimux/src/workbench/tools.js`：告诉模型什么时候必须用这种标记。
- `plugins/omnimux/src/client/index.js`：启动观察。

## 代码风格（Code Style）

标记只认整词，大小写不敏感，后面可以跟说明：

```
prompt-image
prompt-video
prompt-image 分镜
```

`prompt`、`markdown`、`prompt-image-extra` 都不算。按钮放在代码块正文下方的底栏右侧，不放标题栏。中文为「使用提示词生成」，英文为 “Generate with prompt”，跟随软件当前语言；底栏左侧写「图片」或「视频」。标题只显示「图片提示词」或「视频提示词」，原始标记留在页面里但不显示，复制按钮保留。点过之后短暂显示「已填入」或 “Filled”，再回到原按钮名。

## 测试策略（Testing Strategy）

用现有节点测试跑三件事：只有两种标记出现按钮；点按钮后页面收到对应模式和全文，且没有发起生成请求；普通代码块不加按钮。界面验收在本任务隔离环境的浏览器里点一次按钮，看右侧输入框和模式。

## 边界（Boundaries）

- 总是：只认上述两种标记；点击不提交生成；提示词用代码块里的原文，不改写。
- 先问：要自动开始生成、要识别没标的普通代码块、要改官方聊天组件。
- 绝不：改官方宿主源码；在按钮点击时调用生成接口；把开发机地址写进默认路径。

## 成功标准（Success Criteria）

1. `prompt-image` 块底部右侧有「使用提示词生成」（英文界面为 “Generate with prompt”），点击后右侧为图像生成，输入框等于块内全文。
2. `prompt-video` 块同样，底栏左侧标明视频，并切到视频生成。
3. `markdown`、`json`、无标记、`prompt` 单独出现，都没有这个按钮。
4. 点击后网络里没有生成请求。
5. 模型规则写明：可直接生成的提示词必须用这两种标记，普通说明继续用普通代码块。
6. 新用户没有本地模型服务也能看到按钮；打不开右侧页面时按钮保持可点，不报空白页。

## 假设（Assumptions）

1. 右侧生成页就是现有的图像生成页，图片和视频在同一页里切换。
2. 用户截图里的普通 markdown 块不该出现按钮，必须先有明确标记。
3. 「生成」指填好并切模式，不指立刻出图。

## 开放问题（Open Questions）

无。以上三条按用户原话执行，不再等确认。
