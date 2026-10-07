# 规格：画布渠道组操作收窄与 ComfyUI U06 契约参数收敛

## 业务目标

用户选择 `minimax-h3` 的「全能参考版」（comfyui）渠道组时：

1. 生成模式页签只显示 `video_multi_ref`（默认选中），不再出现文生视频/首帧/尾帧/首尾帧/数字人 5 个不可用模式；
2. 清晰度控件整体隐藏——U06 工作流没有分辨率参数，画布基准默认的 720p/1080p 是凭空兜底，同时消除「已根据该渠道能力自适应调整为 1080p」自愈提示；
3. U06 的 `aspect_ratio`（ResolutionSelector）节点真实接入：画布画幅值映射到实例枚举串（16:9 Landscape / 9:16 Portrait / 1:1 Square）。

## 用户关键操作旅程

- 用户在画布新建视频节点 → 模型 minimax-h3 → 渠道组选「全能参考版」→ 生成模式仅剩「全能参考」→ 无清晰度选项 → 填提示词与参考素材 → 提交直达 ComfyUI 实例。

## 验收用例

- TC-OPS-01：`constraints.operations=['video_multi_ref']` 的渠道组，ConfigPanel 的有效操作列表收窄为 1 项，`selectedOperationId=video_multi_ref`，`showModeUi=false`。
- TC-OPS-02：U06 渠道组 `constraints.parameters.resolution.supported=false` 时，`buildChannelContract` 输出 `supportedResolutions=[]`，不产生 resolution 自愈 note；清晰度控件不渲染。
- TC-OPS-03：`buildU06Prompt` 在含 `aspect_ratio` 节点的蓝本上按映射写入：`16:9→16:9 (Landscape Widescreen)`、`9:16→9:16 (Portrait Widescreen)`、`1:1→1:1 (Square)`；未映射值回退蓝本现值。
- TC-OPS-04：执行分发仍只在显式 comfyui 组命中；model-contracts strict、product-baseline、boundaries、两插件全量测试全绿。
